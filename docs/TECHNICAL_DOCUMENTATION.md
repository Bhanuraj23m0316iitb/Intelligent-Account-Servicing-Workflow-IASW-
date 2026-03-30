# IASW — Complete Technical Documentation

> Version 1.0 · Azure OpenAI (GPT-4o) Edition

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Agent Design](#2-agent-design)
3. [HITL Boundary Design](#3-hitl-boundary-design)
4. [Data Model](#4-data-model)
5. [API Specification](#5-api-specification)
6. [Azure OpenAI Integration](#6-azure-openai-integration)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Observability Design](#8-observability-design)
9. [Security Considerations](#9-security-considerations)
10. [Production Readiness Checklist](#10-production-readiness-checklist)

---

## 1. System Architecture

### Component Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 14)                       │
│  ┌──────────────┐  ┌────────────────────┐  ┌───────────────────┐  │
│  │   Dashboard  │  │  Staff Intake Form │  │  Checker Review   │  │
│  │  (Stats UI)  │  │  (4-Step Wizard)   │  │  (HITL Decision)  │  │
│  └──────┬───────┘  └────────┬───────────┘  └────────┬──────────┘  │
└─────────┼───────────────────┼──────────────────────┼──────────────┘
          │  GET /api/*        │  POST /api/intake     │  POST /decision
          ▼                   ▼                        ▼
┌────────────────────────────────────────────────────────────────────┐
│                        BACKEND (FastAPI)                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    API Layer (routes.py)                      │  │
│  │  /intake  /requests  /requests/{id}/decision  /stats  /health│  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                             │                                       │
│  ┌──────────────────────────▼───────────────────────────────────┐  │
│  │                  Agent Pipeline (pipeline.py)                 │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │  │
│  │  │ Agent 1  │→ │ Agent 2  │→ │ Agent 3  │→ │   Agent 4   │  │  │
│  │  │Validation│  │ Doc Proc │  │Confidence│  │   Summary   │  │  │
│  │  │  Agent   │  │  Agent   │  │  Scorer  │  │    Agent    │  │  │
│  │  └──────────┘  └────┬─────┘  └──────────┘  └──────┬──────┘  │  │
│  └───────────────────┬─┼───────────────────────────────┼─────────┘  │
│                      │ │                               │            │
│  ┌───────────────────┼─▼───────────────┐  ┌───────────▼──────────┐ │
│  │  Services Layer   │                 │  │  Azure OpenAI GPT-4o │ │
│  │  ┌───────────┐  ┌─▼───────────┐    │  │  (Vision + Chat)     │ │
│  │  │ RPS Mock  │  │FileNet Mock │    │  └──────────────────────┘ │
│  │  └───────────┘  └─────────────┘    │                            │
│  └─────────────────────────────────────┘                            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  SQLite DB (Pending Table)  +  Structured JSON Logger       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

### Synchronous vs Asynchronous Boundaries

| Boundary | Type | Notes |
|---|---|---|
| Staff → `/api/intake/sync` | Synchronous | Waits for full pipeline (~5–15s); used for demo |
| Staff → `/api/intake` | Asynchronous | Returns 202 immediately; pipeline runs in background |
| Pipeline → Azure OpenAI | Async I/O | `async def` functions; non-blocking |
| Pipeline → SQLite | Async I/O | SQLAlchemy async + aiosqlite |
| Pipeline → FileNet Mock | Synchronous | Local disk I/O (< 1ms); acceptable |
| Checker → `/api/requests/{id}/decision` | Synchronous | Blocks until RPS write completes |

---

## 2. Agent Design

### PipelineState (shared context)

```python
@dataclass
class PipelineState:
    # Input
    request_id: str
    customer_id: str
    change_type: str        # legal_name | address | dob | contact
    old_value: str
    new_value: str
    staff_id: str
    document_path: Path | None
    document_filename: str

    # Agent 1 outputs
    validation_passed: bool
    validation_errors: list[str]
    rps_customer_record: dict

    # Agent 2 outputs
    extracted_fields: dict[str, str]
    forgery_detected: bool
    forgery_details: str
    filenet_reference_id: str
    filenet_metadata: dict

    # Agent 3 outputs
    confidence_scores: dict[str, float]
    overall_confidence: float

    # Agent 4 outputs
    ai_summary: str
    recommended_action: str     # approve | review | reject

    # Pipeline metadata
    error: str
    completed: bool
```

---

### Agent 1 — ValidationAgent

**File**: `agents/validation_agent.py`

**Responsibilities**:
- Verify `change_type` is one of `{legal_name, address, dob, contact}`
- Look up `customer_id` in the RPS mock
- Confirm `account.status == "active"`
- Check that `old_value` matches the RPS field (case-insensitive)
- Verify `new_value != old_value`
- Basic length guard (`new_value.length >= 2`)

**Field Mapping**:

| change_type | RPS Field |
|---|---|
| `legal_name` | `name` |
| `address` | `address` |
| `dob` | `dob` |
| `contact` | `email` |

**Outputs**: `validation_passed`, `validation_errors`, `rps_customer_record`

**Error Handling**: On validation failure, sets `status=FAILED` with `error_message` in DB.
Pipeline stops here — no LLM calls are made, minimising cost.

---

### Agent 2 — DocumentProcessorAgent

**File**: `agents/document_processor.py`

**Responsibilities**:
1. Archive document to FileNet mock (before any LLM processing)
2. Encode document to base64
3. Call Azure OpenAI GPT-4o Vision with change-type-specific structured extraction prompt
4. Parse JSON response
5. Extract `forgery_indicators` list
6. Flatten remaining fields into `extracted_fields`

**Azure OpenAI API Call Shape**:

```python
response = client.chat.completions.create(
    model=AZURE_OPENAI_DEPLOYMENT,          # your deployment name
    max_tokens=2048,
    messages=[
        {
            "role": "system",
            "content": "You are a precise document analysis AI..."
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{b64_data}",
                        "detail": "high"    # high fidelity for document analysis
                    }
                },
                {"type": "text", "text": extraction_prompt}
            ]
        }
    ]
)
```

**Extraction Prompt Design** (Legal Name Change example):

The prompt instructs GPT-4o to return **only** a valid JSON object with exact keys.
It checks for:
- Structural fields: `old_name`, `new_name`, `document_date`, `issuing_authority`, `registration_number`
- Forgery indicators: fonts, alignment, seals, ink consistency, signatures, digital manipulation
- Meta: `document_quality` (high/medium/low), `extraction_confidence` (0.0–1.0)

**Forgery Detection Logic**: Any non-empty `forgery_indicators` array → `forgery_detected=True`.
The forgery flag feeds a −30% penalty in the confidence scorer and forces `recommended_action=reject`.

---

### Agent 3 — ConfidenceScorerAgent

**File**: `agents/confidence_scorer.py`

**Algorithm**:

```
For each change_type:
  1. Compute raw per-field scores using field-specific algorithm
  2. Apply forgery penalty: if forgery_detected, subtract 0.30 from each score (floor 0.0)
  3. Compute weighted overall = Σ(score_i × weight_i)
  4. Clamp to [0.0, 1.0]
```

**Scoring Algorithms by Field**:

| Field | Algorithm | Notes |
|---|---|---|
| Name fields | `difflib.SequenceMatcher` ratio | Strips honorifics (Mr/Mrs/Dr/Prof) before comparison |
| Address | `SequenceMatcher` on full address string | Case-insensitive |
| Date of Birth | Date parser → exact match | Supports 5 date formats; falls back to string similarity |
| Document authenticity | Boolean presence of metadata fields | Weighted sum of `has_date + has_authority + has_registration` |
| Signature/consent | Boolean `signature_present` from extracted fields | 0.9 if present, 0.4 if absent |

**Forgery Penalty**: Reduces all field scores by 0.30 (clamped to 0.0 floor). This ensures
any forgery detection causes the overall confidence to drop below the approval threshold.

---

### Agent 4 — SummaryAgent

**File**: `agents/summary_agent.py`

**Two-phase design**:

1. **Deterministic recommendation** (pure Python, never LLM):
   ```python
   if forgery_detected:       return "reject"
   if confidence >= 0.70:     return "approve"
   if confidence >= 0.40:     return "review"
   return "reject"
   ```

2. **LLM narrative summary** (Azure OpenAI GPT-4o, text-only):
   - System prompt: professional banking tone, 3–5 sentences
   - User prompt: structured data dump (change request, extracted fields, scores, forgery status)
   - Output: natural language summary for Checker Supervisor

**Fallback**: If the LLM call fails (network error, quota, etc.), a deterministic Python
template generates a complete summary. The pipeline never fails at this stage.

---

## 3. HITL Boundary Design

### Enforcement Architecture

The HITL constraint is enforced at **two levels**:

**Level 1 — API Layer** (`api/routes.py`):
```python
@router.post("/requests/{request_id}/decision")
async def checker_decision(...):
    row = await db.get(ChangeRequest, request_id)

    # GUARD: Only pending requests can be decided
    if row.status != "AI_VERIFIED_PENDING_HUMAN":
        raise HTTPException(409, "Request is not in reviewable state")

    # RPS write only happens here, only on explicit human 'approved'
    if body.decision == "approved":
        txn = RPSMock.write_to_rps(...)
```

**Level 2 — Service Layer** (`services/rps_mock.py`):
`write_to_rps()` is a class method that only exists in the RPS mock service and is only
imported and called from the checker decision endpoint. It is **never imported** in the
agent pipeline files.

### What the AI Pipeline Cannot Do

The agent pipeline files (`validation_agent.py`, `document_processor.py`,
`confidence_scorer.py`, `summary_agent.py`, `pipeline.py`) contain:
- **No import of `RPSMock.write_to_rps`**
- **No import of the checker decision endpoint**
- **No mutation of customer records**
- **Only reads from `RPSMock.get_customer()`**
- **Only writes to the staging `ChangeRequest` table**

### Status Lifecycle

```
PENDING
  │  (created on intake submission)
  ▼
AI_PROCESSING
  │  (pipeline running)
  ▼
AI_VERIFIED_PENDING_HUMAN    ← Only status eligible for Checker decision
  │         │
  │         └─ Checker rejects
  ▼                ▼
APPROVED        REJECTED
  │
  └─ RPS.write_to_rps() called
     rps_transaction_id stored

FAILED  ← Pipeline error (validation failure, API error, etc.)
```

---

## 4. Data Model

### ChangeRequest (Pending Table)

```sql
CREATE TABLE change_requests (
    -- Identity
    id                    TEXT PRIMARY KEY,        -- UUID4
    customer_id           TEXT NOT NULL,
    change_type           TEXT NOT NULL,           -- legal_name|address|dob|contact

    -- Request Data
    old_value             TEXT NOT NULL,           -- current value in system
    new_value             TEXT NOT NULL,           -- requested new value
    staff_id              TEXT,
    staff_notes           TEXT,

    -- Document
    document_filename     TEXT,
    document_path         TEXT,                    -- local filesystem path
    filenet_reference_id  TEXT,                    -- FN-XXXXXXXXXXXX
    filenet_metadata      JSON,                    -- size, retention, classification

    -- AI Results
    extracted_fields      JSON,                    -- {field_name: extracted_value}
    confidence_scores     JSON,                    -- {field_name: 0.0-1.0}
    overall_confidence    REAL,                    -- 0.0-1.0 weighted average
    forgery_detected      BOOLEAN DEFAULT 0,
    forgery_details       TEXT,                    -- concatenated indicators
    ai_summary            TEXT,                    -- NL summary for Checker
    recommended_action    TEXT,                    -- approve|review|reject

    -- Status Lifecycle
    status                TEXT DEFAULT 'PENDING',

    -- HITL Checker Decision
    checker_id            TEXT,                    -- who made the decision
    checker_decision      TEXT,                    -- approved|rejected
    checker_notes         TEXT,
    checker_timestamp     DATETIME,

    -- RPS (Core Banking) Result
    rps_transaction_id    TEXT,                    -- RPS-TXN-XXXXXXXXXX
    rps_status            TEXT,                    -- SUCCESS|RPS_ERROR
    rps_response          JSON,                    -- full RPS transaction record

    -- Observability
    agent_logs            JSON,                    -- list of structured log entries
    error_message         TEXT,

    -- Timestamps
    created_at            DATETIME,
    updated_at            DATETIME,
    ai_completed_at       DATETIME
);
```

### FileNet Index Schema

```json
{
  "FN-ABC123456789": {
    "reference_id": "FN-ABC123456789",
    "request_id": "3f7a2b1c-...",
    "customer_id": "C001",
    "change_type": "legal_name",
    "document_type": "Legal Name Document",
    "original_filename": "marriage_cert.jpg",
    "stored_path": "/app/filenet_store/legal_name/C001/FN-ABC..._marriage_cert.jpg",
    "archived_at": "2025-01-15T10:23:45+00:00",
    "file_size_bytes": 245678,
    "classification": "SENSITIVE",
    "retention_policy": "7_YEARS"
  }
}
```

### RPS Transaction Log

```json
{
  "transaction_id": "RPS-TXN-AB12CD34EF",
  "request_id": "3f7a2b1c-...",
  "checker_id": "CHECKER001",
  "customer_id": "C001",
  "change_type": "legal_name",
  "field_updated": "name",
  "old_value": "Priya Sharma",
  "new_value": "Priya Mehta",
  "timestamp": "2025-01-15T10:30:00+00:00",
  "status": "SUCCESS"
}
```

---

## 5. API Specification

### POST /api/intake/sync

Submit a change request and wait for the AI pipeline to complete.

**Request**: `multipart/form-data`

```
customer_id   : string (required)   — e.g. "C001"
change_type   : string (required)   — legal_name|address|dob|contact
old_value     : string (required)   — current value in system
new_value     : string (required)   — requested new value
staff_id      : string (optional)
staff_notes   : string (optional)
document      : file   (required)   — JPEG/PNG/WebP/GIF/PDF
```

**Response 201**: `ChangeRequestDetail` object

**Response 400**: Invalid `change_type`

**Response 422**: Validation error (missing required field)

---

### GET /api/requests

**Query params**: `status`, `change_type`, `limit` (default 50), `offset` (default 0)

**Response 200**: Array of `ChangeRequestSummary`

---

### GET /api/requests/{id}

**Response 200**: `ChangeRequestDetail` (full detail including agent_logs)

**Response 404**: Request not found

---

### POST /api/requests/{id}/decision

**HITL gate** — only callable by human Checker.

**Request body** (JSON):

```json
{
  "checker_id":    "string (required)",
  "decision":      "approved | rejected",
  "checker_notes": "string (optional)"
}
```

**Response 200**:

```json
{
  "request_id":        "uuid",
  "decision":          "approved",
  "rps_transaction_id": "RPS-TXN-XXXXXXXXXX",
  "rps_status":        "SUCCESS",
  "message":           "Request approved by CHECKER001. RPS updated. Transaction: RPS-TXN-..."
}
```

**Response 404**: Request not found

**Response 409**: Request not in `AI_VERIFIED_PENDING_HUMAN` status

---

### GET /api/stats

```json
{
  "total": 12,
  "pending_human": 3,
  "approved": 7,
  "rejected": 1,
  "failed": 1,
  "processing": 0,
  "avg_confidence": 0.8234
}
```

---

## 6. Azure OpenAI Integration

### Client Initialisation

```python
from openai import AzureOpenAI

client = AzureOpenAI(
    api_key=AZURE_OPENAI_API_KEY,
    azure_endpoint=AZURE_OPENAI_ENDPOINT,   # https://<resource>.openai.azure.com/
    api_version=AZURE_OPENAI_API_VERSION,   # 2024-12-01-preview
)
```

### Vision API Call (Document Processor)

```python
response = client.chat.completions.create(
    model=AZURE_OPENAI_DEPLOYMENT,      # deployment name, not model name
    max_tokens=2048,
    messages=[
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{b64_data}",
                        "detail": "high"
                    }
                },
                {"type": "text", "text": extraction_prompt}
            ]
        }
    ]
)
raw_text = response.choices[0].message.content
```

### Text API Call (Summary Agent)

```python
response = client.chat.completions.create(
    model=AZURE_OPENAI_DEPLOYMENT,
    max_tokens=512,
    messages=[
        {"role": "system", "content": SUMMARY_SYSTEM},
        {"role": "user", "content": user_prompt}
    ]
)
summary = response.choices[0].message.content
```

### Supported Image Formats

| Format | MIME Type | Supported |
|---|---|---|
| JPEG | `image/jpeg` | ✓ |
| PNG | `image/png` | ✓ |
| WebP | `image/webp` | ✓ |
| GIF | `image/gif` | ✓ |
| PDF | `application/pdf` | ✗ (treated as JPEG fallback) |

> For production PDF support, add a PDF-to-image conversion step:
> ```bash
> pip install pdf2image
> ```
> ```python
> from pdf2image import convert_from_path
> images = convert_from_path(doc_path)
> images[0].save(jpg_path, 'JPEG')
> ```

### Token Estimation

| Operation | Typical Tokens | Notes |
|---|---|---|
| Document extraction (image) | 800–1500 input + 300–600 output | Depends on image complexity |
| Summary generation | 400–700 input + 150–300 output | Fixed-size prompt |
| **Total per request** | ~1200–2200 input + 450–900 output | — |

---

## 7. Frontend Architecture

### Pages

| Route | Component | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Dashboard: stats cards + recent requests table |
| `/intake` | `app/intake/page.tsx` | 4-step wizard for staff to submit change requests |
| `/checker` | `app/checker/page.tsx` | Filterable queue of all requests with status badges |
| `/checker/[id]` | `app/checker/[id]/page.tsx` | Full review page: AI summary, scores, HITL decision |

### Key UI Components

**Confidence Bar** (`checker/[id]/page.tsx`):
```tsx
<div className="w-full bg-slate-100 rounded-full h-2.5">
  <div
    className={`h-2.5 rounded-full confidence-bar ${confidenceBg(score)}`}
    style={{ width: `${score * 100}%` }}
  />
</div>
```
Colours: `bg-emerald-500` (≥80%), `bg-amber-500` (60–80%), `bg-red-500` (<60%)

**Two-Step Checker Confirm**: The approval/rejection flow requires two clicks (click button → confirm dialog) to prevent accidental decisions on high-stakes banking operations.

**Agent Log Viewer**: Collapsible terminal-style view of every agent step, rendered in mono font with level-coded colours (INFO=green, WARNING=amber, ERROR=red).

### API Client (`lib/api.ts`)

Axios instance with:
- `baseURL: '/api'` (proxied by Next.js to `localhost:8000`)
- `timeout: 120000` (2 minutes for AI pipeline on sync endpoint)

TypeScript types for `ChangeRequest`, `DashboardStats`, `Customer` are co-located with
the API client for single-source-of-truth typing.

---

## 8. Observability Design

### Log Entry Schema

```typescript
{
  ts: string          // ISO 8601 UTC timestamp
  level: "INFO" | "WARNING" | "ERROR"
  request_id: string  // UUID4
  agent: string       // e.g. "DocumentProcessorAgent"
  event: string       // e.g. "filenet_archived", "step_start", "llm_call_failed"
  // ... additional key-value context
}
```

### Standard Events per Agent

| Agent | Events |
|---|---|
| All agents | `step_start`, `step_end` |
| ValidationAgent | `invalid_change_type`, `customer_not_found` |
| DocumentProcessorAgent | `filenet_archived`, `filenet_archive_failed`, `llm_response_received`, `forgery_detected`, `no_forgery_detected`, `json_parse_failed`, `llm_call_failed` |
| ConfidenceScorerAgent | (step_start/end with scores in result) |
| SummaryAgent | `llm_summary_failed_using_fallback` |
| Pipeline | `pipeline_start`, `pipeline_complete`, `pipeline_failed_at_validation` |
| CheckerAPI | `rps_write_failed`, `request_rejected` |
| RPSMock | `rps_write_success` |

### Log Storage

```
logs/
  iasw.jsonl          ← append-only, one JSON object per line
```

Compatible with log aggregators via log forwarder (Filebeat, Fluentd, etc.):
- **Datadog**: tail `iasw.jsonl` with Datadog Agent
- **Grafana Loki**: use `promtail` with JSON parsing pipeline
- **Splunk**: HEC input with JSON sourcetype
- **CloudWatch**: use CloudWatch Logs agent with JSON multiline parser

---

## 9. Security Considerations

### Current (Demo) State

| Area | Current | Production Recommendation |
|---|---|---|
| Authentication | None | OAuth2 / Azure AD with JWT |
| Authorisation | None | Role-based: Maker (intake), Checker (decision), Admin (all) |
| API key storage | Environment variable | Azure Key Vault secret |
| Document storage | Local filesystem | Azure Blob Storage with SAS tokens |
| Database | SQLite, no encryption | PostgreSQL with TLS + row-level security |
| Audit trail | JSONL file + DB column | Immutable audit log (Azure Monitor + Log Analytics) |
| HTTPS | HTTP | TLS termination at load balancer |
| CORS | `localhost:3000` only | Domain-restricted in production |
| File upload | Any authenticated user | Staff authentication + file type validation + AV scan |

### HITL Security Invariant

The HITL boundary is enforced at the API level, not just the UI. An authenticated Checker
must make an explicit `POST /api/requests/{id}/decision` request — the AI pipeline cannot
bypass this gate programmatically.

### Sensitive Data Handling

- Documents are classified `SENSITIVE` in the FileNet metadata
- Retention policy defaults to `7_YEARS` (bank-standard KYC retention)
- `document_path` stored in DB is a server-side path; never exposed to the frontend
- Base64 document data is never stored in the database; only the FileNet reference ID

---

## 10. Production Readiness Checklist

### Infrastructure
- [ ] Replace SQLite with PostgreSQL (change `DATABASE_URL` in `config.py`)
- [ ] Replace FileNet mock with IBM FileNet or Azure Blob Storage
- [ ] Replace in-memory RPS mock with real CBS integration
- [ ] Add Redis for background task queue (Celery or ARQ) for async intake
- [ ] Add HTTPS / TLS termination (nginx or Azure API Management)

### Authentication & Authorisation
- [ ] Implement Azure AD / OAuth2 authentication
- [ ] Add role-based access: Maker, Checker, Admin
- [ ] Add API key rotation policy
- [ ] Store `AZURE_OPENAI_API_KEY` in Azure Key Vault

### Reliability
- [ ] Add retry logic with exponential backoff for Azure OpenAI calls
- [ ] Add circuit breaker for external service failures
- [ ] Add health checks for database and Azure OpenAI connectivity
- [ ] Implement database connection pooling (PgBouncer for PostgreSQL)

### PDF Support
- [ ] Add `pdf2image` or `pypdfium2` for PDF-to-image conversion
- [ ] Handle multi-page PDFs (extract and analyse page 1 for demo; all pages for production)

### Monitoring
- [ ] Forward `logs/iasw.jsonl` to Azure Monitor / Log Analytics
- [ ] Create Azure Dashboard for request volume, confidence distribution, approval rate
- [ ] Set up alerts for: error rate > 5%, avg confidence < 0.5, pipeline latency > 30s

### Compliance
- [ ] Implement immutable audit trail (write-once storage)
- [ ] Add data retention / purge policy enforcement
- [ ] Add GDPR/PII data masking in log output
- [ ] Add 4-eyes principle enforcement (Maker ≠ Checker for same request)

---

*Intelligent Account Servicing Workflow — Technical Documentation v1.0*
