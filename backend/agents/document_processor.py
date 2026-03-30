"""
IASW - Agent 2: Document Processor Agent
---------------------------------------------------------------------
Responsibility:
  * For IMAGE files  → Base64-encode → GPT-4o Vision (image_url)
  * For PDF files    → pypdf text extraction → GPT-4o text completion
  * Forgery / tampering detection via LLM
  * Archive document to FileNet mock

Iteration strategy (2 types):
  1. Exponential-backoff retry on transient Azure OpenAI errors
     (429 rate-limit, 500 server error, network timeout) — up to 3 attempts.
  2. Self-healing JSON retry: if the LLM returns malformed JSON,
     send the broken text back and ask GPT-4o to fix it — 1 extra attempt.
     This avoids failing the entire pipeline over a formatting glitch.

Why NO other iteration:
  - FileNet archival is filesystem I/O — retry at OS level, not here.
  - Confidence scoring is deterministic math — no retry needed.
  - We do NOT re-run extraction to improve low confidence scores.
    That would make the pipeline non-deterministic and non-auditable,
    violating the HITL compliance principle. The Checker handles low scores.
"""
import asyncio
import base64
import json
import mimetypes
from pathlib import Path

from openai import AzureOpenAI, RateLimitError, APIStatusError, APIConnectionError

from agents.state import PipelineState
from config import (
    AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_DEPLOYMENT,
    AZURE_OPENAI_API_VERSION,
    LLM_MAX_TOKENS,
)
from observability import AgentLogger
from services import FileNetMock

AGENT_NAME = "DocumentProcessorAgent"

# ── Retry configuration ───────────────────────────────────────────────────────
MAX_LLM_RETRIES   = 3          # max attempts for transient Azure errors
RETRY_BASE_DELAY  = 2.0        # seconds — doubles each retry (2 → 4 → 8)
MAX_JSON_RETRIES  = 1          # 1 self-healing attempt if JSON is malformed


# ── Extraction prompts (image path — GPT-4o Vision) ───────────────────────────
IMAGE_EXTRACTION_PROMPTS: dict[str, str] = {
    "legal_name": """
You are a document analysis expert for a bank's KYC/AML team.

TASK: Extract information from this legal name-change document (Marriage Certificate,
Gazette Notification, or Deed Poll) and check for signs of forgery or tampering.

Return ONLY a valid JSON object with these exact keys:
{
  "document_type": "<type of document identified>",
  "old_name": "<bride's/applicant's name BEFORE the change>",
  "new_name": "<name AFTER the change / married name>",
  "document_date": "<date on document, ISO format if possible>",
  "issuing_authority": "<authority that issued this document>",
  "registration_number": "<any registration/certificate number if visible>",
  "forgery_indicators": ["<list any signs of tampering, inconsistencies, or forgery; empty list if clean>"],
  "document_quality": "<high | medium | low>",
  "extraction_confidence": <0.0-1.0 float>
}

Be thorough with forgery_indicators — check fonts, alignment, seal authenticity,
ink consistency, paper quality, signature presence, and any digital manipulation signs.
""",
    "address": """
You are a document analysis expert for a bank's KYC/AML team.

TASK: Extract address information from this supporting document (Utility Bill,
Lease Agreement, or Government ID) and check for forgery.

Return ONLY a valid JSON object with these exact keys:
{
  "document_type": "<type of document>",
  "name_on_document": "<full name as shown>",
  "address_line1": "<street address>",
  "address_line2": "<city, state, postal code>",
  "full_address": "<complete address string>",
  "document_date": "<date on document>",
  "issuing_authority": "<issuer>",
  "forgery_indicators": ["<list any signs of tampering or forgery; empty list if clean>"],
  "document_quality": "<high | medium | low>",
  "extraction_confidence": <0.0-1.0 float>
}
""",
    "dob": """
You are a document analysis expert for a bank's KYC/AML team.

TASK: Extract date of birth from this document (Birth Certificate, Passport, or PAN Card)
and verify document authenticity.

Return ONLY a valid JSON object with these exact keys:
{
  "document_type": "<type of document>",
  "name_on_document": "<full name>",
  "date_of_birth": "<DOB in YYYY-MM-DD format>",
  "place_of_birth": "<if available>",
  "document_number": "<document number if visible>",
  "document_date": "<date of issue>",
  "expiry_date": "<expiry if applicable>",
  "issuing_authority": "<issuer>",
  "forgery_indicators": ["<list any signs of tampering or forgery; empty list if clean>"],
  "document_quality": "<high | medium | low>",
  "extraction_confidence": <0.0-1.0 float>
}
""",
    "contact": """
You are a document analysis expert for a bank's KYC/AML team.

TASK: Extract consent and signature information from this digital consent form.

Return ONLY a valid JSON object with these exact keys:
{
  "document_type": "<type of document>",
  "signatory_name": "<name of person who signed>",
  "new_email": "<new email if stated>",
  "new_phone": "<new phone if stated>",
  "consent_date": "<date of consent>",
  "signature_present": <true|false>,
  "signature_type": "<wet | digital | e-signature>",
  "forgery_indicators": ["<list any signs of tampering; empty if clean>"],
  "document_quality": "<high | medium | low>",
  "extraction_confidence": <0.0-1.0 float>
}
""",
}

