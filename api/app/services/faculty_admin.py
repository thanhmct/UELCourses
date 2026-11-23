"""Dịch vụ quản trị dữ liệu học phần (khoa/bộ môn) và độ phủ đề cương (Brief A4).

Cung cấp:
  - Cache 60s cho kết quả rà soát khoa (audit) trên DB.
  - Hàng đợi duyệt dữ liệu khoa / bộ môn (needs_review, prefix_conflict, no_source, admin_modified).
  - Tra cứu danh sách khoa chuẩn và bộ môn.
  - Thống kê độ phủ đề cương (% theo khoa, theo kỳ có lớp mở).
  - Danh sách môn thiếu đề cương (sắp theo số lớp mở).
  - Danh sách tài liệu scan chờ OCR và link Google Drive chờ đồng ý.
"""

from __future__ import annotations

import time
from typing import Any
from sqlalchemy import distinct, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    ClassSection,
    Module,
    OutlineCourse,
    OutlineDocument,
    OutlineModuleLink,
    OutlineResource,
    ProgramCatalogEntry,
    ProgramModule,
    Semester,
)
from app.schemas import (
    FacultiesResponse,
    FacultyCoverageItem,
    FacultyDepartmentInfo,
    FacultyReviewItemOut,
    FacultyReviewResponse,
    FacultyReviewSuggestion,
    OutlineCoverageResponse,
    OutlineDriveLinkItem,
    OutlineDriveLinkResponse,
    OutlineMissingItem,
    OutlineMissingResponse,
    OutlineOcrPendingItem,
    OutlineOcrPendingResponse,
    SemesterCoverageItem,
)
from app.services.faculty_names import (
    CANONICAL_FACULTIES_VI,
    STATIC_DEPARTMENT_EN_TO_VI,
    STATIC_DEPT_ALIASES,
    audit_module_faculties_with_unmapped,
    summarize_audit,
)


_AUDIT_CACHE: dict[str, Any] = {
    "timestamp": 0.0,
    "rows": [],
    "unmapped": [],
    "summary": {},
    "mods": {},
}


def get_cached_audit_data(
    db: Session, force_refresh: bool = False
) -> tuple[list[dict], list[str], dict, dict[str, Module]]:
    """Lấy dữ liệu rà soát khoa/bộ môn trực tiếp từ DB với bộ nhớ đệm ngắn 60 giây."""
    now = time.time()
    if (
        not force_refresh
        and (now - _AUDIT_CACHE["timestamp"] < 60.0)
        and _AUDIT_CACHE["rows"]
    ):
        return (
            _AUDIT_CACHE["rows"],
            _AUDIT_CACHE["unmapped"],
            _AUDIT_CACHE["summary"],
            _AUDIT_CACHE["mods"],
        )

    mods = {m.code: m for m in db.scalars(select(Module)).all()}
    rows, unmapped = audit_module_faculties_with_unmapped(db, mods=mods)
    summary = summarize_audit(rows, unmapped)

    _AUDIT_CACHE["timestamp"] = now
    _AUDIT_CACHE["rows"] = rows
    _AUDIT_CACHE["unmapped"] = unmapped
    _AUDIT_CACHE["summary"] = summary
    _AUDIT_CACHE["mods"] = mods

    return rows, unmapped, summary, mods


def invalidate_audit_cache() -> None:
    """Xóa bộ nhớ đệm rà soát khi có cập nhật khoa/bộ môn."""
    _AUDIT_CACHE["timestamp"] = 0.0
    _AUDIT_CACHE["rows"] = []
    _AUDIT_CACHE["unmapped"] = []
    _AUDIT_CACHE["summary"] = {}
    _AUDIT_CACHE["mods"] = {}


def get_cached_audit_summary(db: Session) -> dict:
    """Lấy tóm tắt audit cho Overview."""
    _, _, summary, _ = get_cached_audit_data(db)
    return summary


