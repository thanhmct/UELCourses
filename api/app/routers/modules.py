from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.rate_limit import get_real_ip
from app.services.catalog_visibility import public_module
from app.services.ip_utils import hash_client_ip
from app.models import (
    AdminSetting,
    ClassSection,
    CommentLike,
    CommentReport,
    Module,
    ModuleAssessment,
    ModuleComment,
    ModuleOfferingPlan,
    ModuleTextbook,
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
    Semester,
)
from app.routers.equivalents import codes_with_equivalents, equivalents_for, like_escape
from app.services.exchange_stats import exchange_stat_items, exchange_totals_subquery
from app.schemas import (
    ClassRoom,
    CommentLikeIn,
    CommentLikeOut,
    CommentReportIn,
    CommentReportOut,
    ExchangeStatItem,
    ExchangeStatList,
    ClassSectionOut,
    LessonOut,
    FacetCount,
    ModuleAssessmentOut,
    ModuleCommentIn,
    ModuleCommentListOut,
    ModuleCommentOut,
    ModuleDetail,
    ModuleFacets,
    ModuleList,
    ModuleSummary,
    ModuleTextbookOut,
    OfferingPlanOut,
    OpenSemester,
    OutlineAssessmentOut,
    OutlineCloOut,
    OutlineCourseOut,
    OutlineDocumentInfo,
    OutlineLinkOut,
    OutlineMaterialOut,
    OutlineObjectiveOut,
    OutlineOut,
    OutlineScheduleOut,
    ProgramRequired,
)
from app.services.descriptions import normalize_description_line_breaks
from app.services.faculty_names import canonical_faculty_vi, department_en, faculty_en
from app.services.moderation import check_content
from app.services.moderation_ban import is_user_ban_active
from app.services.nickname import public_name
from app.routers.auth import current_user
from app.models import User as AccountUser
from app.services.outline_email import get_module_lecturer_email
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
    rows = db.execute(select(Module.code, Module.description, Module.description_en).where(Module.code.in_(codes)))
    return {code: (normalize_description_line_breaks(vi), normalize_description_line_breaks(en)) for code, vi, en in rows}


class OutlineUrlInfo:
    def __init__(
        self,
        outline_url: str | None = None,
        outline_url_en: str | None = None,
        outline_links: list[OutlineLinkOut] | None = None,
    ):
        self.outline_url = outline_url
        self.outline_url_en = outline_url_en
        self.outline_links = outline_links or []

    def __getitem__(self, item: str):
        if item == "outline_url":
            return self.outline_url
        if item == "outline_url_en":
            return self.outline_url_en
        if item == "outline_links":
            return self.outline_links
        raise KeyError(item)

    def get(self, item: str, default=None):
        try:
            return self[item]
        except KeyError:
            return default


_EMPTY_OUTLINE_INFO = OutlineUrlInfo()


def _is_english_outline_kind(kind: str | None) -> bool:
    if not kind:
        return False
    k = kind.strip().lower()
    if "(e)" in k or "(en)" in k:
        return True
    if "tiếng anh" in k or "tieng anh" in k or "english" in k or "syllabus_en" in k:
        return True
    if re.search(r"\b(e|en)\b", k, re.IGNORECASE):
        return True
    return False


def resolve_ctdt_year(cohort: str | None = None, ctdt_year: int | None = None) -> int | None:
    """Xác định năm CTĐT từ khóa sinh viên (K23/K24 -> 2023, K25/K26 -> 2025...) hoặc tham số ctdt_year."""
    if ctdt_year:
        return ctdt_year
    if cohort:
        m = re.search(r"(\d{2})", cohort)
        if m:
            yy = int(m.group(1))
            base_yy = yy if yy % 2 != 0 else yy - 1
            return 2000 + base_yy
    return None


