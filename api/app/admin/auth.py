from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from fastapi import HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AdminSession, AdminUser
from app.admin.security import (
    audit,
    generate_csrf_token,
    generate_session_token,
    hash_client_ip,
    hash_token,
    verify_password,
)


def login_admin(
    db: Session,
    email: str,
    password: str,
    client_ip: str | None,
    user_agent: str | None,
    response: Response,
    request: Request,
) -> dict[str, Any]:
    """Xử lý đăng nhập quản trị viên (Brief A0).
    - Chuẩn hóa email, kiểm tra khóa tài khoản (`locked_until`).
    - Khóa 15 phút nếu nhập sai ≥ 5 lần (`failed_attempts`).
    - Băm mật khẩu và kiểm tra so sánh hằng thời gian.
    - Sinh phiên 8 giờ, lưu băm SHA-256 của session token và CSRF token.
    - Đặt cookie `uel_admin` (HttpOnly, Secure, SameSite=Strict, Path=/api/admin).
    - Trả về `{email, role, csrf_token, user}`.
    """
    clean_email = email.lower().strip()
    now = datetime.now(timezone.utc)

    user = db.scalar(select(AdminUser).where(func.lower(AdminUser.email) == clean_email))
    if not user:
        # Dummy verification để chống timing attack
        verify_password("dummy_password", "pbkdf2:sha256:100000$dummy$dummy")
        audit(
            db,
            actor=clean_email,
            action="admin_login_failed",
            entity_type="admin_user",
            entity_id=clean_email,
            after={"reason": "user_not_found"},
            actor_type="system",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng.",
        )

    # Kiểm tra trạng thái tài khoản
    if not user.is_active:
        audit(
            db,
            actor=user.email,
            action="admin_login_failed",
            entity_type="admin_user",
            entity_id=str(user.id),
            after={"reason": "user_inactive"},
            actor_type="system",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản quản trị đã bị vô hiệu hóa.",
        )

    # Kiểm tra khóa tài khoản
    if user.locked_until:
        locked = user.locked_until if user.locked_until.tzinfo else user.locked_until.replace(tzinfo=timezone.utc)
        if locked > now:
            audit(
                db,
                actor=user.email,
                action="admin_login_locked",
                entity_type="admin_user",
                entity_id=str(user.id),
                after={"locked_until": locked.isoformat()},
                actor_type="system",
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Tài khoản đang bị tạm khóa 15 phút do nhập sai mật khẩu nhiều lần.",
            )
        else:
            user.locked_until = None
            user.failed_attempts = 0

    # Kiểm tra mật khẩu
    if not verify_password(password, user.password_hash):
        user.failed_attempts += 1
        if user.failed_attempts >= 5:
            user.locked_until = now + timedelta(minutes=15)
            db.commit()
            audit(
                db,
                actor=user.email,
                action="admin_account_locked",
                entity_type="admin_user",
                entity_id=str(user.id),
                after={"failed_attempts": user.failed_attempts, "locked_until": user.locked_until.isoformat()},
                actor_type="system",
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email hoặc mật khẩu không đúng. Tài khoản bị tạm khóa 15 phút do nhập sai 5 lần.",
            )
        db.commit()
        audit(
            db,
            actor=user.email,
            action="admin_login_failed",
            entity_type="admin_user",
            entity_id=str(user.id),
            after={"failed_attempts": user.failed_attempts},
            actor_type="system",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng.",
        )

    # Đăng nhập thành công -> reset failed_attempts và cập nhật last_login_at
    user.failed_attempts = 0
    user.locked_until = None
    user.last_login_at = now

    raw_session_token = generate_session_token()
    session_token_hash = hash_token(raw_session_token)

    raw_csrf_token = generate_csrf_token()
    csrf_token_hash = hash_token(raw_csrf_token)

    expires_at = now + timedelta(hours=8)
    ip_hash = hash_client_ip(client_ip)
    ua_safe = user_agent[:500] if user_agent else None

    session = AdminSession(
        user_id=user.id,
        token_hash=session_token_hash,
        csrf_token_hash=csrf_token_hash,
        expires_at=expires_at,
        ip_hash=ip_hash,
        user_agent=ua_safe,
        created_at=now,
    )
    db.add(session)
    db.commit()

    audit(
        db,
        actor=user.email,
        action="admin_login_success",
        entity_type="admin_user",
        entity_id=str(user.id),
        after={"ip_hash": ip_hash},
        actor_type="admin",
    )

    settings = get_settings()
    is_secure = settings.env.lower().strip() != "development"

    response.set_cookie(
        key="uel_admin",
        value=raw_session_token,
        max_age=8 * 3600,
        httponly=True,
        secure=is_secure,
        samesite="strict",
        path="/api/admin",
    )
    response.headers["X-CSRF-Token"] = raw_csrf_token

    return {
        "email": user.email,
        "role": user.role,
        "csrf_token": raw_csrf_token,
        "user": user,
    }


def logout_admin(
    db: Session,
    token: str | None,
    response: Response,
    actor_email: str | None = None,
) -> dict[str, str]:
    """Thu hồi phiên đăng nhập quản trị và xóa cookie."""
    now = datetime.now(timezone.utc)
    if token and token.strip():
        token_hash = hash_token(token.strip())
        session = db.scalar(
            select(AdminSession).where(
                AdminSession.token_hash == token_hash,
                AdminSession.revoked_at.is_(None),
            )
        )
        if session:
            session.revoked_at = now
            actor = actor_email or (session.user.email if session.user else "admin")
            audit(
                db,
                actor=actor,
                action="admin_logout",
                entity_type="admin_session",
                entity_id=str(session.id),
                actor_type="admin",
            )
            db.commit()

    response.delete_cookie(key="uel_admin", path="/api/admin")
    return {"status": "ok"}
