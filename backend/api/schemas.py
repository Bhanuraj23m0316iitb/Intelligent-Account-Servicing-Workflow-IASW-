"""
IASW - Request / Response Schemas (Pydantic v2)
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


# ── Intake ────────────────────────────────────────────────────────────────────

class IntakeRequest(BaseModel):
    customer_id: str = Field(..., min_length=1, max_length=50)
    change_type: str = Field(..., pattern="^(legal_name|address|dob|contact)$")
    old_value: str = Field(..., min_length=1, max_length=500)
    new_value: str = Field(..., min_length=1, max_length=500)
    staff_id: Optional[str] = Field(None, max_length=100)
    staff_notes: Optional[str] = Field(None, max_length=1000)


class IntakeResponse(BaseModel):
    request_id: str
    status: str
    message: str


# ── Change Request Detail ─────────────────────────────────────────────────────

class ChangeRequestSummary(BaseModel):
    id: str
    customer_id: str
    change_type: str
    old_value: str
    new_value: str
    status: str
    overall_confidence: Optional[float]
    recommended_action: Optional[str]
    forgery_detected: Optional[bool]
    filenet_reference_id: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    checker_decision: Optional[str]
    checker_timestamp: Optional[datetime]


class ChangeRequestDetail(ChangeRequestSummary):
    staff_id: Optional[str]
    staff_notes: Optional[str]
    document_filename: Optional[str]
    extracted_fields: Optional[dict[str, Any]]
    confidence_scores: Optional[dict[str, float]]
    forgery_details: Optional[str]
    ai_summary: Optional[str]
    filenet_metadata: Optional[dict[str, Any]]
    checker_id: Optional[str]
    checker_notes: Optional[str]
    rps_transaction_id: Optional[str]
    rps_status: Optional[str]
    rps_response: Optional[dict[str, Any]]
    agent_logs: Optional[list[dict[str, Any]]]
    error_message: Optional[str]
    ai_completed_at: Optional[datetime]


# ── Checker Decision ──────────────────────────────────────────────────────────

class CheckerDecisionRequest(BaseModel):
    checker_id: str = Field(..., min_length=1, max_length=100)
    decision: str = Field(..., pattern="^(approved|rejected)$")
    checker_notes: Optional[str] = Field(None, max_length=1000)


class CheckerDecisionResponse(BaseModel):
    request_id: str
    decision: str
    rps_transaction_id: Optional[str]
    rps_status: Optional[str]
    message: str


# ── RPS / Customer ────────────────────────────────────────────────────────────

class CustomerRecord(BaseModel):
    customer_id: str
    name: str
    address: str
    dob: str
    email: str
    phone: str
    account_number: str
    status: str


class CreateCustomerRequest(BaseModel):
    """Request body for adding a new customer to the mock RPS at runtime."""
    name: str = Field(..., min_length=2, max_length=200,
                      description="Full name of the customer")
    address: str = Field(..., min_length=5, max_length=500,
                         description="Full residential address")
    dob: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$",
                     description="Date of birth in YYYY-MM-DD format")
    email: str = Field(..., min_length=5, max_length=200,
                       description="Email address")
    phone: str = Field(..., min_length=7, max_length=20,
                       description="Phone number e.g. +91-9876543210")
    customer_id: Optional[str] = Field(
        None, max_length=20,
        description="Optional custom ID. If blank, auto-generated as C004, C005 …"
    )


# ── Dashboard Stats ───────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total: int
    pending_human: int
    approved: int
    rejected: int
    failed: int
    processing: int
    avg_confidence: Optional[float]
