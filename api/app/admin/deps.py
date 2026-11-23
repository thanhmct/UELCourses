from __future__ import annotations

from datetime import datetime, timezone
import hmac
from typing import Any, Sequence
from fastapi import HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.config import get_settings
from app.db import SessionLocal
from app.models import AdminSession, AdminUser
from app.admin.security import hash_token


def require_admin(roles: Sequence[str] | None = None, allow_dev: bool = True):
    """Phụ thuộc xác thực quản trị (Brief A0 & PLAN_ADMIN Mục 8).
    - Đọc cookie `uel_admin`, kiểm tra phiên chưa hết hạn/chưa thu hồi trong DB.
    - Với phương thức ghi (POST/PATCH/PUT/DELETE, trừ login), bắt buộc header `X-CSRF-Token` khớp.
    - Kiểm tra vai trò trong `roles` (403 nếu không đủ quyền).
    - Trả về 401 nếu phiên thiếu/hết hạn/thu hồi/sai token khi yêu cầu phiên.
    - Hỗ trợ chế độ dev mode nếu `ADMIN_DEV_OPEN=true` và `ENV != production` khi không có cookie.
    - Trả về 404 khi dev mode tắt và không có phiên để không lộ sự tồn tại của endpoint quản trị theo PLAN_ADMIN Mục 8.
    """
    def _dependency(request: Request, response: Response) -> dict[str, Any]:
        settings = get_settings()
        env_is_prod = settings.env.lower().strip() == "production"
        admin_dev_open = bool(getattr(settings, "admin_dev_open", False))

        # 1. Kiểm tra cookie phiên đăng nhập uel_admin
        token = request.cookies.get("uel_admin")
        if token and token.strip():
            token_hash = hash_token(token.strip())
            with SessionLocal() as db:
                session = db.scalar(
                    select(AdminSession)
                    .options(joinedload(AdminSession.user))
                    .where(
                        AdminSession.token_hash == token_hash,
                        AdminSession.revoked_at.is_(None),
                    )
                )
                if not session:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Phiên đăng nhập không hợp lệ hoặc đã kết thúc.",
                    )

                now = datetime.now(timezone.utc)
                exp = session.expires_at if session.expires_at.tzinfo else session.expires_at.replace(tzinfo=timezone.utc)
                if exp < now:
                    session.revoked_at = now
                    db.commit()
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Phiên đăng nhập đã hết hạn.",
                    )

                user = session.user
                if not user or not user.is_active:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Tài khoản quản trị đã bị vô hiệu hóa hoặc không tồn tại.",
                    )

                if user.locked_until:
                    locked = user.locked_until if user.locked_until.tzinfo else user.locked_until.replace(tzinfo=timezone.utc)
                    if locked > now:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Tài khoản đang bị tạm khóa. Vui lòng thử lại sau.",
                        )

                # Kiểm tra CSRF cho phương thức ghi (POST, PUT, PATCH, DELETE)
                method = request.method.upper()
                if method in ("POST", "PUT", "PATCH", "DELETE"):
                    csrf_header = request.headers.get("X-CSRF-Token")
                    if not csrf_header:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Thiếu header X-CSRF-Token bảo vệ CSRF.",
                        )
                    csrf_hash = hash_token(csrf_header)
                    if not session.csrf_token_hash or not hmac.compare_digest(csrf_hash, session.csrf_token_hash):
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="CSRF token không hợp lệ hoặc không khớp phiên đăng nhập.",
                        )

                # Kiểm tra vai trò
                if roles and user.role not in roles:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Quyền '{user.role}' không được phép truy cập tài nguyên này.",
                    )

                return {
                    "id": user.id,
                    "email": user.email,
                    "role": user.role,
                    "actor_type": "admin",
                    "session_id": session.id,
                }

        # 2. Xử lý khi cookie uel_admin có mặt nhưng rỗng
        if "uel_admin" in request.cookies:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Phiên đăng nhập không hợp lệ hoặc đã kết thúc.",
            )

        # 3. Chế độ dev mode dự phòng (Brief A1 & PLAN_ADMIN Mục 8)
        if allow_dev and admin_dev_open and not env_is_prod:
            role = request.headers.get("x-admin-role", "admin").lower().strip()
            if roles and role not in roles:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Quyền '{role}' không được phép truy cập tài nguyên này.",
                )
            return {
                "id": 0,
                "email": "dev@uelcourses.local",
                "role": role,
                "actor_type": "dev",
            }

        # 4. Khi không có phiên và dev mode tắt:
        # Trả về 404 để không lộ sự tồn tại của endpoint quản trị theo PLAN_ADMIN Mục 8
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not Found",
        )

    return _dependency


# Bí danh tương thích ngược hoàn toàn với mã nguồn từ Brief A1–A6
require_admin_dev = require_admin
