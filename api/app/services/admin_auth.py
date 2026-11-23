from __future__ import annotations

# Tái xuất các hàm bảo mật từ app.admin.security để tương thích hoàn toàn
from app.admin.security import (
    generate_temp_password,
    hash_password,
    verify_password,
)

__all__ = [
    "hash_password",
    "verify_password",
    "generate_temp_password",
]