# ── Extraction prompts (PDF text path — GPT-4o text) ─────────────────────────
PDF_EXTRACTION_PROMPTS: dict[str, str] = {
    "legal_name": """
You are a document analysis expert for a bank's KYC/AML team.

Below is the extracted text content of a legal name-change document.

Return ONLY a valid JSON object with these exact keys:
{{
  "document_type": "<type of document identified from the text>",
  "old_name": "<bride's/applicant's name BEFORE the change>",
  "new_name": "<name AFTER the change / married name>",
  "document_date": "<date on document, ISO format if possible>",
  "issuing_authority": "<authority that issued this document>",
  "registration_number": "<any registration/certificate number>",
  "forgery_indicators": ["<list missing fields, inconsistencies, or suspicious patterns; empty if clean>"],
  "document_quality": "<high | medium | low>",
  "extraction_confidence": <0.0-1.0 float>
}}

DOCUMENT TEXT:
{text}
""",
    "address": """
You are a document analysis expert for a bank's KYC/AML team.

Below is the extracted text content of an address-proof document.

Return ONLY a valid JSON object with these exact keys:
{{
  "document_type": "<type of document>",
  "name_on_document": "<full name as shown>",
  "address_line1": "<street address>",
  "address_line2": "<city, state, postal code>",
  "full_address": "<complete address string>",
  "document_date": "<date on document>",
  "issuing_authority": "<issuer>",
  "forgery_indicators": ["<inconsistencies or suspicious patterns; empty if clean>"],
  "document_quality": "<high | medium | low>",
  "extraction_confidence": <0.0-1.0 float>
}}

DOCUMENT TEXT:
{text}
""",
    "dob": """
You are a document analysis expert for a bank's KYC/AML team.

Below is the extracted text from a date-of-birth document.

Return ONLY a valid JSON object:
{{
  "document_type": "<type>",
  "name_on_document": "<full name>",
  "date_of_birth": "<YYYY-MM-DD>",
  "place_of_birth": "<if available>",
  "document_number": "<doc number>",
  "document_date": "<date of issue>",
  "expiry_date": "<expiry if applicable>",
  "issuing_authority": "<issuer>",
  "forgery_indicators": [],
  "document_quality": "<high | medium | low>",
  "extraction_confidence": <0.0-1.0 float>
}}

DOCUMENT TEXT:
{text}
""",
    "contact": """
You are a document analysis expert for a bank's KYC/AML team.

Below is the extracted text from a digital consent form.

Return ONLY a valid JSON object:
{{
  "document_type": "<type>",
  "signatory_name": "<name of signer>",
  "new_email": "<new email if stated>",
  "new_phone": "<new phone if stated>",
  "consent_date": "<date>",
  "signature_present": <true|false>,
  "signature_type": "<wet | digital | e-signature>",
  "forgery_indicators": [],
  "document_quality": "<high | medium | low>",
  "extraction_confidence": <0.0-1.0 float>
}}

DOCUMENT TEXT:
{text}
""",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_azure_client() -> AzureOpenAI:
    return AzureOpenAI(
        api_key=AZURE_OPENAI_API_KEY,
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_version=AZURE_OPENAI_API_VERSION,
    )


def _is_transient_error(exc: Exception) -> bool:
    """Returns True for errors that are worth retrying."""
    if isinstance(exc, RateLimitError):
        return True
    if isinstance(exc, APIStatusError) and exc.status_code >= 500:
        return True
    if isinstance(exc, APIConnectionError):
        return True
    return False


def _extract_pdf_text(doc_path: Path) -> str:
    from pypdf import PdfReader
    reader = PdfReader(str(doc_path))
    pages_text = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages_text.append(text.strip())
    return "\n\n".join(pages_text) if pages_text else ""


def _encode_image(doc_path: Path) -> tuple[str, str]:
    mime_type, _ = mimetypes.guess_type(str(doc_path))
    supported = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    if mime_type not in supported:
        mime_type = "image/jpeg"
    with open(doc_path, "rb") as f:
        b64_data = base64.standard_b64encode(f.read()).decode("utf-8")
    return b64_data, mime_type


def _is_pdf(doc_path: Path) -> bool:
    mime_type, _ = mimetypes.guess_type(str(doc_path))
    if mime_type == "application/pdf":
        return True
    try:
        with open(doc_path, "rb") as f:
            return f.read(4) == b"%PDF"
    except Exception:
        return False


def _clean_json(raw: str) -> str:
    """Strip markdown code fences if the model added them."""
    clean = raw.strip()
    if "```" in clean:
        parts = clean.split("```")
        # parts[1] is the block inside first pair of backticks
        clean = parts[1]
        if clean.startswith("json"):
            clean = clean[4:]
    return clean.strip()


# ── Iteration 1: Exponential-backoff retry for LLM API call ──────────────────

async def _call_llm_with_retry(
    client: AzureOpenAI,
    messages: list,
    logger: AgentLogger,
) -> str:
    """
    Calls Azure OpenAI with exponential-backoff retry for transient errors.
    Returns the raw text response.

    Retry schedule (MAX_LLM_RETRIES = 3):
      Attempt 1: immediate
      Attempt 2: wait 2s
      Attempt 3: wait 4s
      → Raises the last exception if all attempts fail

    Only retries on transient errors (429, 5xx, connection error).
    Permanent errors (400 bad request, 401 auth) are raised immediately.
    """
    last_exc: Exception | None = None

    for attempt in range(1, MAX_LLM_RETRIES + 1):
        try:
            response = client.chat.completions.create(
                model=AZURE_OPENAI_DEPLOYMENT,
                max_tokens=LLM_MAX_TOKENS,
                messages=messages,
            )
            raw_text = response.choices[0].message.content.strip()

            if attempt > 1:
                logger.info(AGENT_NAME, "llm_retry_succeeded", attempt=attempt)

            usage = response.usage
            logger.info(
                AGENT_NAME, "llm_response_received",
                attempt=attempt,
                prompt_tokens=usage.prompt_tokens if usage else 0,
                completion_tokens=usage.completion_tokens if usage else 0,
            )
            return raw_text

        except Exception as exc:
            last_exc = exc

            if not _is_transient_error(exc):
                # Permanent error — no point retrying
                logger.error(
                    AGENT_NAME, "llm_permanent_error",
                    attempt=attempt, error=str(exc), error_type=type(exc).__name__
                )
                raise

            if attempt < MAX_LLM_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))   # 2 → 4 → 8 seconds
                logger.warning(
                    AGENT_NAME, "llm_transient_error_retrying",
                    attempt=attempt,
                    max_attempts=MAX_LLM_RETRIES,
                    retry_in_seconds=delay,
                    error=str(exc),
                    error_type=type(exc).__name__,
                )
                await asyncio.sleep(delay)
            else:
                logger.error(
                    AGENT_NAME, "llm_all_retries_exhausted",
                    attempts=MAX_LLM_RETRIES,
                    error=str(exc),
                )

    raise last_exc  # type: ignore


