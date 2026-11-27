"""Import chương trình đại học từ file UEL_chuong_trinh_dao_tao.json."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ImportRun, Module, ModuleAssessment, ModuleTextbook, Program, ProgramModule
from app.services.lineage import file_sha256
from app.services.master_data_import import normalize_final_assessment, parse_ratio
from app.services.text import normalize_search


SOURCE = "undergrad_json"
APPLIES_TO_COHORTS = ["K25", "K26"]


def _text(value: Any) -> str | None:
    if value is None:
        return None
    value = re.sub(r"\s+", " ", str(value).replace("\xa0", " ")).strip()
    return value or None


def _pick(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if _text(value) is not None:
            return value
    return None


def _credits(value: Any) -> int | None:
    try:
        number = float(str(value).strip().replace(",", "."))
    except (TypeError, ValueError):
        return None
    return int(number) if number.is_integer() and number >= 0 else None


def _program_id(code: str | None, group: str, name: str) -> str:
    """ID ổn định và không va chạm khi mã 405 xuất hiện cho cả Kế toán/Kiểm toán."""
    digest = hashlib.sha1(f"{group}|{code or ''}|{name}".encode("utf-8")).hexdigest()[:10]
    stem = re.sub(r"[^A-Z0-9]+", "", (code or "UNKNOWN").upper())[:20] or "UNKNOWN"
    return f"UG-{stem}-{digest}"


def _assessment_values(row: dict[str, Any]) -> dict[str, Any]:
    final_form = _text(_pick(row, "Cuối kỳ - Hình thức"))
    exam_type = _text(_pick(row, "Hình thức thi", "Thi"))
    return {
        "process_ratio": parse_ratio(_pick(row, "Quá trình - Tỉ lệ điểm")),
        "process_form": _text(_pick(row, "Quá trình - Hình thức")),
        "midterm_ratio": parse_ratio(_pick(row, "Giữa kỳ - Tỉ lệ điểm")),
        "midterm_form": _text(_pick(row, "Giữa kỳ - Hình thức")),
        "final_ratio": parse_ratio(_pick(row, "Cuối kỳ - Tỉ lệ điểm")),
        "final_form": final_form,
        "advanced_ratio": parse_ratio(_pick(row, "Nâng cao - Tỉ lệ điểm", "Tài năng - Tỉ lệ điểm", "Điểm T - Tỉ lệ điểm")),
        "advanced_form": _text(_pick(row, "Nâng cao - Hình thức", "Tài năng - Hình thức", "Điểm T - Hình thức")),
        "exam_type": exam_type,
        "exam_duration": _text(_pick(row, "Thời gian thi", "Thời lượng thi")),
        "final_assessment_kind": normalize_final_assessment(final_form or exam_type),
    }


def _completeness(values: dict[str, Any]) -> int:
    return sum(value is not None and value != "" for value in values.values())


def import_undergrad_json(
    db: Session, path: Path | str, *, dry_run: bool = False, include_programs: bool = False
) -> dict[str, Any]:
    source_path = Path(path)
    with source_path.open("r", encoding="utf-8-sig") as handle:
        payload = json.load(handle)
    levels = payload.get("bac_hoc") or {}
    groups = levels.get("Đại học")
    if not isinstance(groups, dict):
        raise ValueError("JSON không có bac_hoc['Đại học'] dạng object")

    programs_by_key: dict[tuple[str, str, str], dict[str, Any]] = {}
    rows_in = 0
    for group, raw_programs in groups.items():
        for raw_program in raw_programs or []:
            code = _text(raw_program.get("ma_chuong_trinh")) or ""
            name = _text(raw_program.get("ten_chuong_trinh")) or _text(group) or "Chương trình chưa đặt tên"
            key = (_text(group) or "", code, name)
            # File có nhiều workbook trùng hoàn toàn; giữ bản có nhiều học phần hơn.
            current = programs_by_key.get(key)
            if current is None or len(raw_program.get("hoc_phan") or []) > len(current.get("hoc_phan") or []):
                programs_by_key[key] = raw_program

    existing_modules = {m.code: m for m in db.scalars(select(Module))}
    existing_programs = {p.id: p for p in db.scalars(select(Program).where(Program.source == SOURCE))}
    existing_links = {(pm.program_id, pm.module_code): pm for pm in db.scalars(select(ProgramModule))}
    existing_assessments = {a.module_code: a for a in db.scalars(select(ModuleAssessment))}
    main_textbooks: dict[str, ModuleTextbook] = {}
    for book in db.scalars(select(ModuleTextbook).where(ModuleTextbook.is_main.is_(True)).order_by(ModuleTextbook.id)):
        main_textbooks.setdefault(book.module_code, book)

    counts = {
        "programs_created": 0, "programs_updated": 0, "program_modules_created": 0,
        "modules_created": 0, "modules_filled": 0, "assessments_created": 0,
        "assessments_updated": 0, "textbooks_created": 0, "textbooks_filled": 0,
        "rows_skipped": 0, "assessment_conflicts": 0,
    }
    assessment_candidates: dict[str, dict[str, Any]] = {}
    textbook_candidates: dict[str, dict[str, str | None]] = {}

    for (group, code, name), raw_program in sorted(programs_by_key.items()):
        program_id = _program_id(code, group, name)
        if include_programs:
            program = existing_programs.get(program_id)
            if program is None:
                program = Program(id=program_id, name=name, cohort=None, faculty=group, degree="dai_hoc",
                                  search_text=normalize_search(f"{code} {name} {group}"), is_sample=False, source=SOURCE)
                db.add(program)
                existing_programs[program_id] = program
                counts["programs_created"] += 1
            else:
                changed = False
                for field, value in (("name", name), ("faculty", group), ("degree", "dai_hoc"),
                                     ("search_text", normalize_search(f"{code} {name} {group}"))):
                    if getattr(program, field) != value:
                        setattr(program, field, value)
                        changed = True
                counts["programs_updated"] += int(changed)

        for row in raw_program.get("hoc_phan") or []:
            rows_in += 1
            module_code = _text(_pick(row, "Mã học phần", "Mã môn học"))
            module_name = _text(_pick(row, "Tên học phần", "Tên môn học"))
            if not module_code or not module_name:
                counts["rows_skipped"] += 1
                continue
            module_code = module_code.upper().replace(" ", "")
            credit = _credits(_pick(row, "Số tín chỉ", "STC"))
            module_type = _text(_pick(row, "Loại học phần", "Loại môn học"))
            block = _text(row.get("Khối kiến thức"))
            module = existing_modules.get(module_code)
            if module is None:
                if not include_programs:
                    counts["rows_skipped"] += 1
                    continue
                module = Module(code=module_code, name=module_name, credits=credit, type=module_type,
                                degree="dai_hoc", search_text=normalize_search(f"{module_code} {module_name}"), is_sample=False)
                db.add(module)
                existing_modules[module_code] = module
                counts["modules_created"] += 1
            else:
                changed = False
                for field, value in (("credits", credit), ("type", module_type)):
                    if getattr(module, field) is None and value is not None:
                        setattr(module, field, value)
                        changed = True
                counts["modules_filled"] += int(changed)

            link_key = (program_id, module_code)
            required = bool(module_type and "bắt buộc" in module_type.casefold())
            if include_programs and link_key not in existing_links:
                link = ProgramModule(program_id=program_id, module_code=module_code, block=block, required=required,
                                     suggested_order=int(float(row.get("Index") or row.get("Idx") or row.get("index") or row.get("idx")))
                                     if str(row.get("Index") or row.get("Idx") or row.get("index") or row.get("idx") or "").replace(".", "", 1).isdigit() else None)
                db.add(link)
                existing_links[link_key] = link
                counts["program_modules_created"] += 1

            values = _assessment_values(row)
            if _completeness(values):
                old = assessment_candidates.get(module_code)
                if old and any(old.get(k) is not None and v is not None and old.get(k) != v for k, v in values.items()):
                    counts["assessment_conflicts"] += 1
                if old is None or _completeness(values) > _completeness(old):
                    assessment_candidates[module_code] = values
            book_name = _text(row.get("Tài liệu chính"))
            document_code = _text(_pick(row, "Mã tài liệu", "Mã thư viện"))
            note = _text(row.get("Ghi chú"))
            if book_name or document_code:
                candidate = {"name": book_name, "document_code": document_code, "note": note}
                old_book = textbook_candidates.get(module_code)
                if old_book is None or _completeness(candidate) > _completeness(old_book):
                    textbook_candidates[module_code] = candidate

    for code, values in assessment_candidates.items():
        assessment = existing_assessments.get(code)
        if assessment is None:
            db.add(ModuleAssessment(module_code=code, source=SOURCE, applies_to_cohorts=APPLIES_TO_COHORTS, **values))
            counts["assessments_created"] += 1
        else:
            changed = False
            # Không ghi đè nguồn đáng tin cậy khác; importer này chỉ điền ô trống hoặc cập nhật dữ liệu do chính nó quản lý.
            for field, value in values.items():
                if value is not None and (getattr(assessment, field) is None or assessment.source == SOURCE):
                    if getattr(assessment, field) != value:
                        setattr(assessment, field, value)
                        changed = True
            if changed:
                # Giữ provenance của master_data/nguồn khác khi chỉ điền các ô còn trống.
                if assessment.source in (None, SOURCE):
                    assessment.source = SOURCE
                counts["assessments_updated"] += 1
            if assessment.applies_to_cohorts != APPLIES_TO_COHORTS:
                assessment.applies_to_cohorts = APPLIES_TO_COHORTS
                counts["assessments_updated"] += int(not changed)
        kind = values.get("final_assessment_kind")
        module = existing_modules[code]
        if kind and not module.final_assessment:
            module.final_assessment = kind

    for code, values in textbook_candidates.items():
        book = main_textbooks.get(code)
        if book is None:
            db.add(ModuleTextbook(module_code=code, is_main=True, source=SOURCE,
                                  applies_to_cohorts=APPLIES_TO_COHORTS, **values))
            counts["textbooks_created"] += 1
        else:
            changed = False
            for field, value in values.items():
                if value and not getattr(book, field):
                    setattr(book, field, value)
                    changed = True
            counts["textbooks_filled"] += int(changed)
            if book.applies_to_cohorts != APPLIES_TO_COHORTS:
                book.applies_to_cohorts = APPLIES_TO_COHORTS
            if not book.source:
                book.source = SOURCE

    result = {
        "status": "dry_run" if dry_run else "ok", "degree": "dai_hoc", "include_programs": include_programs,
        "applies_to_cohorts": APPLIES_TO_COHORTS,
        "source_programs": sum(len(v or []) for v in groups.values()),
        "deduplicated_programs": len(programs_by_key), "rows_in": rows_in, **counts,
    }
    if dry_run:
        db.rollback()
        return result

    run = ImportRun(source=SOURCE, file_name=source_path.name, file_sha256=file_sha256(source_path),
                    rows_in=rows_in, rows_ok=rows_in - counts["rows_skipped"], rows_skipped=counts["rows_skipped"],
                    rows_error=0, status="ok", detail=result, started_at=datetime.now(timezone.utc),
                    finished_at=datetime.now(timezone.utc))
    db.add(run)
    db.commit()
    result["import_run_id"] = run.id
    return result
