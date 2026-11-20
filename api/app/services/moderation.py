"""Kiểm duyệt đánh giá học phần theo nguyên tắc cộng đồng (lấy cảm hứng từ hướng dẫn của NUSMods, viết lại bằng tiếng Việt).

Nguyên tắc:
  1. Phê bình tiêu cực được phép nếu mang tính xây dựng, không công kích cá nhân.
  2. Không spam hoặc quảng cáo.
  3. Không ngôn từ thù ghét, lăng mạ, đe dọa, quấy rối hoặc nội dung tình dục.
  4. Đánh giá vi phạm sẽ bị chuyển sang chờ duyệt hoặc gỡ — dù tích cực hay tiêu cực.

Bộ từ khóa là HEURISTIC: chỉ đánh dấu để con người duyệt lại, không tự động kết luận. Đánh giá bị đánh dấu
không hiển thị công khai cho đến khi quản trị viên duyệt. Cập nhật danh sách bằng cách sửa các hằng số dưới đây.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# Từ khóa (đã bỏ dấu, chữ thường). Mỗi nhóm -> lý do hiển thị cho quản trị viên.
_CATEGORIES: dict[str, tuple[str, ...]] = {
    "hate_or_slur": (
        # lăng mạ/xúc phạm phổ biến (tiếng Việt, đã bỏ dấu)
        "dit", "dm", "dcm", "dkm", "vcl", "vkl", "con cho", "con lon", "thang ngu", "do ngu", "ngu nhu bo", "oc cho",
        "con di", "thieu nang", "cave", "me may", "lon ma", "cu ngu",
        # tiếng Anh
        "retard", "idiot", "stupid bitch", "fuck", "shit", "bitch", "faggot", "nigger", "kys", "kill yourself",
    ),
    "threat": (
        "se giet", "giet may", "giet ban", "dam chet", "danh chet", "cho may chet", "dot nha",
        "i will kill", "i'll kill", "going to kill", "beat you up", "find where you live",
    ),
    "sexual": (
        "khieu dam", "sex", "nude", "khoa than", "xxx", "porn", "lam tinh", "gai goi", "showfree", "ban dam",
    ),
    "harassment_personal": (
        # công kích cá nhân (giảng viên/sinh viên cụ thể)
        "thang giang vien", "con giang vien", "giang vien ngu", "giang vien do", "giang vien ngu dot",
        "lua dao", "gian lan", "dao duc kem", "cho chet", "xau xa", "ban than no",
    ),
    "spam_advertising": (
        "inbox", "ib", "lien he zalo", "zalo", "telegram", "kiem tien", "lam giau", "dang ky ngay", "giam gia",
        "mua ngay", "link nhom", "tham gia nhom", "bit.ly", "tinyurl",
        "casino", "ca cuoc", "vay tien", "cho vay", "dich vu lam", "nhan tai lieu",
    ),
}

# Các mẫu regex (bổ sung cho từ khóa): số điện thoại, email, liên kết → coi là spam/quảng cáo hoặc lộ thông tin cá nhân.
_PATTERNS: tuple[tuple[str, re.Pattern], ...] = (
    ("personal_info", re.compile(r"(?<!\d)(0\d{9,10})(?!\d)")),  # số điện thoại VN
    ("personal_info", re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")),  # email
    ("spam_advertising", re.compile(r"(https?://|www\.)\S+", re.I)),
    ("repeated_chars", re.compile(r"(.)\1{7,}")),  # kéo dài ký tự (spam/gây khó chịu)
)

GUIDELINES_VI = [
    "Chia sẻ đánh giá về học phần bạn đã học. Hãy ghi học kỳ đã học và giảng viên phụ trách.",
    "Phê bình tiêu cực được phép nếu mang tính xây dựng, không công kích cá nhân.",
    "Không spam hoặc quảng cáo (không để liên kết, số điện thoại, tài khoản mạng xã hội để mời gọi).",
    "Không ngôn từ thù ghét, lăng mạ, đe dọa, quấy rối hoặc nội dung tình dục.",
    "Đánh giá vi phạm sẽ được chuyển sang chờ duyệt hoặc gỡ, dù tích cực hay tiêu cực.",
    "Lưu ý: nhà trường (UEL) không kiểm duyệt các đánh giá này. Muốn phản hồi chính thức, dùng kênh góp ý của trường. Nội dung do sinh viên tự viết, chưa được xác minh.",
]


def _fold(text: str) -> str:
    """Chữ thường, bỏ dấu tiếng Việt, đ -> d, gộp khoảng trắng."""
    text = text.replace("đ", "d").replace("Đ", "D")
    base = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", base).lower()


@dataclass
class ModerationResult:
    status: str  # "approved" | "pending" (cần con người duyệt)
    reasons: list[str] = field(default_factory=list)
    matched: list[str] = field(default_factory=list)


def moderate(text: str) -> ModerationResult:
    raw = text or ""
    folded = " " + _fold(raw) + " "
    reasons: list[str] = []
    matched: list[str] = []
    for cat, words in _CATEGORIES.items():
        hits = [w.strip() for w in words if w.strip() and f" {w.strip()} " in folded]
        if hits:
            reasons.append(cat)
            matched.extend(hits[:5])
    for cat, rx in _PATTERNS:
        m = rx.search(raw)
        if m:
            reasons.append(cat)
            matched.append(m.group(0)[:40])
    reasons = list(dict.fromkeys(reasons))
    return ModerationResult(status="pending" if reasons else "approved", reasons=reasons, matched=matched[:10])
