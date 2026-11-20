"""Import/upsert dữ liệu: lớp học phần (DKHP/fetch_courses.py), học phần tương đương,
dữ liệu mẫu. Các importer Excel/portal dùng chung `ImportContext` ở đây."""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ClassSection, Equivalent, Lesson, Module, ModuleOfferingPlan, Semester, Venue
from app.schemas import ImportResult
from app.services.schedule_parser import ParsedLesson, parse_schedules
from app.services.text import normalize_search


class ImportFormatError(ValueError):
    pass


# --------------------------------------------------------------------------- helpers
def extract_rows(payload: Any) -> list[dict]:
    """Chấp nhận list hoặc object bọc list (data/Data/result/Result/items)."""
    if isinstance(payload, dict):
        for key in ("data", "Data", "result", "Result", "items", "Items"):
            if isinstance(payload.get(key), list):
                payload = payload[key]
                break
        else:
            raise ImportFormatError("JSON phải là một mảng (list) các bản ghi.")
    if not isinstance(payload, list):
        raise ImportFormatError("JSON phải là một mảng (list) các bản ghi.")
    return [r for r in payload if isinstance(r, dict)]


def load_json_bytes(data: bytes) -> Any:
    try:
        return json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError, ValueError) as e:
        raise ImportFormatError(f"File không phải JSON UTF-8 hợp lệ: {e}") from None


def get_ci(d: dict, *names: str):
    """Lấy giá trị theo tên khóa, không phân biệt hoa thường."""
    lower = {str(k).lower(): v for k, v in d.items()}
    for n in names:
        v = lower.get(n.lower())
        if v not in (None, ""):
            return v
    return None


def to_float(v) -> float | None:
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"-?\d+(?:[.,]\d+)?", str(v))
    if not m:
        return None
    try:
        return float(m.group().replace(",", "."))
    except ValueError:
        return None


def to_int(v) -> int | None:
    f = to_float(v)
    return int(f) if f is not None else None


_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%Y", "%m/%d/%Y")


def to_date(v) -> date | None:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    m = re.match(r"/Date\((\d+)", s)  # định dạng .NET cũ
    if m:
        return datetime.fromtimestamp(int(m.group(1)) / 1000).date()
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        pass
    head = s.split("T")[0].split(" ")[0]
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(head, fmt).date()
        except ValueError:
            continue
    return None


def clip(v, n: int) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s[:n] if s else None


def split_student_groups(value) -> list[str]:
    if not value:
        return []
    items = value if isinstance(value, list) else re.split(r"[,;\n]+", str(value))
    return [s.strip() for s in items if str(s).strip()]


def cohorts_from_groups(groups: list[str]) -> list[str]:
    """Quy ước UEL: lớp sinh viên bắt đầu bằng K + 2 số cuối năm nhập học
    (K24404E -> K24, K234111E -> K23)."""
    out: list[str] = []
    for g in groups:
        m = re.match(r"\s*[Kk](\d{2})", g)
        if m and (c := f"K{m.group(1)}") not in out:
            out.append(c)
    return sorted(out)


# --------------------------------------------------------------------------- semesters
def term_label(term: int) -> str:
    return f"Học kỳ {term}"


def semester_id(y1: int, term: int) -> str:
    return f"{y1}-{y1 + 1}-{term}"


def semester_for_date(d: date) -> str:
    """Giả định (chưa kiểm chứng): HK1 bắt đầu tháng 8–12, HK2 tháng 1–5, HK3 tháng 6–7."""
    if d.month >= 8:
        return semester_id(d.year, 1)
    if d.month <= 5:
        return semester_id(d.year - 1, 2)
    return semester_id(d.year - 1, 3)


def semester_from_class_code(code: str | None) -> str | None:
    """Mã LHP UEL bắt đầu bằng YY + số học kỳ, vd 251EIE300401 -> 2025-2026 HK1.
    (Đã đối chiếu với TKB thật: 222… = 2022-2023 HK02, 243… = 2024-2025 HK03.)"""
    m = re.match(r"(\d{2})(\d)(?=[A-Za-z])", (code or "").strip())
    if not m:
        return None
    return semester_id(2000 + int(m.group(1)), int(m.group(2)))


