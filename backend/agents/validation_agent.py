"""
IASW - Agent 1: Validation Agent
─────────────────────────────────────────────────────────────────────────────
Responsibility:
  • Validate all intake form fields (customer_id, old_value, new_value)
  • Cross-reference against the mock RPS to confirm the customer exists
    and the stated current value matches the system of record
  • Flag any field-level errors before costly LLM processing begins

Input:  PipelineState (customer_id, change_type, old_value, new_value)
Output: PipelineState updated with validation_passed, validation_errors,
        rps_customer_record
"""
from agents.state import PipelineState
from observability import AgentLogger
from services import RPSMock

AGENT_NAME = "ValidationAgent"

# Mapping from change_type to the RPS field that stores the current value
FIELD_MAP = {
    "legal_name": "name",
    "address": "address",
    "dob": "dob",
    "contact": "email",
}


async def run(state: PipelineState, logger: AgentLogger) -> PipelineState:
    """
    Validates the intake request against RPS records.
    Updates state in-place and returns it.
    """
    logger.step_start(AGENT_NAME)
    errors: list[str] = []

    # ── 1. Check change type ──────────────────────────────────────────────────
    if state.change_type not in FIELD_MAP:
        errors.append(f"Unsupported change type: '{state.change_type}'. "
                      f"Allowed: {list(FIELD_MAP.keys())}")
        state.validation_passed = False
        state.validation_errors = errors
        logger.error(AGENT_NAME, "invalid_change_type", change_type=state.change_type)
        return state

    # ── 2. Look up customer in RPS ────────────────────────────────────────────
    customer = RPSMock.get_customer(state.customer_id)
    if not customer:
        errors.append(f"Customer '{state.customer_id}' not found in RPS.")
        state.validation_passed = False
        state.validation_errors = errors
        logger.error(AGENT_NAME, "customer_not_found", customer_id=state.customer_id)
        return state

    state.rps_customer_record = customer

    # ── 3. Validate account is active ────────────────────────────────────────
    if customer.get("status") != "active":
        errors.append(f"Account {state.customer_id} is not active "
                      f"(status: {customer.get('status')}).")

    # ── 4. Validate old_value matches RPS ────────────────────────────────────
    rps_field = FIELD_MAP[state.change_type]
    rps_current = customer.get(rps_field, "")
    if rps_current.strip().lower() != state.old_value.strip().lower():
        errors.append(
            f"Stated current {state.change_type} '{state.old_value}' "
            f"does not match RPS record '{rps_current}'. "
            "Please verify the existing value before submitting."
        )

    # ── 5. new_value must differ from old_value ───────────────────────────────
    if state.new_value.strip().lower() == state.old_value.strip().lower():
        errors.append("New value is identical to the current value — no change needed.")

    # ── 6. Basic length/format guards ─────────────────────────────────────────
    if len(state.new_value.strip()) < 2:
        errors.append("New value is too short (minimum 2 characters).")

    state.validation_passed = len(errors) == 0
    state.validation_errors = errors

    logger.step_end(
        AGENT_NAME,
        result={
            "validation_passed": state.validation_passed,
            "errors": errors,
            "customer_found": True,
            "rps_field": rps_field,
            "rps_current_value": rps_current,
        },
    )
    return state
