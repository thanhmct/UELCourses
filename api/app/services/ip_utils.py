"""Tiện ích băm địa chỉ IP dùng chung cho xác thực, kiểm duyệt và quản trị."""

from __future__ import annotations

import hashlib


def hash_client_ip(ip: str | None) -> str | None:
    """Băm địa chỉ IP bằng SHA-256 để bảo vệ quyền riêng tư người dùng."""
    if not ip:
        return None
    return hashlib.sha256(ip.strip().encode("utf-8")).hexdigest()