def semester_from_year_term(year_study: str | None, term_id: str | None) -> str | None:
    """YearStudy "2022-2023" + TermID "HK02" -> "2022-2023-2"."""
    y = re.match(r"\s*(\d{4})\s*[-–]\s*(\d{4})", str(year_study or ""))
    t = re.search(r"(\d+)", str(term_id or ""))
    if not y or not t:
        return None
    return semester_id(int(y.group(1)), int(t.group(1)))


def parse_semester_id(sem_id: str) -> tuple[str, int, str] | None:
    m = re.fullmatch(r"(\d{4})-(\d{4})-(\d+)", sem_id.strip())
    if not m:
        return None
    y1, y2, term = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return f"{y1}-{y2}", term, f"{term_label(term)}, năm học {y1}–{y2}"


# --------------------------------------------------------------------------- context
def _refresh_module_search(m: Module) -> None:
    m.search_text = normalize_search(f"{m.code} {m.name} {m.faculty or ''} {m.department or ''}")


_UNSET = object()


class ImportContext:
    """Cache + upsert dùng chung cho mọi nguồn dữ liệu lớp học phần."""

    def __init__(self, db: Session, *, is_sample: bool = False, source: str | None = None):
        self.db = db
        self.is_sample = is_sample
        self.source = source or ("sample" if is_sample else None)
        self.modules: dict[str, Module] = {}
        self.venues: dict[str, Venue] = {v.room: v for v in db.scalars(select(Venue))}
        self.semesters: dict[str, Semester] = {}
        self.sem_ids: set[str] = set()
        self.imported = self.skipped = self.unparsed = self.lessons = 0
        self.warnings: list[str] = []

    # ---- semester
    def semester(self, sem_id: str, start: date | None = None, end: date | None = None,
                 *, force_start: bool = False) -> Semester:
        sem = self.semesters.get(sem_id) or self.db.get(Semester, sem_id)
        if sem is None:
            parsed = parse_semester_id(sem_id)
            year, term, name = parsed if parsed else ("", 0, sem_id)
            sem = Semester(id=sem_id, name=name, year=year, term=term, is_sample=self.is_sample)
            self.db.add(sem)
        if not self.is_sample:
            sem.is_sample = False
        if start and (force_start or sem.start_date is None or start < sem.start_date):
            sem.start_date = start
        if end and (sem.end_date is None or end > sem.end_date):
            sem.end_date = end
        self.semesters[sem_id] = sem
        self.sem_ids.add(sem_id)
        return sem

    # ---- module
    def module(self, code: str, *, name=None, credits=None, type=None, faculty=None,
               department=None, is_english: bool | None = None) -> Module:
        m = self.modules.get(code) or self.db.get(Module, code)
        if m is None:
            m = Module(code=code, name=clip(name, 512) or code, is_sample=self.is_sample, is_english=False)
            self.db.add(m)
        if name:
            m.name = clip(name, 512)
        if credits is not None:
            m.credits = credits
        if type:
            m.type = clip(type, 128)
        if faculty:
            m.faculty = clip(faculty, 256)
        if department:
            m.department = clip(department, 256)
        if is_english:
            m.is_english = True
        if not self.is_sample:
            m.is_sample = False
        _refresh_module_search(m)
        self.modules[code] = m
        return m

    # ---- venue
    def venue(self, room: str, capacity: int | None = None) -> str:
        room = room.strip()[:128]
        v = self.venues.get(room)
        if v is None:
            v = Venue(room=room, is_sample=self.is_sample)
            self.db.add(v)
            self.venues[room] = v
        elif not self.is_sample:
            v.is_sample = False
        if capacity is not None:
            v.capacity = capacity
        return room

    # ---- class section
    def upsert_class(self, module_code: str, class_code: str, sem_id: str | None,
                     lessons: list[ParsedLesson], *, schedule_raw: str | None = None, **fields) -> ClassSection:
        db = self.db
        db.flush()
        cs = db.scalar(select(ClassSection).where(
            ClassSection.class_code == class_code,
            ClassSection.semester_id.is_(None) if sem_id is None else ClassSection.semester_id == sem_id,
        ))
        if cs is None:
            cs = ClassSection(class_code=class_code, module_code=module_code, semester_id=sem_id)
            db.add(cs)
        cs.module_code = module_code
        for k, v in fields.items():
            setattr(cs, k, v)
        if "student_groups" in fields:
            cs.cohorts = cohorts_from_groups(fields["student_groups"] or [])
        cs.schedule_raw = schedule_raw
        cs.is_sample = self.is_sample
        cs.source = self.source
        for pl in lessons:
            if pl.room:
                pl.room = self.venue(pl.room)
        db.flush()
        cs.lessons.clear()
        for pl in lessons:
            cs.lessons.append(Lesson(
                weekday=pl.weekday, start_period=pl.start_period, end_period=pl.end_period,
                start_time=pl.start_time, end_time=pl.end_time, room=pl.room,
                weeks=clip(pl.weeks, 256), raw=pl.raw,
            ))
        db.flush()
        self.lessons += len(lessons)
        self.imported += 1
        return cs

    def result(self) -> ImportResult:
        self.db.commit()
        return ImportResult(
            imported=self.imported, modules=len(self.modules), lessons=self.lessons, venues=len(self.venues),
            skipped=self.skipped, unparsed_schedules=self.unparsed, semesters=sorted(self.sem_ids),
            warnings=self.warnings[:50],
        )