# ── Iteration 2: Self-healing JSON retry ──────────────────────────────────────

async def _parse_json_with_heal(
    raw_text: str,
    client: AzureOpenAI,
    logger: AgentLogger,
) -> dict:
    """
    Attempts to parse the LLM response as JSON.
    If it fails, sends the broken response back to GPT-4o once and asks it
    to return ONLY valid JSON — a single self-healing iteration.

    Why this works:
      GPT-4o sometimes wraps JSON in explanatory text despite being told not to.
      Asking it to fix its own output is fast and almost always succeeds.

    Why only 1 healing attempt:
      If the model can't produce valid JSON after being explicitly shown its
      mistake, the document/prompt is genuinely problematic. We stop and fail
      with a clear error rather than looping indefinitely.
    """
    # First attempt — parse directly
    try:
        return json.loads(_clean_json(raw_text))
    except json.JSONDecodeError as first_exc:
        logger.warning(
            AGENT_NAME, "json_parse_failed_attempting_self_heal",
            error=str(first_exc),
            raw_preview=raw_text[:200],
        )

    # Self-healing attempt — ask GPT-4o to fix its output
    heal_messages = [
        {
            "role": "system",
            "content": (
                "You are a JSON repair assistant. "
                "The user will give you malformed output. "
                "Return ONLY the corrected valid JSON object — no explanation, no markdown."
            ),
        },
        {
            "role": "user",
            "content": (
                f"The following text should be a JSON object but is malformed. "
                f"Fix it and return ONLY valid JSON:\n\n{raw_text}"
            ),
        },
    ]

    try:
        heal_response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            max_tokens=LLM_MAX_TOKENS,
            messages=heal_messages,
        )
        healed_text = heal_response.choices[0].message.content.strip()
        result = json.loads(_clean_json(healed_text))
        logger.info(AGENT_NAME, "json_self_heal_succeeded")
        return result

    except Exception as heal_exc:
        logger.error(
            AGENT_NAME, "json_self_heal_failed",
            error=str(heal_exc),
            raw_preview=raw_text[:200],
        )
        raise json.JSONDecodeError(
            f"JSON parse failed and self-heal also failed: {heal_exc}",
            raw_text, 0
        )


