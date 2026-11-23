"""Gói app.admin — Quản trị hệ thống UELPATH."""

from app.admin.deps import require_admin, require_admin_dev
from app.admin.router import router
from app.admin.security import audit

__all__ = ["router", "require_admin", "require_admin_dev", "audit"]
