from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.admin.auth import login_admin, logout_admin
from app.admin.deps import require_admin, require_admin_dev
from app.admin.security import generate_csrf_token, hash_token
from app.db import SessionLocal
from app.models import (
    AcademicEvent,
    AdminSession,
    AuditLog,
    BannedIp,
    BannedTerm,
    Feedback,
    ImportRun,
    Module,
    ModuleComment,
    Review,
    Semester,
    User,
)
from app.schemas import (
    AcademicEventIn,
    AcademicEventOut,
    AcademicEventPatchIn,
    AdminChangeMyPasswordIn,
    AdminLoginIn,
    AdminLoginOut,
    AdminPasswordResetOut,
    AdminSettingsOut,
    AdminSettingsPatchIn,
    AdminUserCreateIn,
    AdminUserCreateOut,
    AdminUserOut,
    AdminUserPatchIn,
    AuditLogItemOut,
    AuditLogListResponse,
    BannedIpOut,
    BannedTermIn,
    BannedTermOut,
    BannedUserOut,
    BanListOut,
    BulkFacultyReviewIn,
    BulkModerationIn,
    CalendarEventsResponse,
    CalendarImportDryRunResponse,
    CalendarImportResponse,
    FacultiesResponse,
    FacultyReviewResponse,
    ModerationActionIn,
    ModerationQueueItemOut,
    ModerationQueueResponse,
    ModuleFacultyPatchIn,
    OutlineCoverageResponse,
    OutlineDriveLinkResponse,
    OutlineMissingResponse,
    OutlineOcrPendingResponse,
    SemesterAdminOut,
    SemesterAdminPatchIn,
    SystemInfoResponse,
)
from app.services.system_admin import (
    change_my_password,
    create_admin_user,
    export_audit_logs_csv,
    get_admin_settings,
    get_admin_users,
    get_audit_logs,
    get_system_info,
    reset_admin_password,
    update_admin_settings,
    update_admin_user,
)
from app.services.academic_calendar import (
    VALID_EVENT_KINDS,
    _matches_cohort,
    clear_calendar_cache,
    import_academic_calendar,
)
from app.routers.semesters import current_semester_id
from app.services.faculty_admin import (
    get_cached_audit_data,
    get_faculties_and_departments,
    get_faculty_review_data,
    get_outlines_coverage,
    get_outlines_drive_links,
    get_outlines_missing,
    get_outlines_ocr_pending,
    invalidate_audit_cache,
)
from app.services.faculty_names import (
    CANONICAL_FACULTIES_VI,
    resolve_module_faculty,
)
from app.services.text import normalize_search
from app.services.analytics import (
    export_to_csv_string,
    get_analytics_overview_numbers,
    get_trend_chat_topics,
    get_trend_classes_for_module,
    get_trend_conflicts,
    get_trend_modules,
    get_trend_pairs,
    get_trend_search_no_results,
    get_trend_slots,
)
from app.services.moderation_ban import as_utc, is_user_ban_active
from app.services.notify import send_ban_email

