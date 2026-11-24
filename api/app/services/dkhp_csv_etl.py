"""ETL lớp học phần từ CSV cào bảng "Tra cứu học phần" của dkhp.uel.edu.vn.

Idempotent theo ba tầng:
1. Tệp: cùng sha256 đã nạp (import_runs.source = "dkhp-csv") thì bỏ qua, trừ khi --force.
2. Dòng: khóa tự nhiên (mã LHP, học kỳ) — dòng trùng trong tệp chỉ giữ một (bản có nhiều thông tin hơn).
3. DB: upsert theo UNIQUE (class_code, semester_id); buổi học được dựng lại, không cộng dồn.
Không xóa lớp vắng mặt trong tệp mới (chỉ báo cáo), vì tệp có thể chỉ là một phần dữ liệu.
"""

from __future__ import annotations

import csv
import re
from collections import Counter
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ClassSection, ImportRun
from app.services.importer import import_classes, semester_from_class_code, semester_for_date, to_date
from app.services.lineage import file_sha256

SOURCE = "dkhp-csv"
REQUIRED = ("Mã HP", "Mã LHP", "Tên HP", "Thông tin")
_SPLIT_RE = re.compile(r"\s+(?=(?:Thứ\s*\d|Chủ\s*nhật))")
_NOTE_RE = re.compile(r"\s*\*(Giảng bằng.*)$")


def extract(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"CSV thiếu cột: {', '.join(missing)}")
        return [{k: (v or "").strip() for k, v in r.items()} for r in reader]


def _schedule_text(info: str) -> str:
    """Bảng web gộp các buổi thành một dòng; tách lại thành mỗi buổi một dòng, ghi chú giữ nguyên."""
    sched: list[str] = []
    note = None
    for seg in _SPLIT_RE.split(info.strip()):
        m = _NOTE_RE.search(seg)
        if m:
            note, seg = m.group(1), seg[: m.start()]
        if seg.strip():
            sched.append(seg.strip())
    if not sched and note is None and info.strip():
        note = info.strip()
    return "\n".join(sched + ([f"*{note}"] if note else []))


def transform(rows: list[dict[str, str]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    out: dict[tuple[str, str | None], dict[str, Any]] = {}
    stats = Counter(rows_in=len(rows))
    for r in rows:
        class_code, module = r.get("Mã LHP", ""), r.get("Mã HP", "")
        if not class_code or not module:
            stats["invalid"] += 1
            continue
        begin = to_date(r.get("Từ ngày"))
        sem = semester_from_class_code(class_code) or (semester_for_date(begin) if begin else None)
        rec = {
            "CurriculumID": module, "ScheduleStudyUnitAlias": class_code, "ScheduleStudyUnitName": r.get("Tên HP"),
            "Credits": r.get("STC"), "StudyUnitTypeName": r.get("Loại"), "Schedules": _schedule_text(r.get("Thông tin", "")),
            "ProfessorName": r.get("Giảng viên"), "StudentQuotas": r.get("Giới hạn"),
            "BeginDate": r.get("Từ ngày"), "EndDate": r.get("Đến ngày"),
        }
        key = (class_code, sem)
        if key in out:
            stats["duplicate_in_file"] += 1
            if len(str(rec["Schedules"])) <= len(str(out[key]["Schedules"])):
                continue
        out[key] = rec
    return list(out.values()), dict(stats)


def _count(db: Session, semesters: set[str | None]) -> int:
    return db.scalar(select(func.count()).select_from(ClassSection).where(ClassSection.source == "dkhp")) or 0


def load(db: Session, path: Path, *, force: bool = False, dry_run: bool = False) -> dict[str, Any]:
    digest = file_sha256(path)
    if digest and not force and db.scalar(
        select(ImportRun.id).where(ImportRun.source == SOURCE, ImportRun.file_sha256 == digest).limit(1)
    ):
        return {"status": "already_loaded", "file_sha256": digest, "imported": 0, "skipped": 0,
                "hint": "Tệp này đã nạp; thêm --force để nạp lại (vẫn không tạo bản ghi trùng)."}
    records, stats = transform(extract(path))
    before = _count(db, set())
    if dry_run:
        return {"status": "dry_run", "rows": len(records), **stats, "class_sections_before": before, "imported": 0, "skipped": 0}
    res = import_classes(db, records).model_dump()
    after = _count(db, set())
    res.update(status="loaded", file_sha256=digest, new_sections=after - before, updated_sections=res["imported"] - (after - before),
               **{k: v for k, v in stats.items() if k != "rows_in"}, rows_in=stats["rows_in"])
    return res
