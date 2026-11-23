from __future__ import annotations

import csv
import io
import os
import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from fastapi import HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, or_, select, text, update
from sqlalchemy.orm import Session

from app.config import API_DIR, get_settings
from app.models import (
    AdminSession,
    AdminSetting,
    AdminUser,
    AuditLog,
    ImportRun,
)
from app.services.admin_auth import (
    generate_temp_password,
    hash_password,
    verify_password,
)

MAIN_TABLE_NAMES = [
    "modules",
    "class_sections",
    "lessons",
    "outline_documents",
    "outline_courses",
    "analytics_events",
    "analytics_daily",
    "analytics_pairs",
    "module_comments",
    "banned_terms",
    "feedback",
    "academic_events",
    "semesters",
    "audit_log",
    "admin_settings",
    "admin_users",
    "admin_sessions",
]


def get_alembic_head_revision() -> str:
    """Lấy mã revision Alembic head trong mã nguồn."""
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        cfg = Config(str(API_DIR / "alembic.ini"))
        script = ScriptDirectory.from_config(cfg)
        head = script.get_current_head()
        if head:
            return str(head)
    except Exception:
        pass
    # Fallback: quét file trong thư mục versions
    try:
        versions_dir = API_DIR / "migrations" / "versions"
        if versions_dir.exists():
            files = sorted([f.name for f in versions_dir.glob("*.py") if not f.name.startswith("__")])
            if files:
                last_file = files[-1]
                match = re.match(r"^([0-9a-fA-F_]+)", last_file)
                if match:
                    return match.group(1).rstrip("_")
    except Exception:
        pass
    return "0021"


def get_alembic_current_revision(db: Session) -> str | None:
    """Lấy revision Alembic hiện tại đang lưu trong bảng alembic_version của DB."""
    try:
        res = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
        return str(res) if res else None
    except Exception:
        return None


def get_table_sizes_and_counts(db: Session) -> list[dict[str, Any]]:
    """Lấy số dòng và kích thước (nếu là PostgreSQL) của các bảng chính."""
    is_postgres = False
    try:
        is_postgres = db.bind.dialect.name == "postgresql"
    except Exception:
        pass

    pg_sizes: dict[str, int] = {}
    if is_postgres:
        try:
            rows = db.execute(text("""
                SELECT relname AS table_name,
                       pg_total_relation_size(relid) AS total_bytes
                FROM pg_catalog.pg_statio_user_tables
            """)).fetchall()
            for r in rows:
                pg_sizes[str(r[0])] = int(r[1])
        except Exception:
            pass

    results = []
    for tbl in MAIN_TABLE_NAMES:
        row_count = 0
        try:
            row_count = db.execute(text(f'SELECT COUNT(*) FROM "{tbl}"')).scalar() or 0
        except Exception:
            row_count = 0

        size_bytes = pg_sizes.get(tbl, None)
        results.append({
            "name": tbl,
            "count": int(row_count),
            "size_bytes": size_bytes,
        })
    return results


def get_last_import_time(db: Session) -> str | None:
    """Lấy thời gian import gần nhất từ ImportRun."""
    try:
        last = db.scalar(select(func.max(ImportRun.finished_at)))
        if not last:
            last = db.scalar(select(func.max(ImportRun.started_at)))
        if last:
            return last.isoformat()
    except Exception:
        pass
    return None


def get_recent_errors_count(db: Session, hours: int = 24) -> int:
    """Đếm số lỗi hệ thống 5xx được ghi vào audit_log trong vòng 24 giờ qua."""
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        count = db.scalar(
            select(func.count(AuditLog.id)).where(
                AuditLog.actor_type == "system",
                AuditLog.created_at >= cutoff,
            )
        )
        return int(count or 0)
    except Exception:
        return 0


def get_safe_system_config() -> dict[str, Any]:
    """Cấu hình an toàn của hệ thống (TUYỆT ĐỐI không trả mật khẩu, token hay secret)."""
    settings = get_settings()
    return {
        "env": settings.env,
        "cors_origins": settings.cors_origins,
        "llm_provider": "extractive",
        "analytics_enabled": bool(getattr(settings, "analytics_enabled", True)),
        "analytics_retention_days": int(getattr(settings, "analytics_retention_days", 180)),
        "auto_seed": bool(getattr(settings, "auto_seed", False)),
        "min_program_cohort": int(getattr(settings, "min_program_cohort", 23)),
        "skip_legacy_codes": bool(getattr(settings, "skip_legacy_codes", True)),
        "enable_rag": bool(getattr(settings, "enable_rag", True)),
    }