router = APIRouter(prefix="/admin", tags=["admin"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/overview", summary="Số liệu tổng quan quản trị")
def get_overview(
    _admin: dict[str, Any] = Depends(require_admin_dev()),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Trả về số liệu tổng quan hệ thống:
    active_anon_7d, active_anon_30d, timetable_adds_7d, planner_adds_7d, activity_30d,
    moderation_pending, data_review_pending, errors_24h, last_import_at.
    """
    # 1. Hàng đợi kiểm duyệt (chờ duyệt feedback, bình luận học phần và review)
    moderation_pending = 0
    try:
        rev_cnt = db.scalar(select(func.count(Review.id)).where(Review.status == "pending")) or 0
        fb_cnt = db.scalar(select(func.count(Feedback.id)).where(Feedback.status == "pending")) or 0
        mc_cnt = db.scalar(select(func.count(ModuleComment.id)).where(ModuleComment.status == "pending")) or 0
        moderation_pending = rev_cnt + fb_cnt + mc_cnt
    except Exception:
        moderation_pending = 0

    # 2. Học phần cần duyệt dữ liệu khoa / bộ môn (needs_review + prefix_conflict) (Brief A4)
    data_review_pending = 0
    try:
        from app.services.faculty_admin import get_cached_audit_summary
        audit_summary = get_cached_audit_summary(db)
        data_review_pending = audit_summary.get("needs_review_count", 0) + audit_summary.get("prefix_conflicts", 0)
    except Exception:
        data_review_pending = 0

    # 3. Lần nhập dữ liệu gần nhất từ import_runs
    last_import_at: str | None = None
    try:
        last_finished = db.scalar(select(func.max(ImportRun.finished_at)))
        if last_finished is None:
            last_finished = db.scalar(select(func.max(ImportRun.started_at)))
        if last_finished is not None:
            last_import_at = last_finished.isoformat()
    except Exception:
        last_import_at = None

    # 4. Số liệu phân tích thật từ analytics_events (Brief A2)
    analytics_numbers = get_analytics_overview_numbers(db)

    # 5. Số lỗi hệ thống 24h từ audit_log (Brief A6)
    from app.services.system_admin import get_recent_errors_count
    errors_24h = get_recent_errors_count(db, hours=24)

    return {
        "active_anon_7d": analytics_numbers.get("active_anon_7d", 0),
        "active_anon_30d": analytics_numbers.get("active_anon_30d", 0),
        "timetable_adds_7d": analytics_numbers.get("timetable_adds_7d", 0),
        "planner_adds_7d": analytics_numbers.get("planner_adds_7d", 0),
        "activity_30d": analytics_numbers.get("activity_30d", []),
        "moderation_pending": moderation_pending,
        "data_review_pending": data_review_pending,
        "errors_24h": errors_24h,
        "last_import_at": last_import_at,
    }


@router.post("/login", response_model=AdminLoginOut, summary="Đăng nhập quản trị viên")
def login_endpoint(
    payload: AdminLoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Xử lý đăng nhập quản trị viên (Brief A0).
    Kiểm tra email, mật khẩu (Argon2id/PBKDF2), giới hạn khóa 15 phút sau 5 lần sai.
    Sinh phiên 8 giờ, đặt cookie uel_admin HttpOnly/Secure và trả CSRF token.
    """
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return login_admin(
        db=db,
        email=payload.email,
        password=payload.password,
        client_ip=client_ip,
        user_agent=user_agent,
        response=response,
        request=request,
    )


@router.post("/logout", summary="Đăng xuất quản trị viên")
def logout_endpoint(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Đăng xuất quản trị viên: thu hồi phiên trong CSDL và xóa cookie uel_admin."""
    token = request.cookies.get("uel_admin")
    return logout_admin(db=db, token=token, response=response)


@router.get("/me", summary="Thông tin người dùng quản trị hiện tại")
def get_me(
    response: Response,
    admin: dict[str, Any] = Depends(require_admin()),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Trả về thông tin phiên quản trị hiện tại (hoặc thông tin chế độ dev)."""
    # Gắn header X-CSRF-Token cho phản hồi
    csrf_val = admin.get("csrf_token")
    session_id = admin.get("session_id")
    if not csrf_val and session_id is not None:
        session = db.scalar(select(AdminSession).where(AdminSession.id == session_id))
        if session:
            csrf_val = generate_csrf_token()
            session.csrf_token_hash = hash_token(csrf_val)
            db.commit()
    if not csrf_val:
        csrf_val = "dev-csrf-token" if admin.get("actor_type") == "dev" else ""
    if csrf_val:
        response.headers["X-CSRF-Token"] = csrf_val

    return {
        "id": admin.get("id", 0),
        "email": admin.get("email", ""),
        "role": admin.get("role", "admin"),
        "actor_type": admin.get("actor_type", "admin"),
        "csrf_token": csrf_val,
    }


@router.post("/auth/test-protected", summary="Endpoint kiểm tra xác thực, vai trò và CSRF")
def test_protected_endpoint(
    payload: dict[str, Any] | None = None,
    admin: dict[str, Any] = Depends(require_admin(roles=["admin"], allow_dev=False)),
):
    """Route thử nghiệm yêu cầu vai trò admin thật và CSRF token hợp lệ."""
    return {"status": "ok", "admin": admin.get("email"), "role": admin.get("role")}



# =============================================================================
# Xu hướng chọn môn & thống kê hành vi (Brief A2)
# Các endpoint yêu cầu vai trò admin hoặc data_editor
# =============================================================================

@router.get("/trends/modules", summary="Top môn học được thêm vào TKB/Kế hoạch/Xem")
def get_trends_modules_endpoint(
    semester: str | None = Query(None, description="Mã học kỳ (vd 2026-2027-1)"),
    program: str | None = Query(None, description="Mã CTĐT hoặc tiền tố khóa (vd K24)"),
    from_date: date | None = Query(None, alias="from", description="Từ ngày (YYYY-MM-DD)"),
    to_date: date | None = Query(None, alias="to", description="Đến ngày (YYYY-MM-DD)"),
    range_days: int = Query(30, alias="range", description="Số ngày gần đây nếu không chọn from/to"),
    format: str | None = Query(None, description="Định dạng trả về: json hoặc csv"),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    modules_data = get_trend_modules(
        db=db,
        semester=semester,
        program=program,
        from_date=from_date,
        to_date=to_date,
        days=range_days,
    )

    if format == "csv":
        headers = ["Mã môn", "Tên môn", "Thêm vào TKB", "Thêm vào Kế hoạch", "Lượt xem", "Xu hướng", "Ẩn danh (<5)"]
        rows = [
            [
                m["module_code"],
                m["module_name"],
                m["timetable_adds"],
                m["planner_adds"],
                m["views"],
                f"{'+' if m['trend_dir'] == 'up' else '-'}{m['trend_pct']}%",
                "Có" if m["anonymized"] else "Không",
            ]
            for m in modules_data
        ]
        csv_str = export_to_csv_string(headers, rows)
        return Response(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=trends_modules.csv"},
        )

    return {"modules": modules_data}


@router.get("/trends/pairs", summary="Cặp môn hay được xếp cùng trong TKB")
def get_trends_pairs_endpoint(
    semester: str | None = Query(None, description="Mã học kỳ"),
    module: str | None = Query(None, description="Lọc theo mã một môn cụ thể"),
    limit: int = Query(50, ge=1, le=200),
    format: str | None = Query(None, description="Định dạng trả về: json hoặc csv"),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    pairs_data = get_trend_pairs(db=db, semester=semester, module=module, limit=limit)

    if format == "csv":
        headers = ["Học kỳ", "Môn A", "Tên môn A", "Môn B", "Tên môn B", "Số TKB chung"]
        rows = [
            [
                p["semester_id"],
                p["module_a"],
                p["module_a_name"],
                p["module_b"],
                p["module_b_name"],
                p["count"],
            ]
            for p in pairs_data
        ]
        csv_str = export_to_csv_string(headers, rows)
        return Response(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=trends_pairs.csv"},
        )

    return {"pairs": pairs_data}


@router.get("/trends/slots", summary="Bản đồ nhiệt Thứ × Tiết của các lớp được chọn")
def get_trends_slots_endpoint(
    semester: str | None = Query(None, description="Mã học kỳ"),
    program: str | None = Query(None, description="Mã CTĐT hoặc tiền tố khóa"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    format: str | None = Query(None, description="Định dạng trả về: json hoặc csv"),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    slots_data = get_trend_slots(
        db=db,
        semester=semester,
        program=program,
        from_date=from_date,
        to_date=to_date,
    )

    if format == "csv":
        headers = ["Thứ", "Tiết", "Lượt chọn", "Ẩn danh (<5)"]
        weekday_names = {2: "Thứ Hai", 3: "Thứ Ba", 4: "Thứ Tư", 5: "Thứ Năm", 6: "Thứ Sáu", 7: "Thứ Bảy", 8: "Chủ nhật"}
        rows = [
            [
                weekday_names.get(s["weekday"], f"Thứ {s['weekday']}"),
                f"Tiết {s['period']}",
                s["count"],
                "Có" if s["anonymized"] else "Không",
            ]
            for s in slots_data
        ]
        csv_str = export_to_csv_string(headers, rows)
        return Response(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=trends_slots.csv"},
        )

    return {"slots": slots_data}


@router.get("/trends/conflicts", summary="Tỷ lệ TKB có trùng lịch hoặc vi phạm ranh giới")
def get_trends_conflicts_endpoint(
    semester: str | None = Query(None, description="Mã học kỳ"),
    format: str | None = Query(None, description="Định dạng trả về: json hoặc csv"),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    conflicts_data = get_trend_conflicts(db=db, semester=semester)

    if format == "csv":
        headers = ["Tổng số TKB có từ 2 lớp", "Số TKB có trùng lịch", "Tỷ lệ xung đột (%)", "Ẩn danh (<5)"]
        rows = [[
            conflicts_data["total_schedules"],
            conflicts_data["conflicted_schedules"],
            f"{conflicts_data['conflict_rate_pct']}%",
            "Có" if conflicts_data["anonymized"] else "Không",
        ]]
        csv_str = export_to_csv_string(headers, rows)
        return Response(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=trends_conflicts.csv"},
        )

    return conflicts_data


@router.get("/trends/search", summary="Top từ khóa tìm kiếm không có kết quả")
def get_trends_search_endpoint(
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    limit: int = Query(20, ge=1, le=100),
    format: str | None = Query(None, description="Định dạng trả về: json hoặc csv"),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    search_data = get_trend_search_no_results(
        db=db,
        limit=limit,
        from_date=from_date,
        to_date=to_date,
    )

    if format == "csv":
        headers = ["Từ khóa tìm kiếm", "Số lượt tìm không thấy", "Ẩn danh (<5)"]
        rows = [
            [
                s["query"],
                s["count"],
                "Có" if s["anonymized"] else "Không",
            ]
            for s in search_data
        ]
        csv_str = export_to_csv_string(headers, rows)
        return Response(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=trends_search_no_result.csv"},
        )

    return {"searches": search_data}


@router.get("/trends/chat-topics", summary="Chủ đề được hỏi trong cửa sổ hỏi đáp AI")
def get_trends_chat_topics_endpoint(
    days: int = Query(30, ge=1, le=365),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    return {"topics": get_trend_chat_topics(db, days, from_date, to_date)}


@router.get("/trends/classes", summary="Lớp được chọn nhiều của môn học")
def get_trends_classes_endpoint(
    module: str = Query(..., description="Mã học phần"),
    semester: str | None = Query(None, description="Mã học kỳ"),
    format: str | None = Query(None, description="Định dạng trả về: json hoặc csv"),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    classes_data = get_trend_classes_for_module(
        db=db,
        module_code=module,
        semester=semester,
    )

    if format == "csv":
        headers = ["Mã học phần", "Mã lớp", "Số lượt chọn", "Ẩn danh (<5)"]
        rows = [
            [
                module,
                c["class_code"],
                c["count"],
                "Có" if c["anonymized"] else "Không",
            ]
            for c in classes_data
        ]
        csv_str = export_to_csv_string(headers, rows)
        return Response(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=trends_classes_{module}.csv"},
        )

    return {"module_code": module, "classes": classes_data}


# =============================================================================
# Quản trị kiểm duyệt: hàng đợi, duyệt/từ chối/ẩn, từ cấm (Brief A3)
# Yêu cầu vai trò: admin hoặc moderator
# =============================================================================

@router.get("/moderation/queue", response_model=ModerationQueueResponse, summary="Hàng đợi kiểm duyệt (góp ý, bình luận, đánh giá, chợ sách)")
def get_moderation_queue(
    type: str = Query("all", description="Loại nội dung: all | feedback | comment | book | review"),
    status: str = Query("pending", description="Trạng thái: all | pending | approved | rejected | hidden"),
    flagged: bool | None = Query(None, description="Chỉ lấy các mục có cờ cảnh báo"),
    q: str | None = Query(None, description="Từ khóa tìm kiếm"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "moderator"])),
    db: Session = Depends(get_db),
):
    items: list[ModerationQueueItemOut] = []

    # 1. Feedback
    if type in ("all", "feedback"):
        stmt = select(Feedback)
        if status != "all":
            stmt = stmt.where(Feedback.status == status)
        if flagged is True:
            stmt = stmt.where(Feedback.flag_reasons.isnot(None))
        if q:
            stmt = stmt.where(or_(Feedback.message.ilike(f"%{q}%"), Feedback.category.ilike(f"%{q}%"), Feedback.page.ilike(f"%{q}%")))
        for f in db.scalars(stmt):
            flags = f.flag_reasons or []
            if flagged is True and not flags:
                continue
            items.append(
                ModerationQueueItemOut(
                    id=f"feedback_{f.id}",
                    item_id=f.id,
                    type="feedback",
                    title=f"Góp ý: {f.category}",
                    content=f.message or "",
                    rating=f.rating,
                    author=f.contact or "Sinh viên ẩn danh",
                    status=f.status or "pending",
                    flag_reasons=flags,
                    created_at=f.created_at,
                    moderated_by=f.moderated_by,
                    moderated_at=f.moderated_at,
                    moderation_note=f.moderation_note,
                    page=f.page,
                    category=f.category,
                )
            )

    # 2. ModuleComment
    if type in ("all", "comment"):
        stmt = select(ModuleComment)
        if status != "all":
            stmt = stmt.where(ModuleComment.status == status)
        if flagged is True:
            stmt = stmt.where(ModuleComment.flag_reasons.isnot(None))
        if q:
            stmt = stmt.where(or_(ModuleComment.body.ilike(f"%{q}%"), ModuleComment.module_code.ilike(f"%{q}%")))
        for c in db.scalars(stmt):
            flags = c.flag_reasons or []
            if flagged is True and not flags:
                continue
            items.append(
                ModerationQueueItemOut(
                    id=f"comment_{c.id}",
                    item_id=c.id,
                    type="comment",
                    title=f"Bình luận môn {c.module_code}",
                    content=c.body,
                    rating=c.rating,
                    author="Sinh viên ẩn danh",
                    status=c.status,
                    flag_reasons=flags,
                    created_at=c.created_at,
                    moderated_by=c.moderated_by,
                    moderated_at=c.moderated_at,
                    moderation_note=c.moderation_note,
                    module_code=c.module_code,
                )
            )

    # 3. Review (đánh giá học phần của tài khoản sinh viên)
    if type in ("all", "review"):
        stmt = select(Review)
        if status != "all":
            stmt = stmt.where(Review.status == status)
        if flagged is True:
            stmt = stmt.where(Review.moderation_reasons.isnot(None))
        if q:
            stmt = stmt.where(
                or_(
                    Review.content.ilike(f"%{q}%"),
                    Review.professor.ilike(f"%{q}%"),
                    Review.module_code.ilike(f"%{q}%"),
                )
            )
        for r in db.scalars(stmt):
            flags = r.moderation_reasons or []
            if flagged is True and not flags:
                continue
            title = f"Đánh giá môn {r.module_code}" + (f" - GV {r.professor}" if r.professor else "")
            items.append(
                ModerationQueueItemOut(
                    id=f"review_{r.id}",
                    item_id=r.id,
                    type="review",
                    title=title,
                    content=r.content,
                    rating=r.rating,
                    author=r.display_name,
                    status=r.status,
                    flag_reasons=flags,
                    created_at=r.created_at,
                    module_code=r.module_code,
                )
            )

    # Sắp xếp mới nhất lên đầu
    items.sort(key=lambda x: as_utc(x.created_at) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)

    # Thống kê tổng số lượng theo từng loại (chờ duyệt)
    fb_pending = db.scalar(select(func.count(Feedback.id)).where(Feedback.status == "pending")) or 0
    cm_pending = db.scalar(select(func.count(ModuleComment.id)).where(ModuleComment.status == "pending")) or 0
    rv_pending = db.scalar(select(func.count(Review.id)).where(Review.status == "pending")) or 0

    total_count = len(items)
    paged_items = items[(page - 1) * size : page * size]

    return ModerationQueueResponse(
        items=paged_items,
        total=total_count,
        page=page,
        size=size,
        counts={
            "all": fb_pending + cm_pending + rv_pending,
            "feedback": fb_pending,
            "comment": cm_pending,
            "review": rv_pending,
            "book": 0,
        },
    )


@router.post("/moderation/{item_type}/{item_id}/{action}", summary="Duyệt, từ chối hoặc ẩn nội dung")
def moderate_single_item(
    item_type: str,
    item_id: int,
    action: str,
    body: ModerationActionIn | None = None,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "moderator"])),
    db: Session = Depends(get_db),
):
    action = action.lower()
    if action not in ("approve", "reject", "hide"):
        raise HTTPException(status_code=400, detail="Hành động không hợp lệ. Chọn approve, reject hoặc hide.")

    status_map = {"approve": "approved", "reject": "rejected", "hide": "hidden"}
    # Review không có trạng thái hidden riêng; thao tác hide được quy về rejected
    new_status = "rejected" if item_type == "review" and action == "hide" else status_map[action]
    now = datetime.now(timezone.utc)
    note = body.note if body else None

    old_status = None
    if item_type == "feedback":
        item = db.get(Feedback, item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Không tìm thấy góp ý này.")
        old_status = item.status
        item.status = new_status
        item.moderated_by = admin.get("email", "dev@uelcourses.local")
        item.moderated_at = now
        if note:
            item.moderation_note = note
    elif item_type == "comment":
        item = db.get(ModuleComment, item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Không tìm thấy bình luận này.")
        old_status = item.status
        item.status = new_status
        item.moderated_by = admin.get("email", "dev@uelcourses.local")
        item.moderated_at = now
        if note:
            item.moderation_note = note
    elif item_type == "review":
        item = db.get(Review, item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Không tìm thấy đánh giá này.")
        old_status = item.status
        item.status = new_status
    elif item_type == "book":
        raise HTTPException(status_code=404, detail="Tính năng chợ giáo trình sẽ khả dụng ở giai đoạn A7.")
    else:
        raise HTTPException(status_code=400, detail="Loại nội dung không hợp lệ.")

    # Ghi nhật ký quản trị (AuditLog)
    audit = AuditLog(
        actor_type=admin.get("actor_type", "dev"),
        actor_id=admin.get("email", "dev@uelcourses.local"),
        action=f"moderation_{action}_{item_type}",
        entity_type=item_type,
        entity_id=str(item_id),
        before={"status": old_status},
        after={"status": new_status, "note": note},
        created_at=now,
    )
    db.add(audit)
    db.commit()

    return {
        "success": True,
        "type": item_type,
        "id": item_id,
        "status": new_status,
        "moderated_by": admin.get("email"),
    }


@router.post("/moderation/bulk", summary="Thao tác hàng loạt trên hàng đợi kiểm duyệt")
def bulk_moderate_items(
    body: BulkModerationIn,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "moderator"])),
    db: Session = Depends(get_db),
):
    action = body.action.lower()
    status_map = {"approve": "approved", "reject": "rejected", "hide": "hidden"}
    if action not in status_map:
        raise HTTPException(status_code=400, detail="Hành động không hợp lệ.")
    new_status = status_map[action]
    now = datetime.now(timezone.utc)
    updated_count = 0

    for target in body.items:
        old_status = None
        if target.type == "feedback":
            fb = db.get(Feedback, target.id)
            if fb:
                old_status = fb.status
                fb.status = new_status
                fb.moderated_by = admin.get("email", "dev@uelcourses.local")
                fb.moderated_at = now
                if body.note:
                    fb.moderation_note = body.note
                updated_count += 1
        elif target.type == "comment":
            mc = db.get(ModuleComment, target.id)
            if mc:
                old_status = mc.status
                mc.status = new_status
                mc.moderated_by = admin.get("email", "dev@uelcourses.local")
                mc.moderated_at = now
                if body.note:
                    mc.moderation_note = body.note
                updated_count += 1

        if old_status is not None:
            db.add(
                AuditLog(
                    actor_type=admin.get("actor_type", "dev"),
                    actor_id=admin.get("email", "dev@uelcourses.local"),
                    action=f"moderation_bulk_{action}_{target.type}",
                    entity_type=target.type,
                    entity_id=str(target.id),
                    before={"status": old_status},
                    after={"status": new_status, "note": body.note},
                    created_at=now,
                )
            )

    db.commit()
    return {"success": True, "updated_count": updated_count}


@router.get("/banned-terms", response_model=list[BannedTermOut], summary="Danh sách từ cấm kiểm duyệt")
def list_banned_terms(
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "moderator"])),
    db: Session = Depends(get_db),
):
    return list(db.scalars(select(BannedTerm).order_by(BannedTerm.id.desc())))


@router.post("/banned-terms", response_model=BannedTermOut, status_code=status.HTTP_201_CREATED, summary="Thêm từ cấm")
def create_banned_term(
    body: BannedTermIn,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "moderator"])),
    db: Session = Depends(get_db),
):
    norm = body.term.strip().lower()
    existing = db.scalar(select(BannedTerm).where(BannedTerm.term == norm))
    if existing:
        existing.severity = body.severity
        db.commit()
        db.refresh(existing)
        return existing

    term_obj = BannedTerm(term=norm, severity=body.severity)
    db.add(term_obj)
    db.flush()

    audit = AuditLog(
        actor_type=admin.get("actor_type", "dev"),
        actor_id=admin.get("email", "dev@uelcourses.local"),
        action="create_banned_term",
        entity_type="banned_term",
        entity_id=str(term_obj.id),
        before=None,
        after={"term": norm, "severity": body.severity},
        created_at=datetime.now(timezone.utc),
    )
    db.add(audit)
    db.commit()
    db.refresh(term_obj)
    return term_obj


@router.delete("/banned-terms/{term_id}", summary="Xóa từ cấm")
def delete_banned_term(
    term_id: int,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "moderator"])),
    db: Session = Depends(get_db),
):
    term_obj = db.get(BannedTerm, term_id)
    if not term_obj:
        raise HTTPException(status_code=404, detail="Không tìm thấy từ cấm này.")

    audit = AuditLog(
        actor_type=admin.get("actor_type", "dev"),
        actor_id=admin.get("email", "dev@uelcourses.local"),
        action="delete_banned_term",
        entity_type="banned_term",
        entity_id=str(term_id),
        before={"term": term_obj.term, "severity": term_obj.severity},
        after=None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(audit)
    db.delete(term_obj)
    db.commit()
    return {"success": True, "id": term_id}


@router.get("/bans", response_model=BanListOut, summary="Danh sách tài khoản và IP bị khóa")
def list_bans(
    status: str = Query("active", description="Trạng thái: active | lifted | expired | all"),
    scope: str = Query("all", description="Phạm vi nguồn khóa IP: all | system | admin"),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "moderator"])),
    db: Session = Depends(get_db),
):
    if status not in ("active", "lifted", "expired", "all"):
        raise HTTPException(status_code=400, detail="Trạng thái không hợp lệ. Chọn active, lifted, expired hoặc all.")
    if scope not in ("all", "system", "admin"):
        raise HTTPException(status_code=400, detail="Phạm vi không hợp lệ. Chọn all, system hoặc admin.")

    now = datetime.now(timezone.utc)

    # 1. Danh sách tài khoản bị khóa (User không lưu lịch sử sau khi gỡ ban)
    users_out: list[BannedUserOut] = []
    if status != "lifted":
        user_stmt = select(User).where(User.ban_level.isnot(None)).order_by(User.banned_at.desc(), User.id.desc())
        for u in db.scalars(user_stmt):
            active = is_user_ban_active(u, now)
            if status == "active" and not active:
                continue
            if status == "expired" and not (u.ban_level == "temporary" and not active):
                continue
            users_out.append(
                BannedUserOut(
                    user_id=u.id,
                    display_name=u.display_name,
                    provider=u.provider,
                    email=u.email,
                    ban_level=u.ban_level,
                    ban_reason=u.ban_reason,
                    banned_at=u.banned_at,
                    ban_expires_at=u.ban_expires_at,
                    ban_notified_email_at=u.ban_notified_email_at,
                )
            )

    # 2. Danh sách IP bị khóa (lọc theo scope và status)
    ip_stmt = select(BannedIp).order_by(BannedIp.created_at.desc(), BannedIp.id.desc())
    if scope == "system":
        ip_stmt = ip_stmt.where(BannedIp.created_by == "system")
    elif scope == "admin":
        ip_stmt = ip_stmt.where(BannedIp.created_by != "system")

    ips_out: list[BannedIpOut] = []
    for row in db.scalars(ip_stmt):
        exp = as_utc(row.expires_at)
        is_lifted = row.lifted_at is not None
        is_active_ip = (not is_lifted) and (
            row.level == "permanent" or (row.level == "temporary" and exp is not None and exp > now)
        )
        is_expired_ip = (not is_lifted) and row.level == "temporary" and (exp is None or exp <= now)

        if status == "active" and not is_active_ip:
            continue
        if status == "lifted" and not is_lifted:
            continue
        if status == "expired" and not is_expired_ip:
            continue

        ips_out.append(
            BannedIpOut(
                id=row.id,
                ip_hash=row.ip_hash,
                level=row.level,
                reason=row.reason,
                created_by=row.created_by,
                created_at=row.created_at,
                expires_at=row.expires_at,
                lifted_at=row.lifted_at,
                lifted_by=row.lifted_by,
                related_user_id=row.related_user_id,
            )
        )

    return BanListOut(users=users_out, banned_ips=ips_out)