def get_faculty_review_data(
    db: Session,
    *,
    kind: str = "needs_review",
    q: str | None = None,
    prefix: str | None = None,
    faculty: str | None = None,
    page: int = 1,
    size: int = 20,
) -> FacultyReviewResponse:
    """Lấy danh sách học phần cần rà duyệt khoa/bộ môn phân theo nhóm:
    - needs_review: Môn có mâu thuẫn tên chuẩn hóa hoặc nhiều đề cương xung đột
    - prefix_conflict: Môn có mâu thuẫn giữa khoa hiện tại và tiền tố mã môn
    - no_source: Môn chưa có nguồn đề cương lẫn tiền tố
    - admin_modified: Môn đã được quản trị viên chỉnh tay (faculty_source='admin')
    """
    rows, _, _, mods = get_cached_audit_data(db)

    # 1. Phân loại toàn bộ các dòng theo 4 nhóm
    needs_review_rows = []
    prefix_conflict_rows = []
    no_source_rows = []
    admin_rows = []

    for r in rows:
        is_admin = (r.get("faculty_source") == "admin") or (r.get("nguồn") == "admin")
        is_pref_conf = bool(r.get("is_prefix_conflict")) or ("mâu thuẫn tiền tố" in (r.get("lý do") or ""))
        is_needs_rev = bool(r.get("needs_review_bool")) or (r.get("kết_luận") == "cần duyệt")

        if is_admin:
            admin_rows.append(r)
        elif is_pref_conf:
            prefix_conflict_rows.append(r)
        elif is_needs_rev:
            needs_review_rows.append(r)
        elif r.get("nguồn") not in ("outline", "counterpart_outline", "prefix"):
            no_source_rows.append(r)

    counts = {
        "needs_review": len(needs_review_rows),
        "prefix_conflict": len(prefix_conflict_rows),
        "no_source": len(no_source_rows),
        "admin_modified": len(admin_rows),
    }

    # 2. Chọn tập dữ liệu theo tham số kind
    kind_clean = (kind or "needs_review").strip().lower()
    if kind_clean in ("prefix_conflict", "conflict"):
        target_rows = prefix_conflict_rows
    elif kind_clean in ("no_source", "nosource"):
        target_rows = no_source_rows
    elif kind_clean in ("admin_modified", "admin", "manual"):
        target_rows = admin_rows
    else:
        target_rows = needs_review_rows

    # 3. Lọc theo q, prefix, faculty
    filtered = []
    q_norm = q.strip().lower() if q else ""
    pref_norm = prefix.strip().upper() if prefix else ""
    fac_norm = faculty.strip() if faculty else ""

    for r in target_rows:
        if q_norm:
            code_str = r.get("code", "").lower()
            name_str = r.get("name", "").lower()
            if q_norm not in code_str and q_norm not in name_str:
                continue

        if pref_norm:
            if r.get("prefix", "").upper() != pref_norm:
                continue

        if fac_norm:
            cur_fac = r.get("faculty_hiện_tại") or ""
            target_fac = r.get("faculty_chuẩn") or ""
            if fac_norm != cur_fac and fac_norm != target_fac:
                continue

        filtered.append(r)

    total = len(filtered)
    start_idx = (page - 1) * size
    page_rows = filtered[start_idx : start_idx + size]
    page_codes = [r["code"] for r in page_rows]

    # 4. Truy vấn số lớp mở và số CTĐT có chứa môn cho các mã trên trang hiện tại
    open_classes_map: dict[str, int] = {}
    program_map: dict[str, int] = {}

    if page_codes:
        for c_code, cnt in db.execute(
            select(ClassSection.module_code, func.count(ClassSection.id))
            .where(ClassSection.module_code.in_(page_codes))
            .group_by(ClassSection.module_code)
        ).all():
            open_classes_map[c_code] = cnt

        for c_code, cnt in db.execute(
            select(
                ProgramModule.module_code,
                func.count(distinct(ProgramModule.program_id)),
            )
            .where(ProgramModule.module_code.in_(page_codes))
            .group_by(ProgramModule.module_code)
        ).all():
            program_map[c_code] = cnt

    # 5. Xây dựng kết quả trả về
    items: list[FacultyReviewItemOut] = []
    for r in page_rows:
        code = r["code"]
        m_obj = mods.get(code)
        credits_val = m_obj.credits if m_obj else None

        # Xác định đề xuất khoa / nguồn / độ tin cậy
        suggestion = None
        if r.get("is_prefix_conflict"):
            suggestion = FacultyReviewSuggestion(
                faculty=r.get("faculty_theo_tiền_tố"),
                source="prefix",
                confidence=r.get("tỷ_lệ_tiền_tố") or "Tiền tố mã môn",
            )
        elif r.get("faculty_theo_đề_cương"):
            suggestion = FacultyReviewSuggestion(
                faculty=r.get("faculty_theo_đề_cương"),
                source=r.get("nguồn") or "outline",
                confidence="Đề cương",
            )
        elif r.get("faculty_theo_tiền_tố"):
            suggestion = FacultyReviewSuggestion(
                faculty=r.get("faculty_theo_tiền_tố"),
                source="prefix",
                confidence=r.get("tỷ_lệ_tiền_tố") or "Tiền tố",
            )
        elif r.get("faculty_chuẩn") and r.get("faculty_chuẩn") != (r.get("faculty_hiện_tại") or ""):
            suggestion = FacultyReviewSuggestion(
                faculty=r.get("faculty_chuẩn"),
                source=r.get("nguồn") or None,
                confidence=None,
            )

        items.append(
            FacultyReviewItemOut(
                code=code,
                name=r.get("name") or "",
                credits=credits_val,
                faculty=r.get("faculty_hiện_tại") or None,
                department=r.get("department_hiện_tại") or None,
                faculty_source=r.get("faculty_source") or r.get("nguồn") or None,
                suggestion=suggestion,
                reason=r.get("lý do") or r.get("vấn_đề") or None,
                open_classes_count=open_classes_map.get(code, 0),
                program_count=program_map.get(code, 0),
            )
        )

    return FacultyReviewResponse(
        items=items,
        total=total,
        page=page,
        size=size,
        counts=counts,
    )