def get_system_info(db: Session) -> dict[str, Any]:
    """Tổng hợp trạng thái toàn diện của hệ thống cho quản trị viên."""
    settings = get_settings()
    alembic_head = get_alembic_head_revision()
    alembic_current = get_alembic_current_revision(db)
    alembic_match = (alembic_current == alembic_head) if alembic_current else False

    table_stats = get_table_sizes_and_counts(db)
    last_import = get_last_import_time(db)
    errors_24h = get_recent_errors_count(db, hours=24)
    safe_config = get_safe_system_config()

    return {
        "app_version": os.getenv("APP_VERSION", "0.1.0"),
        "env": settings.env,
        "alembic_current": alembic_current,
        "alembic_head": alembic_head,
        "alembic_match": alembic_match,
        "table_stats": table_stats,
        "last_import_at": last_import,
        "errors_24h": errors_24h,
        "safe_config": safe_config,
    }


# =============================================================================
# Nhật ký thao tác (Audit Log)
# =============================================================================

def build_audit_log_query(
    actor: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
):
    stmt = select(AuditLog)
    if actor:
        actor_clean = actor.strip()
        stmt = stmt.where(
            or_(
                AuditLog.actor_id.ilike(f"%{actor_clean}%"),
                AuditLog.actor_type.ilike(f"%{actor_clean}%"),
            )
        )
    if action:
        stmt = stmt.where(AuditLog.action == action.strip())
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type.strip())
    if from_date:
        start_dt = datetime.combine(from_date, time.min).replace(tzinfo=timezone.utc)
        stmt = stmt.where(AuditLog.created_at >= start_dt)
    if to_date:
        end_dt = datetime.combine(to_date, time.max).replace(tzinfo=timezone.utc)
        stmt = stmt.where(AuditLog.created_at <= end_dt)

    return stmt


