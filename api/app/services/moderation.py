"""Kiểm duyệt nội dung bình luận, góp ý và đánh giá học phần (Brief A3, D-A6).

Nguyên tắc:
  1. Phê bình tiêu cực được phép nếu mang tính xây dựng, không công kích cá nhân.
  2. Không spam hoặc quảng cáo (liên kết, số điện thoại, mạng xã hội).
  3. Không ngôn từ thù ghét, lăng mạ, đe dọa, quấy rối hoặc nội dung độc hại.
  4. Không tự động chặn (422) nội dung theo kiểm duyệt — chỉ độ dài không hợp lệ mới bị chặn ngay.
     Mọi nghi vấn khác chỉ GẮN CỜ và chuyển vào hàng đợi; quản trị viên quyết định duyệt/từ chối/ẩn.
  5. Nguồn gắn cờ: (a) định dạng số điện thoại/email/liên kết, (b) từ cấm do quản trị viên tự thêm
     (BannedTerm), (c) mô hình kiểm duyệt AI (OpenAI omni-moderation-latest) — bắt các vi phạm diễn đạt
     khéo (công kích cá nhân, thù ghét, quấy rối, đe dọa, tình dục...) mà danh sách từ cố định không bắt được.
  6. Độ dài hợp lệ: 5–1000 ký tự cho bình luận (feedback/đánh giá dùng giới hạn riêng của chúng).
"""

from __future__ import annotations

import os
import re
import unicodedata
from dataclasses import dataclass, field

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import BannedTerm


GUIDELINES_VI = [
    "Chia sẻ đánh giá về học phần bạn đã học. Hãy ghi học kỳ đã học và giảng viên phụ trách.",
    "Cho phép phê bình thẳng và nặng về chất lượng giảng dạy, độ khó, cách chấm điểm, miễn là mang tính xây dựng; các góp ý gay gắt về chuyên môn vẫn được giữ lại nếu không công kích cá nhân.",
    "Cấm tuyệt đối: công kích cá nhân, ngoại hình hoặc đời tư của giảng viên hay người khác; ngôn từ thù ghét, phân biệt, lăng mạ, đe dọa, quấy rối; nội dung tình dục; spam hoặc quảng cáo (không để liên kết, số điện thoại, tài khoản mạng xã hội để mời gọi).",
    "Đánh giá vi phạm sẽ được chuyển sang chờ duyệt hoặc gỡ, dù tích cực hay tiêu cực.",
    "Tài khoản vi phạm nhiều lần (từ 3 lần vi phạm nghiêm trọng trong 30 ngày) sẽ bị tự động khóa tạm thời cả tài khoản và địa chỉ IP đã dùng; vi phạm nghiêm trọng hoặc tái phạm sau khi được mở lại có thể bị quản trị viên khóa vĩnh viễn.",
    "Lưu ý: nhà trường (UEL) không kiểm duyệt các đánh giá này. Muốn phản hồi chính thức, dùng kênh góp ý của trường. Nội dung do sinh viên tự viết, chưa được xác minh.",
]

# OpenAI Moderation API — mô hình đọc hiểu ngữ nghĩa, thay cho danh sách từ cấm cố định trong code.
AI_MODERATION_URL = "https://api.openai.com/v1/moderations"
AI_MODERATION_MODEL = "omni-moderation-latest"
AI_MODERATION_TIMEOUT = 8.0


def normalize_for_moderation(text: str) -> tuple[str, str]:
    """Chuẩn hóa văn bản để so khớp từ cấm (BannedTerm):
    - Bỏ dấu tiếng Việt, chữ thường, đ/Đ -> d.
    - Bản clean: gộp khoảng trắng.
    - Bản collapsed: bỏ các ký tự phân cách xen giữa các chữ cái (d.u -> du, d-m -> dm, f.u.c.k -> fuck),
      đồng thời gộp các ký tự lặp liên tiếp (loooooon -> lon, vclllll -> vcl).
    """
    if not text:
        return "", ""
    t = text.replace("đ", "d").replace("Đ", "d")
    base = "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")
    clean = re.sub(r"\s+", " ", base).strip().lower()

    # Xóa dấu phân cách xen kẽ giữa các ký tự chữ (d.u -> du, d-m -> dm, d.m -> dm)
    no_punct = re.sub(r"(?<=[a-z0-9])[.\-_*~@#$%^&+=/|\\]+(?=[a-z0-9])", "", clean)
    # Gộp các ký tự lặp liên tiếp (>= 2 lần thành 1 lần)
    collapsed = re.sub(r"([a-z0-9])\1+", r"\1", no_punct)

    return clean, collapsed


