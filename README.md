## IASW — Intelligent Account Servicing Workflow

An AI-powered, agentic workflow system designed to automate and streamline banking account change request verification while ensuring strict regulatory compliance through a Human-in-the-Loop (HITL) approval mechanism.

This project replaces the traditional manual “Maker–Checker” process with an intelligent AI-driven pipeline that performs document processing, data extraction, validation, and confidence scoring, while preserving the human Checker as the final authority before any core banking update is executed

---

## Table of Contents

1. [Overview](#overview)
2. [Core HITL Constraint](#core-hitl-constraint)
3. [Tech Stack & Justification](#tech-stack--justification)
4. [Project Structure](#project-structure)
5. [Prerequisites & Azure OpenAI Setup](#prerequisites--azure-openai-setup)
6. [Quick Start — Local Development](#quick-start--local-development)
7. [Docker Setup](#docker-setup)
8. [End-to-End Demo Flow](#end-to-end-demo-flow)
9. [All 4 Change Types — Test Guide](#all-4-change-types--test-guide)
10. [API Reference](#api-reference)
11. [Agent Pipeline — Architecture](#agent-pipeline--architecture)
12. [Confidence Scoring Logic](#confidence-scoring-logic)
13. [Resilience & Retry Strategy](#resilience--retry-strategy)
14. [RPS Management (Runtime)](#rps-management-runtime)
15. [Observability & Logging](#observability--logging)
16. [Environment Variables](#environment-variables)
17. [Assumptions & Known Limitations](#assumptions--known-limitations)

---

## Overview

IASW replaces the manual **Maker role** in a bank's account change request process with a four-agent AI pipeline. The pipeline performs OCR extraction, forgery detection, confidence scoring, and summary generation — but **never writes to the core banking system (RPS) autonomously**.

The **human Checker Supervisor** is the final, non-negotiable decision authority.

### Supported Change Types

| Change Type | Required Document | AI Verification |
|---|---|---|
| Legal Name Change | Marriage Certificate, Deed Poll, Gazette | Match old name → new name |
| Address Update | Utility Bill, Lease Agreement, Govt ID | Extract and verify address string |
| Date of Birth | Birth Certificate, Passport, PAN Card | Verify date format + authenticity |
| Contact / Email | Digital Consent Form | Verify signature + new contact |

---

## Core HITL Constraint

```
┌──────────────────────────────────────────────────────────┐
│  AI CAN do autonomously:                                 │
│    ✓ Read customer records from RPS                      │
│    ✓ OCR + extract fields from documents (GPT-4o Vision) │
│    ✓ Detect forgery indicators                           │
│    ✓ Score field-level confidence                        │
│    ✓ Generate NL summary and recommendation              │
│    ✓ Archive documents to FileNet                        │
│    ✓ Write to the Pending Table (staging only)           │
│                                                          │
│  AI CANNOT do without a human:                           │
│    ✗ Approve or reject a request                         │
│    ✗ Trigger the RPS write-call                          │
│    ✗ Change status from AI_VERIFIED_PENDING_HUMAN        │
│    ✗ Modify live customer records                        │
└──────────────────────────────────────────────────────────┘
```

Enforced at the **API layer** in `POST /api/requests/{id}/decision` — not just the UI. The endpoint validates that `status == AI_VERIFIED_PENDING_HUMAN` before executing any RPS write.

---

## Tech Stack & Justification

| Layer | Choice | Justification |
|---|---|---|
| **Frontend** | Next.js 14 + Tailwind CSS | App Router for SSR, Tailwind for rapid professional UI |
| **Backend** | FastAPI + Uvicorn | Async-native Python, perfect for I/O-bound AI API calls. Auto-generates OpenAPI docs |
| **Orchestration** | Custom sequential pipeline (`pipeline.py`) | Fixed linear graph — no dynamic routing needed. Deterministic and fully auditable, which is mandatory for banking compliance. An LLM orchestrator would make routing non-auditable |
| **LLM + OCR** | Azure OpenAI GPT-4o (Vision) | Single model handles both Vision OCR and text summarisation. Enterprise-grade SLA via Azure. No separate OCR service needed |
| **Database** | SQLite + SQLAlchemy async | Zero-config for demo; one-line swap to PostgreSQL for production |
| **Document Store** | Local filesystem (FileNet mock) | Faithful stub of IBM FileNet's metadata-indexed archival pattern |
| **Observability** | Structured JSONL logging | Per-step audit trail, compatible with Datadog/Splunk/Grafana Loki |
| **Containerisation** | Docker + Docker Compose | One-command production deployment |

---

## Project Structure

```
iasw/
├── .env                          ← Your Azure OpenAI credentials
├── .env.example                  ← Template
├── docker-compose.yml
├── README.md
│
├── backend/
│   ├── .env                      ← Backend copy (loaded by uvicorn)
│   ├── main.py                   ← FastAPI entry point (loads .env first)
│   ├── config.py                 ← Azure OpenAI settings, HITL thresholds
│   ├── requirements.txt
│   ├── Dockerfile
│   │
│   ├── agents/
│   │   ├── state.py              ← Typed PipelineState dataclass
│   │   ├── pipeline.py           ← Sequential orchestrator (DB persistence per step)
│   │   ├── validation_agent.py   ← Agent 1: RPS cross-reference
│   │   ├── document_processor.py ← Agent 2: GPT-4o Vision OCR + FileNet + retry
│   │   ├── confidence_scorer.py  ← Agent 3: Per-field weighted scoring
│   │   └── summary_agent.py      ← Agent 4: NL summary + deterministic recommendation
│   │
│   ├── api/
│   │   ├── routes.py             ← All REST endpoints + HITL gate
│   │   └── schemas.py            ← Pydantic request/response models
│   │
│   ├── db/
│   │   ├── database.py           ← Async SQLAlchemy engine
│   │   └── models.py             ← ChangeRequest ORM (Pending Table)
│   │
│   ├── services/
│   │   ├── rps_mock.py           ← Mock RPS: read, write (HITL-gated), add, reset
│   │   └── filenet_mock.py       ← Mock FileNet document archive
│   │
│   └── observability/
│       └── logger.py             ← Structured JSON audit logger
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx              ← Dashboard (stats + live RPS panel + reset)
│   │   ├── intake/page.tsx       ← Staff Intake Form (4-step wizard, dynamic customers)
│   │   ├── checker/page.tsx      ← Checker Queue (filterable, searchable)
│   │   └── checker/[id]/page.tsx ← Checker Review UI + HITL Decision panel
│   ├── components/NavBar.tsx
│   └── lib/api.ts                ← Axios client + TypeScript types
│
├── docs/
│   ├── ARCHITECTURE.md           ← Mermaid system diagrams
│   └── TECHNICAL_DOCUMENTATION.md
│
└── test_documents/               ← HTML test docs → save as PDF → upload to app
    ├── marriage_certificate_priya_sharma.html   ← Legal Name Change (C001)
    ├── utility_bill_arjun_verma.html            ← Address Update (C002)
    ├── dob_pan_birth_cert_sunita_patel.html     ← Date of Birth (C003)
    ├── consent_form_contact_email_priya_mehta.html ← Contact/Email (C001)
    └── TEST_GUIDE.html                          ← Visual test guide
```

---

## Prerequisites & Azure OpenAI Setup

| Tool | Minimum Version |
|---|---|
| Python | 3.12+ |
| Node.js | 20+ |
| Azure OpenAI | GPT-4o deployment with Vision |

### Get Your Azure OpenAI Credentials

1. Go to [Azure OpenAI Studio](https://oai.azure.com/)
2. **Deployments → Create → gpt-4o** (ensure Vision is enabled)
3. Copy **Endpoint** and **API Key** from Azure Portal → your resource → *Keys and Endpoint*

---

## Setup Instructions (Clone & Run)

### 1. Clone the Repository

```bash
git clone https://github.com/Bhanuraj23m0316iitb/Intelligent-Account-Servicing-Workflow-IASW-.git
cd Intelligent-Account-Servicing-Workflow-IASW-

```
### 2. Configure Environment Variables
Configure .env file in backend folder paste the following requirements

```bash
AZURE_OPENAI_API_KEY=your_api_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-12-01-preview

```

### 3. Start the backend

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Run (loads .env automatically via python-dotenv)
uvicorn main:app --reload --port 8000
```

Backend: **http://localhost:8000** · Swagger UI: **http://localhost:8000/docs**

### 4. Start the frontend

```bash
# New terminal
cd frontend
npm install
npm run dev
```

Frontend: **http://localhost:3000**

---

## Docker Setup

```bash
cd C:\Users\Admin\Downloads\iasw
docker-compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| Swagger | http://localhost:8000/docs |

---

## End-to-End Demo Flow

### The Primary Demo (Legal Name Change — as specified in assignment)

1. Open **http://localhost:3000/intake**
2. Select **C001 — Priya Sharma**, Staff ID: `STAFF001`
3. Select **Legal Name Change**
   - Current Value: `Priya Sharma` *(must match RPS exactly)*
   - New Value: `Priya Mehta`
4. Upload `test_documents/marriage_certificate_priya_sharma.html` → **Ctrl+P → Save as PDF** → Upload
5. Click **Submit for AI Verification** (~5–10 seconds)
6. AI pipeline runs and redirects to Checker Review page
7. Review: AI summary, confidence scores (~97%), FileNet reference, extracted fields
8. Enter Checker ID: `CHECKER001`, click **Approve** → Confirm
9. Status → **APPROVED**, RPS transaction ID logged ✅

### Via API (curl)

```bash
# Step 1: Submit
curl -X POST http://localhost:8000/api/intake/sync \
  -F "customer_id=C001" \
  -F "change_type=legal_name" \
  -F "old_value=Priya Sharma" \
  -F "new_value=Priya Mehta" \
  -F "staff_id=STAFF001" \
  -F "document=@marriage_certificate.pdf"

# Step 2: Checker approves (copy request id from above response)
curl -X POST http://localhost:8000/api/requests/{REQUEST_ID}/decision \
  -H "Content-Type: application/json" \
  -d '{"checker_id":"CHECKER001","decision":"approved","checker_notes":"Verified"}'
```

---

## All 4 Change Types — Test Guide

Open `test_documents/TEST_GUIDE.html` for the visual guide. Quick reference:

| # | Change Type | Customer | Current Value | New Value | Document |
|---|---|---|---|---|---|
| 1 | Legal Name | C001 | `Priya Sharma` | `Priya Mehta` | `marriage_certificate_priya_sharma.html` |
| 2 | Address | C002 | `45 Park Street, Kolkata 700016` | `78 Camac Street, Kolkata 700017` | `utility_bill_arjun_verma.html` |
| 3 | Date of Birth | C003 | `1992-03-08` | `1992-03-09` | `dob_pan_birth_cert_sunita_patel.html` |
| 4 | Contact/Email | C001 | `priya.sharma@email.com` | `priya.mehta@email.com` | `consent_form_contact_email_priya_mehta.html` |

**To use each document:** Open HTML in Chrome → Ctrl+P → Save as PDF → Upload to intake form.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/intake/sync` | Submit change request (synchronous — waits for pipeline) |
| `POST` | `/api/intake` | Submit change request (async background processing) |
| `GET` | `/api/requests` | List all requests — `?status=AI_VERIFIED_PENDING_HUMAN` |
| `GET` | `/api/requests/{id}` | Full request detail with AI results + agent logs |
| `POST` | `/api/requests/{id}/decision` | **🔒 HITL Gate** — Checker approves or rejects |
| `GET` | `/api/customers` | List live RPS customers (current state) |
| `GET` | `/api/customers/{id}` | Get single customer record |
| `POST` | `/api/admin/add-customer` | Add new customer to RPS at runtime |
| `POST` | `/api/admin/reset-rps` | Reset all RPS records to seed data (dev/test) |
| `GET` | `/api/stats` | Dashboard statistics |
| `GET` | `/api/rps/transactions` | RPS write-call audit log |
| `GET` | `/api/filenet/documents` | FileNet archive index |
| `GET` | `/api/health` | Health check |
| `GET` | `/docs` | Interactive Swagger UI |

---

## Agent Pipeline — Architecture

```
Staff Intake (Frontend)
        │
        ▼
  FastAPI /intake/sync
        │
        ▼
┌─────────────────────────────────────────────────────┐
│              pipeline.py (Orchestrator)             │
│                                                     │
│  Agent 1: ValidationAgent                          │
│    • Validates change_type, customer_id             │
│    • Cross-references old_value against RPS         │
│    • Checks account status = active                 │
│    → validation_passed / FAILED (stops pipeline)   │
│                   │                                 │
│  Agent 2: DocumentProcessorAgent                   │
│    • Archives to FileNet mock                       │
│    • PDF → pypdf text extraction                    │
│    • Image → base64 → GPT-4o Vision                │
│    • Extracts structured fields as JSON             │
│    • Detects forgery indicators                     │
│    • Retry: 3 attempts + JSON self-heal             │
│                   │                                 │
│  Agent 3: ConfidenceScorerAgent                    │
│    • SequenceMatcher name/address similarity        │
│    • Date-aware DOB comparison                      │
│    • Weighted per-field scores                      │
│    • Forgery penalty: −30% if detected              │
│    → confidence_scores + overall_confidence         │
│                   │                                 │
│  Agent 4: SummaryAgent                             │
│    • Deterministic recommendation (Python rule)     │
│    • GPT-4o narrative summary (2-attempt retry)     │
│    • Deterministic fallback if LLM fails            │
│    → ai_summary + recommended_action               │
└─────────────────────────────────────────────────────┘
        │
        ▼
  DB: status = AI_VERIFIED_PENDING_HUMAN
        │
        ▼
  Checker Review UI
        │
  Human Approve/Reject
        │
        ▼ (only on approval)
  RPSMock.write_to_rps()   ← THE ONLY RPS MUTATION POINT
  DB: status = APPROVED + rps_transaction_id
```

---

## Confidence Scoring Logic

### Per-Change-Type Weighted Scores

**Legal Name Change**
| Field | Algorithm | Weight |
|---|---|---|
| `old_name_match` | SequenceMatcher (honorifics stripped) | 35% |
| `new_name_match` | SequenceMatcher (honorifics stripped) | 45% |
| `document_authenticity` | Presence of date + authority + reg number | 20% |

**Address Update**
| Field | Algorithm | Weight |
|---|---|---|
| `address_match` | Full-string SequenceMatcher | 60% |
| `document_authenticity` | Presence of date + name | 40% |

**Date of Birth**
| Field | Algorithm | Weight |
|---|---|---|
| `dob_match` | Date-aware parsing → exact match | 65% |
| `document_authenticity` | Presence of doc number + authority | 35% |

**Contact / Email**
| Field | Algorithm | Weight |
|---|---|---|
| `contact_match` | String similarity | 55% |
| `consent_verification` | Signature present: 0.9, absent: 0.4 | 45% |

### Recommendation Thresholds (Rule-Based, Never LLM)

| Condition | Action |
|---|---|
| Forgery detected (any) | **REJECT** — overrides all scores |
| Overall ≥ 70% | **APPROVE** |
| Overall 40–70% | **REVIEW** |
| Overall < 40% | **REJECT** |

---

## Resilience & Retry Strategy

### Agent 2 — Document Processor (2 iteration types)

**Type 1: Exponential-backoff retry for Azure OpenAI transient errors**
```
Attempt 1 → immediate
Attempt 2 → wait 2 seconds   (429 rate-limit, 500 error, network timeout)
Attempt 3 → wait 4 seconds
→ FAILED with clear error
```

**Type 2: JSON self-healing (1 attempt)**
```
Parse fails → send broken output back to GPT-4o
             → ask "fix and return ONLY valid JSON"
             → parse again
             → FAILED only if healing also fails
```

### Agent 4 — Summary Agent (1 iteration type)
```
Attempt 1 → immediate
Attempt 2 → wait 2 seconds
→ Use deterministic fallback template (pipeline NEVER fails at this step)
```

### Why No Other Iteration
- **Agent 1 (Validation)** — Pure Python, deterministic, no external calls
- **Agent 3 (Scorer)** — Pure math, no external calls
- **No confidence-based re-extraction** — Re-running extraction to improve low scores would make the pipeline non-deterministic and non-auditable, violating banking compliance requirements. Low confidence is intentionally routed to the human Checker

---

## RPS Management (Runtime)

### Add a New Customer at Runtime

Via UI: **http://localhost:3000/intake** → Step 1 → **"Add New Customer"** button

Via API:
```bash
curl -X POST http://localhost:8000/api/admin/add-customer \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Rahul Gupta",
    "dob": "1988-07-22",
    "email": "rahul.gupta@email.com",
    "phone": "+91-9876500001",
    "address": "12 Park Avenue, Delhi 110001"
  }'
# customer_id is auto-generated as C004, C005...
```

### Reset RPS to Defaults

Via UI: Dashboard → **"Reset RPS to Defaults"** button → Confirm

Via API:
```bash
curl -X POST http://localhost:8000/api/admin/reset-rps
```

Resets C001/C002/C003 to original seed values. Clears transaction log. Change request history in DB is unaffected.

### Seed Customers

| ID | Name | DOB | Email |
|---|---|---|---|
| C001 | Priya Sharma | 1990-05-15 | priya.sharma@email.com |
| C002 | Arjun Verma | 1985-11-22 | arjun.verma@email.com |
| C003 | Sunita Patel | 1992-03-08 | sunita.patel@email.com |

---

## Observability & Logging

Every agent step emits a structured JSON entry to:
1. Console (stdout)
2. `backend/logs/iasw.jsonl` — newline-delimited JSON
3. `agent_logs` column in the DB — queryable per request via `GET /api/requests/{id}`

### Log Entry Format
```json
{
  "ts": "2024-03-15T10:23:45.123456+00:00",
  "level": "INFO",
  "request_id": "3f7a2b1c-...",
  "agent": "DocumentProcessorAgent",
  "event": "filenet_archived",
  "reference_id": "FN-ABC123",
  "file_size": 245678
}
```

### Viewing Logs
```bash
# Filter by request
grep "3f7a2b1c" backend/logs/iasw.jsonl | python -m json.tool

# All errors
grep '"level":"ERROR"' backend/logs/iasw.jsonl

# RPS audit trail
curl http://localhost:8000/api/rps/transactions
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `AZURE_OPENAI_API_KEY` | ✓ | Azure OpenAI resource key |
| `AZURE_OPENAI_ENDPOINT` | ✓ | e.g. `https://myresource.openai.azure.com/` |
| `AZURE_OPENAI_DEPLOYMENT` | ✓ | GPT-4o deployment name in Azure Studio |
| `AZURE_OPENAI_API_VERSION` | ✓ | e.g. `2024-12-01-preview` |

Place in `iasw/.env` AND `iasw/backend/.env` (the backend reads from its own directory at startup).

---

## Assumptions & Known Limitations

1. **In-memory RPS** — Customer records reset on backend restart. Use `POST /api/admin/reset-rps` anytime during a session, or add customers to `config.py` → `RPS_CUSTOMERS` to make them permanent
2. **SQLite** — Zero-config for demo; swap to PostgreSQL by changing `DATABASE_URL` in `config.py`
3. **PDF as text** — PDFs are processed via `pypdf` text extraction. Scanned/image PDFs with no extractable text receive reduced confidence scores. For production, add `pdf2image` + cloud OCR
4. **No authentication** — Production would require OAuth2/Azure AD with Maker, Checker, Admin roles
5. **Single document per request** — Production would support multiple supporting documents
6. **No real FileNet/RPS** — Mock stubs with the same interface contract; replace `FileNetMock.archive_document()` and `RPSMock.write_to_rps()` for production

---

*IASW v1.0 — Intelligent Account Servicing Workflow · Azure OpenAI (GPT-4o) Edition*
