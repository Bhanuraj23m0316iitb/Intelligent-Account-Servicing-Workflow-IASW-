"""
IASW - Agent 3: Confidence Scorer

Responsibility:
  • Compare extracted document fields against the requested change values
  • Produce a per-field confidence score (0.0 – 1.0)
  • Compute a weighted overall confidence score
  • Flag individual fields as PASS / FLAG / FAIL

Input:  PipelineState with extracted_fields populated
Output: PipelineState updated with confidence_scores, overall_confidence
"""
import difflib
import re
from datetime import datetime

from agents.state import PipelineState
from config import CONFIDENCE_FLAG_THRESHOLD, CONFIDENCE_REJECT_THRESHOLD
from observability import AgentLogger

AGENT_NAME = "ConfidenceScorerAgent"


def _string_similarity(a: str, b: str) -> float:
    """Case-insensitive SequenceMatcher ratio."""
    return difflib.SequenceMatcher(
        None,
        a.strip().lower(),
        b.strip().lower(),
    ).ratio()


def _date_similarity(extracted_str: str, requested_str: str) -> float:
    """Try to parse both as dates and compare."""
    fmts = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%B %d, %Y", "%d %B %Y"]
    def parse(s):
        for fmt in fmts:
            try:
                return datetime.strptime(s.strip(), fmt)
            except ValueError:
                pass
        return None

    d1, d2 = parse(extracted_str), parse(requested_str)
    if d1 and d2:
        return 1.0 if d1 == d2 else 0.0
    # Fall back to string similarity
    return _string_similarity(extracted_str, requested_str)


def _name_similarity(a: str, b: str) -> float:
    """
    Name comparison: strip honorifics, normalise whitespace,
    then use sequence similarity.
    """
    honorifics = r"^(mr\.?|mrs\.?|ms\.?|dr\.?|prof\.?)\s+"
    a_clean = re.sub(honorifics, "", a.strip().lower())
    b_clean = re.sub(honorifics, "", b.strip().lower())
    return _string_similarity(a_clean, b_clean)



def _score_legal_name(extracted: dict, old_value: str, new_value: str) -> dict[str, float]:
    scores: dict[str, float] = {}

    # Old name match (bride/applicant's original name)
    old_extracted = extracted.get("old_name", "")
    scores["old_name_match"] = _name_similarity(old_extracted, old_value) if old_extracted else 0.3

    # New name match
    new_extracted = extracted.get("new_name", "")
    scores["new_name_match"] = _name_similarity(new_extracted, new_value) if new_extracted else 0.3

    # Document authenticity (penalise if key fields absent)
    has_date = bool(extracted.get("document_date", "").strip())
    has_authority = bool(extracted.get("issuing_authority", "").strip())
    has_reg = bool(extracted.get("registration_number", "").strip())
    scores["document_authenticity"] = (
        0.4 + (0.2 if has_date else 0.0) + (0.2 if has_authority else 0.0) + (0.2 if has_reg else 0.0)
    )

    return scores


def _score_address(extracted: dict, old_value: str, new_value: str) -> dict[str, float]:
    scores: dict[str, float] = {}

    full_address = extracted.get("full_address", "")
    scores["address_match"] = _string_similarity(full_address, new_value) if full_address else 0.3

    has_date = bool(extracted.get("document_date", "").strip())
    has_name = bool(extracted.get("name_on_document", "").strip())
    scores["document_authenticity"] = (
        0.5 + (0.25 if has_date else 0.0) + (0.25 if has_name else 0.0)
    )

    return scores


def _score_dob(extracted: dict, old_value: str, new_value: str) -> dict[str, float]:
    scores: dict[str, float] = {}

    dob_extracted = extracted.get("date_of_birth", "")
    scores["dob_match"] = _date_similarity(dob_extracted, new_value) if dob_extracted else 0.2

    has_doc_num = bool(extracted.get("document_number", "").strip())
    has_authority = bool(extracted.get("issuing_authority", "").strip())
    scores["document_authenticity"] = (
        0.4 + (0.3 if has_doc_num else 0.0) + (0.3 if has_authority else 0.0)
    )

    return scores


def _score_contact(extracted: dict, old_value: str, new_value: str) -> dict[str, float]:
    scores: dict[str, float] = {}

    new_contact = extracted.get("new_email", extracted.get("new_phone", ""))
    scores["contact_match"] = _string_similarity(new_contact, new_value) if new_contact else 0.3

    sig_present = extracted.get("signature_present", False)
    if isinstance(sig_present, str):
        sig_present = sig_present.lower() in ("true", "yes", "1")
    scores["consent_verification"] = 0.9 if sig_present else 0.4

    return scores


SCORER_MAP = {
    "legal_name": _score_legal_name,
    "address": _score_address,
    "dob": _score_dob,
    "contact": _score_contact,
}

# Weights for weighted overall score per change type
WEIGHTS: dict[str, dict[str, float]] = {
    "legal_name": {"old_name_match": 0.35, "new_name_match": 0.45, "document_authenticity": 0.20},
    "address": {"address_match": 0.60, "document_authenticity": 0.40},
    "dob": {"dob_match": 0.65, "document_authenticity": 0.35},
    "contact": {"contact_match": 0.55, "consent_verification": 0.45},
}


def _forgery_penalty(forgery_detected: bool) -> float:
    """Apply a forgery penalty to the overall score."""
    return -0.30 if forgery_detected else 0.0


async def run(state: PipelineState, logger: AgentLogger) -> PipelineState:
    """
    Computes per-field and overall confidence scores.
    """
    logger.step_start(AGENT_NAME)

    scorer_fn = SCORER_MAP.get(state.change_type, _score_legal_name)
    raw_scores = scorer_fn(
        state.extracted_fields,
        state.old_value,
        state.new_value,
    )

    # Apply forgery penalty
    penalty = _forgery_penalty(state.forgery_detected)
    adjusted_scores = {k: max(0.0, min(1.0, v + penalty)) for k, v in raw_scores.items()}

    state.confidence_scores = adjusted_scores

    # Weighted overall confidence
    weights = WEIGHTS.get(state.change_type, {k: 1 / len(raw_scores) for k in raw_scores})
    overall = sum(adjusted_scores.get(field, 0.0) * weight for field, weight in weights.items())
    state.overall_confidence = round(min(1.0, max(0.0, overall)), 4)

    logger.step_end(
        AGENT_NAME,
        result={
            "scores": adjusted_scores,
            "overall_confidence": state.overall_confidence,
            "forgery_penalty_applied": state.forgery_detected,
        },
    )
    return state
