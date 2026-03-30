"""
IASW - Mock RPS (Core Banking / Record Processing System)
Stubs the real RPS integration.  In production this would be replaced by
a secured microservice call (mTLS + audit trail) to the bank's CBS.

HITL ENFORCEMENT:
  The write_to_rps() function is the ONLY place where customer data
  is mutated.  It is ONLY callable after a Checker has approved the request.
  The backend API enforces this gate; the function itself also checks.
"""
import uuid
from datetime import datetime, timezone

from config import RPS_CUSTOMERS
from observability import AgentLogger


class RPSError(Exception):
    pass


class RPSMock:
    """Simulates a core banking record store."""

    # In-memory store — mutable copy of seed data
    _store: dict = {k: dict(v) for k, v in RPS_CUSTOMERS.items()}
    _transaction_log: list[dict] = []

    # ── Read ──────────────────────────────────────────────────────────────────

    @classmethod
    def get_customer(cls, customer_id: str) -> dict | None:
        return cls._store.get(customer_id)

    @classmethod
    def list_customers(cls) -> list[dict]:
        return list(cls._store.values())

    # ── Add Customer (Runtime) ────────────────────────────────────────────────

    @classmethod
    def add_customer(
        cls,
        *,
        name: str,
        address: str,
        dob: str,
        email: str,
        phone: str,
        customer_id: str | None = None,
    ) -> dict:
        """
        Adds a new customer to the in-memory RPS store at runtime.
        Auto-generates a customer ID if not provided (C004, C005, …).
        Raises RPSError if the customer_id already exists.
        """
        # Auto-generate ID if not given
        if not customer_id:
            existing_nums = []
            for k in cls._store:
                if k.startswith("C") and k[1:].isdigit():
                    existing_nums.append(int(k[1:]))
            next_num = max(existing_nums, default=0) + 1
            customer_id = f"C{next_num:03d}"

        # Prevent duplicates
        if customer_id in cls._store:
            raise RPSError(
                f"Customer ID '{customer_id}' already exists in RPS. "
                "Choose a different ID or leave blank to auto-generate."
            )

        # Generate account number
        account_number = f"ACC{uuid.uuid4().int % 10**9:09d}"

        customer = {
            "customer_id":    customer_id,
            "name":           name.strip(),
            "address":        address.strip(),
            "dob":            dob.strip(),
            "email":          email.strip().lower(),
            "phone":          phone.strip(),
            "account_number": account_number,
            "status":         "active",
        }
        cls._store[customer_id] = customer
        return customer

    # ── Reset (Dev/Test only) ─────────────────────────────────────────────────

    @classmethod
    def reset_to_defaults(cls) -> dict:
        """
        Resets all customer records back to the original seed data.
        Clears the transaction log.
        DEV / TEST USE ONLY.
        """
        cls._store = {k: dict(v) for k, v in RPS_CUSTOMERS.items()}
        cls._transaction_log = []
        return {
            "status":           "reset_complete",
            "message":          "All RPS customer records restored to original seed data.",
            "customers_reset":  list(cls._store.keys()),
            "timestamp":        datetime.now(timezone.utc).isoformat(),
        }

    # ── Write (HITL-gated) ────────────────────────────────────────────────────

    @classmethod
    def write_to_rps(
        cls,
        *,
        request_id: str,
        checker_id: str,
        customer_id: str,
        change_type: str,
        new_value: str,
        logger: AgentLogger | None = None,
    ) -> dict:
        """
        Performs the actual update to the mock core banking store.
        MUST ONLY be called after explicit Checker approval.
        """
        customer = cls._store.get(customer_id)
        if not customer:
            raise RPSError(f"Customer {customer_id} not found in RPS")

        field_map = {
            "legal_name": "name",
            "address":    "address",
            "dob":        "dob",
            "contact":    "email",
        }
        field = field_map.get(change_type)
        if not field:
            raise RPSError(f"Unsupported change type: {change_type}")

        old_value = customer.get(field, "")
        customer[field] = new_value

        txn_id = f"RPS-TXN-{uuid.uuid4().hex[:10].upper()}"
        txn_record = {
            "transaction_id": txn_id,
            "request_id":     request_id,
            "checker_id":     checker_id,
            "customer_id":    customer_id,
            "change_type":    change_type,
            "field_updated":  field,
            "old_value":      old_value,
            "new_value":      new_value,
            "timestamp":      datetime.now(timezone.utc).isoformat(),
            "status":         "SUCCESS",
        }
        cls._transaction_log.append(txn_record)

        if logger:
            logger.info(
                "RPSMock", "rps_write_success",
                transaction_id=txn_id,
                customer_id=customer_id,
                field=field,
                new_value=new_value,
            )

        return txn_record

    @classmethod
    def get_transaction_log(cls) -> list[dict]:
        return list(cls._transaction_log)
