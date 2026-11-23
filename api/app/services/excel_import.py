"""Import dữ liệu thật từ file Excel của UEL.

(A) UIS "Danh sách thông tin LHP đăng ký" (vd UIS-DanhSachThongTinLHPDangKy_2025-2026_HK01.xlsx):
    1 sheet, header 2 dòng (nhóm + cột con). Cột "Thời khóa biểu" dạng
    "Thứ 4,tiết 1-5,tuần 4-12,B2.202 || Thứ 4,tiết 1-5,tuần 3-3,B2.204 || *Giảng bằng Tiếng anh".
    Số tuần là tuần của học kỳ.
(B) "Thông tin môn học TA" (kế hoạch mở môn dạy bằng tiếng Anh theo năm học):
    tiêu đề ở các dòng đầu, header ở dòng có "Mã học phần".

Cột được nhận diện theo TÊN (không dấu, không phân biệt hoa thường), không theo vị trí cứng.
"""

from __future__ import annotations

from app.services.legacy import skip_legacy_code

import io
import re
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Module, ModuleOfferingPlan
from app.schemas import ImportResult
from app.services.importer import (
    ImportContext,
    ImportFormatError,
    clip,
    semester_from_class_code,
    split_student_groups,
    to_date,
    to_float,
    to_int,
)
from app.services.schedule_parser import _WEEKDAY_RE, _fold, parse_segment
from app.services.text import normalize_search


def load_workbook(src: bytes | str | Path):
    import openpyxl

    try:
        fh = io.BytesIO(src) if isinstance(src, (bytes, bytearray)) else src
        return openpyxl.load_workbook(fh, read_only=True, data_only=True)
    except Exception as e:  # noqa: BLE001 — file hỏng / không phải xlsx
        raise ImportFormatError(f"Không đọc được file Excel (.xlsx): {type(e).__name__}") from None


def _norm(v: Any) -> str:
    return normalize_search(str(v).replace("\n", " ")) if v is not None else ""


def _rows(ws) -> list[tuple]:
    return [tuple(r) for r in ws.iter_rows(values_only=True)]


# =========================================================================== (A) UIS
_UIS_COLUMNS = {
    "faculty": ("khoa chu quan hp", "khoa chu quan"),
    "code": ("ma hp", "ma hoc phan"),
    "name": ("ten hp", "ten hoc phan"),
    "credits": ("so tc", "so tin chi"),
    "class_code": ("ma lhp", "ma lop hoc phan"),
    "type": ("loai hp", "loai hoc phan"),
    "groups": ("lop sinh vien",),
    "quota_min": ("ss toi thieu",),
    "quota_max": ("ss toi da",),
    "registered": ("ss da dang ky",),
    "available": ("ss con trong",),
    "rooms": ("phong hoc",),
    "capacity_gap": ("do lech suc chua",),
    "start": ("ngay bd", "ngay bat dau"),
    "end": ("ngay kt", "ngay ket thuc"),
    "tkb": ("thoi khoa bieu",),
    "lecturer_code": ("ma gvgd",),
    "lecturer": ("ten gvgd",),
}

_ROOM_CAP_RE = re.compile(r"([^,()]+?)\s*\(\s*SC\s*:\s*(-?\d+)\s*\)", re.I)
_ROOM_GAP_RE = re.compile(r"([^,()]+?)\s*\(\s*(-?\d+)\s*\)")


def _map_uis_header(rows: list[tuple]) -> tuple[dict[str, int], int]:
    """Trả (tên trường -> chỉ số cột, chỉ số dòng dữ liệu đầu tiên)."""
    for i, row in enumerate(rows[:15]):
        cells = [_norm(c) for c in row]
        if "ma hp" not in cells and "ma lhp" not in cells:
            continue
        sub = [_norm(c) for c in rows[i + 1]] if i + 1 < len(rows) else []
        has_sub = any(c.startswith("ss ") or c in ("ngay bd", "thoi khoa bieu") for c in sub)
        names = [(sub[j] if has_sub and j < len(sub) and sub[j] else cells[j]) for j in range(len(cells))]
        mapping: dict[str, int] = {}
        for field, keys in _UIS_COLUMNS.items():
            for j, n in enumerate(names):
                if n in keys:
                    mapping[field] = j
                    break
        missing = {"code", "class_code"} - mapping.keys()
        if missing:
            raise ImportFormatError(f"Thiếu cột bắt buộc trong file UIS: {sorted(missing)}")
        return mapping, i + (2 if has_sub else 1)
    raise ImportFormatError("Không tìm thấy dòng tiêu đề có cột 'Mã HP' / 'Mã LHP'.")