# --------------------------------------------------------------------------- semesters/modules (seed)
def upsert_semesters(db: Session, rows: list[dict], *, is_sample: bool = False) -> int:
    ctx = ImportContext(db, is_sample=is_sample)
    for r in rows:
        sem = ctx.semester(str(r["id"]), to_date(r.get("start_date")), to_date(r.get("end_date")))
        for f in ("name", "year"):
            if r.get(f):
                setattr(sem, f, r[f])
        if r.get("term") is not None:
            sem.term = int(r["term"])
        if "is_current" in r:
            sem.is_current_override = bool(r["is_current"])
    db.commit()
    return len(rows)


def upsert_modules(db: Session, rows: list[dict], *, is_sample: bool = False) -> int:
    """Metadata học phần (khoa, mô tả, tiên quyết) — dùng cho seed."""
    ctx = ImportContext(db, is_sample=is_sample)
    n = 0
    for r in rows:
        code = clip(r.get("code"), 64)
        if not code:
            continue
        m = ctx.module(code, name=r.get("name"), credits=to_int(r.get("credits")), type=r.get("type"),
                       faculty=r.get("faculty"), department=r.get("department"),
                       is_english=bool(r.get("is_english")))
        if r.get("description"):
            m.description = r["description"]
        if r.get("prerequisites") is not None:
            m.prerequisites = [str(x) for x in r["prerequisites"]]
        n += 1
    db.commit()
    return n


