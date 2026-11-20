"""Ghi nhật ký nguồn dữ liệu: mỗi lần nhập file → một dòng `import_runs` (nguồn, file, sha256, số dòng)."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models import ImportRun

_MAX_HASH_BYTES = 300 * 1024 * 1024


def file_sha256(path: Path | None) -> str | None:
    if path is None or not path.is_file() or path.stat().st_size > _MAX_HASH_BYTES:
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def log_run(db: Session, source: str, path: Path | None, result: Any, *, started_at: datetime | None = None) -> ImportRun:
    """`result`: dict hoặc pydantic model có các khóa imported/skipped/... Trả về dòng ImportRun đã lưu."""
    data = result if isinstance(result, dict) else result.model_dump()
    ok = int(data.get("imported", data.get("rows_ok", 0)) or 0)
    skipped = int(data.get("skipped", data.get("rows_skipped", 0)) or 0)
    errors = int(data.get("rows_error", 0) or 0)
    run = ImportRun(
        source=source,
        file_name=path.name if path else None,
        file_sha256=file_sha256(path),
        rows_in=int(data.get("rows_in", ok + skipped + errors) or 0),
        rows_ok=ok,
        rows_skipped=skipped,
        rows_error=errors,
        status="partial" if errors else "ok",
        detail=data,
        started_at=started_at or datetime.now(timezone.utc),
        finished_at=datetime.now(timezone.utc),
    )
    db.add(run)
    db.commit()
    return run
