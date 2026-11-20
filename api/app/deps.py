from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, status

from app.config import get_settings


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    """Nếu ADMIN_KEY được cấu hình thì bắt buộc header X-Admin-Key khớp."""
    expected = get_settings().admin_key
    if not expected:
        return
    if not x_admin_key or not hmac.compare_digest(x_admin_key, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Thiếu hoặc sai X-Admin-Key.")