# --------------------------------------------------------------------------- DKHP classes
def import_classes(db: Session, rows: list[dict], *, is_sample: bool = False,
                   semester: str | None = None) -> ImportResult:
    """Upsert lớp học phần từ JSON của fetch_courses.py (list các bản ghi DKHP)."""
    ctx = ImportContext(db, is_sample=is_sample, source="sample" if is_sample else "dkhp")
    for r in rows:
        module_code = clip(get_ci(r, "CurriculumID", "CurriculumCode", "StudyUnitCode"), 64)
        class_code = clip(get_ci(r, "ScheduleStudyUnitAlias", "ScheduleStudyUnitID", "ScheduleStudyUnitCode"), 128)
        if not module_code or not class_code:
            ctx.skipped += 1
            continue
        name = clip(get_ci(r, "ScheduleStudyUnitName", "CurriculumName", "StudyUnitName"), 512) or module_code
        begin, end = to_date(get_ci(r, "BeginDate", "StartDate")), to_date(get_ci(r, "EndDate"))
        ctx.module(module_code, name=name, credits=to_int(get_ci(r, "Credits", "Credit")),
                   type=get_ci(r, "StudyUnitTypeName", "StudyUnitType"),
                   is_english=name.rstrip().endswith("(E)"))
        sem_id = semester or semester_from_class_code(class_code) or (semester_for_date(begin) if begin else None)
        if sem_id:
            ctx.semester(sem_id, begin, end)
        result = parse_schedules(r.get("Schedules", get_ci(r, "Schedules", "Schedule")))
        if result.unparsed or (result.raw and not result.lessons):
            ctx.unparsed += 1
        quota = to_int(get_ci(r, "StudentQuotas", "Quota"))
        ctx.upsert_class(
            module_code, class_code, sem_id, result.lessons, schedule_raw=result.raw,
            lecturer=clip(get_ci(r, "ProfessorName", "Lecturer"), 512), quota=quota,
            start_date=begin, end_date=end, study_type=clip(get_ci(r, "StudyUnitTypeName"), 128),
        )
    return ctx.result()


# --------------------------------------------------------------------------- equivalents
def import_equivalents(db: Session, rows: list[dict], *, is_sample: bool = False) -> ImportResult:
    existing = {(e.code, e.equivalent_code): e for e in db.scalars(select(Equivalent))}
    imported = skipped = 0
    for r in rows:
        code = clip(get_ci(r, "MaMon", "code"), 64)
        eq_code = clip(get_ci(r, "MaMonTuongDuong", "equivalent_code"), 64)
        if not code or not eq_code or code == eq_code:
            skipped += 1
            continue
        e = existing.get((code, eq_code))
        if e is None:
            e = Equivalent(code=code, equivalent_code=eq_code, is_sample=is_sample)
            db.add(e)
            existing[(code, eq_code)] = e
        e.name = clip(get_ci(r, "TenMon", "name"), 512) or e.name
        stc = to_int(get_ci(r, "STC", "credits"))
        e.credits = stc if stc is not None else e.credits
        e.equivalent_name = clip(get_ci(r, "TenMonTuongDuong", "equivalent_name"), 512) or e.equivalent_name
        stc2 = to_int(get_ci(r, "STCTuongDuong", "equivalent_credits"))
        e.equivalent_credits = stc2 if stc2 is not None else e.equivalent_credits
        if not is_sample:
            e.is_sample = False
        e.search_text = normalize_search(f"{code} {e.name or ''} {eq_code} {e.equivalent_name or ''}")
        imported += 1
    db.commit()
    return ImportResult(imported=imported, skipped=skipped)


def clear_sample_data(db: Session) -> dict[str, int]:
    """Xóa toàn bộ bản ghi gắn cờ is_sample (khi đã có dữ liệu thật)."""
    counts: dict[str, int] = {}
    for model in (ClassSection, Equivalent, Module, Venue, Semester):
        rows = list(db.scalars(select(model).where(model.is_sample.is_(True))))
        deleted = 0
        for row in rows:
            if model is Module and (any(not c.is_sample for c in row.classes) or row.offering_plans):
                continue
            if model is Venue and db.scalar(select(Lesson.id).where(Lesson.room == row.room).limit(1)):
                continue
            if model is Semester and db.scalar(select(ClassSection.id).where(ClassSection.semester_id == row.id).limit(1)):
                continue
            db.delete(row)
            deleted += 1
        counts[model.__tablename__] = deleted
        db.flush()
    db.commit()
    return counts


__all__ = [
    "ImportContext", "ImportFormatError", "ModuleOfferingPlan", "clear_sample_data", "extract_rows",
    "import_classes", "import_equivalents", "load_json_bytes", "semester_for_date",
    "semester_from_class_code", "semester_from_year_term", "to_date", "to_float", "to_int",
    "upsert_modules", "upsert_semesters",
]
