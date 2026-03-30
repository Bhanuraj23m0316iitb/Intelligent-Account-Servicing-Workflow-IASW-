"""
IASW - FastAPI Route Handlers
─────────────────────────────────────────────────────────────────────────────
Endpoints:
  POST /api/intake/sync         — Staff submits a change request (sync, demo)
  POST /api/intake              — Staff submits a change request (async bg)
  GET  /api/requests            — List all change requests
  GET  /api/requests/{id}       — Get a single request (full detail)
  POST /api/requests/{id}/decision — Checker approves or rejects (HITL gate)
  GET  /api/customers           — List all mock RPS customers (live state)
  GET  /api/customers/{id}      — Get a single customer record
  POST /api/admin/add-customer  — Add new customer to RPS at runtime
  POST /api/admin/reset-rps     — Reset RPS to seed data (DEV/TEST only)
  GET  /api/stats               — Dashboard statistics
  GET  /api/rps/transactions    — RPS transaction audit log
  GET  /api/health              — Health check
"""
import shutil
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.pipeline import run_pipeline
from api.schemas import (
    CheckerDecisionRequest,
    CheckerDecisionResponse,
    ChangeRequestDetail,
    ChangeRequestSummary,
    CreateCustomerRequest,
    CustomerRecord,
    DashboardStats,
    IntakeResponse,
)
from config import UPLOAD_DIR
from db import ChangeRequest, get_db
from observability import AgentLogger
from services import FileNetMock, RPSError, RPSMock

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════════════
# INTAKE
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/intake", response_model=IntakeResponse, status_code=202)
async def submit_intake(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    customer_id: str = Form(...),
    change_type: str = Form(...),
    old_value: str = Form(...),
    new_value: str = Form(...),
    staff_id: Optional[str] = Form(None),
    staff_notes: Optional[str] = Form(None),
    document: UploadFile = File(...),
):
    """Staff submits a change request — pipeline runs in background."""
    allowed_types = {"legal_name", "address", "dob", "contact"}
    if change_type not in allowed_types:
        raise HTTPException(400, f"Invalid change_type. Allowed: {allowed_types}")

    safe_filename = f"{uuid.uuid4().hex}_{document.filename}"
    doc_path = UPLOAD_DIR / safe_filename
    with open(doc_path, "wb") as f:
        shutil.copyfileobj(document.file, f)

    async def _run_bg():
        from db.database import AsyncSessionLocal
        async with AsyncSessionLocal() as bg_db:
            await run_pipeline(
                db=bg_db,
                customer_id=customer_id, change_type=change_type,
                old_value=old_value, new_value=new_value,
                staff_id=staff_id or "", staff_notes=staff_notes or "",
                document_path=doc_path, document_filename=document.filename,
            )
            await bg_db.commit()

    background_tasks.add_task(_run_bg)
    return IntakeResponse(
        request_id="pending", status="ACCEPTED",
        message="Change request accepted. AI pipeline is processing your submission.",
    )


@router.post("/intake/sync", response_model=ChangeRequestDetail, status_code=201)
async def submit_intake_sync(
    db: AsyncSession = Depends(get_db),
    customer_id: str = Form(...),
    change_type: str = Form(...),
    old_value: str = Form(...),
    new_value: str = Form(...),
    staff_id: Optional[str] = Form(None),
    staff_notes: Optional[str] = Form(None),
    document: UploadFile = File(...),
):
    """Synchronous intake — waits for pipeline. Use for the demo flow."""
    allowed_types = {"legal_name", "address", "dob", "contact"}
    if change_type not in allowed_types:
        raise HTTPException(400, f"Invalid change_type. Allowed: {allowed_types}")

    safe_filename = f"{uuid.uuid4().hex}_{document.filename}"
    doc_path = UPLOAD_DIR / safe_filename
    with open(doc_path, "wb") as f:
        shutil.copyfileobj(document.file, f)

    record = await run_pipeline(
        db=db,
        customer_id=customer_id, change_type=change_type,
        old_value=old_value, new_value=new_value,
        staff_id=staff_id or "", staff_notes=staff_notes or "",
        document_path=doc_path, document_filename=document.filename,
    )
    await db.commit()
    await db.refresh(record)
    return ChangeRequestDetail(**record.to_dict())