def get_faculties_and_departments(db: Session) -> FacultiesResponse:
    """Trả về danh sách 9 khoa chuẩn + Phòng Đào tạo cùng các bộ môn đã biết."""
    # Thu thập bộ môn từ DB
    db_dept_rows = db.execute(
        select(distinct(Module.faculty), Module.department)
        .where(Module.faculty.is_not(None), Module.department.is_not(None))
    ).all()

    faculty_depts: dict[str, set[str]] = {f: set() for f in CANONICAL_FACULTIES_VI}

    for fac, dept in db_dept_rows:
        if fac and dept and fac in faculty_depts:
            clean_d = dept.strip()
            if clean_d:
                faculty_depts[fac].add(clean_d)

    # Bổ sung bộ môn tĩnh đã biết
    for d_vi in STATIC_DEPARTMENT_EN_TO_VI.values():
        if not d_vi.startswith("Bộ môn "):
            d_name = f"Bộ môn {d_vi}"
        else:
            d_name = d_vi
        d_lower = d_name.lower()

        if "kinh doanh" in d_lower or "quản trị" in d_lower or "marketing" in d_lower:
            faculty_depts["Khoa Quản trị kinh doanh"].add(d_name)
        elif "thông tin" in d_lower or "thương mại điện tử" in d_lower or "phân tích dữ liệu" in d_lower:
            faculty_depts["Khoa Hệ thống thông tin"].add(d_name)
        elif "tài chính" in d_lower or "ngân hàng" in d_lower:
            faculty_depts["Khoa Tài chính - Ngân hàng"].add(d_name)
        elif "kế toán" in d_lower or "kiểm toán" in d_lower:
            faculty_depts["Khoa Kế toán - Kiểm toán"].add(d_name)
        elif "toán" in d_lower:
            faculty_depts["Khoa Toán kinh tế"].add(d_name)
        elif "đối ngoại" in d_lower or "kinh tế quốc tế" in d_lower:
            faculty_depts["Khoa Kinh tế đối ngoại"].add(d_name)
        elif "kinh tế" in d_lower:
            faculty_depts["Khoa Kinh tế"].add(d_name)
        elif "luật kinh tế" in d_lower or "thương mại" in d_lower:
            faculty_depts["Khoa Luật Kinh tế"].add(d_name)
        elif "luật" in d_lower:
            faculty_depts["Khoa Luật"].add(d_name)

    all_departments = sorted(
        {dept for depts in faculty_depts.values() for dept in depts}
    )

    fac_items = [
        FacultyDepartmentInfo(
            name=fac,
            departments=sorted(faculty_depts[fac]),
        )
        for fac in CANONICAL_FACULTIES_VI
    ]

    return FacultiesResponse(
        faculties=fac_items,
        canonical_faculties=CANONICAL_FACULTIES_VI,
        all_departments=all_departments,
    )


