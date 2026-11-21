from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import (
    ClassSection,
    Module,
    ModuleOfferingPlan,
    OutlineAssessment,
    OutlineClo,
    OutlineCourse,
    OutlineDocument,
    OutlineMaterial,
    OutlineModuleLink,
    OutlineObjective,
    OutlineResource,
    OutlineScheduleItem,
    ProgramCatalogEntry,
    ProgramModule,
)
from app.routers.equivalents import codes_with_equivalents, equivalents_for, like_escape
from app.schemas import (
    ClassRoom,
    ClassSectionOut,
    LessonOut,
    FacetCount,
    ModuleDetail,
    ModuleFacets,
    ModuleList,
    ModuleSummary,
    OfferingPlanOut,
    OpenSemester,
    OutlineAssessmentOut,
    OutlineCloOut,
    OutlineCourseOut,
    OutlineDocumentInfo,
    OutlineMaterialOut,
    OutlineObjectiveOut,
    OutlineOut,
    OutlineScheduleOut,
    ProgramRequired,
)
from app.services.faculty_names import department_en, faculty_en
from app.services.program_tracks import get_program_track_codes
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


def _descriptions_for(db: Session, codes: list[str]) -> dict[str, tuple[str | None, str | None]]:
    """Mô tả học phần song ngữ: code -> (tiếng Việt, tiếng Anh) từ cột modules.description / description_en.
    Các cột này do `fill-descriptions` điền từ đề cương (không còn lấy trực tiếp từ đề cương lúc truy vấn, để đúng ngôn ngữ)."""
    if not codes:
        return {}
    clean = lambda s: s.strip() if s and s.strip() else None  # noqa: E731
    return {code: (clean(vi), clean(en)) for code, vi, en in db.execute(
        select(Module.code, Module.description, Module.description_en).where(Module.code.in_(codes))).all()}


def _outline_urls_for(db: Session, codes: list[str]) -> dict[str, str]:
    """Link Drive (PDF) của đề cương cho từng học phần; ưu tiên link 'chuẩn' (đề cương hiện tại)."""
    if not codes:
        return {}
    rows = db.execute(
        select(ProgramCatalogEntry.module_code, OutlineResource.kind, OutlineResource.url)
        .join(OutlineResource, OutlineResource.entry_id == ProgramCatalogEntry.id)
        .where(ProgramCatalogEntry.module_code.in_(codes), OutlineResource.url.is_not(None))
        .order_by(ProgramCatalogEntry.module_code, OutlineResource.id)
    ).all()
    best: dict[str, tuple[bool, str]] = {}
    for code, kind, url in rows:
        if not url or not url.startswith("http"):
            continue
        chuan = "chuẩn" in (kind or "").lower()
        if code not in best or (chuan and not best[code][0]):
            best[code] = (chuan, url)
    return {code: url for code, (_, url) in best.items()}


def _summary(m: Module, has_eq: bool, plans: list[OfferingPlanOut], open_sems: list[OpenSemester] | None = None,
             has_outline: bool = False, description: str | None = None, outline_url: str | None = None,
             description_en: str | None = None) -> ModuleSummary:
    return ModuleSummary(code=m.code, name=m.name, name_en=m.name_en, credits=m.credits, type=m.type, faculty=m.faculty,
                         faculty_en=faculty_en(m.faculty), department=m.department, department_en=department_en(m.department),
                         description=description, description_en=description_en, outline_url=outline_url, is_english=bool(m.is_english) or m.language_track == "en", has_equivalents=has_eq,
                         offering_plan=plans, language_track=m.language_track or "vi", language_basis=m.language_basis,
                         is_talent_program=bool(m.is_talent_program), counterpart_code=m.counterpart_code,
                         open_semesters=open_sems or [], has_outline=has_outline, is_sample=m.is_sample)