# ═══════════════════════════════════════════════════════════════════════════════
# REQUESTS LIST & DETAIL
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/requests", response_model=List[ChangeRequestSummary])
async def list_requests(
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = None,
    change_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    stmt = select(ChangeRequest).order_by(ChangeRequest.created_at.desc())
    if status:
        stmt = stmt.where(ChangeRequest.status == status)
    if change_type:
        stmt = stmt.where(ChangeRequest.change_type == change_type)
    stmt = stmt.limit(limit).offset(offset)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [ChangeRequestSummary(**r.to_dict()) for r in rows]


@router.get("/requests/{request_id}", response_model=ChangeRequestDetail)
async def get_request(request_id: str, db: AsyncSession = Depends(get_db)):
    row = await db.get(ChangeRequest, request_id)
    if not row:
        raise HTTPException(404, f"Request '{request_id}' not found.")
    return ChangeRequestDetail(**row.to_dict())


# ═══════════════════════════════════════════════════════════════════════════════
# HITL CHECKER DECISION
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/requests/{request_id}/decision", response_model=CheckerDecisionResponse)
async def checker_decision(
    request_id: str,
    body: CheckerDecisionRequest,
    db: AsyncSession = Depends(get_db),
):
    """HITL Gate — RPS write ONLY executes here, ONLY on explicit human approval."""
    row = await db.get(ChangeRequest, request_id)
    if not row:
        raise HTTPException(404, f"Request '{request_id}' not found.")

    if row.status != "AI_VERIFIED_PENDING_HUMAN":
        raise HTTPException(
            409,
            f"Request is in status '{row.status}' — "
            "only AI_VERIFIED_PENDING_HUMAN requests can be decided.",
        )

    logger = AgentLogger(request_id)
    now = datetime.now(timezone.utc)
    row.checker_id = body.checker_id
    row.checker_decision = body.decision
    row.checker_notes = body.checker_notes
    row.checker_timestamp = now

    if body.decision == "approved":
        try:
            txn = RPSMock.write_to_rps(
                request_id=request_id, checker_id=body.checker_id,
                customer_id=row.customer_id, change_type=row.change_type,
                new_value=row.new_value, logger=logger,
            )
            row.status = "APPROVED"
            row.rps_transaction_id = txn["transaction_id"]
            row.rps_status = "SUCCESS"
            row.rps_response = txn
            message = (
                f"Request approved by {body.checker_id}. "
                f"RPS updated. Transaction: {txn['transaction_id']}"
            )
        except RPSError as exc:
            row.status = "APPROVED"
            row.rps_status = "RPS_ERROR"
            row.rps_response = {"error": str(exc)}
            message = f"Approved but RPS write failed: {exc}"
            logger.error("CheckerAPI", "rps_write_failed", error=str(exc))
    else:
        row.status = "REJECTED"
        row.rps_status = None
        message = f"Request rejected by {body.checker_id}."

    row.agent_logs = (row.agent_logs or []) + logger.get_all()
    row.updated_at = now
    db.add(row)
    await db.commit()
    await db.refresh(row)

    return CheckerDecisionResponse(
        request_id=request_id, decision=body.decision,
        rps_transaction_id=row.rps_transaction_id,
        rps_status=row.rps_status, message=message,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMERS — Live RPS State
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/customers", response_model=List[CustomerRecord])
async def list_customers():
    """Returns the LIVE current state of all RPS customer records."""
    return [CustomerRecord(**c) for c in RPSMock.list_customers()]


@router.get("/customers/{customer_id}", response_model=CustomerRecord)
async def get_customer(customer_id: str):
    c = RPSMock.get_customer(customer_id)
    if not c:
        raise HTTPException(404, f"Customer '{customer_id}' not found in RPS.")
    return CustomerRecord(**c)


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN — ADD CUSTOMER (runtime)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/admin/add-customer", response_model=CustomerRecord, status_code=201)
async def add_customer(body: CreateCustomerRequest):
    """
    Add a new customer to the mock RPS at runtime.
    The new customer is immediately available for intake requests.
    Customer ID is auto-generated (C004, C005 …) unless you specify one.
    """
    try:
        customer = RPSMock.add_customer(
            name=body.name,
            address=body.address,
            dob=body.dob,
            email=body.email,
            phone=body.phone,
            customer_id=body.customer_id or None,
        )
        return CustomerRecord(**customer)
    except RPSError as exc:
        raise HTTPException(409, str(exc))


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN — RESET RPS (DEV/TEST only)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/admin/reset-rps")
async def reset_rps():
    """
    Resets all RPS records to original seed data and clears the transaction log.
    DEV / TEST ONLY.
    """
    return RPSMock.reset_to_defaults()


# ═══════════════════════════════════════════════════════════════════════════════
# STATS & AUDIT
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/stats", response_model=DashboardStats)
async def get_stats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChangeRequest))
    rows = result.scalars().all()
    statuses = [r.status for r in rows]
    confidences = [r.overall_confidence for r in rows if r.overall_confidence is not None]
    return DashboardStats(
        total=len(rows),
        pending_human=statuses.count("AI_VERIFIED_PENDING_HUMAN"),
        approved=statuses.count("APPROVED"),
        rejected=statuses.count("REJECTED"),
        failed=statuses.count("FAILED"),
        processing=statuses.count("AI_PROCESSING"),
        avg_confidence=round(sum(confidences) / len(confidences), 4) if confidences else None,
    )


@router.get("/rps/transactions")
async def rps_transactions():
    return RPSMock.get_transaction_log()


@router.get("/filenet/documents")
async def filenet_documents():
    return FileNetMock.list_all()


@router.get("/health")
async def health():
    return {"status": "ok", "service": "IASW Backend"}
