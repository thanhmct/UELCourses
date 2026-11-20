"""Import chương trình đào tạo (portal studyProgram) dạng {"<StudyProgramID>": [rows]}.

Mỗi row: MaCTDT, TenCTDT, KhoaHoc, HocKy/HocKyHienThi, BatBuoc, MaHP, TenHP, STC, LT, TH, TL, BoMon, Khoa,
HPHocTruoc, HPTienQuyet, HPTuongDuong, TenKhoiKienThuc, TenKhoaKienThucCha, GhiChu.
Chỉ đọc các trường trên — trường cá nhân (IsPass, điểm, ...) bị bỏ qua.
"""

from __future__ import annotations

from app.services.legacy import skip_legacy_code, skip_old_program

import re
from collections import Counter
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Equivalent, ModuleRelation, Program, ProgramModule
from app.schemas import ImportResult
from app.services.importer import ImportContext, ImportFormatError, clip, get_ci, to_int
from app.services.requirements import parse_requirement, tree_codes
from app.services.text import normalize_search


def extract_programs(payload: Any) -> dict[str, list[dict]]:
    if isinstance(payload, list):  # list rows có MaCTDT
        out: dict[str, list[dict]] = {}
        for r in payload:
            if isinstance(r, dict) and r.get("MaCTDT"):
                out.setdefault(str(r["MaCTDT"]).strip(), []).append(r)
        if out:
            return out
        raise ImportFormatError("Danh sách không có trường MaCTDT.")
    if not isinstance(payload, dict):
        raise ImportFormatError("File CTĐT phải là object {\"<StudyProgramID>\": [rows]}.")
    out = {}
    for pid, rows in payload.items():
        if isinstance(rows, dict):
            rows = rows.get("tbStudyPrograms") or rows.get("data") or []
        if isinstance(rows, list):
            out[str(pid).strip()] = [r for r in rows if isinstance(r, dict)]
    if not out:
        raise ImportFormatError("Không tìm thấy chương trình nào trong file CTĐT.")
    return out


def cohort_of(program_id: str) -> str | None:
    m = re.match(r"\s*[Kk](\d{2})", program_id)
    return f"K{m.group(1)}" if m else None


_SEM_RE = re.compile(r"HK\s*0*(\d+).*?(\d{4})\s*[-–]\s*(\d{4})", re.I)


def parse_suggested_semester(text: Any) -> str | None:
    """"HK02 năm học 2022-2023" -> "2022-2023-2"; "Chưa phân học kỳ" -> None."""
    m = _SEM_RE.search(str(text or ""))
    return f"{m.group(2)}-{m.group(3)}-{int(m.group(1))}" if m else None


def is_required(v: Any) -> bool:
    s = normalize_search(str(v or ""))
    if s in ("", "0", "false", "khong"):
        return False
    return "bat buoc" in s or s in ("1", "true", "x", "co")


