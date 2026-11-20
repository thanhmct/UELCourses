"""Mã học phần hệ cũ (đúng 4 ký tự và có chữ số: AA01, AC81, EN21, KT48…) — chỉ dùng cho chương trình đào tạo K19–K22.

Chủ dự án (2026-11-21): bỏ các môn này. Hai việc:
  * `skip_legacy_code()` — các importer bỏ qua dòng có mã hệ cũ để dữ liệu không bị nạp lại.
  * `purge_legacy_codes()` — xóa khỏi DB (CASCADE: lớp học phần, buổi học, môn trong chương trình, kế hoạch mở) + cạnh quan hệ.

Giữ lại (KHÔNG phải mã hệ cũ): mã chỉ gồm chữ như GDQP, TATC, TEST; mã 5 ký tự như TATC1, 2NL01.
Bảng `equivalents` (cặp tương đương cũ↔mới) không bị đụng tới.
Tắt việc bỏ qua khi nạp bằng biến môi trường SKIP_LEGACY_CODES=false.
"""

from __future__ import annotations

import re

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import ClassSection, Module, ModuleRelation, Program, ProgramModule


def is_legacy_code(code: str | None) -> bool:
    c = re.sub(r"\s+", "", code or "")
    return len(c) == 4 and any(ch.isdigit() for ch in c)


def skip_legacy_code(code: str | None) -> bool:
    """True nếu importer nên bỏ qua dòng có mã này."""
    return get_settings().skip_legacy_codes and is_legacy_code(code)


def purge_legacy_codes(db: Session, *, dry_run: bool = False) -> dict:
    codes = [c for c in db.scalars(select(Module.code)) if is_legacy_code(c)]
    res = {"modules": len(codes), "class_sections": 0, "program_modules": 0, "relations": 0, "dry_run": dry_run}
    for i in range(0, len(codes), 400):
        chunk = codes[i : i + 400]
        res["class_sections"] += db.scalar(select(func.count()).select_from(ClassSection).where(ClassSection.module_code.in_(chunk))) or 0
        res["program_modules"] += db.scalar(select(func.count()).select_from(ProgramModule).where(ProgramModule.module_code.in_(chunk))) or 0
        res["relations"] += db.scalar(select(func.count()).select_from(ModuleRelation).where(
            or_(ModuleRelation.source.in_(chunk), ModuleRelation.target.in_(chunk)))) or 0
    if dry_run or not codes:
        return res
    for i in range(0, len(codes), 400):
        chunk = codes[i : i + 400]
        db.execute(delete(ModuleRelation).where(or_(ModuleRelation.source.in_(chunk), ModuleRelation.target.in_(chunk))))
        db.execute(delete(Module).where(Module.code.in_(chunk)))  # FK ON DELETE CASCADE xử lý các bảng con
    db.commit()
    return res


# --------------------------------------------------------------------------- chương trình đào tạo của khóa cũ
def cohort_number(cohort: str | None) -> int | None:
    """"K22" -> 22."""
    m = re.match(r"\s*[Kk](\d{2})", cohort or "")
    return int(m.group(1)) if m else None


def skip_old_program(cohort: str | None) -> bool:
    """True nếu importer bỏ qua chương trình của khóa cũ hơn `min_program_cohort` (mặc định K23)."""
    n, lo = cohort_number(cohort), get_settings().min_program_cohort
    return bool(lo) and n is not None and n < lo


def purge_old_programs(db: Session, *, before: int | None = None, dry_run: bool = False) -> dict:
    """Xóa chương trình đào tạo có khóa < `before` (mặc định min_program_cohort) cùng môn/quan hệ của chúng (CASCADE).
    Các học phần (modules) và lớp học phần KHÔNG bị xóa."""
    before = before or get_settings().min_program_cohort
    ids = [p.id for p in db.scalars(select(Program)) if (cohort_number(p.cohort) or 99) < before]
    res = {"programs": len(ids), "program_modules": 0, "relations": 0, "before_cohort": before, "dry_run": dry_run}
    if ids:
        res["program_modules"] = db.scalar(select(func.count()).select_from(ProgramModule).where(ProgramModule.program_id.in_(ids))) or 0
        res["relations"] = db.scalar(select(func.count()).select_from(ModuleRelation).where(ModuleRelation.program_id.in_(ids))) or 0
    if dry_run or not ids:
        return res
    db.execute(delete(ModuleRelation).where(ModuleRelation.program_id.in_(ids)))
    db.execute(delete(ProgramModule).where(ProgramModule.program_id.in_(ids)))
    db.execute(delete(Program).where(Program.id.in_(ids)))
    db.commit()
    return res