@router.post("/bans/{user_id}/lift", summary="Gỡ khóa tài khoản và các IP liên quan")
def lift_user_ban(
    user_id: int,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "moderator"])),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng này.")

    now = datetime.now(timezone.utc)
    old_level = user.ban_level
    old_reason = user.ban_reason

    user.ban_level = None
    user.ban_reason = None
    user.banned_at = None
    user.ban_expires_at = None
    user.ban_cycle_reset_at = now

    lifted_by = (admin.get("email") or "admin")[:32]
    related_ips = list(
        db.scalars(select(BannedIp).where(BannedIp.related_user_id == user_id, BannedIp.lifted_at.is_(None)))
    )
    for ip_ban in related_ips:
        ip_ban.lifted_at = now
        ip_ban.lifted_by = lifted_by

    db.add(
        AuditLog(
            actor_type=admin.get("actor_type", "dev"),
            actor_id=admin.get("email", "dev@uelcourses.local"),
            action="lift_ban",
            entity_type="user",
            entity_id=str(user_id),
            before={"ban_level": old_level, "ban_reason": old_reason},
            after={"ban_level": None, "lifted_ip_count": len(related_ips)},
            created_at=now,
        )
    )
    db.commit()
    return {"success": True, "user_id": user_id}


@router.post("/bans/{user_id}/escalate", summary="Nâng mức khóa tài khoản lên vĩnh viễn")
def escalate_user_ban(
    user_id: int,
    body: ModerationActionIn | None = None,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "moderator"])),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng này.")
    if not user.ban_level:
        raise HTTPException(status_code=400, detail="Người dùng hiện không bị khóa.")

    now = datetime.now(timezone.utc)
    old_level = user.ban_level
    old_reason = user.ban_reason
    note = body.note.strip() if body and body.note and body.note.strip() else None

    user.ban_level = "permanent"
    user.ban_expires_at = None
    if note:
        user.ban_reason = f"{old_reason} | {note}" if old_reason else note

    db.add(
        AuditLog(
            actor_type=admin.get("actor_type", "dev"),
            actor_id=admin.get("email", "dev@uelcourses.local"),
            action="escalate_ban_permanent",
            entity_type="user",
            entity_id=str(user_id),
            before={"ban_level": old_level, "ban_reason": old_reason},
            after={"ban_level": "permanent", "ban_reason": user.ban_reason, "note": note},
            created_at=now,
        )
    )
    db.commit()
    return {"success": True, "user_id": user_id, "ban_level": "permanent"}


