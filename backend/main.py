"""
IASW - FastAPI Application Entry Point
Run with: uvicorn main:app --reload --port 8000
"""
# Load .env FIRST — before any config imports read os.getenv()
from dotenv import load_dotenv
load_dotenv()  # looks for .env in backend/ then walks up to iasw/

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes import router
from config import APP_TITLE, APP_VERSION, CORS_ORIGINS, UPLOAD_DIR
from db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    await init_db()
    yield


app = FastAPI(
    title=APP_TITLE,
    version=APP_VERSION,
    description=(
        "Intelligent Account Servicing Workflow — AI-powered document verification "
        "with mandatory Human-in-the-Loop Checker approval before any core banking update."
    ),
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API Routes ─────────────────────────────────────────────────────────────────
app.include_router(router, prefix="/api")

# ── Serve uploaded documents (for Checker preview) ────────────────────────────
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


@app.get("/")
async def root():
    return {
        "service": APP_TITLE,
        "version": APP_VERSION,
        "docs": "/docs",
        "health": "/api/health",
    }
