"""Biệt danh công khai của người dùng (thay cho "Sinh viên ẩn danh").

Quy tắc: 2–30 ký tự sau khi chuẩn hóa khoảng trắng; không chứa liên kết, email, số điện thoại;
không giả danh quản trị/hệ thống; không chứa từ cấm (cùng bộ lọc với bình luận).
"""

from __future__ import annotations

import re
import unicodedata

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.services.moderation import check_content

ANONYMOUS_NAME = "Sinh viên ẩn danh"
NICKNAME_MIN = 2
NICKNAME_MAX = 30

# Tên dễ gây nhầm là người của nhà trường/hệ thống (so khớp sau khi bỏ dấu, chữ thường, bỏ ký tự phân cách).
_RESERVED_FRAGMENTS = (
    "admin", "administrator", "quantri", "quantrivien", "moderator", "kiemduyet", "hethong", "system",
    "uelpath", "uelcourses", "phongdaotao", "phongdt", "nhatruong", "giangvien", "support", "hotro",
)


def _fold(text: str) -> str:
    """Bỏ dấu tiếng Việt, chữ thường, chỉ giữ chữ và số (dùng để so khớp tên dành riêng)."""
    text = text.replace("đ", "d").replace("Đ", "D")
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]", "", text.lower())


def clean_nickname(raw: str | None) -> str | None:
    """Chuẩn hóa: bỏ ký tự điều khiển, gộp khoảng trắng, cắt hai đầu. Rỗng -> None."""
    if raw is None:
        return None
    text = "".join(ch for ch in raw if unicodedata.category(ch)[0] != "C" or ch == " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def validate_nickname(raw: str | None, db: Session | None = None) -> str | None:
    """Trả về biệt danh hợp lệ (đã chuẩn hóa) hoặc None nếu để trống. Vi phạm -> HTTP 422."""
    name = clean_nickname(raw)
    if name is None:
        return None
    if len(name) < NICKNAME_MIN or len(name) > NICKNAME_MAX:
        raise HTTPException(422, f"Biệt danh cần từ {NICKNAME_MIN} đến {NICKNAME_MAX} ký tự.")
    folded = _fold(name)
    if any(fragment in folded for fragment in _RESERVED_FRAGMENTS):
        raise HTTPException(422, "Biệt danh này dễ gây nhầm với quản trị viên hoặc hệ thống, vui lòng chọn tên khác.")
    # check_content ném 422 với từ cấm mức 'block'; còn lại trả cờ (liên kết, email, số điện thoại, từ nghi vấn).
    flags = check_content(name, db=db, min_len=NICKNAME_MIN, max_len=NICKNAME_MAX)
    if flags:
        raise HTTPException(422, "Biệt danh không được chứa liên kết, email, số điện thoại hoặc từ ngữ không phù hợp.")
    return name


def public_name(nickname: str | None) -> str:
    """Tên hiển thị công khai: biệt danh nếu có, ngược lại là tên ẩn danh mặc định."""
    return nickname or ANONYMOUS_NAME