@router.post("/bans/{user_id}/notify", summary="Gửi email thông báo khóa tài khoản cho sinh viên")
def notify_user_ban(
    user_id: int,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "moderator"])),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng này.")

    if not user.email:
        return {"success": False, "message": "Người dùng chưa cấp email, không thể gửi thông báo."}

    res = send_ban_email(
        to_email=user.email,
        display_name=user.display_name,
        level=user.ban_level or "temporary",
        reason=user.ban_reason,
        expires_at=user.ban_expires_at,
    )
    if not res.get("sent"):
        if res.get("reason") == "smtp_not_configured":
            return {
                "success": False,
                "message": "Chưa cấu hình SMTP, không thể gửi email tự động. Vui lòng liên hệ trực tiếp.",
            }
        return {
            "success": False,
            "message": "Không thể gửi email thông báo lúc này. Vui lòng liên hệ trực tiếp.",
        }

    now = datetime.now(timezone.utc)
    user.ban_notified_email_at = now
    db.add(
        AuditLog(
            actor_type=admin.get("actor_type", "dev"),
            actor_id=admin.get("email", "dev@uelcourses.local"),
            action="notify_ban_email",
            entity_type="user",
            entity_id=str(user_id),
            before=None,
            after={"ban_level": user.ban_level, "notified_at": now.isoformat()},
            created_at=now,
        )
    )
    db.commit()
    return {"success": True, "message": "Đã gửi email thông báo."}