def _get_outline_covered_codes(db: Session) -> set[str]:
    """Tập hợp tất cả các mã học phần đã có đề cương (qua outline_module_links hoặc outline_courses)."""
    codes = set()
    for row in db.execute(select(distinct(OutlineModuleLink.module_code))).all():
        if row[0]:
            codes.add(row[0].strip().upper())

    for row in db.execute(
        select(distinct(OutlineCourse.course_code_norm)).where(
            OutlineCourse.course_code_norm.is_not(None)
        )
    ).all():
        if row[0]:
            codes.add(row[0].strip().upper())

    return codes


def get_outlines_coverage(db: Session) -> OutlineCoverageResponse:
    """Thống kê độ phủ đề cương tổng thể, theo từng khoa và theo học kỳ có lớp mở."""
    modules = db.scalars(select(Module)).all()
    total_modules = len(modules)
    covered_codes = _get_outline_covered_codes(db)

    with_outline_count = sum(1 for m in modules if m.code.strip().upper() in covered_codes)
    coverage_pct = (
        round(with_outline_count / total_modules * 100.0, 1)
        if total_modules > 0
        else 0.0
    )

    # 1. Thống kê theo khoa
    by_faculty: list[FacultyCoverageItem] = []
    for fac in CANONICAL_FACULTIES_VI:
        fac_mods = [m for m in modules if (m.faculty or "") == fac]
        fac_total = len(fac_mods)
        fac_with = sum(
            1 for m in fac_mods if m.code.strip().upper() in covered_codes
        )
        fac_pct = (
            round(fac_with / fac_total * 100.0, 1) if fac_total > 0 else 0.0
        )
        by_faculty.append(
            FacultyCoverageItem(
                faculty=fac,
                total_modules=fac_total,
                with_outline=fac_with,
                coverage_pct=fac_pct,
            )
        )

    # 2. Thống kê theo học kỳ có lớp mở
    semesters = db.scalars(
        select(Semester).order_by(Semester.id.desc())
    ).all()
    sem_name_map = {s.id: s.name for s in semesters}

    sem_classes = db.execute(
        select(ClassSection.semester_id, ClassSection.module_code).where(
            ClassSection.semester_id.is_not(None)
        )
    ).all()

    sem_module_map: dict[str, set[str]] = {}
    for sem_id, m_code in sem_classes:
        if not sem_id or not m_code:
            continue
        if sem_id not in sem_module_map:
            sem_module_map[sem_id] = set()
        sem_module_map[sem_id].add(m_code.strip().upper())

    by_semester: list[SemesterCoverageItem] = []
    # Ưu tiên các học kỳ có trong bảng semesters
    seen_sems = set()
    for sem in semesters:
        seen_sems.add(sem.id)
        m_set = sem_module_map.get(sem.id, set())
        s_total = len(m_set)
        s_with = sum(1 for c in m_set if c in covered_codes)
        s_pct = round(s_with / s_total * 100.0, 1) if s_total > 0 else 0.0
        by_semester.append(
            SemesterCoverageItem(
                semester_id=sem.id,
                semester_name=sem.name,
                total_modules=s_total,
                with_outline=s_with,
                coverage_pct=s_pct,
            )
        )

    # Các kỳ khác nếu có trong class_sections mà chưa có trong semesters
    for sem_id, m_set in sorted(sem_module_map.items(), reverse=True):
        if sem_id not in seen_sems:
            s_total = len(m_set)
            s_with = sum(1 for c in m_set if c in covered_codes)
            s_pct = round(s_with / s_total * 100.0, 1) if s_total > 0 else 0.0
            by_semester.append(
                SemesterCoverageItem(
                    semester_id=sem_id,
                    semester_name=sem_name_map.get(sem_id, sem_id),
                    total_modules=s_total,
                    with_outline=s_with,
                    coverage_pct=s_pct,
                )
            )

    return OutlineCoverageResponse(
        total_modules=total_modules,
        modules_with_outline=with_outline_count,
        coverage_pct=coverage_pct,
        by_faculty=by_faculty,
        by_semester=by_semester,
    )


