"""
IASW - Configuration
Centralised settings loaded from environment variables.
LLM Provider: Azure OpenAI (GPT-4o with Vision)
"""
import os
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
FILENET_STORE_DIR = BASE_DIR / "filenet_store"
LOG_DIR = BASE_DIR / "logs"
DB_PATH = BASE_DIR / "iasw.db"

for d in (UPLOAD_DIR, FILENET_STORE_DIR, LOG_DIR):
    d.mkdir(parents=True, exist_ok=True)

# ── Azure OpenAI ───────────────────────────────────────────────────────────────
# Required environment variables:
#   AZURE_OPENAI_API_KEY        - your Azure OpenAI resource key
#   AZURE_OPENAI_ENDPOINT       - e.g. https://<resource>.openai.azure.com/
#   AZURE_OPENAI_DEPLOYMENT     - your GPT-4o deployment name (e.g. "gpt-4o")
#   AZURE_OPENAI_API_VERSION    - e.g. "2024-12-01-preview"

AZURE_OPENAI_API_KEY: str     = os.getenv("AZURE_OPENAI_API_KEY", "")
AZURE_OPENAI_ENDPOINT: str    = os.getenv("AZURE_OPENAI_ENDPOINT", "")
AZURE_OPENAI_DEPLOYMENT: str  = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
AZURE_OPENAI_API_VERSION: str = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")

# ── LLM ───────────────────────────────────────────────────────────────────────
LLM_MAX_TOKENS: int = 2048

# ── App ───────────────────────────────────────────────────────────────────────
APP_TITLE: str = "Intelligent Account Servicing Workflow"
APP_VERSION: str = "1.0.0"
CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

# ── HITL Thresholds ───────────────────────────────────────────────────────────
CONFIDENCE_FLAG_THRESHOLD: float = 0.70
CONFIDENCE_REJECT_THRESHOLD: float = 0.40

# ── Mock RPS Customer Records ─────────────────────────────────────────────────
RPS_CUSTOMERS: dict = {
    "C001": {
        "customer_id": "C001",
        "name": "Priya Sharma",
        "address": "123 MG Road, Mumbai 400001",
        "dob": "1990-05-15",
        "email": "priya.sharma@email.com",
        "phone": "+91-9876543210",
        "account_number": "ACC001234567",
        "status": "active",
    },
    "C002": {
        "customer_id": "C002",
        "name": "Arjun Verma",
        "address": "45 Park Street, Kolkata 700016",
        "dob": "1985-11-22",
        "email": "arjun.verma@email.com",
        "phone": "+91-9123456789",
        "account_number": "ACC002345678",
        "status": "active",
    },
    "C003": {
        "customer_id": "C003",
        "name": "Sunita Patel",
        "address": "78 Linking Road, Ahmedabad 380001",
        "dob": "1992-03-08",
        "email": "sunita.patel@email.com",
        "phone": "+91-9012345678",
        "account_number": "ACC003456789",
        "status": "active",
    },
}
