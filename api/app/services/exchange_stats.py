"""Thống kê sinh viên trao đổi (SVTĐ) đã học từng học phần theo học kỳ.

Nguồn: các file `data/processed/exchange_<học kỳ>.json` (vd `exchange_2025-2026-1.json`), mỗi file gồm
`semester_id` và danh sách `students` (mỗi SV có `classes` = mã lớp học phần). Chỉ mã lớp được dùng;
`ref` chỉ là số thứ tự nội bộ. Chỉ lưu số đếm vào DB, không lưu danh sách SV.

Mã môn suy từ mã lớp:
- môn 3 chữ cái: `251ELB104801` -> `ELB1048` (9 ký tự sau học kỳ: 3 chữ + 4 số mã môn + 2 số nhóm lớp)
- môn 2 chữ cái: `251VT0201` -> `VT0201` (6 ký tự sau học kỳ, không có nhóm lớp)
- còn lại (vd `251EKTT02301`) -> không khớp, ghi vào danh sách chưa khớp, không đếm.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import ExchangeModuleStat

SEMESTER_FILE_GLOB = "exchange_*-*.json"  # vd exchange_2025-2026-1.json (không khớp exchange_module_counts_check.json)

_THREE_LETTER_CLASS = re.compile(r"^\d{3}([A-Z]{3}\d{4})\d{2}$")
_TWO_LETTER_CLASS = re.compile(r"^\d{3}([A-Z]{2}\d{4})$")


def module_code_from_class(class_code: str | None) -> str | None:
    """Trả về mã môn của một mã lớp học phần, hoặc None nếu không nhận diện được."""
    code = (class_code or "").strip().upper()
    match = _THREE_LETTER_CLASS.match(code) or _TWO_LETTER_CLASS.match(code)
    return match.group(1) if match else None


@dataclass(frozen=True)
class SemesterRecord:
    semester_id: str
    source_file: str
    students: list[list[str]]  # mỗi SV: danh sách mã lớp (không có thông tin cá nhân)


@dataclass(frozen=True)
class StatRow:
    module_code: str
    semester_id: str
    student_count: int
    class_codes: list[str]


def load_semester_files(data_dir: Path) -> list[SemesterRecord]:
    records: list[SemesterRecord] = []
    for path in sorted(data_dir.glob(SEMESTER_FILE_GLOB)):
        data = json.loads(path.read_text(encoding="utf-8-sig"))  # utf-8-sig: chấp nhận file có BOM (PowerShell)
        semester_id = str(data.get("semester_id") or "").strip()
        if not semester_id:
            raise ValueError(f"{path.name}: thiếu semester_id")
        students = [[str(c) for c in (s.get("classes") or [])] for s in data.get("students") or []]
        records.append(SemesterRecord(semester_id=semester_id, source_file=path.name, students=students))
    return records


def aggregate(records: list[SemesterRecord]) -> tuple[list[StatRow], dict[str, int]]:
    """Đếm số SV (distinct trong từng học kỳ) đã học mỗi môn. Trả về (dòng thống kê, mã lớp chưa khớp -> số lần)."""
    students_by_key: dict[tuple[str, str], int] = defaultdict(int)
    classes_by_key: dict[tuple[str, str], set[str]] = defaultdict(set)
    unmatched: Counter[str] = Counter()
    for record in records:
        for classes in record.students:
            modules_in_student: set[str] = set()
            for class_code in classes:
                module = module_code_from_class(class_code)
                if module is None:
                    unmatched[class_code.strip().upper()] += 1
                    continue
                modules_in_student.add(module)
                classes_by_key[(module, record.semester_id)].add(class_code.strip().upper())
            for module in modules_in_student:  # mỗi SV chỉ đếm một lần cho mỗi môn trong học kỳ
                students_by_key[(module, record.semester_id)] += 1
    rows = [
        StatRow(module_code=module, semester_id=semester, student_count=count,
                class_codes=sorted(classes_by_key[(module, semester)]))
        for (module, semester), count in sorted(students_by_key.items())
    ]
    return rows, dict(unmatched)


def replace_stats(db: Session, semester_id: str, rows: list[StatRow]) -> int:
    """Thay toàn bộ thống kê của một học kỳ (không đụng học kỳ khác). Không commit."""
    db.execute(delete(ExchangeModuleStat).where(ExchangeModuleStat.semester_id == semester_id))
    now = datetime.now(timezone.utc)
    for row in rows:
        db.add(ExchangeModuleStat(
            module_code=row.module_code,
            semester_id=row.semester_id,
            student_count=row.student_count,
            class_codes=row.class_codes,
            updated_at=now,
        ))
    db.flush()
    return len(rows)


def import_exchange_stats(db: Session | None, data_dir: Path, *, dry_run: bool) -> dict:
    """Đọc các file học kỳ, tổng hợp và (nếu không dry_run) ghi vào DB. Trả về báo cáo."""
    records = load_semester_files(data_dir)
    if not records:
        raise FileNotFoundError(f"Không có file {SEMESTER_FILE_GLOB} trong {data_dir}")
    rows, unmatched = aggregate(records)
    per_semester = []
    for record in records:
        sem_rows = [r for r in rows if r.semester_id == record.semester_id]
        per_semester.append({
            "semester_id": record.semester_id,
            "source_file": record.source_file,
            "students": len(record.students),
            "modules": len(sem_rows),
        })
    if not dry_run:
        if db is None:
            raise ValueError("Cần Session để ghi DB")
        for record in records:
            replace_stats(db, record.semester_id, [r for r in rows if r.semester_id == record.semester_id])
        db.commit()
    return {
        "dry_run": dry_run,
        "semesters": per_semester,
        "distinct_modules": len({r.module_code for r in rows}),
        "stat_rows": len(rows),
        "unmatched_class_codes": [{"class_code": c, "count": n} for c, n in sorted(unmatched.items())],
    }


def exchange_totals_subquery():
    """Subquery (module_code, total): tổng SV trao đổi đã học từng học phần, dùng để sắp xếp danh sách học phần."""
    return (
        select(ExchangeModuleStat.module_code.label("module_code"),
               func.sum(ExchangeModuleStat.student_count).label("total"))
        .group_by(ExchangeModuleStat.module_code)
        .subquery()
    )


def exchange_stat_items(db: Session, codes: list[str]) -> list[dict]:
    """Số SV trao đổi theo học phần: [{module_code, total, by_semester:[{semester_id, students}]}]. Chỉ các mã có dữ liệu."""
    if not codes:
        return []
    stmt = (select(ExchangeModuleStat)
            .where(ExchangeModuleStat.module_code.in_(codes))
            .order_by(ExchangeModuleStat.module_code, ExchangeModuleStat.semester_id))
    grouped: dict[str, list[dict]] = defaultdict(list)
    for stat in db.scalars(stmt):
        grouped[stat.module_code].append({"semester_id": stat.semester_id, "students": stat.student_count})
    return [
        {"module_code": code, "total": sum(s["students"] for s in semesters), "by_semester": semesters}
        for code, semesters in grouped.items()
    ]