def get_audit_logs(
    db: Session,
    actor: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    """Lấy danh sách nhật ký thao tác có bộ lọc và phân trang."""
    stmt = build_audit_log_query(actor, action, entity_type, from_date, to_date)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    page = max(1, page)
    page_size = max(1, min(200, page_size))
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    items_stmt = stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list(db.scalars(items_stmt).all())

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


def export_audit_logs_csv(
    db: Session,
    actor: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> str:
    """Xuất toàn bộ bản ghi nhật ký phù hợp bộ lọc ra chuỗi CSV."""
    import json

    stmt = build_audit_log_query(actor, action, entity_type, from_date, to_date)
    items = list(db.scalars(stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(5000)).all())

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    writer.writerow([
        "ID",
        "Thời gian (UTC)",
        "Loại người dùng",
        "Mã / Email người dùng",
        "Hành động",
        "Loại đối tượng",
        "Mã đối tượng",
        "Dữ liệu trước (Before)",
        "Dữ liệu sau (After)",
    ])

    for item in items:
        writer.writerow([
            item.id,
            item.created_at.isoformat() if item.created_at else "",
            item.actor_type,
            item.actor_id or "",
            item.action,
            item.entity_type or "",
            item.entity_id or "",
            json.dumps(item.before, ensure_ascii=False) if item.before else "",
            json.dumps(item.after, ensure_ascii=False) if item.after else "",
        ])

    return output.getvalue()


# =============================================================================
# Quản lý tài khoản quản trị (Admin Users)
# =============================================================================

VALID_ROLES = {"admin", "moderator", "data_editor"}


def get_admin_users(db: Session) -> list[AdminUser]:
    """Lấy danh sách tất cả tài khoản quản trị viên."""
    return list(db.scalars(select(AdminUser).order_by(AdminUser.id.asc())).all())


def create_admin_user(
    db: Session,
    email: str,
    role: str,
    actor_email: str,
    actor_type: str = "dev",
) -> tuple[AdminUser, str]:
    """Tạo tài khoản quản trị mới, sinh mật khẩu tạm 16 ký tự trả về MỘT LẦN duy nhất."""
    email_clean = email.strip().lower()
    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Email không hợp lệ.")

    if role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Vai trò '{role}' không hợp lệ. Phải là một trong: {', '.join(sorted(VALID_ROLES))}",
        )

    # Kiểm tra trùng email
    existing = db.scalar(select(AdminUser).where(func.lower(AdminUser.email) == email_clean))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Email '{email_clean}' đã được sử dụng.")

    temp_password = generate_temp_password(16)
    pwd_hash = hash_password(temp_password)

    now = datetime.now(timezone.utc)
    user = AdminUser(
        email=email_clean,
        password_hash=pwd_hash,
        role=role,
        is_active=True,
        failed_attempts=0,
        locked_until=None,
        last_login_at=None,
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Ghi nhật ký thao tác
    audit = AuditLog(
        actor_type=actor_type,
        actor_id=actor_email,
        action="create_user",
        entity_type="admin_user",
        entity_id=str(user.id),
        before=None,
        after={"email": user.email, "role": user.role, "is_active": user.is_active},
        created_at=now,
    )
    db.add(audit)
    db.commit()

    return user, temp_password


def update_admin_user(
    db: Session,
    user_id: int,
    role: str | None = None,
    is_active: bool | None = None,
    is_locked: bool | None = None,
    actor_email: str = "dev@uelcourses.local",
    actor_type: str = "dev",
) -> AdminUser:
    """Cập nhật vai trò, trạng thái kích hoạt hoặc khóa tài khoản quản trị.

    Nguyên tắc an toàn (Brief A6): Không cho tự hạ quyền/tắt tài khoản admin cuối cùng.
    """
    user = db.get(AdminUser, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản quản trị.")

    before_state = {
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "locked_until": user.locked_until.isoformat() if user.locked_until else None,
    }

    # Kiểm tra quy tắc bảo vệ admin cuối cùng
    will_demote_or_deactivate = False
    if user.role == "admin":
        if role is not None and role != "admin":
            will_demote_or_deactivate = True
        if is_active is False:
            will_demote_or_deactivate = True

    if will_demote_or_deactivate:
        active_admins_count = db.scalar(
            select(func.count(AdminUser.id)).where(
                AdminUser.role == "admin",
                AdminUser.is_active.is_(True),
            )
        ) or 0
        if active_admins_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể hạ quyền hoặc vô hiệu hóa tài khoản quản trị viên (admin) cuối cùng.",
            )

    if role is not None:
        if role not in VALID_ROLES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Vai trò '{role}' không hợp lệ.")
        user.role = role

    now = datetime.now(timezone.utc)
    if is_active is not None:
        user.is_active = is_active
        if not is_active:
            # Thu hồi toàn bộ phiên đăng nhập của tài khoản này
            db.execute(
                update(AdminSession)
                .where(AdminSession.user_id == user.id, AdminSession.revoked_at.is_(None))
                .values(revoked_at=now)
            )

    if is_locked is not None:
        if is_locked:
            user.locked_until = now + timedelta(days=365)
        else:
            user.locked_until = None
            user.failed_attempts = 0

    user.updated_at = now
    db.commit()
    db.refresh(user)

    after_state = {
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "locked_until": user.locked_until.isoformat() if user.locked_until else None,
    }

    audit = AuditLog(
        actor_type=actor_type,
        actor_id=actor_email,
        action="update_user",
        entity_type="admin_user",
        entity_id=str(user.id),
        before=before_state,
        after=after_state,
        created_at=now,
    )
    db.add(audit)
    db.commit()

    return user


def reset_admin_password(
    db: Session,
    user_id: int,
    actor_email: str,
    actor_type: str = "dev",
) -> str:
    """Đặt lại mật khẩu cho tài khoản, sinh mật khẩu tạm 16 ký tự trả về MỘT LẦN, thu hồi các phiên khác."""
    user = db.get(AdminUser, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản quản trị.")

    temp_password = generate_temp_password(16)
    user.password_hash = hash_password(temp_password)
    user.failed_attempts = 0
    user.locked_until = None
    now = datetime.now(timezone.utc)
    user.updated_at = now

    # Thu hồi toàn bộ phiên đăng nhập của người dùng này
    db.execute(
        update(AdminSession)
        .where(AdminSession.user_id == user.id, AdminSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )

    audit = AuditLog(
        actor_type=actor_type,
        actor_id=actor_email,
        action="reset_password",
        entity_type="admin_user",
        entity_id=str(user.id),
        before={"email": user.email},
        after={"email": user.email, "sessions_revoked": True},
        created_at=now,
    )
    db.add(audit)
    db.commit()

    return temp_password


def change_my_password(
    db: Session,
    actor_email: str,
    current_password: str,
    new_password: str,
    actor_type: str = "dev",
) -> None:
    """Đổi mật khẩu của chính quản trị viên đang đăng nhập (kiểm tra mật khẩu cũ, thu hồi các phiên khác)."""
    user = db.scalar(select(AdminUser).where(func.lower(AdminUser.email) == actor_email.strip().lower()))
    if not user:
        # Nếu chưa có tài khoản trong DB (chế độ dev), tạo hoặc thông báo
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản của bạn trong hệ thống.")

    if not verify_password(current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu hiện tại không chính xác.")

    if len(new_password) < 8:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Mật khẩu mới phải có ít nhất 8 ký tự.")

    now = datetime.now(timezone.utc)
    user.password_hash = hash_password(new_password)
    user.updated_at = now

    # Thu hồi các phiên khác
    db.execute(
        update(AdminSession)
        .where(AdminSession.user_id == user.id, AdminSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )

    audit = AuditLog(
        actor_type=actor_type,
        actor_id=actor_email,
        action="change_password",
        entity_type="admin_user",
        entity_id=str(user.id),
        before=None,
        after={"email": user.email, "sessions_revoked": True},
        created_at=now,
    )
    db.add(audit)
    db.commit()


# =============================================================================
# Cài đặt quản trị (Admin Settings)
# =============================================================================

DEFAULT_SETTINGS = {
    "moderation.mode": "pre",
    "analytics.enabled": True,
    "analytics.retention_days": 180,
}


def get_admin_settings(db: Session) -> dict[str, Any]:
    """Đọc toàn bộ cài đặt hệ thống từ bảng admin_settings (kèm fallback mặc định)."""
    settings_dict = dict(DEFAULT_SETTINGS)
    rows = list(db.scalars(select(AdminSetting)).all())
    for r in rows:
        if r.key in settings_dict:
            settings_dict[r.key] = r.value

    last_updated_by = None
    last_updated_at = None
    if rows:
        sorted_rows = sorted(rows, key=lambda x: x.updated_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        last_updated_by = sorted_rows[0].updated_by
        last_updated_at = sorted_rows[0].updated_at

    return {
        "moderation_mode": str(settings_dict["moderation.mode"]),
        "analytics_enabled": bool(settings_dict["analytics.enabled"]),
        "analytics_retention_days": int(settings_dict["analytics.retention_days"]),
        "updated_by": last_updated_by,
        "updated_at": last_updated_at,
    }


def update_admin_settings(
    db: Session,
    actor_email: str,
    moderation_mode: str | None = None,
    analytics_enabled: bool | None = None,
    analytics_retention_days: int | None = None,
    actor_type: str = "dev",
) -> dict[str, Any]:
    """Cập nhật cài đặt quản trị, kiểm tra giá trị hợp lệ và ghi audit log."""
    before_state = get_admin_settings(db)

    # 1. Kiểm tra validation
    if moderation_mode is not None:
        mode_clean = moderation_mode.strip().lower()
        if mode_clean not in ("pre", "post"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Chế độ kiểm duyệt không hợp lệ. Phải là 'pre' (kiểm duyệt trước) hoặc 'post' (kiểm duyệt sau).",
            )

    if analytics_retention_days is not None:
        if not (30 <= analytics_retention_days <= 365):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Thời gian lưu trữ dữ liệu phân tích phải nằm trong khoảng từ 30 đến 365 ngày.",
            )

    now = datetime.now(timezone.utc)
    changes: dict[str, Any] = {}

    def _set_setting(k: str, v: Any):
        s = db.get(AdminSetting, k)
        if not s:
            s = AdminSetting(key=k, value=v, updated_by=actor_email, updated_at=now)
            db.add(s)
        else:
            s.value = v
            s.updated_by = actor_email
            s.updated_at = now
        changes[k] = v

    if moderation_mode is not None:
        _set_setting("moderation.mode", moderation_mode.strip().lower())
    if analytics_enabled is not None:
        _set_setting("analytics.enabled", bool(analytics_enabled))
    if analytics_retention_days is not None:
        _set_setting("analytics.retention_days", int(analytics_retention_days))

    db.flush()
    after_state = get_admin_settings(db)

    if changes:
        audit = AuditLog(
            actor_type=actor_type,
            actor_id=actor_email,
            action="update_settings",
            entity_type="admin_settings",
            entity_id="system",
            before=jsonable_encoder(before_state),
            after=jsonable_encoder(after_state),
            created_at=now,
        )
        db.add(audit)
        db.commit()

    return after_state