# =============================================================================
# Quản trị dữ liệu học phần (khoa/bộ môn) & Đề cương (Brief A4)
# Yêu cầu vai trò: admin hoặc data_editor
# =============================================================================

@router.get(
    "/data/faculty-review",
    response_model=FacultyReviewResponse,
    summary="Danh sách học phần cần rà soát hoặc duyệt khoa/bộ môn",
)
def get_faculty_review_endpoint(
    kind: str = Query("needs_review", description="needs_review | prefix_conflict | no_source | admin_modified"),
    q: str | None = Query(None, description="Tìm theo mã môn hoặc tên học phần"),
    prefix: str | None = Query(None, description="Lọc theo tiền tố 2 chữ cái (vd AA, BB, IE...)"),
    faculty: str | None = Query(None, description="Lọc theo khoa"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Lấy danh sách học phần cần duyệt dữ liệu khoa / bộ môn từ hàm audit chạy trực tiếp trên DB (có cache 60s)."""
    return get_faculty_review_data(
        db,
        kind=kind,
        q=q,
        prefix=prefix,
        faculty=faculty,
        page=page,
        size=size,
    )


@router.patch("/modules/{code}", summary="Chỉnh sửa thủ công khoa/bộ môn của học phần (nguồn admin)")
def patch_module_faculty_endpoint(
    code: str,
    body: ModuleFacultyPatchIn,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Cập nhật thủ công khoa/bộ môn cho học phần:
    - Ghi nhận `faculty_source='admin'`, `faculty_set_by`, `faculty_set_at`.
    - Kiểm tra faculty thuộc 9 khoa chuẩn hoặc Phòng Đào tạo.
    - Cập nhật search_text và ghi nhật ký AuditLog.
    """
    code_norm = code.strip().upper()
    module = db.get(Module, code_norm)
    if not module:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy học phần '{code}'.")

    if body.faculty:
        fac_clean = body.faculty.strip()
        if fac_clean and fac_clean not in CANONICAL_FACULTIES_VI:
            raise HTTPException(
                status_code=422,
                detail=f"Khoa '{body.faculty}' không hợp lệ. Phải thuộc danh sách 9 khoa chuẩn hoặc Phòng Đào tạo.",
            )
    else:
        fac_clean = None

    dept_clean = body.department.strip() if body.department else None

    before_state = {
        "faculty": module.faculty,
        "department": module.department,
        "faculty_source": module.faculty_source,
    }

    now = datetime.now(timezone.utc)
    module.faculty = fac_clean
    module.department = dept_clean
    module.faculty_source = "admin"
    module.faculty_set_by = admin.get("email", "dev@uelcourses.local")
    module.faculty_set_at = now
    module.search_text = normalize_search(
        f"{module.code} {module.name} {module.name_en or ''} {module.faculty or ''} {module.department or ''}"
    )

    after_state = {
        "faculty": module.faculty,
        "department": module.department,
        "faculty_source": "admin",
    }

    audit = AuditLog(
        actor_type=admin.get("actor_type", "dev"),
        actor_id=admin.get("email", "dev@uelcourses.local"),
        action="update_module_faculty",
        entity_type="module",
        entity_id=module.code,
        before=before_state,
        after=after_state,
        created_at=now,
    )
    db.add(audit)
    db.commit()
    db.refresh(module)
    invalidate_audit_cache()

    return {
        "success": True,
        "code": module.code,
        "name": module.name,
        "faculty": module.faculty,
        "department": module.department,
        "faculty_source": module.faculty_source,
        "faculty_set_by": module.faculty_set_by,
        "faculty_set_at": module.faculty_set_at.isoformat() if module.faculty_set_at else None,
    }


@router.post("/data/faculty-review/bulk", summary="Thao tác hàng loạt trên học phần cần duyệt khoa/bộ môn")
def bulk_faculty_review_endpoint(
    body: BulkFacultyReviewIn,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Áp dụng hàng loạt đề xuất khoa hoặc đặt khoa cho nhiều học phần cùng lúc."""
    action = body.action.lower()
    now = datetime.now(timezone.utc)
    updated_count = 0

    if action == "set":
        if not body.faculty:
            raise HTTPException(status_code=422, detail="Vui lòng cung cấp khoa cần đặt.")
        fac_clean = body.faculty.strip()
        if fac_clean not in CANONICAL_FACULTIES_VI:
            raise HTTPException(
                status_code=422,
                detail=f"Khoa '{body.faculty}' không hợp lệ. Phải thuộc danh sách 9 khoa chuẩn hoặc Phòng Đào tạo.",
            )
        dept_clean = body.department.strip() if body.department else None

        for c_code in body.codes:
            code_norm = c_code.strip().upper()
            m = db.get(Module, code_norm)
            if not m:
                continue

            before_state = {
                "faculty": m.faculty,
                "department": m.department,
                "faculty_source": m.faculty_source,
            }
            m.faculty = fac_clean
            if body.department is not None:
                m.department = dept_clean
            m.faculty_source = "admin"
            m.faculty_set_by = admin.get("email", "dev@uelcourses.local")
            m.faculty_set_at = now
            m.search_text = normalize_search(f"{m.code} {m.name} {m.name_en or ''} {m.faculty or ''} {m.department or ''}")

            after_state = {
                "faculty": m.faculty,
                "department": m.department,
                "faculty_source": "admin",
            }
            db.add(
                AuditLog(
                    actor_type=admin.get("actor_type", "dev"),
                    actor_id=admin.get("email", "dev@uelcourses.local"),
                    action="bulk_set_module_faculty",
                    entity_type="module",
                    entity_id=m.code,
                    before=before_state,
                    after=after_state,
                    created_at=now,
                )
            )
            updated_count += 1

    elif action == "accept_suggestion":
        audit_rows, _, _, _ = get_cached_audit_data(db)
        audit_map = {r["code"].strip().upper(): r for r in audit_rows}

        for c_code in body.codes:
            code_norm = c_code.strip().upper()
            m = db.get(Module, code_norm)
            if not m:
                continue

            r = audit_map.get(code_norm)
            if not r:
                continue

            sug_fac = None
            if r.get("is_prefix_conflict"):
                sug_fac = r.get("faculty_theo_tiền_tố")
            elif r.get("faculty_theo_đề_cương"):
                sug_fac = r.get("faculty_theo_đề_cương")
            elif r.get("faculty_theo_tiền_tố"):
                sug_fac = r.get("faculty_theo_tiền_tố")
            elif r.get("faculty_chuẩn"):
                sug_fac = r.get("faculty_chuẩn")

            if not sug_fac:
                continue

            sug_dept = r.get("department_theo_đề_cương") or r.get("department_mới") or m.department

            before_state = {
                "faculty": m.faculty,
                "department": m.department,
                "faculty_source": m.faculty_source,
            }
            m.faculty = sug_fac
            m.department = sug_dept
            m.faculty_source = "admin"
            m.faculty_set_by = admin.get("email", "dev@uelcourses.local")
            m.faculty_set_at = now
            m.search_text = normalize_search(f"{m.code} {m.name} {m.name_en or ''} {m.faculty or ''} {m.department or ''}")

            after_state = {
                "faculty": m.faculty,
                "department": m.department,
                "faculty_source": "admin",
            }
            db.add(
                AuditLog(
                    actor_type=admin.get("actor_type", "dev"),
                    actor_id=admin.get("email", "dev@uelcourses.local"),
                    action="bulk_accept_suggestion_module_faculty",
                    entity_type="module",
                    entity_id=m.code,
                    before=before_state,
                    after=after_state,
                    created_at=now,
                )
            )
            updated_count += 1

    db.commit()
    invalidate_audit_cache()
    return {"success": True, "updated_count": updated_count}


@router.delete("/modules/{code}/faculty-override", summary="Xóa ghi đè quản trị và tính lại khoa tự động")
def delete_module_faculty_override_endpoint(
    code: str,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Hủy ghi đè quản trị (`faculty_source='admin'`), kích hoạt lại cơ chế tự động lấy khoa từ đề cương/tiền tố."""
    code_norm = code.strip().upper()
    module = db.get(Module, code_norm)
    if not module:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy học phần '{code}'.")

    before_state = {
        "faculty": module.faculty,
        "department": module.department,
        "faculty_source": module.faculty_source,
    }

    if module.faculty_source == "admin":
        module.faculty = None
        module.department = None
        module.faculty_source = None
        module.faculty_set_by = None
        module.faculty_set_at = None

    target_fac, target_dept = resolve_module_faculty(db, code_norm, existing_mods={code_norm: module})
    module.faculty = target_fac
    module.department = target_dept
    module.search_text = normalize_search(
        f"{module.code} {module.name} {module.name_en or ''} {module.faculty or ''} {module.department or ''}"
    )

    now = datetime.now(timezone.utc)
    after_state = {
        "faculty": module.faculty,
        "department": module.department,
        "faculty_source": module.faculty_source,
    }

    audit = AuditLog(
        actor_type=admin.get("actor_type", "dev"),
        actor_id=admin.get("email", "dev@uelcourses.local"),
        action="delete_module_faculty_override",
        entity_type="module",
        entity_id=module.code,
        before=before_state,
        after=after_state,
        created_at=now,
    )
    db.add(audit)
    db.commit()
    db.refresh(module)
    invalidate_audit_cache()

    return {
        "success": True,
        "code": module.code,
        "faculty": module.faculty,
        "department": module.department,
        "faculty_source": module.faculty_source,
    }


@router.get("/faculties", response_model=FacultiesResponse, summary="Danh sách khoa chuẩn và bộ môn đã biết")
def get_faculties_endpoint(
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Trả về danh sách 9 khoa chuẩn + Phòng Đào tạo cùng danh sách bộ môn tương ứng để phục vụ dropdown chọn."""
    return get_faculties_and_departments(db)


@router.get("/outlines/coverage", response_model=OutlineCoverageResponse, summary="Thống kê độ phủ đề cương")
def get_outlines_coverage_endpoint(
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Thống kê tổng số môn có đề cương, tỷ lệ % tổng thể, theo từng khoa và theo học kỳ có lớp mở."""
    return get_outlines_coverage(db)


@router.get("/outlines/missing", response_model=OutlineMissingResponse, summary="Danh sách môn còn thiếu đề cương")
def get_outlines_missing_endpoint(
    sort: str = Query("open_classes", description="Sắp xếp: open_classes (số lớp mở giảm dần) | code"),
    q: str | None = Query(None, description="Tìm theo mã môn hoặc tên học phần"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Liệt kê các môn chưa có đề cương, kèm số lớp mở và thông tin bản tương ứng có đề cương không."""
    return get_outlines_missing(db, sort=sort, q=q, page=page, size=size)


@router.get("/outlines/ocr-pending", response_model=OutlineOcrPendingResponse, summary="Danh sách tài liệu scan chờ OCR")
def get_outlines_ocr_pending_endpoint(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Danh sách các file scan cần chạy OCR (ocr_status='pending')."""
    return get_outlines_ocr_pending(db, page=page, size=size)


@router.get("/outlines/drive-links", response_model=OutlineDriveLinkResponse, summary="Danh sách link Google Drive chờ đồng ý")
def get_outlines_drive_links_endpoint(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Liệt kê các link Google Docs/Drive đề cương chưa tải (chỉ liệt kê, KHÔNG tải - cần chủ dự án đồng ý)."""
    return get_outlines_drive_links(db, page=page, size=size)


# =============================================================================
# Quản trị Lịch năm học & Học kỳ (Brief A5)
# Yêu cầu vai trò: admin hoặc data_editor
# =============================================================================

@router.get(
    "/calendar/events",
    response_model=CalendarEventsResponse,
    summary="Danh sách sự kiện năm học (quản trị)",
)
def list_admin_calendar_events(
    year: str | None = Query(None, description="Lọc theo năm học (vd 2026-2027)"),
    cohort: str | None = Query(None, description="Lọc theo khóa (vd K24, all)"),
    type: str | None = Query(None, description="Lọc theo loại sự kiện (vd teaching)"),
    verified: bool | None = Query(None, description="Lọc theo trạng thái đã kiểm chứng"),
    semester_id: str | None = Query(None, description="Lọc theo mã học kỳ (vd 2026-2027-1)"),
    q: str | None = Query(None, description="Tìm theo tên sự kiện hoặc ghi chú"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Liệt kê và lọc sự kiện năm học phục vụ giao diện quản trị."""
    # Danh sách năm học và loại sự kiện đã có trong DB
    years = [
        y
        for (y,) in db.execute(
            select(AcademicEvent.academic_year)
            .distinct()
            .order_by(AcademicEvent.academic_year.desc())
        ).all()
        if y
    ]
    kinds = [
        k
        for (k,) in db.execute(
            select(AcademicEvent.kind).distinct().order_by(AcademicEvent.kind.asc())
        ).all()
        if k
    ]

    stmt = select(AcademicEvent)
    if year:
        stmt = stmt.where(AcademicEvent.academic_year == year)
    if type:
        stmt = stmt.where(AcademicEvent.kind == type)
    if verified is not None:
        stmt = stmt.where(AcademicEvent.verified == verified)
    if semester_id:
        stmt = stmt.where(AcademicEvent.semester_id == semester_id)
    if q:
        search_kw = f"%{q.strip()}%"
        stmt = stmt.where(or_(AcademicEvent.title.ilike(search_kw), AcademicEvent.note.ilike(search_kw)))

    stmt = stmt.order_by(AcademicEvent.start_date.asc(), AcademicEvent.id.asc())
    events = list(db.scalars(stmt))

    if cohort:
        events = [e for e in events if _matches_cohort(e.cohorts, cohort)]

    total = len(events)
    paged = events[(page - 1) * size : page * size]

    return CalendarEventsResponse(
        items=[AcademicEventOut.model_validate(e) for e in paged],
        total=total,
        page=page,
        size=size,
        years=years,
        kinds=kinds,
    )


@router.post(
    "/calendar/events",
    response_model=AcademicEventOut,
    status_code=status.HTTP_201_CREATED,
    summary="Thêm sự kiện năm học mới",
)
def create_admin_calendar_event(
    body: AcademicEventIn,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Tạo mới một sự kiện năm học, kiểm tra hợp lệ dữ liệu và ghi nhật ký AuditLog."""
    # 1. Kiểm tra ngày
    if body.end_date is not None and body.end_date < body.start_date:
        raise HTTPException(
            status_code=422,
            detail="Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.",
        )

    # 2. Kiểm tra loại sự kiện
    kind_clean = body.kind.strip()
    if kind_clean not in VALID_EVENT_KINDS:
        raise HTTPException(
            status_code=422,
            detail=f"Loại sự kiện '{body.kind}' không hợp lệ. Phải thuộc danh sách hỗ trợ.",
        )

    # 3. Kiểm tra khóa áp dụng
    cohorts_clean: list[str] = []
    for c in body.cohorts:
        c_str = str(c).strip()
        if c_str == "all" or re.match(r"^K\d{2}$", c_str):
            cohorts_clean.append(c_str)
        else:
            raise HTTPException(
                status_code=422,
                detail=f"Mã khóa '{c}' không hợp lệ. Phải có định dạng 'K22', 'K24' hoặc 'all'.",
            )

    now = datetime.now(timezone.utc)
    actor_email = admin.get("email", "dev@uelcourses.local")

    evt = AcademicEvent(
        academic_year=body.academic_year.strip(),
        kind=kind_clean,
        title=body.title.strip(),
        start_date=body.start_date,
        end_date=body.end_date,
        semester_id=body.semester_id.strip() if body.semester_id else None,
        cohorts=cohorts_clean if cohorts_clean else ["all"],
        note=body.note.strip() if body.note else None,
        verified=body.verified,
        source=body.source.strip() if body.source else "TB 223/TB-ĐHKTL-ĐT",
        updated_by=actor_email,
        updated_at=now,
    )
    db.add(evt)
    db.flush()

    # Ghi nhật ký quản trị AuditLog
    audit = AuditLog(
        actor_type=admin.get("actor_type", "dev"),
        actor_id=actor_email,
        action="create_calendar_event",
        entity_type="academic_event",
        entity_id=str(evt.id),
        before=None,
        after={
            "title": evt.title,
            "kind": evt.kind,
            "academic_year": evt.academic_year,
            "start_date": str(evt.start_date),
            "end_date": str(evt.end_date) if evt.end_date else None,
            "cohorts": evt.cohorts,
            "verified": evt.verified,
        },
        created_at=now,
    )
    db.add(audit)
    db.commit()
    clear_calendar_cache()
    db.refresh(evt)

    return AcademicEventOut.model_validate(evt)


@router.patch(
    "/calendar/events/{event_id}",
    response_model=AcademicEventOut,
    summary="Chỉnh sửa sự kiện năm học",
)
def patch_admin_calendar_event(
    event_id: int,
    body: AcademicEventPatchIn,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Cập nhật thông tin sự kiện năm học và ghi nhật ký AuditLog."""
    evt = db.get(AcademicEvent, event_id)
    if not evt:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự kiện này.")

    # 1. Kiểm tra ngày
    target_start = body.start_date if body.start_date is not None else evt.start_date
    target_end = body.end_date if body.end_date is not None else evt.end_date
    if target_end is not None and target_end < target_start:
        raise HTTPException(
            status_code=422,
            detail="Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.",
        )

    # 2. Kiểm tra loại sự kiện
    if body.kind is not None:
        kind_clean = body.kind.strip()
        if kind_clean not in VALID_EVENT_KINDS:
            raise HTTPException(
                status_code=422,
                detail=f"Loại sự kiện '{body.kind}' không hợp lệ.",
            )
        evt.kind = kind_clean

    # 3. Kiểm tra khóa
    if body.cohorts is not None:
        cohorts_clean: list[str] = []
        for c in body.cohorts:
            c_str = str(c).strip()
            if c_str == "all" or re.match(r"^K\d{2}$", c_str):
                cohorts_clean.append(c_str)
            else:
                raise HTTPException(
                    status_code=422,
                    detail=f"Mã khóa '{c}' không hợp lệ. Phải có định dạng 'K22' hoặc 'all'.",
                )
        evt.cohorts = cohorts_clean

    before_state = {
        "title": evt.title,
        "kind": evt.kind,
        "academic_year": evt.academic_year,
        "start_date": str(evt.start_date),
        "end_date": str(evt.end_date) if evt.end_date else None,
        "cohorts": evt.cohorts,
        "verified": evt.verified,
        "semester_id": evt.semester_id,
    }

    if body.academic_year is not None:
        evt.academic_year = body.academic_year.strip()
    if body.title is not None:
        evt.title = body.title.strip()
    if body.start_date is not None:
        evt.start_date = body.start_date
    if body.end_date is not None:
        evt.end_date = body.end_date
    if body.semester_id is not None:
        evt.semester_id = body.semester_id.strip() if body.semester_id else None
    if body.note is not None:
        evt.note = body.note.strip() if body.note else None
    if body.verified is not None:
        evt.verified = body.verified
    if body.source is not None:
        evt.source = body.source.strip()

    now = datetime.now(timezone.utc)
    actor_email = admin.get("email", "dev@uelcourses.local")
    evt.updated_by = actor_email
    evt.updated_at = now

    after_state = {
        "title": evt.title,
        "kind": evt.kind,
        "academic_year": evt.academic_year,
        "start_date": str(evt.start_date),
        "end_date": str(evt.end_date) if evt.end_date else None,
        "cohorts": evt.cohorts,
        "verified": evt.verified,
        "semester_id": evt.semester_id,
    }

    audit = AuditLog(
        actor_type=admin.get("actor_type", "dev"),
        actor_id=actor_email,
        action="update_calendar_event",
        entity_type="academic_event",
        entity_id=str(event_id),
        before=before_state,
        after=after_state,
        created_at=now,
    )
    db.add(audit)
    db.commit()
    clear_calendar_cache()
    db.refresh(evt)

    return AcademicEventOut.model_validate(evt)


@router.delete(
    "/calendar/events/{event_id}",
    summary="Xóa sự kiện năm học",
)
def delete_admin_calendar_event(
    event_id: int,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Xóa sự kiện năm học kèm ghi nhật ký AuditLog."""
    evt = db.get(AcademicEvent, event_id)
    if not evt:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự kiện này.")

    before_state = {
        "title": evt.title,
        "kind": evt.kind,
        "academic_year": evt.academic_year,
        "start_date": str(evt.start_date),
        "end_date": str(evt.end_date) if evt.end_date else None,
        "cohorts": evt.cohorts,
        "verified": evt.verified,
    }

    now = datetime.now(timezone.utc)
    actor_email = admin.get("email", "dev@uelcourses.local")

    audit = AuditLog(
        actor_type=admin.get("actor_type", "dev"),
        actor_id=actor_email,
        action="delete_calendar_event",
        entity_type="academic_event",
        entity_id=str(event_id),
        before=before_state,
        after=None,
        created_at=now,
    )
    db.add(audit)
    db.delete(evt)
    db.commit()
    clear_calendar_cache()

    return {"success": True, "id": event_id}


@router.post(
    "/calendar/import",
    summary="Nhập sự kiện năm học từ file/chuỗi JSON seed",
)
def import_admin_calendar(
    body: list[dict[str, Any]],
    dry_run: bool = Query(False, description="Nếu true: chỉ xem trước khác biệt và kiểm tra, không ghi vào DB"),
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Nhập danh sách sự kiện năm học đúng định dạng seed JSON:
    - dry_run=true: tính toán khác biệt và trả thông tin xem trước.
    - dry_run=false: nạp thật, cập nhật DB và ghi nhật ký AuditLog.
    """
    if not isinstance(body, list):
        raise HTTPException(status_code=422, detail="Dữ liệu nạp phải là một mảng JSON các sự kiện.")

    # Kiểm tra tính hợp lệ cơ bản của các dòng
    for idx, item in enumerate(body):
        if not isinstance(item, dict):
            raise HTTPException(status_code=422, detail=f"Phần tử thứ {idx} không phải là đối tượng JSON.")
        if not item.get("academic_year") or not item.get("kind") or not item.get("title") or not item.get("start_date"):
            raise HTTPException(
                status_code=422,
                detail=f"Phần tử thứ {idx} thiếu các trường bắt buộc (academic_year, kind, title, start_date).",
            )
        s_date_str = str(item["start_date"])
        e_date_str = item.get("end_date")
        if e_date_str:
            try:
                s_d = date.fromisoformat(s_date_str)
                e_d = date.fromisoformat(str(e_date_str))
                if e_d < s_d:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Phần tử '{item.get('title')}': ngày kết thúc phải >= ngày bắt đầu.",
                    )
            except ValueError:
                raise HTTPException(status_code=422, detail=f"Phần tử '{item.get('title')}': định dạng ngày không hợp lệ.")

    actor_email = admin.get("email", "dev@uelcourses.local")
    return import_academic_calendar(
        db,
        raw_events=body,
        dry_run=dry_run,
        actor=actor_email,
    )


@router.get(
    "/semesters",
    response_model=list[SemesterAdminOut],
    summary="Danh sách học kỳ cho quản trị viên",
)
def list_admin_semesters(
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Liệt kê danh sách tất cả học kỳ kèm thời gian học thực tế và cờ hiện tại."""
    sems = list(db.scalars(select(Semester).order_by(Semester.year.desc(), Semester.term.desc())))
    cur_id = current_semester_id(sems)

    res: list[SemesterAdminOut] = []
    for s in sems:
        is_cur = (s.id == cur_id) if s.is_current_override is None else bool(s.is_current_override)
        res.append(
            SemesterAdminOut(
                id=s.id,
                name=s.name,
                year=s.year,
                term=s.term,
                is_current=is_cur,
                start_date=s.start_date,
                end_date=s.end_date,
                teaching_start=s.teaching_start,
                teaching_end=s.teaching_end,
                is_current_override=s.is_current_override,
            )
        )
    return res


@router.patch(
    "/semesters/{sem_id}",
    response_model=SemesterAdminOut,
    summary="Chỉnh sửa thông tin học kỳ (đặt kỳ hiện tại, thời gian học thật, tên)",
)
def patch_admin_semester(
    sem_id: str,
    body: SemesterAdminPatchIn,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin", "data_editor"])),
    db: Session = Depends(get_db),
):
    """Cập nhật thông tin học kỳ:
    - `is_current`: nếu True -> đặt kỳ này làm hiện tại (is_current_override=True), các kỳ khác False.
    - `teaching_start`, `teaching_end`: thời gian học thực tế lưu DB.
    - `name`: tên hiển thị.
    - Ghi nhật ký AuditLog và xóa cache lịch.
    """
    sem = db.get(Semester, sem_id)
    if not sem:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy học kỳ '{sem_id}'.")

    # Kiểm tra ngày học thực tế
    target_start = body.teaching_start if body.teaching_start is not None else sem.teaching_start
    target_end = body.teaching_end if body.teaching_end is not None else sem.teaching_end
    if target_start and target_end and target_end < target_start:
        raise HTTPException(
            status_code=422,
            detail="Ngày kết thúc học thực tế phải lớn hơn hoặc bằng ngày bắt đầu.",
        )

    before_state = {
        "name": sem.name,
        "is_current_override": sem.is_current_override,
        "teaching_start": str(sem.teaching_start) if sem.teaching_start else None,
        "teaching_end": str(sem.teaching_end) if sem.teaching_end else None,
    }

    if body.name is not None:
        name_clean = body.name.strip()
        if not name_clean:
            raise HTTPException(status_code=422, detail="Tên học kỳ không được để trống.")
        sem.name = name_clean

    if body.teaching_start is not None:
        sem.teaching_start = body.teaching_start
    if body.teaching_end is not None:
        sem.teaching_end = body.teaching_end

    if body.is_current is not None:
        if body.is_current:
            # Đặt kỳ này là hiện tại -> tất cả kỳ khác là false
            all_sems = db.scalars(select(Semester)).all()
            for s in all_sems:
                if s.id == sem_id:
                    s.is_current_override = True
                else:
                    s.is_current_override = False
        else:
            sem.is_current_override = False

    now = datetime.now(timezone.utc)
    actor_email = admin.get("email", "dev@uelcourses.local")

    after_state = {
        "name": sem.name,
        "is_current_override": sem.is_current_override,
        "teaching_start": str(sem.teaching_start) if sem.teaching_start else None,
        "teaching_end": str(sem.teaching_end) if sem.teaching_end else None,
    }

    audit = AuditLog(
        actor_type=admin.get("actor_type", "dev"),
        actor_id=actor_email,
        action="update_semester",
        entity_type="semester",
        entity_id=sem_id,
        before=before_state,
        after=after_state,
        created_at=now,
    )
    db.add(audit)
    db.commit()
    clear_calendar_cache()
    db.refresh(sem)

    all_sems_after = list(db.scalars(select(Semester)).all())
    cur_id = current_semester_id(all_sems_after)
    is_cur = (sem.id == cur_id) if sem.is_current_override is None else bool(sem.is_current_override)

    return SemesterAdminOut(
        id=sem.id,
        name=sem.name,
        year=sem.year,
        term=sem.term,
        is_current=is_cur,
        start_date=sem.start_date,
        end_date=sem.end_date,
        teaching_start=sem.teaching_start,
        teaching_end=sem.teaching_end,
        is_current_override=sem.is_current_override,
    )


# =============================================================================
# Hệ thống & Cơ sở dữ liệu (Brief A6)
# =============================================================================

@router.get("/system", response_model=SystemInfoResponse, summary="Tình trạng hệ thống và cơ sở dữ liệu")
def get_system_endpoint(
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin"])),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Trả về trạng thái hệ thống, phiên bản Alembic, kích thước bảng, lỗi 24h và cấu hình an toàn."""
    return get_system_info(db)


# =============================================================================
# Nhật ký thao tác (Audit Log) (Brief A6)
# =============================================================================

@router.get("/audit-log", summary="Xem nhật ký thao tác hoặc xuất file CSV")
def get_audit_log_endpoint(
    actor: str | None = Query(None, description="Lọc theo email hoặc mã người thao tác"),
    action: str | None = Query(None, description="Lọc theo tên hành động (vd: create_user, update_faculty)"),
    entity_type: str | None = Query(None, description="Lọc theo loại đối tượng (vd: module, admin_user)"),
    from_date: date | None = Query(None, alias="from", description="Từ ngày (YYYY-MM-DD)"),
    to_date: date | None = Query(None, alias="to", description="Đến ngày (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, description="Số trang"),
    page_size: int = Query(50, ge=1, le=200, description="Số mục trên mỗi trang"),
    format: str | None = Query(None, description="Định dạng trả về: csv hoặc json"),
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin"])),
    db: Session = Depends(get_db),
):
    if format == "csv":
        csv_content = export_audit_logs_csv(
            db=db,
            actor=actor,
            action=action,
            entity_type=entity_type,
            from_date=from_date,
            to_date=to_date,
        )
        return Response(
            content=csv_content,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": "attachment; filename=audit_log.csv"},
        )

    return get_audit_logs(
        db=db,
        actor=actor,
        action=action,
        entity_type=entity_type,
        from_date=from_date,
        to_date=to_date,
        page=page,
        page_size=page_size,
    )


# =============================================================================
# Tài khoản quản trị (Admin Users) (Brief A6)
# =============================================================================

@router.get("/users", response_model=list[AdminUserOut], summary="Danh sách tài khoản quản trị viên")
def get_users_endpoint(
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin"])),
    db: Session = Depends(get_db),
):
    return get_admin_users(db)


@router.post("/users", response_model=AdminUserCreateOut, status_code=status.HTTP_201_CREATED, summary="Tạo tài khoản quản trị mới")
def create_user_endpoint(
    body: AdminUserCreateIn,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin"])),
    db: Session = Depends(get_db),
):
    user, temp_pwd = create_admin_user(
        db=db,
        email=body.email,
        role=body.role,
        actor_email=admin.get("email", "dev@uelcourses.local"),
        actor_type=admin.get("actor_type", "dev"),
    )
    return AdminUserCreateOut(
        user=AdminUserOut.model_validate(user, from_attributes=True),
        temporary_password=temp_pwd,
        message="Tài khoản đã được tạo thành công. Mật khẩu tạm chỉ hiển thị một lần duy nhất này.",
    )


@router.patch("/users/{user_id}", response_model=AdminUserOut, summary="Cập nhật vai trò / kích hoạt / khóa tài khoản")
def update_user_endpoint(
    user_id: int,
    body: AdminUserPatchIn,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin"])),
    db: Session = Depends(get_db),
):
    user = update_admin_user(
        db=db,
        user_id=user_id,
        role=body.role,
        is_active=body.is_active,
        is_locked=body.is_locked,
        actor_email=admin.get("email", "dev@uelcourses.local"),
        actor_type=admin.get("actor_type", "dev"),
    )
    return AdminUserOut.model_validate(user, from_attributes=True)


@router.post("/users/{user_id}/reset-password", response_model=AdminPasswordResetOut, summary="Đặt lại mật khẩu tạm cho tài khoản")
def reset_password_endpoint(
    user_id: int,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin"])),
    db: Session = Depends(get_db),
):
    temp_pwd = reset_admin_password(
        db=db,
        user_id=user_id,
        actor_email=admin.get("email", "dev@uelcourses.local"),
        actor_type=admin.get("actor_type", "dev"),
    )
    return AdminPasswordResetOut(
        user_id=user_id,
        temporary_password=temp_pwd,
        message="Mật khẩu tạm đã được tạo. Hãy sao chép ngay vì chỉ hiển thị một lần.",
    )


@router.post("/me/password", summary="Đổi mật khẩu của quản trị viên đang đăng nhập")
def change_password_endpoint(
    body: AdminChangeMyPasswordIn,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin"])),
    db: Session = Depends(get_db),
):
    change_my_password(
        db=db,
        actor_email=admin.get("email", "dev@uelcourses.local"),
        current_password=body.current_password,
        new_password=body.new_password,
        actor_type=admin.get("actor_type", "dev"),
    )
    return {"message": "Đổi mật khẩu thành công. Các phiên đăng nhập khác đã được thu hồi."}


# =============================================================================
# Cài đặt quản trị hệ thống (Admin Settings) (Brief A6)
# =============================================================================

@router.get("/settings", response_model=AdminSettingsOut, summary="Xem cài đặt quản trị hệ thống")
def get_settings_endpoint(
    _admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin"])),
    db: Session = Depends(get_db),
):
    return get_admin_settings(db)


@router.patch("/settings", response_model=AdminSettingsOut, summary="Cập nhật cài đặt quản trị hệ thống")
def update_settings_endpoint(
    body: AdminSettingsPatchIn,
    admin: dict[str, Any] = Depends(require_admin_dev(roles=["admin"])),
    db: Session = Depends(get_db),
):
    return update_admin_settings(
        db=db,
        actor_email=admin.get("email", "dev@uelcourses.local"),
        moderation_mode=body.moderation_mode,
        analytics_enabled=body.analytics_enabled,
        analytics_retention_days=body.analytics_retention_days,
        actor_type=admin.get("actor_type", "dev"),
    )




