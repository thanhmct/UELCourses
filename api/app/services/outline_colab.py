"""Nạp kết quả trích xuất từ Colab (colab/outline_extract_v2.ipynb -> outline_results.jsonl) vào DB.

Mỗi dòng JSONL: {"file", "pages", "text", "tables": [{"page", "rows"} | {"page", "error"}]} hoặc {"file", "error"}.
- Văn bản: giữ văn bản pdftotext đã có (quy tắc phân tích được chỉnh theo định dạng đó);
  chỉ điền văn bản PyMuPDF khi tài liệu chưa có văn bản.
- Bảng: lấy bảng PyMuPDF từ Colab thay cho trích xuất cục bộ, rồi phân tích lại từng tài liệu bằng parse_document(raw_tables=...).
Khớp tài liệu theo tên file (outline_documents.file_name).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OutlineDocument
from app.services.outline_parse import parse_document, save_parsed


def load_colab_records(jsonl_path: Path) -> tuple[dict[str, dict], dict[str, int]]:
    """Đọc JSONL -> {tên file: bản ghi}. Dòng trùng tên: dòng sau ghi đè (chạy lại an toàn)."""
    records: dict[str, dict] = {}
    stats = {"lines": 0, "bad_lines": 0, "error_records": 0}
    with jsonl_path.open(encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            stats["lines"] += 1
            try:
                rec = json.loads(line)
            except ValueError:
                stats["bad_lines"] += 1
                continue
            name = rec.get("file")
            if not name:
                stats["bad_lines"] += 1
                continue
            if "error" in rec and not rec.get("text"):
                stats["error_records"] += 1
            records[name] = rec
    return records, stats


def import_colab_results(db: Session, jsonl_path: Path, data_dir: Path, *, commit_every: int = 8) -> dict:
    records, rstats = load_colab_records(jsonl_path)
    stats = {**rstats, "records": len(records), "matched": 0, "unmatched": 0, "no_text": 0,
             "text_filled": 0, "tables_found": 0, "ok": 0, "partial": 0, "failed": 0, "skipped": 0,
             "not_in_colab": 0}

    docs = list(db.scalars(select(OutlineDocument)))
    by_name: dict[str, OutlineDocument] = {}
    for d in docs:
        by_name.setdefault(d.file_name, d)  # tên trùng: giữ tài liệu đầu tiên
    covered = set(records)
    stats["not_in_colab"] = sum(1 for d in docs if d.text_status == "extracted" and d.file_name not in covered)

    for n, (name, rec) in enumerate(records.items(), 1):
        d = by_name.get(name)
        if d is None:
            stats["unmatched"] += 1
            continue
        stats["matched"] += 1
        if not d.text and rec.get("text"):
            d.text = rec["text"]
            d.text_status = "extracted"
            d.text_method = "pymupdf_colab"
            d.text_chars = len(d.text)
            d.page_count = rec.get("pages") or d.page_count
            d.extracted_at = datetime.now(timezone.utc)
            stats["text_filled"] += 1
        if d.text_status != "extracted" or not d.text:
            stats["no_text"] += 1
            continue
        raw_tables = rec.get("tables") or []
        if any("rows" in t for t in raw_tables):
            stats["tables_found"] += 1
        p = parse_document(d.text, str(data_dir / d.rel_path), raw_tables=raw_tables)
        save_parsed(db, d.id, p)
        stats[p["status"]] += 1
        if n % commit_every == 0:
            db.commit()
    db.commit()
    stats["imported"] = stats["ok"] + stats["partial"]
    return stats