def get_outlines_missing(
    db: Session,
    *,
    sort: str = "open_classes",
    q: str | None = None,
    page: int = 1,
    size: int = 20,
) -> OutlineMissingResponse:
    """Danh sách học phần còn thiếu đề cương, sắp theo số lớp mở giảm dần."""
    covered_codes = _get_outline_covered_codes(db)
    modules = db.scalars(select(Module)).all()

    missing_mods = [
        m for m in modules if m.code.strip().upper() not in covered_codes
    ]

    # Đếm số lớp mở cho từng môn
    open_classes_map: dict[str, int] = {}
    for c_code, cnt in db.execute(
        select(ClassSection.module_code, func.count(ClassSection.id)).group_by(
            ClassSection.module_code
        )
    ).all():
        if c_code:
            open_classes_map[c_code.strip().upper()] = cnt

    # Lọc theo từ khóa tìm kiếm q
    filtered = []
    q_norm = q.strip().lower() if q else ""
    for m in missing_mods:
        if q_norm:
            if (
                q_norm not in m.code.lower()
                and q_norm not in (m.name or "").lower()
            ):
                continue
        filtered.append(m)

    # Sắp xếp theo số lớp mở giảm dần
    if sort == "open_classes":
        filtered.sort(
            key=lambda m: (
                open_classes_map.get(m.code.strip().upper(), 0),
                m.code,
            ),
            reverse=True,
        )
    else:
        filtered.sort(key=lambda m: m.code)

    total = len(filtered)
    start_idx = (page - 1) * size
    page_mods = filtered[start_idx : start_idx + size]

    items: list[OutlineMissingItem] = []
    for m in page_mods:
        c_upper = m.code.strip().upper()
        cp = m.counterpart_code.strip().upper() if m.counterpart_code else None
        cp_has_outline = (cp in covered_codes) if cp else False

        items.append(
            OutlineMissingItem(
                code=m.code,
                name=m.name,
                credits=m.credits,
                faculty=m.faculty,
                department=m.department,
                open_classes_count=open_classes_map.get(c_upper, 0),
                counterpart_code=m.counterpart_code,
                counterpart_has_outline=cp_has_outline,
            )
        )

    return OutlineMissingResponse(
        items=items,
        total=total,
        page=page,
        size=size,
    )