def parse_room_capacities(rooms: Any, gaps: Any) -> list[dict]:
    """"B2.202(SC:54),B2.204(SC:90)" + "B2.202(14),B2.204(50)" -> [{room, capacity, capacity_gap}]."""
    out: dict[str, dict] = {}
    text = str(rooms or "")
    for m in _ROOM_CAP_RE.finditer(text):
        out[m.group(1).strip()] = {"room": m.group(1).strip(), "capacity": int(m.group(2)), "capacity_gap": None}
    if not out:
        for part in re.split(r"[,;]", text):
            if part.strip():
                out[part.strip()] = {"room": part.strip(), "capacity": None, "capacity_gap": None}
    for m in _ROOM_GAP_RE.finditer(str(gaps or "")):
        r = m.group(1).strip()
        out.setdefault(r, {"room": r, "capacity": None, "capacity_gap": None})["capacity_gap"] = int(m.group(2))
    return list(out.values())


def parse_uis_timetable(text: Any):
    """Tách chuỗi TKB UIS theo "||" -> (lessons, notes, unparsed)."""
    lessons, notes, unparsed = [], [], []
    for part in re.split(r"\|\|", str(text or "")):
        part = part.strip()
        if not part:
            continue
        if part.startswith("*"):
            notes.append(part.lstrip("* ").strip())
            continue
        if not _WEEKDAY_RE.search(_fold(part)):
            notes.append(part)  # vd "Giảng bằng Tiếng anh" thiếu dấu *
            continue
        lesson = parse_segment(part)
        if lesson:
            lessons.append(lesson)
        else:
            unparsed.append(part)
            notes.append(part)
    return lessons, notes, unparsed


def _min_week(lessons) -> int | None:
    weeks = [int(m.group()) for l in lessons if l.weeks for m in [re.match(r"\d+", l.weeks)] if m]
    return min(weeks) if weeks else None


def import_uis_classes(db: Session, src: bytes | str | Path, *, semester: str | None = None,
                       filename: str | None = None) -> ImportResult:
    wb = load_workbook(src)
    ws = wb.worksheets[0]
    rows = _rows(ws)
    wb.close()
    col, first = _map_uis_header(rows)
    ctx = ImportContext(db, source="uis")
    sem_hint = semester
    if not sem_hint and filename:
        m = re.search(r"(\d{4})-(\d{4})_HK0?(\d)", filename)
        if m:
            sem_hint = f"{m.group(1)}-{m.group(2)}-{int(m.group(3))}"
    starts: dict[str, Counter] = {}
    ends: dict[str, date] = {}

    def cell(row, field):
        j = col.get(field)
        return row[j] if j is not None and j < len(row) else None

    for row in rows[first:]:
        code = clip(cell(row, "code"), 64)
        class_code = clip(cell(row, "class_code"), 128)
        if not code or not class_code or skip_legacy_code(code):
            if any(v not in (None, "") for v in row):
                ctx.skipped += 1
            continue
        name = clip(cell(row, "name"), 512) or code
        lessons, notes, unparsed = parse_uis_timetable(cell(row, "tkb"))
        if unparsed:
            ctx.unparsed += 1
            ctx.warnings.append(f"{class_code}: không parse được '{unparsed[0]}'")
        is_english = name.rstrip().endswith("(E)") or any("tieng anh" in _norm(n) for n in notes)
        ctx.module(code, name=name, credits=to_int(cell(row, "credits")), type=cell(row, "type"),
                   faculty=cell(row, "faculty"), is_english=is_english)

        sem_id = semester or semester_from_class_code(class_code) or sem_hint
        begin, end = to_date(cell(row, "start")), to_date(cell(row, "end"))
        if sem_id:
            ctx.semester(sem_id, None, end)
            wk = _min_week(lessons)
            if begin and wk:
                monday = begin - timedelta(days=begin.weekday()) - timedelta(weeks=wk - 1)
                starts.setdefault(sem_id, Counter())[monday] += 1
            if end:
                ends[sem_id] = max(end, ends.get(sem_id, end))

        rooms = parse_room_capacities(cell(row, "rooms"), cell(row, "capacity_gap"))
        for r in rooms:
            r["room"] = ctx.venue(r["room"], r["capacity"])
        groups = split_student_groups(cell(row, "groups"))
        qmax = to_int(cell(row, "quota_max"))
        ctx.upsert_class(
            code, class_code, sem_id, lessons, schedule_raw=clip(cell(row, "tkb"), 10000),
            lecturer=clip(cell(row, "lecturer"), 512), quota=qmax, quota_min=to_int(cell(row, "quota_min")),
            registered=to_int(cell(row, "registered")), available=to_int(cell(row, "available")),
            student_groups=groups, rooms=rooms, notes=notes, start_date=begin, end_date=end,
            study_type=clip(cell(row, "type"), 128),
        )

    # Ngày bắt đầu học kỳ = thứ Hai của tuần 1, suy từ Ngày BĐ và tuần nhỏ nhất (lấy giá trị phổ biến nhất).
    for sem_id, counter in starts.items():
        ctx.semester(sem_id, counter.most_common(1)[0][0], ends.get(sem_id), force_start=True)
    from app.services.faculty_names import apply_outline_faculties
    apply_outline_faculties(db)
    return ctx.result()