def _outline_urls_for(db: Session, codes: list[str], ctdt_year: int | None = None) -> dict[str, OutlineUrlInfo]:
    """Link Drive (PDF/Word/Docs) của đề cương cho từng học phần.

    Trả về dict[code, OutlineUrlInfo] gồm:
    - outline_url: link tiếng Việt/chuẩn (ưu tiên Word/gdoc hơn PDF, 'cập nhật' hơn 'hiện tại')
    - outline_url_en: link bản tiếng Anh (kind chứa (E)/E/English)
    - outline_links: danh sách [{kind, url}] (loại bỏ trùng URL, bỏ URL rỗng)

    Hỗ trợ tìm trực tiếp qua program_catalog_entries.module_code và gián tiếp
    qua outline_module_links -> cùng catalog entry của tài liệu đó.
    """
    if not codes:
        return {}

    # 1. Trực tiếp: qua ProgramCatalogEntry.module_code hoặc module_code_en
    rows = db.execute(
        select(
            ProgramCatalogEntry.module_code,
            ProgramCatalogEntry.module_code_en,
            OutlineResource.kind,
            OutlineResource.url,
        )
        .join(OutlineResource, OutlineResource.entry_id == ProgramCatalogEntry.id)
        .where(
            or_(
                ProgramCatalogEntry.module_code.in_(codes),
                ProgramCatalogEntry.module_code_en.in_(codes),
            ),
            OutlineResource.url.is_not(None),
        )
        .order_by(ProgramCatalogEntry.id, OutlineResource.id)
    ).all()

    raw_by_code: dict[str, list[tuple[str | None, str]]] = defaultdict(list)
    for m_code, m_code_en, kind, url in rows:
        if m_code and m_code in codes:
            raw_by_code[m_code].append((kind, url))
        if m_code_en and m_code_en in codes and m_code_en != m_code:
            raw_by_code[m_code_en].append((kind, url))

    # 2. Gián tiếp: qua outline_module_links trỏ tới tài liệu đề cương
    def _has_valid_url(items: list[tuple[str | None, str]]) -> bool:
        for _, u in items:
            if u and isinstance(u, str) and u.strip().startswith("http"):
                return True
        return False

    link_conds = [OutlineModuleLink.module_code.in_(codes)]
    if ctdt_year is not None:
        link_conds.append(
            or_(OutlineModuleLink.ctdt_year == ctdt_year, OutlineModuleLink.ctdt_year.is_(None))
        )

    # Tìm entry_id từ OutlineResource tương ứng với document_id trong OutlineModuleLink
    entry_subq = (
        select(OutlineModuleLink.module_code, OutlineResource.entry_id)
        .join(OutlineResource, OutlineResource.document_id == OutlineModuleLink.document_id)
        .where(
            *link_conds,
            OutlineResource.entry_id.is_not(None),
        )
        .distinct()
        .subquery()
    )
    indirect_rows = db.execute(
        select(
            entry_subq.c.module_code,
            OutlineResource.kind,
            OutlineResource.url,
        )
        .join(OutlineResource, OutlineResource.entry_id == entry_subq.c.entry_id)
        .where(OutlineResource.url.is_not(None))
        .order_by(entry_subq.c.module_code, OutlineResource.id)
    ).all()

    for code, kind, url in indirect_rows:
        raw_by_code[code].append((kind, url))

    # Thêm tài nguyên gắn trực tiếp với document_id qua OutlineModuleLink
    doc_direct_rows = db.execute(
        select(
            OutlineModuleLink.module_code,
            OutlineResource.kind,
            OutlineResource.url,
        )
        .join(OutlineResource, OutlineResource.document_id == OutlineModuleLink.document_id)
        .where(
            *link_conds,
            OutlineResource.url.is_not(None),
        )
        .order_by(OutlineModuleLink.module_code, OutlineResource.id)
    ).all()
    for code, kind, url in doc_direct_rows:
        raw_by_code[code].append((kind, url))

    def _kind_quality(k: str | None, u: str = "") -> int:
        if not k:
            return 0
        s = k.lower()
        u_low = u.lower()
        score = 5
        # Ưu tiên Word / Google Docs hơn PDF (Brief D5)
        if "docs.google.com/document" in u_low or ".docx" in u_low or "docx" in s or "word" in s or "gdoc" in s:
            score += 30
        elif ".pdf" in u_low or "pdf" in s or "drive.google.com/file" in u_low:
            score += 10
        # Ưu tiên bản cập nhật hơn hiện tại (Brief D5)
        if "cập nhật" in s or "capnhat" in s or "cap nhat" in s:
            score += 25
        elif "hiện tại" in s or "hientai" in s or "hien tai" in s:
            score += 15
        if "chuẩn" in s or "chuan" in s:
            score += 20
        if "đề cương" in s or "de cuong" in s or "syllabus" in s:
            score += 10
        if "rà soát" in s or "ra soat" in s or "bdcl" in s or "bđcl" in s:
            score -= 10
        return score

    result: dict[str, OutlineUrlInfo] = {}
    for code in codes:
        items = raw_by_code.get(code, [])
        valid_items: list[tuple[str | None, str]] = []
        for kind, url in items:
            if not url or not isinstance(url, str):
                continue
            u = url.strip()
            if not u.startswith("http"):
                continue
            valid_items.append((kind.strip() if kind and isinstance(kind, str) and kind.strip() else None, u))

        if not valid_items:
            result[code] = OutlineUrlInfo()
            continue

        # Danh sách outline_links: deduplicate url, giữ thứ tự nhưng ưu tiên kind tốt nhất
        url_to_link: dict[str, OutlineLinkOut] = {}
        outline_links: list[OutlineLinkOut] = []
        for kind, u in valid_items:
            if u not in url_to_link:
                item = OutlineLinkOut(kind=kind, url=u)
                url_to_link[u] = item
                outline_links.append(item)
            else:
                existing = url_to_link[u]
                if _kind_quality(kind, u) > _kind_quality(existing.kind, u):
                    existing.kind = kind

        # Phân loại EN / VI
        en_items = [(k, u) for k, u in valid_items if _is_english_outline_kind(k)]
        vi_items = [(k, u) for k, u in valid_items if not _is_english_outline_kind(k)]

        # outline_url_en: ưu tiên link có Word/Docs > PDF, 'cập nhật' > 'hiện tại'
        outline_url_en: str | None = None
        if en_items:
            outline_url_en = max(en_items, key=lambda it: _kind_quality(it[0], it[1]))[1]

        # outline_url: ưu tiên link Word/Docs > PDF, 'cập nhật' > 'hiện tại' không phải (E)
        outline_url: str | None = None
        if vi_items:
            outline_url = max(vi_items, key=lambda it: _kind_quality(it[0], it[1]))[1]
        elif valid_items:
            outline_url = max(valid_items, key=lambda it: _kind_quality(it[0], it[1]))[1]

        result[code] = OutlineUrlInfo(
            outline_url=outline_url,
            outline_url_en=outline_url_en,
            outline_links=outline_links,
        )

    # Bổ sung link từ Module.outline_url (Master_data) nếu catalog chưa có link
    missing_url_codes = [c for c in codes if not result[c].outline_url]
    if missing_url_codes:
        mod_urls = db.execute(
            select(Module.code, Module.outline_url)
            .where(Module.code.in_(missing_url_codes), Module.outline_url.is_not(None))
        ).all()
        for cd, u in mod_urls:
            if u and isinstance(u, str) and u.strip().startswith("http"):
                clean_u = u.strip()
                result[cd].outline_url = clean_u
                if not any(link.url == clean_u for link in result[cd].outline_links):
                    result[cd].outline_links.append(OutlineLinkOut(kind="Link đề cương (Master data)", url=clean_u))

    return result


def _summary(m: Module, has_eq: bool, plans: list[OfferingPlanOut], open_sems: list[OpenSemester] | None = None,
             has_outline: bool = False, description: str | None = None, outline_url: str | None = None,
             description_en: str | None = None, outline_url_en: str | None = None,
             outline_links: list[OutlineLinkOut] | None = None,
             outline_year: int | None = None, outline_year_fallback: bool = False,
             lecturer_email: str | None = None) -> ModuleSummary:
    return ModuleSummary(code=m.code, name=m.name, name_en=m.name_en, credits=m.credits, type=m.type, faculty=m.faculty,
                         faculty_en=faculty_en(m.faculty), department=m.department, department_en=department_en(m.department),
                         description=description, description_en=description_en, outline_url=outline_url,
                         outline_url_en=outline_url_en, outline_links=outline_links or [],
                         final_assessment=m.final_assessment, head_lecturer=m.head_lecturer, lecturer_email=lecturer_email,
                         is_english=bool(m.is_english) or m.language_track == "en", has_equivalents=has_eq,
                         offering_plan=plans, language_track=m.language_track or "vi", language_basis=m.language_basis,
                         is_talent_program=bool(m.is_talent_program), counterpart_code=m.counterpart_code,
                         open_semesters=open_sems or [], has_outline=has_outline,
                         outline_year=outline_year, outline_year_fallback=outline_year_fallback,
                         degree=m.degree or "dai_hoc", is_sample=m.is_sample)


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