def import_ctdt(db: Session, payload: Any, *, is_sample: bool = False) -> ImportResult:
    programs = extract_programs(payload)
    ctx = ImportContext(db, is_sample=is_sample, source="sample" if is_sample else "ctdt")
    existing_eq = {(e.code, e.equivalent_code) for e in db.scalars(select(Equivalent))}
    n_rel = 0
    for pid, rows in programs.items():
        pid = pid[:64]
        if skip_old_program(cohort_of(pid)):  # khóa cũ (K19–K22): không nạp
            ctx.skipped += len(rows)
            continue
        prog = db.get(Program, pid) or Program(id=pid)
        if prog not in db:
            db.add(prog)
        name = next((r.get("TenCTDT") for r in rows if r.get("TenCTDT")), None)
        faculties = Counter(str(r["Khoa"]).strip() for r in rows if r.get("Khoa"))
        prog.name = clip(name, 512) or prog.name or pid
        prog.cohort = cohort_of(pid)
        prog.faculty = faculties.most_common(1)[0][0] if faculties else prog.faculty
        prog.search_text = normalize_search(f"{pid} {prog.name} {prog.faculty or ''}")
        prog.is_sample = is_sample
        prog.source = ctx.source
        db.flush()
        # Idempotent: thay toàn bộ môn + quan hệ của CTĐT này
        db.execute(delete(ModuleRelation).where(ModuleRelation.program_id == pid))
        db.execute(delete(ProgramModule).where(ProgramModule.program_id == pid))
        db.flush()

        seen: dict[str, ProgramModule] = {}
        relations: set[tuple[str, str, str]] = set()
        for r in rows:
            code = clip(get_ci(r, "MaHP"), 64)
            if not code or skip_legacy_code(code):
                ctx.skipped += 1
                continue
            ctx.module(code, name=clip(get_ci(r, "TenHP"), 512), credits=to_int(get_ci(r, "STC")),
                       faculty=get_ci(r, "Khoa"), department=get_ci(r, "BoMon"))
            db.flush()
            pm = seen.get(code)
            if pm is None:
                pm = ProgramModule(program_id=pid, module_code=code)
                db.add(pm)
                seen[code] = pm
            pm.block = clip(get_ci(r, "TenKhoiKienThuc"), 512)
            pm.parent_block = clip(get_ci(r, "TenKhoaKienThucCha"), 512)
            pm.required = is_required(get_ci(r, "BatBuoc"))
            pm.suggested_term = clip(get_ci(r, "HocKyHienThi", "HocKy"), 128)
            pm.suggested_semester = parse_suggested_semester(get_ci(r, "HocKyHienThi", "HocKy"))
            pm.note = clip(get_ci(r, "GhiChu"), 2000)
            for field, rtype, raw_attr, tree_attr in (
                ("HPTienQuyet", "prereq", "prereq_raw", "prereq_tree"),
                ("HPHocTruoc", "previous", "previous_raw", "previous_tree"),
                ("HPSongHanh", "coreq", "coreq_raw", "coreq_tree"),
            ):
                raw = get_ci(r, field)
                raw = str(raw).strip() if raw is not None else None
                setattr(pm, raw_attr, clip(raw, 512))
                tree = parse_requirement(raw)
                setattr(pm, tree_attr, tree)
                for src in tree_codes(tree):
                    if src != code:
                        relations.add((src, code, rtype))
            eq_raw = get_ci(r, "HPTuongDuong")
            pm.equivalent_raw = clip(str(eq_raw).strip(), 512) if eq_raw else None
            for eq in tree_codes(parse_requirement(eq_raw)):
                if eq == code:
                    continue
                relations.add((eq, code, "equivalent"))
                if (code, eq) not in existing_eq and (eq, code) not in existing_eq:
                    db.add(Equivalent(code=code, name=clip(get_ci(r, "TenHP"), 512), credits=to_int(get_ci(r, "STC")),
                                      equivalent_code=eq, is_sample=is_sample,
                                      search_text=normalize_search(f"{code} {get_ci(r, 'TenHP') or ''} {eq}")))
                    existing_eq.add((code, eq))
            ctx.imported += 1

        # Thứ tự kỳ gợi ý: xếp hạng các học kỳ xuất hiện trong CTĐT (1 = kỳ sớm nhất)
        def sem_key(s: str):
            y1, _y2, t = s.split("-")
            return int(y1), int(t)

        order = {s: i + 1 for i, s in enumerate(sorted({pm.suggested_semester for pm in seen.values()
                                                         if pm.suggested_semester}, key=sem_key))}
        for pm in seen.values():
            pm.suggested_order = order.get(pm.suggested_semester) if pm.suggested_semester else None
        for src, tgt, rtype in sorted(relations):
            db.add(ModuleRelation(source=src[:64], target=tgt[:64], type=rtype, program_id=pid))
            n_rel += 1
        db.flush()
    res = ctx.result()
    res.warnings = [f"programs={len(programs)}", f"relations={n_rel}", *res.warnings]
    return res