# =========================================================================== (B) TA plan
def parse_terms(text: Any) -> list[int]:
    """"Học kỳ 1,3" -> [1, 3]; "Cả năm học" -> [1, 2, 3] (giả định năm học có 3 học kỳ)."""
    s = _norm(text)
    if not s:
        return []
    if "ca nam" in s:
        return [1, 2, 3]
    return sorted({int(x) for x in re.findall(r"\d+", s)})


def parse_credit_spec(v: Any) -> tuple[int | None, float | None]:
    """"3.0(45.0,0,0,0,0,0)" -> (3, 45.0) — số TC và số giờ lý thuyết."""
    if v is None:
        return None, None
    if isinstance(v, (int, float)):
        return int(v), None
    m = re.match(r"\s*(\d+(?:[.,]\d+)?)\s*(?:\(\s*(\d+(?:[.,]\d+)?))?", str(v))
    if not m:
        return None, None
    credits = int(float(m.group(1).replace(",", ".")))
    hours = float(m.group(2).replace(",", ".")) if m.group(2) else None
    return credits, hours


_YEAR_RE = re.compile(r"(20\d{2})\s*[–\-_]\s*(20\d{2})")


def import_ta_plan(db: Session, src: bytes | str | Path, *, academic_year: str | None = None,
                   filename: str | None = None) -> ImportResult:
    wb = load_workbook(src)
    ws = next((w for w in wb.worksheets if "mon hoc ta" in _norm(w.title)), wb.worksheets[0])
    rows = _rows(ws)
    wb.close()

    header_idx = None
    for i, row in enumerate(rows[:20]):
        if any(_norm(c).startswith("ma hoc phan") for c in row):
            header_idx = i
            break
    if header_idx is None:
        raise ImportFormatError("Không tìm thấy dòng tiêu đề có cột 'Mã học phần'.")
    names = [_norm(c) for c in rows[header_idx]]

    def find(pred) -> int | None:
        return next((j for j, n in enumerate(names) if pred(n)), None)

    col = {
        "code": find(lambda n: n.startswith("ma hoc phan")),
        "name": find(lambda n: n.startswith("ten hoc phan")),
        "department": find(lambda n: n.startswith("khoa/bo mon") or n.startswith("bo mon")),
        "terms": find(lambda n: n.startswith("hoc ky")),
        "pct": find(lambda n: n.startswith("%") or "duoc mo" in n),
        "credits": find(lambda n: n.startswith("so tin chi")),
        "note": find(lambda n: n.startswith("ghi chu")),
    }
    if col["code"] is None:
        raise ImportFormatError("Thiếu cột 'Mã học phần'.")

    year = academic_year
    if not year:
        for row in rows[:header_idx]:
            for c in row:
                if c and (m := _YEAR_RE.search(str(c))):
                    year = f"{m.group(1)}-{m.group(2)}"
                    break
            if year:
                break
    if not year and filename and (m := _YEAR_RE.search(filename)):
        year = f"{m.group(1)}-{m.group(2)}"
    if not year:
        raise ImportFormatError("Không xác định được năm học của kế hoạch (truyền academic_year).")

    ctx = ImportContext(db, source="ta-plan")
    existing = {p.module_code: p for p in db.scalars(
        select(ModuleOfferingPlan).where(ModuleOfferingPlan.academic_year == year))}

    def cell(row, field):
        j = col.get(field)
        return row[j] if j is not None and j < len(row) else None

    for row in rows[header_idx + 1:]:
        code = clip(cell(row, "code"), 64)
        if not code:
            if any(v not in (None, "") for v in row):
                ctx.skipped += 1
            continue
        credits, hours = parse_credit_spec(cell(row, "credits"))
        exists = code in ctx.modules or db.get(Module, code) is not None
        ctx.module(code, name=None if exists else clip(cell(row, "name"), 512), credits=credits,
                   department=cell(row, "department"), is_english=True)
        terms_text = clip(cell(row, "terms"), 128)
        plan = existing.get(code)
        if plan is None:
            plan = ModuleOfferingPlan(module_code=code, academic_year=year)
            db.add(plan)
            existing[code] = plan
        plan.terms = parse_terms(terms_text)
        plan.terms_text = terms_text
        plan.open_pct = to_float(cell(row, "pct"))
        plan.lecture_hours = hours
        plan.note = clip(cell(row, "note"), 2000)
        plan.source = "ta-plan"
        ctx.imported += 1
    from app.services.faculty_names import apply_outline_faculties
    apply_outline_faculties(db)
    res = ctx.result()
    res.semesters = []
    res.warnings = [f"academic_year={year}", *res.warnings]
    return res