def _build_module_filter_clauses(
    db: Session,
    q: str | None = None,
    program_id: str | None = None,
    program_ids: list[str] | None = None,
    degree: str | None = "dai_hoc",
    faculty: str | None = None,
    faculty_in: list[str] | None = None,
    department: str | None = None,
    department_in: list[str] | None = None,
    credits: int | None = None,
    credits_in: str | None = None,
    type: str | None = None,
    type_in: str | None = None,
    is_english: bool | None = None,
    language: str | None = None,
    talent: bool | None = None,
    has_outline: bool | None = None,
    semester: str | None = None,
    final_assessment: str | None = None,
    final_assessment_in: str | list[str] | None = None,
) -> tuple[list[Any], dict[str, Any]]:
    # Base clauses: applies to all facets and total (always in context)
    base_clauses: list[Any] = [Module.is_hidden.is_(False), or_(Module.credits.is_(None), Module.credits != 0)]
    if degree and degree.strip().lower() != "all":
        base_clauses.append(Module.degree == degree.strip().lower())
    for tok in search_tokens(q):
        pattern = f"%{like_escape(tok)}%"
        base_clauses.append(or_(
            Module.search_text.like(pattern, escape="\\"),
            Module.name_en.ilike(pattern, escape="\\"),
            # Tìm thêm theo nội dung (mô tả) học phần — cột này có dấu nên chỉ khớp khi gõ đúng dấu.
            Module.description.ilike(pattern, escape="\\"),
            Module.description_en.ilike(pattern, escape="\\"),
        ))

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
            try:
                allowed_codes.update(get_program_track_codes(db, pid))
            except HTTPException:
                pass
        base_clauses.append(Module.code.in_(allowed_codes if allowed_codes else ["__EMPTY_PROGRAM__"]))

    group_clauses: dict[str, Any] = {}

    # Language
    if language:
        group_clauses["language"] = (Module.language_track == language)
    elif is_english is not None:
        en = or_(Module.language_track == "en", Module.is_english.is_(True))
        group_clauses["language"] = (en if is_english else ~en)

    # Credits
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
        group_clauses["credits"] = Module.credits.in_(list(set(parsed_credits)))

    # Faculty & Department
    parsed_faculties: list[str] = []
    if faculty and faculty.strip():
        parsed_faculties.append(faculty.strip())
    if faculty_in:
        for item in faculty_in:
            if isinstance(item, str) and item.strip():
                parsed_faculties.append(item.strip())

    parsed_departments: list[str] = []
    if department and department.strip():
        parsed_departments.append(department.strip())
    if department_in:
        for item in department_in:
            if isinstance(item, str) and item.strip():
                parsed_departments.append(item.strip())

    if parsed_faculties:
        fac_variants = list(dict.fromkeys(v for f in parsed_faculties for v in _text_case_variants(f)))
        fac_targets = [func.lower(v) for v in fac_variants]
        if parsed_departments:
            group_clauses["faculty"] = or_(
                func.lower(Module.faculty).in_(fac_targets),
                Module.faculty.in_(fac_variants),
            )
        else:
            group_clauses["faculty"] = or_(
                func.lower(Module.faculty).in_(fac_targets),
                func.lower(Module.department).in_(fac_targets),
                Module.faculty.in_(fac_variants),
                Module.department.in_(fac_variants),
            )

    if parsed_departments:
        dept_variants = list(dict.fromkeys(v for d in parsed_departments for v in _text_case_variants(d)))
        dept_targets = [func.lower(v) for v in dept_variants]
        group_clauses["department"] = or_(
            func.lower(Module.department).in_(dept_targets),
            Module.department.in_(dept_variants),
        )

    # Type
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
        group_clauses["type"] = or_(
            func.lower(Module.type).in_(type_targets),
            Module.type.in_(type_variants),
        )

    # Talent
    if talent is not None:
        group_clauses["talent"] = (Module.is_talent_program.is_(talent))

    # Outline
    if has_outline is not None:
        sub = _modules_with_outline_subquery()
        group_clauses["has_outline"] = (Module.code.in_(sub) if has_outline else Module.code.not_in(sub))

    # Semester
    if semester:
        group_clauses["semester"] = Module.code.in_(
            select(ClassSection.module_code).where(ClassSection.semester_id == semester)
        )

    # Final assessment
    parsed_finals: list[str] = []
    if final_assessment and final_assessment.strip():
        parsed_finals.append(final_assessment.strip())
    if final_assessment_in:
        if isinstance(final_assessment_in, str):
            for part in final_assessment_in.split(","):
                part = part.strip()
                if part:
                    parsed_finals.append(part)
        else:
            for item in final_assessment_in:
                if isinstance(item, str) and item.strip():
                    parsed_finals.append(item.strip())
    if parsed_finals:
        final_targets = [f.lower() for f in parsed_finals]
        group_clauses["final_assessment"] = func.lower(Module.final_assessment).in_(final_targets)

    return base_clauses, group_clauses


