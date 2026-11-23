"""Clone evidenced Vietnamese-language K24 curricula into missing K23 programs."""

from __future__ import annotations

import csv
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import ClassSection, ModuleRelation, Program, ProgramModule
from app.services.text import normalize_search

_SOURCE_ID = re.compile(r"K24([0-9]{3})")
_K23_GROUP = re.compile(r"K23([0-9]{3})", re.IGNORECASE)
_FILE_CODES = re.compile(r"(?<![0-9])(20[0-9]{2}(?:20[0-9]{2})?)((?:_[0-9]{3})+)$")
_MAJOR_CELL = re.compile(r"(?:K[0-9]{2})?([0-9]{3})(?:[A-Z][A-Z0-9]*|\.0)?")
_K23_HEADER = re.compile(
    r"(?:(?:hk|hoc ky) )?(?:k\s*23|khoa (?:20)?23)(?: (?:hk|hoc ky))?"
)
_ACADEMIC_YEAR = re.compile(r"(?<![0-9])([0-9]{4})-([0-9]{4})(?![0-9])")
_REPORT_COLUMNS = (
    "ma_nganh", "ma_ctdt", "ten_ctdt", "quyet_dinh", "bang_chung", "ly_do",
    "so_mon_them", "tin_chi_bat_buoc_them",
)


def _class_evidence(db: Session) -> dict[str, set[str]]:
    examples: dict[tuple[str, str], str] = {}
    rows = db.execute(
        select(ClassSection.student_groups, ClassSection.cohorts)
        .where(ClassSection.is_sample.is_(False))
    )
    for groups, cohorts in rows:
        for column, values in (("student_groups", groups), ("cohorts", cohorts)):
            for value in values or ():
                group = value.strip().upper()
                match = _K23_GROUP.match(group)
                if match:
                    key = (match[1], column)
                    examples[key] = min(group, examples.get(key, group))
    evidence: dict[str, set[str]] = defaultdict(set)
    for (major, column), group in examples.items():
        evidence[major].add(f"Nhóm lớp {group} (class_sections.{column})")
    return evidence


def _excel_evidence(
    excel_dir: Path, evidence: dict[str, set[str]]
) -> dict[str, list[str]]:
    filenames: dict[str, list[str]] = defaultdict(list)
    for path in sorted(excel_dir.glob("*.xlsx")):
        if path.name.startswith("~$"):
            continue
        file_codes = _FILE_CODES.search(path.stem)
        majors = file_codes[2].strip("_").split("_") if file_codes else []
        for major in majors:
            filenames[major].append(path.name)
            # Combined-year filenames require cohort-specific evidence within the workbook.
            if file_codes[1] == "2023":
                evidence[major].add(f"Tên tệp CTĐT 2023: {path.name}")

        workbook = load_workbook(path, read_only=True, data_only=True)
        try:
            for sheet in workbook:
                rows = enumerate(sheet.values, start=1)
                for row_no, row in rows:
                    headers = [normalize_search(str(value)) for value in row]
                    k23_cols = [i for i, label in enumerate(headers) if _K23_HEADER.fullmatch(label)]
                    if k23_cols:
                        break
                else:
                    continue

                major_cols = [i for i, label in enumerate(headers) if label in {"ma nganh", "ma ctdt"}]
                proven: dict[str, str] = {}
                for row_no, row in rows:
                    k23_col = next((i for i in k23_cols if row[i] is not None and str(row[i]).strip()), None)
                    if k23_col is None:
                        continue
                    major_cells = [str(row[i]).strip().upper() for i in major_cols if row[i] is not None]
                    row_majors = [match[1] for cell in major_cells if (match := _MAJOR_CELL.fullmatch(cell))]
                    if not any(major_cells) and len(majors) == 1:
                        row_majors = majors
                    for major in row_majors:
                        proven.setdefault(
                            major, f"Excel {path.name} / {sheet.title}, dòng {row_no} ({headers[k23_col]})"
                        )
                for major, detail in proven.items():
                    evidence[major].add(detail)
        finally:
            workbook.close()
    return filenames


