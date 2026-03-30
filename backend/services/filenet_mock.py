"""
IASW - Mock FileNet Document Management Service
Stubs IBM FileNet / OpenText document archival.
Documents are saved to the local filesystem under filenet_store/.
Metadata is stored in a JSON index file.
"""
import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from config import FILENET_STORE_DIR


_index_path = FILENET_STORE_DIR / "_index.json"


def _load_index() -> dict:
    if _index_path.exists():
        return json.loads(_index_path.read_text())
    return {}


def _save_index(index: dict) -> None:
    _index_path.write_text(json.dumps(index, indent=2, default=str))


class FileNetMock:
    """
    Simulates archiving documents into an enterprise DMS (FileNet / OpenText).
    """

    @staticmethod
    def archive_document(
        *,
        source_path: Path,
        request_id: str,
        customer_id: str,
        change_type: str,
        document_type: str,
        original_filename: str,
    ) -> dict:
        """
        Archives a document and returns FileNet metadata including reference ID.
        """
        ref_id = f"FN-{uuid.uuid4().hex[:12].upper()}"
        dest_dir = FILENET_STORE_DIR / change_type / customer_id
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / f"{ref_id}_{original_filename}"

        shutil.copy2(source_path, dest_path)

        metadata = {
            "reference_id": ref_id,
            "request_id": request_id,
            "customer_id": customer_id,
            "change_type": change_type,
            "document_type": document_type,
            "original_filename": original_filename,
            "stored_path": str(dest_path),
            "archived_at": datetime.now(timezone.utc).isoformat(),
            "file_size_bytes": dest_path.stat().st_size,
            "classification": "SENSITIVE",
            "retention_policy": "7_YEARS",
        }

        index = _load_index()
        index[ref_id] = metadata
        _save_index(index)

        return metadata

    @staticmethod
    def get_document_metadata(ref_id: str) -> dict | None:
        index = _load_index()
        return index.get(ref_id)

    @staticmethod
    def list_all() -> list[dict]:
        return list(_load_index().values())