def get_outlines_ocr_pending(
    db: Session,
    *,
    page: int = 1,
    size: int = 20,
) -> OutlineOcrPendingResponse:
    """Danh sách tài liệu đề cương scan đang chờ OCR (ocr_status='pending')."""
    base_query = (
        select(OutlineDocument)
        .where(OutlineDocument.ocr_status == "pending")
        .order_by(OutlineDocument.id.desc())
    )

    total = (
        db.scalar(
            select(func.count(OutlineDocument.id)).where(
                OutlineDocument.ocr_status == "pending"
            )
        )
        or 0
    )

    docs = db.scalars(base_query.offset((page - 1) * size).limit(size)).all()

    doc_ids = [d.id for d in docs]
    doc_module_map: dict[int, set[str]] = {did: set() for did in doc_ids}

    if doc_ids:
        # Qua OutlineModuleLink
        for did, mcode in db.execute(
            select(OutlineModuleLink.document_id, OutlineModuleLink.module_code).where(
                OutlineModuleLink.document_id.in_(doc_ids)
            )
        ).all():
            if mcode:
                doc_module_map[did].add(mcode.strip().upper())

        # Qua OutlineCourse
        for did, ccode, cnorm in db.execute(
            select(
                OutlineCourse.document_id,
                OutlineCourse.course_code,
                OutlineCourse.course_code_norm,
            ).where(OutlineCourse.document_id.in_(doc_ids))
        ).all():
            if cnorm:
                doc_module_map[did].add(cnorm.strip().upper())
            elif ccode:
                doc_module_map[did].add(ccode.strip().upper())

    items = [
        OutlineOcrPendingItem(
            id=d.id,
            file_name=d.file_name,
            rel_path=d.rel_path,
            size_bytes=d.size_bytes,
            page_count=d.page_count,
            ocr_engine=d.ocr_engine,
            text_chars=d.text_chars,
            extracted_at=d.extracted_at,
            related_modules=sorted(doc_module_map.get(d.id, set())),
        )
        for d in docs
    ]

    return OutlineOcrPendingResponse(
        items=items,
        total=total,
        page=page,
        size=size,
    )


def get_outlines_drive_links(
    db: Session,
    *,
    page: int = 1,
    size: int = 20,
) -> OutlineDriveLinkResponse:
    """Danh sách liên kết Google Docs/Drive chưa tải về (chỉ liệt kê, KHÔNG tải)."""
    filter_cond = (
        or_(
            OutlineResource.url.ilike("%drive.google.com%"),
            OutlineResource.url.ilike("%docs.google.com%"),
        ),
        or_(
            OutlineResource.status != "downloaded",
            OutlineResource.document_id.is_(None),
        ),
    )

    total = (
        db.scalar(
            select(func.count(OutlineResource.id)).where(*filter_cond)
        )
        or 0
    )

    resources = db.scalars(
        select(OutlineResource)
        .where(*filter_cond)
        .order_by(OutlineResource.id.asc())
        .offset((page - 1) * size)
        .limit(size)
    ).all()

    entry_ids = [r.entry_id for r in resources if r.entry_id]
    entry_module_map: dict[str, list[str]] = {}
    if entry_ids:
        for eid, mcode in db.execute(
            select(ProgramCatalogEntry.id, ProgramCatalogEntry.module_code).where(
                ProgramCatalogEntry.id.in_(entry_ids)
            )
        ).all():
            if mcode:
                entry_module_map.setdefault(eid, []).append(mcode.strip().upper())

    items = [
        OutlineDriveLinkItem(
            id=r.id,
            url=r.url,
            kind=r.kind,
            label=r.label,
            status=r.status,
            failure_reason=r.failure_reason,
            entry_id=r.entry_id,
            module_codes=entry_module_map.get(r.entry_id, []),
        )
        for r in resources
    ]

    return OutlineDriveLinkResponse(
        items=items,
        total=total,
        page=page,
        size=size,
    )
