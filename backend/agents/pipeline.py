"""
IASW - Agent Pipeline Orchestrator
─────────────────────────────────────────────────────────────────────────────
Runs the four agents in sequence (LangGraph-style linear graph):

  ValidationAgent
       │ (pass/fail)
       ▼
  DocumentProcessorAgent
       │
       ▼
  ConfidenceScorerAgent
       │
       ▼
  SummaryAgent
       │
       ▼
  PipelineState (completed=True)

Each agent receives and returns a PipelineState object.
The orchestrator persists the DB record at each step for partial recovery.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from agents import (
    validation_agent,
    document_processor,
    confidence_scorer,
    summary_agent,
)
from agents.state import PipelineState
from db.models import ChangeRequest
from observability import AgentLogger


async def _persist(db: AsyncSession, record: ChangeRequest) -> None:
    """Upsert the request record to DB."""
    db.add(record)
    await db.flush()


async def run_pipeline(
    *,
    db: AsyncSession,
    customer_id: str,
    change_type: str,
    old_value: str,
    new_value: str,
    staff_id: str,
    staff_notes: str,
    document_path,
    document_filename: str,
) -> ChangeRequest:
    """
    Full agent pipeline. Creates a DB record, runs all agents, returns the
    final persisted ChangeRequest row.
    """
    request_id = str(uuid.uuid4())
    logger = AgentLogger(request_id)

    logger.info("Pipeline", "pipeline_start", change_type=change_type, customer_id=customer_id)

    # ── Create initial DB record ───────────────────────────────────────────────
    record = ChangeRequest(
        id=request_id,
        customer_id=customer_id,
        change_type=change_type,
        old_value=old_value,
        new_value=new_value,
        staff_id=staff_id,
        staff_notes=staff_notes,
        document_filename=document_filename,
        document_path=str(document_path) if document_path else None,
        status="AI_PROCESSING",
    )
    await _persist(db, record)

    # ── Build pipeline state ───────────────────────────────────────────────────
    state = PipelineState(
        request_id=request_id,
        customer_id=customer_id,
        change_type=change_type,
        old_value=old_value,
        new_value=new_value,
        staff_id=staff_id,
        staff_notes=staff_notes,
        document_path=document_path,
        document_filename=document_filename,
    )

    # ── Agent 1: Validation ────────────────────────────────────────────────────
    state = await validation_agent.run(state, logger)
    if not state.validation_passed:
        record.status = "FAILED"
        record.error_message = "; ".join(state.validation_errors)
        record.agent_logs = logger.get_all()
        await _persist(db, record)
        logger.error("Pipeline", "pipeline_failed_at_validation",
                     errors=state.validation_errors)
        return record

    # ── Agent 2: Document Processor ────────────────────────────────────────────
    state = await document_processor.run(state, logger)
    if state.error:
        record.status = "FAILED"
        record.error_message = state.error
        record.agent_logs = logger.get_all()
        await _persist(db, record)
        return record

    # Persist FileNet data immediately after archival
    record.filenet_reference_id = state.filenet_reference_id
    record.filenet_metadata = state.filenet_metadata
    record.extracted_fields = state.extracted_fields
    record.forgery_detected = state.forgery_detected
    record.forgery_details = state.forgery_details
    await _persist(db, record)

    # ── Agent 3: Confidence Scorer ─────────────────────────────────────────────
    state = await confidence_scorer.run(state, logger)
    record.confidence_scores = state.confidence_scores
    record.overall_confidence = state.overall_confidence
    await _persist(db, record)

    # ── Agent 4: Summary Agent ─────────────────────────────────────────────────
    state = await summary_agent.run(state, logger)
    record.ai_summary = state.ai_summary
    record.recommended_action = state.recommended_action

    # ── Finalise record ────────────────────────────────────────────────────────
    record.status = "AI_VERIFIED_PENDING_HUMAN"
    record.ai_completed_at = datetime.now(timezone.utc)
    record.agent_logs = logger.get_all()
    await _persist(db, record)

    logger.info("Pipeline", "pipeline_complete",
                status=record.status,
                overall_confidence=state.overall_confidence,
                recommended_action=state.recommended_action)

    return record