# ── Main run function ─────────────────────────────────────────────────────────

async def run(state: PipelineState, logger: AgentLogger) -> PipelineState:
    """
    Processes the uploaded document:
      - PDF   → pypdf text extraction → GPT-4o text (with retry + JSON heal)
      - Image → base64 encode → GPT-4o Vision (with retry + JSON heal)
    """
    logger.step_start(AGENT_NAME)

    if not state.document_path or not state.document_path.exists():
        state.error = "No document provided for processing."
        logger.error(AGENT_NAME, "no_document")
        return state

    # ── Step 1: Archive to FileNet ────────────────────────────────────────────
    try:
        fn_meta = FileNetMock.archive_document(
            source_path=state.document_path,
            request_id=state.request_id,
            customer_id=state.customer_id,
            change_type=state.change_type,
            document_type=state.change_type.replace("_", " ").title() + " Document",
            original_filename=state.document_filename,
        )
        state.filenet_reference_id = fn_meta["reference_id"]
        state.filenet_metadata = fn_meta
        logger.info(
            AGENT_NAME, "filenet_archived",
            reference_id=fn_meta["reference_id"],
            file_size=fn_meta["file_size_bytes"],
        )
    except Exception as exc:
        logger.error(AGENT_NAME, "filenet_archive_failed", error=str(exc))
        state.error = f"FileNet archival failed: {exc}"
        return state

    # ── Step 2: Build LLM messages ────────────────────────────────────────────
    is_pdf = _is_pdf(state.document_path)
    logger.info(AGENT_NAME, "document_type_detected", is_pdf=is_pdf)

    try:
        if is_pdf:
            pdf_text = _extract_pdf_text(state.document_path)
            if not pdf_text.strip():
                pdf_text = "[No extractable text — document may be a scanned image]"
                logger.warning(AGENT_NAME, "pdf_no_text_extracted")
            else:
                logger.info(AGENT_NAME, "pdf_text_extracted", chars=len(pdf_text))

            prompt_template = PDF_EXTRACTION_PROMPTS.get(
                state.change_type, PDF_EXTRACTION_PROMPTS["legal_name"]
            )
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a precise document analysis AI for a bank's KYC/AML "
                        "compliance team. Always respond with valid JSON only — "
                        "no markdown, no preamble."
                    ),
                },
                {"role": "user", "content": prompt_template.format(text=pdf_text[:6000])},
            ]

        else:
            b64_data, mime_type = _encode_image(state.document_path)
            data_url = f"data:{mime_type};base64,{b64_data}"
            logger.info(AGENT_NAME, "image_encoded", mime_type=mime_type)

            image_prompt = IMAGE_EXTRACTION_PROMPTS.get(
                state.change_type, IMAGE_EXTRACTION_PROMPTS["legal_name"]
            )
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a precise document analysis AI for a bank's KYC/AML "
                        "compliance team. Always respond with valid JSON only — "
                        "no markdown, no preamble."
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url, "detail": "high"},
                        },
                        {"type": "text", "text": image_prompt},
                    ],
                },
            ]
    except Exception as exc:
        logger.error(AGENT_NAME, "document_prepare_failed", error=str(exc))
        state.error = f"Document preparation failed: {exc}"
        return state

    # ── Step 3: LLM call with exponential-backoff retry (Iteration 1) ─────────
    client = _get_azure_client()
    try:
        raw_text = await _call_llm_with_retry(client, messages, logger)
    except Exception as exc:
        state.error = f"Azure OpenAI call failed after {MAX_LLM_RETRIES} attempts: {exc}"
        return state

    # ── Step 4: Parse JSON with self-healing (Iteration 2) ────────────────────
    try:
        extracted = await _parse_json_with_heal(raw_text, client, logger)
    except json.JSONDecodeError as exc:
        state.error = f"Could not parse LLM response even after self-heal: {exc}"
        return state

    # ── Step 5: Assess forgery ────────────────────────────────────────────────
    forgery_indicators: list = extracted.get("forgery_indicators", [])
    state.forgery_detected = len(forgery_indicators) > 0
    state.forgery_details = "; ".join(forgery_indicators) if forgery_indicators else ""

    if state.forgery_detected:
        logger.warning(AGENT_NAME, "forgery_detected", indicators=forgery_indicators)
    else:
        logger.info(AGENT_NAME, "no_forgery_detected")

    # ── Step 6: Store extracted fields ───────────────────────────────────────
    skip_keys = {"forgery_indicators", "extraction_confidence", "document_quality"}
    state.extracted_fields = {
        k: str(v) for k, v in extracted.items() if k not in skip_keys
    }

    logger.step_end(
        AGENT_NAME,
        result={
            "extracted_fields": state.extracted_fields,
            "forgery_detected": state.forgery_detected,
            "filenet_ref": state.filenet_reference_id,
            "doc_quality": extracted.get("document_quality", "unknown"),
            "extraction_confidence": extracted.get("extraction_confidence", 0),
            "pdf_mode": is_pdf,
        },
    )
    return state
