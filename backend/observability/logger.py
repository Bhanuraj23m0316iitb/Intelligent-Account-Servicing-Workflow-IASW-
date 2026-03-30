"""
IASW - Observability / Structured Logging
Every agent step is logged as a structured JSON entry, persisted to:
  1. Console (pretty-printed)
  2. logs/iasw.jsonl  (newline-delimited JSON for log aggregators)
  3. The agent_logs column in the DB record (in-memory accumulation)
"""
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import LOG_DIR

# ── Root Python logger setup ─────────────────────────────────────────────────
_log_file = LOG_DIR / "iasw.jsonl"
_handler_file = logging.FileHandler(_log_file, encoding="utf-8")
_handler_console = logging.StreamHandler(sys.stdout)

logging.basicConfig(
    level=logging.INFO,
    handlers=[_handler_file, _handler_console],
    format="%(message)s",   # We emit pre-serialised JSON
)
_root = logging.getLogger("iasw")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AgentLogger:
    """
    Per-request logger that accumulates structured log entries.
    Designed to be created once per pipeline run and attached to state.
    """

    def __init__(self, request_id: str):
        self.request_id = request_id
        self.entries: list[dict] = []

    def _emit(self, level: str, agent: str, event: str, **kwargs: Any) -> dict:
        entry = {
            "ts": _now(),
            "level": level,
            "request_id": self.request_id,
            "agent": agent,
            "event": event,
            **kwargs,
        }
        self.entries.append(entry)
        _root.info(json.dumps(entry, default=str))
        return entry

    def info(self, agent: str, event: str, **kwargs: Any) -> None:
        self._emit("INFO", agent, event, **kwargs)

    def warning(self, agent: str, event: str, **kwargs: Any) -> None:
        self._emit("WARNING", agent, event, **kwargs)

    def error(self, agent: str, event: str, **kwargs: Any) -> None:
        self._emit("ERROR", agent, event, **kwargs)

    def step_start(self, agent: str) -> None:
        self.info(agent, "step_start")

    def step_end(self, agent: str, result: dict | None = None) -> None:
        self.info(agent, "step_end", result=result or {})

    def get_all(self) -> list[dict]:
        return list(self.entries)