@router.get("/modules", response_model=ModuleList, summary="Tìm kiếm học phần")
def list_modules(
    q: str | None = Query(None, description="Mã/tên học phần, không phân biệt dấu"),
    faculty: str | None = None,
    faculty_in: list[str] | None = Query(None, description="Danh sách khoa (lặp tham số ?faculty_in=...)"),
    department: str | None = None,
    department_in: list[str] | None = Query(None, description="Danh sách bộ môn (lặp tham số ?department_in=...)"),
    credits: int | None = Query(None, ge=0, le=60),
    credits_in: str | None = Query(None, description="Danh sách tín chỉ, phân cách bằng dấu phẩy, vd '2,3,4'"),
    type: str | None = Query(None, description="Loại học phần (vd 'Lý thuyết', 'Bắt buộc')"),
    type_in: str | None = Query(None, description="Danh sách loại học phần, phân cách bằng dấu phẩy"),
    is_english: bool | None = Query(None, description="(cũ) tương đương language=en"),
    language: str | None = Query(None, pattern="^(en|vi)$", description="en = dạy bằng tiếng Anh, vi = tiếng Việt"),
    talent: bool | None = Query(None, description="Chỉ môn thuộc chương trình Cử nhân tài năng (CNTN)"),
    has_outline: bool | None = Query(None, description="Chỉ môn đã có đề cương chi tiết"),
    semester: str | None = Query(None, description="Chỉ môn có lớp mở trong học kỳ này"),
    final_assessment: str | None = Query(None, description="Hình thức thi cuối kỳ"),
    final_assessment_in: str | None = Query(None, description="Danh sách hình thức thi cuối kỳ (phân cách bằng dấu phẩy)"),
    degree: str = Query("dai_hoc", description="Bậc đào tạo: 'dai_hoc' | 'thac_si' | 'tien_si' | 'all'"),
    program_id: str | None = Query(None, description="Chỉ môn thuộc CTĐT này, vd K23406 (khóa 23, ngành 406)"),
    program_ids: list[str] | None = Query(None, description="Danh sách mã CTĐT (lặp tham số ?program_ids=...)"),
    priority_codes: str | None = Query(None, max_length=4000, description="Học phần đã chọn/đã học (phân cách bằng dấu phẩy): xếp lên đầu"),
    exchange_rank: bool = Query(False, description="Sau nhóm ưu tiên, xếp theo số SV trao đổi đã học (nhiều → ít)"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    base_clauses, group_clauses = _build_module_filter_clauses(
        db=db,
        q=q,
        program_id=program_id,
        program_ids=program_ids,
        degree=degree,
        faculty=faculty,
        faculty_in=faculty_in,
        department=department,
        department_in=department_in,
        credits=credits,
        credits_in=credits_in,
        type=type,
        type_in=type_in,
        is_english=is_english,
        language=language,
        talent=talent,
        has_outline=has_outline,
        semester=semester,
        final_assessment=final_assessment,
        final_assessment_in=final_assessment_in,
    )
    stmt = select(Module).where(*base_clauses, *group_clauses.values())
    total = db.scalar(select(func.count(Module.code)).where(*base_clauses, *group_clauses.values())) or 0
    priority = list(dict.fromkeys(c.strip().upper() for c in (priority_codes or "").split(",") if c.strip()))[:200]
    order_by = []
    if priority or exchange_rank:
        exch = exchange_totals_subquery()
        stmt = stmt.outerjoin(exch, exch.c.module_code == Module.code)
        if priority:  # học phần đã chọn/đã học lên đầu
            order_by.append(case((Module.code.in_(priority), 0), else_=1))
        if exchange_rank:  # rồi tới học phần SV trao đổi học nhiều
            order_by.append(func.coalesce(exch.c.total, 0).desc())
    order_by.append(Module.code)
    rows = list(db.scalars(stmt.order_by(*order_by).offset((page - 1) * size).limit(size)))
    codes = [m.code for m in rows]
    has_eq = codes_with_equivalents(db, codes)
    plans = _plans_for(db, codes)
    open_map = _open_semesters(db, codes)
    outline_codes = set(db.scalars(_modules_with_outline_subquery().where(OutlineModuleLink.module_code.in_(codes)))) if codes else set()
    descs = _descriptions_for(db, codes)
    urls = _outline_urls_for(db, codes)
    d = lambda c: descs.get(c, (None, None))  # noqa: E731
    def _u(c: str) -> OutlineUrlInfo:
        return urls.get(c, _EMPTY_OUTLINE_INFO)

    return ModuleList(items=[_summary(m, m.code in has_eq, plans.get(m.code, []), open_map.get(m.code), m.code in outline_codes,
                                      d(m.code)[0], _u(m.code).outline_url, d(m.code)[1],
                                      outline_url_en=_u(m.code).outline_url_en,
                                      outline_links=_u(m.code).outline_links) for m in rows],
                      total=total, page=page, size=size)


@router.get("/module-facets", response_model=ModuleFacets, summary="Số lượng học phần theo từng bộ lọc (cho cột 'Lọc theo')")
@router.get("/modules/facets", response_model=ModuleFacets, include_in_schema=False)
def module_facets(
    q: str | None = Query(None, description="Mã/tên học phần, không phân biệt dấu"),
    faculty: str | None = None,
    faculty_in: list[str] | None = Query(None, description="Danh sách khoa (lặp tham số ?faculty_in=...)"),
    department: str | None = None,
    department_in: list[str] | None = Query(None, description="Danh sách bộ môn (lặp tham số ?department_in=...)"),
    credits: int | None = Query(None, ge=0, le=60),
    credits_in: str | None = Query(None, description="Danh sách tín chỉ, phân cách bằng dấu phẩy"),
    type: str | None = Query(None, description="Loại học phần"),
    type_in: str | None = Query(None, description="Danh sách loại học phần"),
    is_english: bool | None = Query(None),
    language: str | None = Query(None, pattern="^(en|vi)$"),
    talent: bool | None = Query(None),
    has_outline: bool | None = Query(None),
    semester: str | None = Query(None),
    final_assessment: str | None = Query(None, description="Hình thức thi cuối kỳ"),
    final_assessment_in: str | None = Query(None, description="Danh sách hình thức thi cuối kỳ"),
    degree: str = Query("dai_hoc", description="Bậc đào tạo: 'dai_hoc' | 'thac_si' | 'tien_si' | 'all'"),
    program_id: str | None = Query(None),
    program_ids: list[str] | None = Query(None),
    db: Session = Depends(get_db),
):
    base_clauses, group_clauses = _build_module_filter_clauses(
        db=db,
        q=q,
        program_id=program_id,
        program_ids=program_ids,
        degree=degree,
        faculty=faculty,
        faculty_in=faculty_in,
        department=department,
        department_in=department_in,
        credits=credits,
        credits_in=credits_in,
        type=type,
        type_in=type_in,
        is_english=is_english,
        language=language,
        talent=talent,
        has_outline=has_outline,
        semester=semester,
        final_assessment=final_assessment,
        final_assessment_in=final_assessment_in,
    )

    def conds_except(group: str) -> list[Any]:
        return [*base_clauses, *(clause for k, clause in group_clauses.items() if k != group)]

    all_conds = [*base_clauses, *group_clauses.values()]
    total = db.scalar(select(func.count(Module.code)).where(*all_conds)) or 0

    # 1. Language (bỏ qua lọc language)
    c_lang = conds_except("language")
    lang_rows = db.execute(
        select(Module.language_track, func.count(Module.code))
        .where(*c_lang, Module.language_track.is_not(None))
        .group_by(Module.language_track)
    ).all()
    language_counts = [FacetCount(value=str(v), count=n) for v, n in lang_rows if str(v).strip() and n > 0]

    # 2. Credits (bỏ qua lọc credits)
    c_cred = conds_except("credits")
    cred_rows = db.execute(
        select(Module.credits, func.count(Module.code))
        .where(*c_cred, Module.credits.is_not(None), Module.credits != 0)
        .group_by(Module.credits)
        .order_by(Module.credits)
    ).all()
    credits_counts = sorted(
        [FacetCount(value=str(v), count=n) for v, n in cred_rows if n > 0],
        key=lambda f: int(f.value),
    )

    # 3. Faculty (bỏ qua lọc faculty, chuẩn hóa tên khoa & gộp biến thể)
    c_fac = conds_except("faculty")
    fac_rows = db.execute(
        select(Module.faculty, func.count(Module.code))
        .where(*c_fac, Module.faculty.is_not(None))
        .group_by(Module.faculty)
    ).all()
    canonical_map: dict[str, int] = defaultdict(int)
    for raw_fac, n in fac_rows:
        if not raw_fac or not str(raw_fac).strip():
            continue
        canon = canonical_faculty_vi(raw_fac) or raw_fac.strip()
        canonical_map[canon] += n

    def _fac_sort_key(item: tuple[str, int]):
        name, cnt = item
        is_end = 1 if name in ("Trường Đại học Kinh tế - Luật", "Chưa rõ khoa", "Khác / Chưa rõ khoa", "Chưa phân loại") else 0
        return (is_end, -cnt, name)

    faculty_counts = [
        FacetCount(value=fac, count=cnt)
        for fac, cnt in sorted(canonical_map.items(), key=_fac_sort_key)
        if cnt > 0
    ]

    # 4. Department (bỏ qua lọc department)
    c_dept = conds_except("department")
    dept_rows = db.execute(
        select(Module.department, func.count(Module.code))
        .where(*c_dept, Module.department.is_not(None))
        .group_by(Module.department)
        .order_by(func.count(Module.code).desc())
    ).all()
    department_counts = [FacetCount(value=str(v).strip(), count=n) for v, n in dept_rows if str(v).strip() and n > 0]

    # 5. Type (bỏ qua lọc type)
    c_type = conds_except("type")
    type_rows = db.execute(
        select(Module.type, func.count(Module.code))
        .where(*c_type, Module.type.is_not(None))
        .group_by(Module.type)
        .order_by(func.count(Module.code).desc())
    ).all()
    type_counts = [FacetCount(value=str(v).strip(), count=n) for v, n in type_rows if str(v).strip() and n > 0]

    # 6. Semester (bỏ qua lọc semester). Chỉ tính học phần ĐÃ MỞ LỚP (join class_sections).
    # `count` = số lớp học phần (thống nhất cách đếm với Phòng Đào tạo); `modules` = số học phần khác nhau (= số dòng danh sách).
    c_sem = conds_except("semester")
    sem_rows = db.execute(
        select(
            ClassSection.semester_id,
            func.count(ClassSection.id),
            func.count(func.distinct(ClassSection.module_code)),
        )
        .join(Module, Module.code == ClassSection.module_code)
        .where(*c_sem, ClassSection.semester_id.is_not(None))
        .group_by(ClassSection.semester_id)
        .order_by(ClassSection.semester_id)
    ).all()
    semester_counts = [FacetCount(value=str(s), count=n, modules=m) for s, n, m in sem_rows if n > 0]

    # 7. Outline (bỏ qua lọc has_outline)
    c_out = conds_except("has_outline")
    sub = _modules_with_outline_subquery()
    with_out_cnt = db.scalar(select(func.count(Module.code)).where(*c_out, Module.code.in_(sub))) or 0
    tot_out_ctx = db.scalar(select(func.count(Module.code)).where(*c_out)) or 0
    without_out_cnt = tot_out_ctx - with_out_cnt
    outline_counts = []
    if with_out_cnt > 0:
        outline_counts.append(FacetCount(value="true", count=with_out_cnt))
    if without_out_cnt > 0:
        outline_counts.append(FacetCount(value="false", count=without_out_cnt))

    # 8. Talent (bỏ qua lọc talent)
    c_tal = conds_except("talent")
    talent_cnt = db.scalar(select(func.count(Module.code)).where(*c_tal, Module.is_talent_program.is_(True))) or 0
    tot_tal_ctx = db.scalar(select(func.count(Module.code)).where(*c_tal)) or 0
    non_talent_cnt = tot_tal_ctx - talent_cnt
    talent_counts = []
    if talent_cnt > 0:
        talent_counts.append(FacetCount(value="true", count=talent_cnt))
    if non_talent_cnt > 0:
        talent_counts.append(FacetCount(value="false", count=non_talent_cnt))

    # 9. Final assessment (bỏ qua lọc final_assessment)
    c_final = conds_except("final_assessment")
    final_rows = db.execute(
        select(Module.final_assessment, func.count(Module.code))
        .where(*c_final, Module.final_assessment.is_not(None), Module.final_assessment != "")
        .group_by(Module.final_assessment)
        .order_by(func.count(Module.code).desc())
    ).all()
    final_assessment_counts = [
        FacetCount(value=str(v).strip(), count=n)
        for v, n in final_rows
        if str(v).strip() and n > 0
    ]

    return ModuleFacets(
        total=total,
        language=language_counts,
        talent=talent_counts,
        credits=credits_counts,
        faculty=faculty_counts,
        department=department_counts,
        type=type_counts,
        semester=semester_counts,
        has_outline=outline_counts,
        final_assessment=final_assessment_counts,
    )


@router.get("/faculties", response_model=list[str], summary="Danh sách khoa (để lọc)")
def list_faculties(db: Session = Depends(get_db)):
    stmt = select(Module.faculty).where(Module.is_hidden.is_(False)).distinct().order_by(Module.faculty)
    return [f for f in db.scalars(stmt) if f]


def _get_module(db: Session, code: str) -> Module:
    return public_module(db, code)


@router.get("/modules/{code}", response_model=ModuleDetail, summary="Chi tiết học phần")
def get_module(
    code: str,
    program_id: str | None = Query(None, description="Mã CTĐT để tra cứu trạng thái bắt buộc của môn học"),
    cohort: str | None = Query(None, description="Khóa, vd K24 hoặc K25 để chọn đề cương theo năm CTĐT"),
    ctdt_year: int | None = Query(None, description="Năm CTĐT (2023, 2025...) để chọn đề cương"),
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

    # Nhận diện các năm CTĐT hiện có của đề cương môn này
    link_years = set(
        db.scalars(
            select(OutlineModuleLink.ctdt_year)
            .where(OutlineModuleLink.module_code == m.code, OutlineModuleLink.ctdt_year.is_not(None))
        )
    )
    doc_years = set(
        db.scalars(
            select(OutlineDocument.ctdt_year)
            .join(OutlineModuleLink, OutlineModuleLink.document_id == OutlineDocument.id)
            .where(OutlineModuleLink.module_code == m.code, OutlineDocument.ctdt_year.is_not(None))
        )
    )
    course_years = set(
        db.scalars(
            select(OutlineDocument.ctdt_year)
            .join(OutlineCourse, OutlineCourse.document_id == OutlineDocument.id)
            .where(OutlineCourse.course_code_norm == m.code, OutlineDocument.ctdt_year.is_not(None))
        )
    )
    avail_years = link_years | doc_years | course_years
    if not avail_years and (has_outline or m.outline_url):
        avail_years.add(2025)

    req_year = resolve_ctdt_year(cohort, ctdt_year)
    chosen_year: int | None = None
    fallback_year: bool = False

    if avail_years:
        if req_year:
            if req_year in avail_years:
                chosen_year = req_year
                fallback_year = False
            else:
                chosen_year = min(avail_years, key=lambda y: abs(y - req_year))
                fallback_year = True
        else:
            chosen_year = max(avail_years)
            fallback_year = False

    lec_email = get_module_lecturer_email(db, m.code)
    outline_info = _outline_urls_for(db, [m.code], ctdt_year=chosen_year).get(m.code, _EMPTY_OUTLINE_INFO)
    base = _summary(m, bool(eqs), _plans_for(db, [m.code]).get(m.code, []), open_sems, has_outline,
                    description=vi, outline_url=outline_info.outline_url, description_en=en,
                    outline_url_en=outline_info.outline_url_en,
                    outline_links=outline_info.outline_links,
                    outline_year=chosen_year, outline_year_fallback=fallback_year,
                    lecturer_email=lec_email).model_dump()
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

    # Assessment & Textbooks (Brief D4)
    assessment_out = None
    if m.assessment:
        assessment_out = ModuleAssessmentOut(
            process_ratio=m.assessment.process_ratio,
            process_form=m.assessment.process_form,
            midterm_ratio=m.assessment.midterm_ratio,
            midterm_form=m.assessment.midterm_form,
            final_ratio=m.assessment.final_ratio,
            final_form=m.assessment.final_form,
            advanced_ratio=m.assessment.advanced_ratio,
            advanced_form=m.assessment.advanced_form,
            exam_type=m.assessment.exam_type,
            exam_duration=m.assessment.exam_duration,
        )
    textbooks_out = [
        ModuleTextbookOut(
            name=tb.name,
            url=tb.url,
            document_code=tb.document_code,
            note=tb.note,
            is_main=tb.is_main,
        )
        for tb in (m.textbooks or [])
    ]

    return ModuleDetail(
        **base,
        description=vi,
        prerequisites=m.prerequisites or [],
        equivalents=eqs,
        semesters=sems,
        required_in_programs=req_in_progs,
        is_required_any=is_req_any,
        required=current_req,
        assessment=assessment_out,
        textbooks=textbooks_out,
    )


def class_to_out(cs: ClassSection, lecturer_email: str | None = None) -> ClassSectionOut:
    return ClassSectionOut(
        class_code=cs.class_code, module_code=cs.module_code, semester=cs.semester_id,
        lecturer=cs.lecturer, lecturer_email=lecturer_email, quota=cs.quota, quota_min=cs.quota_min, quota_max=cs.quota,
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


@router.get("/exchange-stats", response_model=ExchangeStatList, summary="Số SV trao đổi đã học các học phần (tổng hợp, công khai)")
def list_exchange_stats(
    codes: str = Query(..., max_length=4000, description="Mã học phần, cách nhau bởi dấu phẩy (tối đa 200)"),
    db: Session = Depends(get_db),
):
    wanted = list(dict.fromkeys(c.strip().upper() for c in codes.split(",") if c.strip()))[:200]
    return ExchangeStatList(items=[ExchangeStatItem(**item) for item in exchange_stat_items(db, wanted)])


@router.get("/modules/{code}/exchange-stats", response_model=ExchangeStatItem, summary="Số SV trao đổi đã học một học phần (tổng hợp, công khai)")
def module_exchange_stats(code: str, db: Session = Depends(get_db)):
    key = code.strip().upper()
    found = exchange_stat_items(db, [key])
    return ExchangeStatItem(**found[0]) if found else ExchangeStatItem(module_code=key, total=0, by_semester=[])


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
    lec_email = get_module_lecturer_email(db, m.code)
    return [class_to_out(cs, lecturer_email=lec_email) for cs in classes]


# ---------------------------------------------------------------- đề cương chi tiết
_STATUS_RANK = {"ok": 3, "partial": 2, "failed": 1, "skipped": 0}


def _doc_info(c: OutlineCourse, d: OutlineDocument) -> OutlineDocumentInfo:
    return OutlineDocumentInfo(document_id=d.id, doc_type=c.doc_type, parse_status=c.parse_status, parse_method=c.parse_method,
                               pages=d.page_count, text_chars=d.text_chars)


@router.get("/modules/{code}/outline", response_model=OutlineOut, summary="Đề cương chi tiết của học phần (từ PDF/Word đề cương)")
def get_module_outline(
    code: str,
    cohort: str | None = Query(None, description="Khóa sinh viên (vd K24, K23) để lấy đề cương đúng năm CTĐT"),
    ctdt_year: int | None = Query(None, description="Năm CTĐT (vd 2023, 2025)"),
    db: Session = Depends(get_db),
):
    m = _get_module(db, code)
    links = list(
        db.execute(
            select(OutlineModuleLink.document_id, OutlineModuleLink.ctdt_year)
            .where(OutlineModuleLink.module_code == m.code)
        ).all()
    )
    link_year_map = {doc_id: yr for doc_id, yr in links if yr is not None}
    doc_ids = set(doc_id for doc_id, _ in links)
    doc_ids |= set(db.scalars(select(OutlineCourse.document_id).where(OutlineCourse.course_code_norm == m.code)))

    rows = list(
        db.execute(
            select(OutlineCourse, OutlineDocument)
            .join(OutlineDocument, OutlineDocument.id == OutlineCourse.document_id)
            .where(OutlineCourse.document_id.in_(doc_ids), OutlineCourse.doc_type.like("syllabus%"))
        ).all()
    ) if doc_ids else []
    rows = [r for r in rows if r[0].parse_status in ("ok", "partial")]
    if not rows:
        raise HTTPException(404, f"Chưa có đề cương đã phân tích cho học phần {m.code}.")

    # Nhận diện các năm CTĐT khả dụng
    avail_years: set[int] = set()
    for c, d in rows:
        yr = link_year_map.get(d.id) or d.ctdt_year
        if yr is not None:
            avail_years.add(yr)
    if not avail_years:
        avail_years.add(2025)

    req_year = resolve_ctdt_year(cohort, ctdt_year)
    chosen_year: int | None = None
    fallback_year: bool = False

    if req_year:
        if req_year in avail_years:
            chosen_year = req_year
            fallback_year = False
        else:
            chosen_year = min(avail_years, key=lambda y: abs(y - req_year))
            fallback_year = True
    else:
        chosen_year = max(avail_years)
        fallback_year = False

    def _row_year(r):
        c, d = r
        return link_year_map.get(d.id) or d.ctdt_year or 2025

    year_rows = [r for r in rows if _row_year(r) == chosen_year]
    candidate_rows = year_rows if year_rows else rows

    def score(r):
        c, d = r
        counts = (c.parse_detail or {}).get("counts", {})
        wants = "syllabus_en" if m.language_track == "en" else "syllabus_vi"
        fn = (d.file_name or "").lower()
        sf = (d.source_format or "").lower()
        is_word_or_doc = (sf in ("docx", "gdoc")) or fn.endswith(".docx")
        is_update = ("cập nhật" in fn) or ("cap nhat" in fn) or ("capnhat" in fn)
        return (
            _STATUS_RANK.get(c.parse_status, 0),
            1 if c.doc_type == wants else 0,
            1 if is_word_or_doc else 0,
            1 if is_update else 0,
            sum(counts.values()),
        )

    candidate_rows.sort(key=score, reverse=True)
    c, d = candidate_rows[0]

    def q(model, order):
        return list(db.scalars(select(model).where(model.document_id == d.id).order_by(order)))

    return OutlineOut(
        module_code=m.code,
        outline_year=chosen_year,
        outline_year_fallback=fallback_year,
        document=_doc_info(c, d),
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
        alternatives=[_doc_info(c2, d2) for c2, d2 in candidate_rows[1:6]],
    )


# ---------------------------------------------------------------- bình luận học phần (Brief A3)
@router.get(
    "/modules/{code}/comments",
    response_model=ModuleCommentListOut,
    summary="Bình luận đã duyệt của học phần (công khai)",
)
def list_module_comments(
    code: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    m = _get_module(db, code)
    base_stmt = select(ModuleComment).where(
        ModuleComment.module_code == m.code,
        ModuleComment.status == "approved",
    )
    total = db.scalar(select(func.count(ModuleComment.id)).where(
        ModuleComment.module_code == m.code,
        ModuleComment.status == "approved",
    )) or 0

    comments = list(
        db.scalars(
            base_stmt.order_by(ModuleComment.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
    )

    avg_rating_val = db.scalar(
        select(func.avg(ModuleComment.rating)).where(
            ModuleComment.module_code == m.code,
            ModuleComment.status == "approved",
            ModuleComment.rating.isnot(None),
        )
    )
    avg_rating = round(float(avg_rating_val), 1) if avg_rating_val is not None else None

    items = [
        ModuleCommentOut(
            id=c.id,
            module_code=c.module_code,
            body=c.body,
            rating=c.rating,
            author_name=public_name(c.author_name),
            status=c.status,
            like_count=c.like_count or 0,
            created_at=c.created_at,
        )
        for c in comments
    ]

    return ModuleCommentListOut(
        items=items,
        total=total,
        page=page,
        size=size,
        average_rating=avg_rating,
    )


@router.post(
    "/modules/{code}/comments",
    response_model=ModuleCommentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Gửi bình luận đánh giá học phần",
)
def create_module_comment(
    code: str,
    body: ModuleCommentIn,
    db: Session = Depends(get_db),
    account: AccountUser | None = Depends(current_user),
):
    m = _get_module(db, code)

    # 0. Học kỳ đã học (tùy chọn): phải tồn tại; có học kỳ thì bắt buộc anon_id và chống góp ý trùng.
    semester = body.semester.strip() if body.semester else None
    if semester:
        if not body.anon_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Thiếu mã thiết bị (anon_id) để góp ý theo học kỳ.",
            )
        if db.get(Semester, semester) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Học kỳ không hợp lệ.",
            )
        duplicate = db.scalar(
            select(ModuleComment.id).where(
                ModuleComment.anon_id == body.anon_id,
                ModuleComment.module_code == m.code,
                ModuleComment.semester == semester,
            ).limit(1)
        )
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bạn đã góp ý học phần này trong học kỳ này.",
            )

    # 1. Rate limit: tối đa 10 bình luận / 10 phút / anon_id (một sinh viên góp ý nhiều học phần cùng lúc)
    if body.anon_id:
        since = datetime.now(timezone.utc) - timedelta(minutes=10)
        recent_count = db.scalar(
            select(func.count(ModuleComment.id)).where(
                ModuleComment.anon_id == body.anon_id,
                ModuleComment.created_at >= since,
            )
        ) or 0
        if recent_count >= 10:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Bạn đã gửi quá nhiều bình luận trong 10 phút qua. Vui lòng thử lại sau.",
            )

    # 2. Kiểm duyệt nội dung: gắn cờ link/SĐT/email, từ cấm admin tự thêm và mô hình AI (không chặn cứng)
    flags = check_content(body.body, db=db, min_len=5, max_len=1000)

    # 3. Chế độ kiểm duyệt (admin_settings 'moderation.mode'):
    #    auto (mặc định): approved nếu không có cờ, pending nếu có cờ (link, SĐT/email, từ khóa flag)
    #    pre: luôn pending; post: luôn approved
    mode_setting = db.scalar(select(AdminSetting.value).where(AdminSetting.key == "moderation.mode"))
    mode = "auto"
    if isinstance(mode_setting, dict):
        mode = mode_setting.get("mode", "auto")
    elif isinstance(mode_setting, str):
        mode = mode_setting
    mode = str(mode).strip().lower()
    if mode not in ("auto", "pre", "post"):
        mode = "pre"  # giá trị không rõ thì giữ chế độ an toàn nhất

    if mode == "post":
        initial_status = "approved"
    elif mode == "auto":
        initial_status = "pending" if flags else "approved"
    else:
        initial_status = "pending"

    # Người đã đăng nhập và đặt biệt danh thì bình luận hiện biệt danh đó; còn lại vẫn là "Sinh viên ẩn danh".
    author_name = None
    if account is not None and account.nickname and not is_user_ban_active(account, datetime.now(timezone.utc)):
        author_name = account.nickname

    comment = ModuleComment(
        module_code=m.code,
        anon_id=body.anon_id,
        semester=semester,
        body=body.body.strip(),
        rating=body.rating,
        status=initial_status,
        flag_reasons=flags or None,
        author_name=author_name,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return ModuleCommentOut(
        id=comment.id,
        module_code=comment.module_code,
        body=comment.body,
        rating=comment.rating,
        author_name=public_name(comment.author_name),
        status=comment.status,
        semester=comment.semester,
        like_count=comment.like_count or 0,
        created_at=comment.created_at,
    )


# Số lượt báo cáo cho một bình luận khiến nó tự động chuyển về chờ duyệt (Brief A3+).
_COMMENT_REPORT_AUTO_PENDING_THRESHOLD = 3


def _get_comment(db: Session, code: str, comment_id: int) -> ModuleComment:
    m = _get_module(db, code)
    comment = db.get(ModuleComment, comment_id)
    if comment is None or comment.module_code != m.code:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy bình luận.")
    return comment


@router.post(
    "/modules/{code}/comments/{comment_id}/like",
    response_model=CommentLikeOut,
    summary="Thích / bỏ thích một bình luận (không cần đăng nhập)",
)
def like_module_comment(
    code: str,
    comment_id: int,
    body: CommentLikeIn,
    db: Session = Depends(get_db),
):
    comment = _get_comment(db, code, comment_id)
    anon_id = body.anon_id.strip()
    existing = db.scalar(
        select(CommentLike).where(CommentLike.comment_id == comment.id, CommentLike.anon_id == anon_id)
    )
    if existing:
        db.delete(existing)
        comment.like_count = max(0, (comment.like_count or 0) - 1)
        liked = False
    else:
        db.add(CommentLike(comment_id=comment.id, anon_id=anon_id))
        comment.like_count = (comment.like_count or 0) + 1
        liked = True
    db.commit()
    return CommentLikeOut(liked=liked, like_count=comment.like_count)


@router.post(
    "/modules/{code}/comments/{comment_id}/report",
    response_model=CommentReportOut,
    status_code=status.HTTP_201_CREATED,
    summary="Báo cáo bình luận vi phạm (không cần đăng nhập, chỉ cần nêu lý do)",
)
def report_module_comment(
    code: str,
    comment_id: int,
    body: CommentReportIn,
    request: Request,
    db: Session = Depends(get_db),
):
    comment = _get_comment(db, code, comment_id)
    ip_hash = hash_client_ip(get_real_ip(request))
    db.add(CommentReport(comment_id=comment.id, reason=body.reason.strip(), ip_hash=ip_hash))

    # Nhiều người cùng báo cáo một bình luận -> tự động chuyển về chờ duyệt (dù đang approved),
    # theo đúng "Nguyên tắc cộng đồng": vi phạm sẽ được chuyển sang chờ duyệt hoặc gỡ.
    report_count = (
        db.scalar(select(func.count(CommentReport.id)).where(CommentReport.comment_id == comment.id)) or 0
    ) + 1
    auto_pending = False
    if report_count >= _COMMENT_REPORT_AUTO_PENDING_THRESHOLD and comment.status == "approved":
        comment.status = "pending"
        comment.flag_reasons = list(dict.fromkeys([*(comment.flag_reasons or []), "reported"]))
        auto_pending = True
    db.commit()

    message = (
        "Đã ghi nhận báo cáo. Bình luận đã được chuyển về chờ duyệt lại."
        if auto_pending
        else "Đã ghi nhận báo cáo, cảm ơn bạn. Quản trị viên sẽ xem lại."
    )
    return CommentReportOut(ok=True, message=message)
