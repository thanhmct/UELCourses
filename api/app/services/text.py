"""Tiện ích chuẩn hóa chuỗi tiếng Việt (bỏ dấu) cho tìm kiếm."""

from __future__ import annotations

import re
import unicodedata


def unaccent(text: str | None) -> str:
    if not text:
        return ""
    text = text.replace("đ", "d").replace("Đ", "D")
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def normalize_search(text: str | None) -> str:
    return re.sub(r"\s+", " ", unaccent(text).lower()).strip()


def search_tokens(q: str | None) -> list[str]:
    return [t for t in normalize_search(q).split(" ") if t]