def _shift_year(value: str | None) -> str | None:
    def previous_year(match: re.Match[str]) -> str:
        start, end = int(match[1]), int(match[2])
        return f"{start - 1:04d}-{end - 1:04d}" if end == start + 1 else match[0]

    return _ACADEMIC_YEAR.sub(previous_year, value) if value is not None else None


def _clone_module(source: ProgramModule) -> ProgramModule:
    fields = {
        column.key: getattr(source, column.key)
        for column in ProgramModule.__table__.columns
        if column.key not in {"id", "program_id", "suggested_semester", "suggested_term"}
    }
    return ProgramModule(
        **fields,
        suggested_semester=_shift_year(source.suggested_semester),
        suggested_term=_shift_year(source.suggested_term),
    )


def clone_cohort_programs(
    db: Session, *, excel_dir: Path, report_path: Path, dry_run: bool
) -> dict:
    evidence = _class_evidence(db)
    filenames = _excel_evidence(excel_dir, evidence)
    existing = dict(db.execute(select(Program.id, Program.name).where(Program.id.like("K23%"))).all())
    sources = db.scalars(
        select(Program)
        .where(Program.id.like("K24%"), Program.source == "ctdt")
        .options(selectinload(Program.modules).selectinload(ProgramModule.module))
        .order_by(Program.id)
    )
    rows = []
    cloned_ids: dict[str, str] = {}
    for source in sources:
        if not (match := _SOURCE_ID.fullmatch(source.id)):
            continue
        major = match[1]
        target_id = f"K23{major}"
        name = (
            re.sub(
                r"\b(?:Khóa|Khoá)\s+24\b", "Khóa 23",
                unicodedata.normalize("NFC", source.name), flags=re.IGNORECASE,
            )
            if source.name is not None else None
        )
        reason = ""
        details = "; ".join(sorted(evidence.get(major, ())))
        if target_id in existing:
            reason = f"{target_id} đã tồn tại"
        elif not details:
            reason = "Thiếu bằng chứng ngành có khóa 23"
            if major in filenames:
                details = f"Tệp không xác nhận K23 cho mã ngành: {', '.join(filenames[major])}"
        else:
            cloned_ids[source.id] = target_id
            if not dry_run:
                db.add(Program(
                    id=target_id, cohort="K23", name=name, faculty=source.faculty,
                    search_text=normalize_search(f"{target_id} {name or ''} {source.faculty or ''}"),
                    is_sample=False, source="derived_from_K24",
                    modules=[_clone_module(module) for module in source.modules],
                ))

        rows.append({
            "ma_nganh": major,
            "ma_ctdt": target_id,
            "ten_ctdt": existing.get(target_id) if reason else name,
            "quyet_dinh": "bỏ qua" if reason else "tạo",
            "bang_chung": details,
            "ly_do": reason,
            "so_mon_them": 0 if reason else len(source.modules),
            "tin_chi_bat_buoc_them": 0 if reason else sum(
                pm.module.credits or 0 for pm in source.modules if pm.required and pm.module
            ),
        })

    if not dry_run and cloned_ids:
        # Ghi chương trình mới xuống DB trước, rồi mới chèn quan hệ môn: module_relations có khóa
        # ngoại tới programs nên chèn chung một lượt flush sẽ vi phạm khóa ngoại trên PostgreSQL.
        db.flush()
        relations = db.scalars(select(ModuleRelation).where(ModuleRelation.program_id.in_(cloned_ids)))
        db.add_all(
            ModuleRelation(
                program_id=cloned_ids[relation.program_id], source=relation.source,
                target=relation.target, type=relation.type,
            )
            for relation in relations
        )
        db.flush()

    report_path.parent.mkdir(parents=True, exist_ok=True)
    with report_path.open("w", encoding="utf-8-sig", newline="") as report:
        writer = csv.DictWriter(report, fieldnames=_REPORT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    if not dry_run and cloned_ids:
        db.commit()
    return {
        "dry_run": dry_run,
        "so_chuong_trinh_them": len(cloned_ids),
        "so_mon_them": sum(row["so_mon_them"] for row in rows),
        "bao_cao": str(report_path),
    }