def _open_semesters(db: Session, codes: list[str]) -> dict[str, list[OpenSemester]]:
    out: dict[str, list[OpenSemester]] = defaultdict(list)
    if not codes:
        return out
    rows = db.execute(
        select(ClassSection.module_code, ClassSection.semester_id, func.count())
        .where(ClassSection.module_code.in_(codes), ClassSection.semester_id.is_not(None))
        .group_by(ClassSection.module_code, ClassSection.semester_id).order_by(ClassSection.semester_id)
    ).all()
    for code, sem, n in rows:
        out[code].append(OpenSemester(semester=sem, classes=n))
    return out


def _modules_with_outline_subquery():
    """Mã học phần có ít nhất một đề cương đã phân tích (ok/partial)."""
    return (select(OutlineModuleLink.module_code)
            .join(OutlineCourse, OutlineCourse.document_id == OutlineModuleLink.document_id)
            .where(OutlineCourse.parse_status.in_(("ok", "partial"))))


def _text_case_variants(text: str) -> list[str]:
    """Tạo các biến thể chữ hoa/thường (gốc, lower, upper, title, capitalize)
    để hỗ trợ tìm kiếm không phân biệt hoa thường với ký tự tiếng Việt có dấu
    trên cả SQLite (hàm lower() chỉ hỗ trợ ASCII) và PostgreSQL."""
    s = text.strip()
    if not s:
        return []
    variants = {s, s.lower(), s.upper(), s.title(), s.capitalize()}
    return [v for v in variants if v]


