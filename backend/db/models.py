"""
IASW - Database Models (SQLAlchemy + aiosqlite)
"""
import json
from datetime import datetime
from sqlalchemy import (
    Column, String, Float, Boolean, Text, DateTime, JSON
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class ChangeRequest(Base):
    """
    The central Pending Table for all account change requests.
    Lifecycle: PENDING → AI_PROCESSING → AI_VERIFIED_PENDING_HUMAN → APPROVED | REJECTED
    """
    __tablename__ = "change_requests"

    # ── Identity ──────────────────────────────────────────────────────────────
    id = Column(String(36), primary_key=True)           # UUID4
    customer_id = Column(String(50), nullable=False)
    change_type = Column(String(50), nullable=False)    # legal_name | address | dob | contact

    # ── Request Data ──────────────────────────────────────────────────────────
    old_value = Column(String(500), nullable=False)
    new_value = Column(String(500), nullable=False)
    staff_id = Column(String(100), nullable=True)
    staff_notes = Column(Text, nullable=True)

    # ── Document ──────────────────────────────────────────────────────────────
    document_filename = Column(String(500), nullable=True)
    document_path = Column(String(500), nullable=True)
    filenet_reference_id = Column(String(100), nullable=True)
    filenet_metadata = Column(JSON, nullable=True)

    # ── AI Processing Results ─────────────────────────────────────────────────
    extracted_fields = Column(JSON, nullable=True)      # {field: value}
    confidence_scores = Column(JSON, nullable=True)     # {field: 0.0-1.0}
    overall_confidence = Column(Float, nullable=True)   # 0.0-1.0
    forgery_detected = Column(Boolean, default=False)
    forgery_details = Column(Text, nullable=True)
    ai_summary = Column(Text, nullable=True)
    recommended_action = Column(String(20), nullable=True)  # approve | reject | review

    # ── Status ────────────────────────────────────────────────────────────────
    status = Column(String(50), default="PENDING")
    # PENDING | AI_PROCESSING | AI_VERIFIED_PENDING_HUMAN | APPROVED | REJECTED | FAILED

    # ── HITL Checker Decision ─────────────────────────────────────────────────
    checker_id = Column(String(100), nullable=True)
    checker_decision = Column(String(20), nullable=True)    # approved | rejected
    checker_notes = Column(Text, nullable=True)
    checker_timestamp = Column(DateTime, nullable=True)

    # ── RPS (Core Banking) ────────────────────────────────────────────────────
    rps_transaction_id = Column(String(100), nullable=True)
    rps_status = Column(String(50), nullable=True)
    rps_response = Column(JSON, nullable=True)

    # ── Observability / Audit ─────────────────────────────────────────────────
    agent_logs = Column(JSON, nullable=True)            # List of log entries
    error_message = Column(Text, nullable=True)

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    ai_completed_at = Column(DateTime, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "customer_id": self.customer_id,
            "change_type": self.change_type,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "staff_id": self.staff_id,
            "staff_notes": self.staff_notes,
            "document_filename": self.document_filename,
            "filenet_reference_id": self.filenet_reference_id,
            "filenet_metadata": self.filenet_metadata,
            "extracted_fields": self.extracted_fields,
            "confidence_scores": self.confidence_scores,
            "overall_confidence": self.overall_confidence,
            "forgery_detected": self.forgery_detected,
            "forgery_details": self.forgery_details,
            "ai_summary": self.ai_summary,
            "recommended_action": self.recommended_action,
            "status": self.status,
            "checker_id": self.checker_id,
            "checker_decision": self.checker_decision,
            "checker_notes": self.checker_notes,
            "checker_timestamp": self.checker_timestamp.isoformat() if self.checker_timestamp else None,
            "rps_transaction_id": self.rps_transaction_id,
            "rps_status": self.rps_status,
            "rps_response": self.rps_response,
            "agent_logs": self.agent_logs,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "ai_completed_at": self.ai_completed_at.isoformat() if self.ai_completed_at else None,
        }