def _match_term(norm_term: str, clean: str, collapsed: str) -> bool:
    """So khớp từ cấm trên cả hai bản clean và collapsed."""
    if not norm_term:
        return False
    if " " in norm_term:
        return norm_term in clean or norm_term in collapsed
    pattern = rf"(?<![a-z0-9]){re.escape(norm_term)}(?![a-z0-9])"
    return bool(re.search(pattern, clean) or re.search(pattern, collapsed))


def validate_content_length(text: str, min_len: int = 5, max_len: int = 1000) -> str:
    """Kiểm tra độ dài nội dung 5–1000 ký tự."""
    stripped = (text or "").strip()
    if len(stripped) < min_len:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Nội dung phải có từ {min_len} đến {max_len} ký tự",
        )
    if len(stripped) > max_len:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Nội dung không được vượt quá {max_len} ký tự",
        )
    return stripped


def _ai_api_key() -> str | None:
    """Khóa OpenAI dùng cho Moderation API (tái dùng CODEX_API_KEY đã cấu hình sẵn cho RAG)."""
    settings = get_settings()
    return os.getenv("CODEX_API_KEY") or settings.codex_api_key or None


def ai_flag_categories(text: str) -> list[str]:
    """Gọi OpenAI Moderation API (omni-moderation-latest) để phát hiện vi phạm theo ngữ nghĩa.

    Trả về danh sách category bị gắn cờ (rỗng nếu an toàn). Khi thiếu khóa API hoặc gọi lỗi, trả về
    ['ai_unavailable'] để nội dung vào hàng chờ duyệt thủ công thay vì tự động đăng lúc không kiểm
    tra được — an toàn hơn là cho qua mặc định.
    """
    text = (text or "").strip()
    if not text:
        return []
    api_key = _ai_api_key()
    if not api_key:
        return ["ai_unavailable"]
    try:
        r = httpx.post(
            AI_MODERATION_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": AI_MODERATION_MODEL, "input": text},
            timeout=AI_MODERATION_TIMEOUT,
        )
        r.raise_for_status()
        result = r.json()["results"][0]
        if not result.get("flagged"):
            return []
        categories = result.get("categories") or {}
        return sorted(name for name, hit in categories.items() if hit)
    except Exception:  # noqa: BLE001 - lỗi mạng/API bất kỳ -> coi là không kiểm tra được, không chặn người dùng
        return ["ai_unavailable"]


def check_content(
    text: str,
    db: Session | None = None,
    min_len: int = 5,
    max_len: int = 1000,
) -> list[str]:
    """Kiểm tra nội dung theo Brief A3 (chỉ gắn cờ, không chặn cứng):
    1. Độ dài 5–1000 ký tự (vi phạm -> 422; đây là chốt chặn ngay duy nhất).
    2. Phát hiện số điện thoại/email -> cờ 'contact_info'; liên kết -> cờ 'link'.
    3. Từ cấm do quản trị viên tự thêm (BannedTerm) -> cờ 'banned_term' (chỉ gắn cờ, mọi severity).
    4. Mô hình kiểm duyệt AI -> cờ theo từng category (harassment, hate, sexual, violence, ...).
    Trả về danh sách cờ vi phạm (rỗng nếu an toàn); nơi gọi quyết định approved/pending dựa trên cờ.
    """
    raw = validate_content_length(text, min_len, max_len)
    flags: list[str] = []

    if re.search(r"(?<!\d)(0\d{9,10})(?!\d)", raw):
        flags.append("contact_info")
    if re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", raw):
        flags.append("contact_info")
    if re.search(r"(https?://|www\.|\bbit\.ly/|\btinyurl\.com/)\S+", raw, re.I):
        flags.append("link")

    if db is not None:
        try:
            db_terms = [bt.term.strip() for bt in db.scalars(select(BannedTerm)).all() if bt.term.strip()]
        except Exception:
            db_terms = []
        if db_terms:
            clean, collapsed = normalize_for_moderation(raw)
            for term in db_terms:
                norm_term, _ = normalize_for_moderation(term)
                if norm_term and _match_term(norm_term, clean, collapsed):
                    flags.append("banned_term")
                    break

    flags.extend(ai_flag_categories(raw))
    return list(dict.fromkeys(flags))


@dataclass
class ModerationResult:
    status: str  # "approved" | "pending"
    reasons: list[str] = field(default_factory=list)
    matched: list[str] = field(default_factory=list)


def moderate(text: str, db: Session | None = None) -> ModerationResult:
    """Dùng cho đánh giá học phần/giảng viên: không bao giờ chặn cứng, chỉ approved hoặc pending."""
    try:
        flags = check_content(text, db=db, min_len=1, max_len=5000)
    except HTTPException:
        return ModerationResult(status="pending", reasons=["invalid_length"])

    reasons = list(flags)
    if re.search(r"(.)\1{7,}", text):
        reasons.append("repeated_chars")
    reasons = list(dict.fromkeys(reasons))
    return ModerationResult(status="pending" if reasons else "approved", reasons=reasons)