@router.get("/modules", response_model=ModuleList, summary="Tìm kiếm học phần")
def list_modules(
    q: str | None = Query(None, description="Mã/tên học phần, không phân biệt dấu"),
    faculty: str | None = None,
    faculty_in: list[str] | None = Query(None, description="Danh sách khoa/bộ môn (lặp tham số ?faculty_in=...)"),
    credits: int | None = Query(None, ge=0, le=60),
    credits_in: str | None = Query(None, description="Danh sách tín chỉ, phân cách bằng dấu phẩy, vd '2,3,4'"),
    type: str | None = Query(None, description="Loại học phần (vd 'Lý thuyết', 'Bắt buộc')"),
    type_in: str | None = Query(None, description="Danh sách loại học phần, phân cách bằng dấu phẩy"),
    is_english: bool | None = Query(None, description="(cũ) tương đương language=en"),
    language: str | None = Query(None, pattern="^(en|vi)$", description="en = dạy bằng tiếng Anh, vi = tiếng Việt"),
    talent: bool | None = Query(None, description="Chỉ môn thuộc chương trình Cử nhân tài năng (CNTN)"),
    has_outline: bool | None = Query(None, description="Chỉ môn đã có đề cương chi tiết"),
    semester: str | None = Query(None, description="Chỉ môn có lớp mở trong học kỳ này"),
    program_id: str | None = Query(None, description="Chỉ môn thuộc CTĐT này, vd K23406 (khóa 23, ngành 406)"),
    program_ids: list[str] | None = Query(None, description="Danh sách mã CTĐT (lặp tham số ?program_ids=...)"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=500),
    db: Session = Depends(get_db),
):
    stmt = select(Module)
    # 0 TC được coi là lỗi dữ liệu: không đưa vào danh sách (NULL vẫn giữ để không mất môn chưa rõ TC).
    stmt = stmt.where(or_(Module.credits.is_(None), Module.credits != 0))
    for tok in search_tokens(q):
        stmt = stmt.where(Module.search_text.like(f"%{like_escape(tok)}%", escape="\\"))
    pids: list[str] = []
    if program_id and program_id.strip():
        pids.append(program_id.strip())
    if program_ids:
        for item in program_ids:
            if isinstance(item, str) and item.strip():
                pids.append(item.strip())
    if pids:
        allowed_codes: set[str] = set()
        for pid in pids:
            allowed_codes.update(get_program_track_codes(db, pid))
        stmt = stmt.where(Module.code.in_(allowed_codes))

    # Khoa / Bộ môn: khớp cột faculty HOẶC department cho từng giá trị được chọn
    parsed_faculties: list[str] = []
    if faculty and faculty.strip():
        parsed_faculties.append(faculty.strip())
    if faculty_in:
        for item in faculty_in:
            if isinstance(item, str) and item.strip():
                parsed_faculties.append(item.strip())
    if parsed_faculties:
        fac_variants = list(dict.fromkeys(v for f in parsed_faculties for v in _text_case_variants(f)))
        fac_targets = [func.lower(v) for v in fac_variants]
        stmt = stmt.where(or_(
            func.lower(Module.faculty).in_(fac_targets),
            func.lower(Module.department).in_(fac_targets),
            Module.faculty.in_(fac_variants),
            Module.department.in_(fac_variants),
        ))

    # Tín chỉ: kết hợp credits (đơn) và credits_in (nhiều, phân cách dấu phẩy)
    parsed_credits: list[int] = []
    if credits is not None:
        parsed_credits.append(credits)
    if credits_in:
        for part in credits_in.split(","):
            part = part.strip()
            if not part:
                continue
            try:
                val = int(part)
            except ValueError:
                raise HTTPException(422, f"Giá trị tín chỉ không hợp lệ: {part}")
            if val < 0 or val > 60:
                raise HTTPException(422, f"Tín chỉ phải từ 0 đến 60: {val}")
            parsed_credits.append(val)
    if parsed_credits:
        stmt = stmt.where(Module.credits.in_(list(set(parsed_credits))))

    # Loại học phần: kết hợp type (đơn) và type_in (nhiều, phân cách dấu phẩy)
    parsed_types: list[str] = []
    if type and type.strip():
        parsed_types.append(type.strip())
    if type_in:
        for part in type_in.split(","):
            part = part.strip()
            if part:
                parsed_types.append(part)
    if parsed_types:
        type_variants = list(dict.fromkeys(v for t in parsed_types for v in _text_case_variants(t)))
        type_targets = [func.lower(v) for v in type_variants]
        stmt = stmt.where(or_(
            func.lower(Module.type).in_(type_targets),
            Module.type.in_(type_variants),
        ))

    if is_english is not None:  # cùng nguồn với hiển thị: cột language_track HOẶC cờ is_english (ghi chú "Giảng bằng Tiếng Anh")
        en = or_(Module.language_track == "en", Module.is_english.is_(True))
        stmt = stmt.where(en if is_english else ~en)
    if language:
        stmt = stmt.where(Module.language_track == language)
    if talent is not None:
        stmt = stmt.where(Module.is_talent_program.is_(talent))
    if has_outline is not None:
        sub = _modules_with_outline_subquery()
        stmt = stmt.where(Module.code.in_(sub) if has_outline else Module.code.not_in(sub))
    if semester:
        stmt = stmt.where(Module.code.in_(
            select(ClassSection.module_code).where(ClassSection.semester_id == semester)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(db.scalars(stmt.order_by(Module.code).offset((page - 1) * size).limit(size)))
    codes = [m.code for m in rows]
    has_eq = codes_with_equivalents(db, codes)
    plans = _plans_for(db, codes)
    open_map = _open_semesters(db, codes)
    outline_codes = set(db.scalars(_modules_with_outline_subquery().where(OutlineModuleLink.module_code.in_(codes)))) if codes else set()
    descs = _descriptions_for(db, codes)
    urls = _outline_urls_for(db, codes)
    d = lambda c: descs.get(c, (None, None))  # noqa: E731
    return ModuleList(items=[_summary(m, m.code in has_eq, plans.get(m.code, []), open_map.get(m.code), m.code in outline_codes,
                                      d(m.code)[0], urls.get(m.code), d(m.code)[1]) for m in rows],
                      total=total, page=page, size=size)


@router.get("/module-facets", response_model=ModuleFacets, summary="Số lượng học phần theo từng bộ lọc (cho cột 'Lọc theo')")
def module_facets(db: Session = Depends(get_db)):
    def counts(col):
        return [FacetCount(value=str(v), count=n) for v, n in db.execute(
            select(col, func.count()).where(col.is_not(None)).group_by(col).order_by(func.count().desc())).all() if str(v).strip()]

    total = db.scalar(select(func.count()).select_from(Module).where(or_(Module.credits.is_(None), Module.credits != 0))) or 0
    sem = db.execute(select(ClassSection.semester_id, func.count(func.distinct(ClassSection.module_code)))
                     .where(ClassSection.semester_id.is_not(None)).group_by(ClassSection.semester_id)
                     .order_by(ClassSection.semester_id)).all()
    talent = db.scalar(select(func.count()).select_from(Module).where(Module.is_talent_program.is_(True))) or 0
    with_outline = db.scalar(select(func.count(func.distinct(OutlineModuleLink.module_code)))
                             .where(OutlineModuleLink.module_code.in_(_modules_with_outline_subquery()))) or 0
    return ModuleFacets(
        total=total, language=counts(Module.language_track),
        talent=[FacetCount(value="true", count=talent), FacetCount(value="false", count=total - talent)],
        credits=sorted((f for f in counts(Module.credits) if f.value != "0"), key=lambda f: int(f.value)), faculty=counts(Module.faculty), type=counts(Module.type),
        department=counts(Module.department),
        semester=[FacetCount(value=s, count=n) for s, n in sem],
        has_outline=[FacetCount(value="true", count=with_outline), FacetCount(value="false", count=total - with_outline)])


@router.get("/faculties", response_model=list[str], summary="Danh sách khoa (để lọc)")
def list_faculties(db: Session = Depends(get_db)):
    return [f for f in db.scalars(select(Module.faculty).distinct().order_by(Module.faculty)) if f]


def _get_module(db: Session, code: str) -> Module:
    m = db.get(Module, code.strip())
    if m is None:
        raise HTTPException(404, f"Không tìm thấy học phần {code}.")
    return m


@router.get("/modules/{code}", response_model=ModuleDetail, summary="Chi tiết học phần")
def get_module(
    code: str,
    program_id: str | None = Query(None, description="Mã CTĐT để tra cứu trạng thái bắt buộc của môn học"),
    db: Session = Depends(get_db),
):
    m = _get_module(db, code)
    eqs = equivalents_for(db, m.code)
    sems = sorted(s for s in db.scalars(
        select(ClassSection.semester_id).where(ClassSection.module_code == m.code).distinct()
    ) if s)
    open_sems = _open_semesters(db, [m.code]).get(m.code)
    has_outline = bool(db.scalar(_modules_with_outline_subquery().where(OutlineModuleLink.module_code == m.code).limit(1)))
    vi, en = _descriptions_for(db, [m.code]).get(m.code, (None, None))  # mô tả song ngữ: description (VI) / description_en (EN)
    base = _summary(m, bool(eqs), _plans_for(db, [m.code]).get(m.code, []), open_sems, has_outline,
                    description=vi, description_en=en).model_dump()
    base.pop("description", None)

    # Ô bắt buộc: required_in_programs, is_required_any, required
    pm_rows = db.execute(
        select(ProgramModule.program_id, ProgramModule.required)
        .where(ProgramModule.module_code == m.code)
        .order_by(ProgramModule.program_id)
    ).all()
    req_in_progs = [ProgramRequired(program_id=pid, required=bool(req)) for pid, req in pm_rows]
    is_req_any = any(rp.required for rp in req_in_progs)
    current_req = None
    if program_id:
        clean_pid = program_id.strip()
        match = next((rp for rp in req_in_progs if rp.program_id == clean_pid), None)
        if match is not None:
            current_req = match.required

    return ModuleDetail(
        **base,
        description=vi,
        prerequisites=m.prerequisites or [],
        equivalents=eqs,
        semesters=sems,
        required_in_programs=req_in_progs,
        is_required_any=is_req_any,
        required=current_req,
    )


def class_to_out(cs: ClassSection) -> ClassSectionOut:
    return ClassSectionOut(
        class_code=cs.class_code, module_code=cs.module_code, semester=cs.semester_id,
        lecturer=cs.lecturer, quota=cs.quota, quota_min=cs.quota_min, quota_max=cs.quota,
        registered=cs.registered, available=cs.available, student_groups=cs.student_groups or [],
        cohorts=cs.cohorts or [], rooms=[ClassRoom(**r) for r in (cs.rooms or [])], notes=cs.notes or [],
        start_date=cs.start_date, end_date=cs.end_date, study_type=cs.study_type,
        lessons=[LessonOut(weekday=l.weekday, start_period=l.start_period, end_period=l.end_period,
                           start_time=l.start_time, end_time=l.end_time, room=l.room, weeks=l.weeks,
                           date_start=l.date_start, date_end=l.date_end)
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


# ---------------------------------------------------------------- đề cương chi tiết
_STATUS_RANK = {"ok": 3, "partial": 2, "failed": 1, "skipped": 0}


def _doc_info(c: OutlineCourse, d: OutlineDocument) -> OutlineDocumentInfo:
    return OutlineDocumentInfo(document_id=d.id, doc_type=c.doc_type, parse_status=c.parse_status, parse_method=c.parse_method,
                               pages=d.page_count, text_chars=d.text_chars)


@router.get("/modules/{code}/outline", response_model=OutlineOut, summary="Đề cương chi tiết của học phần (từ PDF đề cương 2025)")
def get_module_outline(code: str, db: Session = Depends(get_db)):
    m = _get_module(db, code)
    doc_ids = set(db.scalars(select(OutlineModuleLink.document_id).where(OutlineModuleLink.module_code == m.code)))
    doc_ids |= set(db.scalars(select(OutlineCourse.document_id).where(OutlineCourse.course_code_norm == m.code)))
    rows = list(db.execute(select(OutlineCourse, OutlineDocument).join(OutlineDocument, OutlineDocument.id == OutlineCourse.document_id)
                           .where(OutlineCourse.document_id.in_(doc_ids), OutlineCourse.doc_type.like("syllabus%"))).all()) if doc_ids else []
    rows = [r for r in rows if r[0].parse_status in ("ok", "partial")]
    if not rows:
        raise HTTPException(404, f"Chưa có đề cương đã phân tích cho học phần {m.code}.")

    def score(r):
        c, _ = r
        counts = (c.parse_detail or {}).get("counts", {})
        wants = "syllabus_en" if m.language_track == "en" else "syllabus_vi"
        return (_STATUS_RANK.get(c.parse_status, 0), c.doc_type == wants, sum(counts.values()))

    rows.sort(key=score, reverse=True)
    c, d = rows[0]

    def q(model, order):
        return list(db.scalars(select(model).where(model.document_id == d.id).order_by(order)))

    return OutlineOut(
        module_code=m.code, document=_doc_info(c, d),
        course=OutlineCourseOut(**{k: getattr(c, k) for k in OutlineCourseOut.model_fields if k not in ("lecturers", "assistants")},
                                lecturers=c.lecturers or [], assistants=c.assistants or []),
        objectives=[OutlineObjectiveOut(code=o.code, description=o.description, clo_codes=o.clo_codes or [], competency_level=o.competency_level)
                    for o in q(OutlineObjective, OutlineObjective.id)],
        clos=[OutlineCloOut(code=o.code, description=o.description, teaching_levels=o.teaching_levels) for o in q(OutlineClo, OutlineClo.id)],
        assessments=[OutlineAssessmentOut(component=o.component, item_code=o.item_code, item_name=o.item_name, clo_codes=o.clo_codes or [],
                                          criteria=o.criteria, duration=o.duration, weight_pct=o.weight_pct, sub_weight_pct=o.sub_weight_pct)
                     for o in q(OutlineAssessment, OutlineAssessment.ord)],
        schedule=[OutlineScheduleOut(week_label=o.week_label, content=o.content, clo_codes=o.clo_codes or [], activities=o.activities,
                                     assessment=o.assessment) for o in q(OutlineScheduleItem, OutlineScheduleItem.ord)],
        materials=[OutlineMaterialOut(kind=o.kind, citation=o.citation) for o in q(OutlineMaterial, OutlineMaterial.ord)],
        alternatives=[_doc_info(c2, d2) for c2, d2 in rows[1:6]],
    )
