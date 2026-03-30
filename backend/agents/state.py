"""
IASW - Agent Pipeline State
Typed dataclass passed through each agent step (LangGraph-style state).
"""
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class PipelineState:
    """
    Immutable-ish state object threaded through the agent pipeline.
    Each agent reads from it and writes its outputs back into it.
    """

    # ── Input ─────────────────────────────────────────────────────────────────
    request_id: str = ""
    customer_id: str = ""
    change_type: str = ""      # legal_name | address | dob | contact
    old_value: str = ""
    new_value: str = ""
    staff_id: str = ""
    staff_notes: str = ""

    # ── Document ──────────────────────────────────────────────────────────────
    document_path: Path | None = None
    document_filename: str = ""

    # ── Agent 1: Validation Agent ─────────────────────────────────────────────
    validation_passed: bool = False
    validation_errors: list[str] = field(default_factory=list)
    rps_customer_record: dict = field(default_factory=dict)

    # ── Agent 2: Document Processor ───────────────────────────────────────────
    extracted_fields: dict[str, str] = field(default_factory=dict)
    forgery_detected: bool = False
    forgery_details: str = ""
    filenet_reference_id: str = ""
    filenet_metadata: dict = field(default_factory=dict)

    # ── Agent 3: Confidence Scorer ────────────────────────────────────────────
    confidence_scores: dict[str, float] = field(default_factory=dict)
    overall_confidence: float = 0.0

    # ── Agent 4: Summary Agent ────────────────────────────────────────────────
    ai_summary: str = ""
    recommended_action: str = ""   # approve | review | reject

    # ── Pipeline metadata ─────────────────────────────────────────────────────
    error: str = ""
    completed: bool = False
