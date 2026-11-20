from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import ClassSection, Module, ModuleOfferingPlan
from app.routers.equivalents import codes_with_equivalents, equivalents_for, like_escape
from app.schemas import (
    ClassRoom,
    ClassSectionOut,
    LessonOut,
    ModuleDetail,
    ModuleList,
    ModuleSummary,
    OfferingPlanOut,
)
from app.services.text import search_tokens

router = APIRouter(tags=["modules"])


def _plans_for(db: Session, codes: list[str]) -> dict[str, list[OfferingPlanOut]]:
    out: dict[str, list[OfferingPlanOut]] = defaultdict(list)
    if not codes:
        return out
    for p in db.scalars(select(ModuleOfferingPlan).where(ModuleOfferingPlan.module_code.in_(codes))
                        .order_by(ModuleOfferingPlan.academic_year)):
        out[p.module_code].append(OfferingPlanOut(academic_year=p.academic_year, terms=p.terms or [],
                                                  terms_text=p.terms_text, open_pct=p.open_pct))
    return out


def _summary(m: Module, has_eq: bool, plans: list[OfferingPlanOut]) -> ModuleSummary:
    return ModuleSummary(code=m.code, name=m.name, credits=m.credits, type=m.type, faculty=m.faculty,
                         department=m.department, is_english=bool(m.is_english), has_equivalents=has_eq,
                         offering_plan=plans, is_sample=m.is_sample)


@router.get("/modules", response_model=ModuleList, summary="Tìm kiếm học phần")
def list_modules(
    q: str | None = Query(None, description="Mã/tên học phần, không phân biệt dấu"),
    faculty: str | None = None,
    credits: int | None = Query(None, ge=0, le=60),
    type: str | None = Query(None, description="Loại học phần (vd 'Lý thuyết', 'Bắt buộc')"),
    is_english: bool | None = Query(None, description="Chỉ môn dạy bằng tiếng Anh"),
    semester: str | None = Query(None, description="Chỉ môn có lớp mở trong học kỳ này"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=500),
    db: Session = Depends(get_db),
):
    stmt = select(Module)
    for tok in search_tokens(q):
        stmt = stmt.where(Module.search_text.like(f"%{like_escape(tok)}%", escape="\\"))
    if faculty:
        stmt = stmt.where(func.lower(Module.faculty) == faculty.strip().lower())
    if credits is not None:
        stmt = stmt.where(Module.credits == credits)
    if type:
        stmt = stmt.where(func.lower(Module.type) == type.strip().lower())
    if is_english is not None:
        stmt = stmt.where(Module.is_english.is_(is_english))
    if semester:
        stmt = stmt.where(Module.code.in_(
            select(ClassSection.module_code).where(ClassSection.semester_id == semester)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(db.scalars(stmt.order_by(Module.code).offset((page - 1) * size).limit(size)))
    codes = [m.code for m in rows]
    has_eq = codes_with_equivalents(db, codes)
    plans = _plans_for(db, codes)
    return ModuleList(items=[_summary(m, m.code in has_eq, plans.get(m.code, [])) for m in rows],
                      total=total, page=page, size=size)


@router.get("/faculties", response_model=list[str], summary="Danh sách khoa (để lọc)")
def list_faculties(db: Session = Depends(get_db)):
    return [f for f in db.scalars(select(Module.faculty).distinct().order_by(Module.faculty)) if f]


def _get_module(db: Session, code: str) -> Module:
    m = db.get(Module, code.strip())
    if m is None:
        raise HTTPException(404, f"Không tìm thấy học phần {code}.")
    return m


@router.get("/modules/{code}", response_model=ModuleDetail, summary="Chi tiết học phần")
def get_module(code: str, db: Session = Depends(get_db)):
    m = _get_module(db, code)
    eqs = equivalents_for(db, m.code)
    sems = sorted(s for s in db.scalars(
        select(ClassSection.semester_id).where(ClassSection.module_code == m.code).distinct()
    ) if s)
    base = _summary(m, bool(eqs), _plans_for(db, [m.code]).get(m.code, [])).model_dump()
    return ModuleDetail(**base, description=m.description, prerequisites=m.prerequisites or [],
                        equivalents=eqs, semesters=sems)


def class_to_out(cs: ClassSection) -> ClassSectionOut:
    return ClassSectionOut(
        class_code=cs.class_code, module_code=cs.module_code, semester=cs.semester_id,
        lecturer=cs.lecturer, quota=cs.quota, quota_min=cs.quota_min, quota_max=cs.quota,
        registered=cs.registered, available=cs.available, student_groups=cs.student_groups or [],
        cohorts=cs.cohorts or [], rooms=[ClassRoom(**r) for r in (cs.rooms or [])], notes=cs.notes or [],
        start_date=cs.start_date, end_date=cs.end_date, study_type=cs.study_type,
        lessons=[LessonOut(weekday=l.weekday, start_period=l.start_period, end_period=l.end_period,
                           start_time=l.start_time, end_time=l.end_time, room=l.room, weeks=l.weeks)
                 for l in cs.lessons],
        schedule_raw=cs.schedule_raw,
        schedule_parsed=bool(cs.lessons) or not cs.schedule_raw,
        is_sample=cs.is_sample,
    )


@router.get("/modules/{code}/classes", response_model=list[ClassSectionOut], summary="Lớp học phần của một học phần")
def list_module_classes(
    code: str,
    semester: str | None = Query(None, description="Mã học kỳ, vd 2025-2026-1"),
    cohort: str | None = Query(None, description="Khóa, vd K24 — chỉ lớp có sinh viên khóa này"),
    db: Session = Depends(get_db),
):
    m = _get_module(db, code)
    stmt = (select(ClassSection).where(ClassSection.module_code == m.code)
            .options(selectinload(ClassSection.lessons)).order_by(ClassSection.class_code))
    if semester:
        stmt = stmt.where(ClassSection.semester_id == semester)
    classes = list(db.scalars(stmt))
    if cohort:  # lọc trong Python để giống nhau trên SQLite/PostgreSQL (cột JSON)
        c = cohort.strip().upper()
        classes = [cs for cs in classes if c in (cs.cohorts or [])]
    return [class_to_out(cs) for cs in classes]
