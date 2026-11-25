"""Kiểm duyệt nội dung bình luận, góp ý và đánh giá học phần (Brief A3, D-A6).

Nguyên tắc:
  1. Phê bình tiêu cực được phép nếu mang tính xây dựng, không công kích cá nhân.
  2. Không spam hoặc quảng cáo (liên kết, số điện thoại, mạng xã hội).
  3. Không ngôn từ thù ghét, lăng mạ, đe dọa, quấy rối hoặc nội dung độc hại.
  4. Bộ lọc chuẩn hóa: bỏ dấu tiếng Việt, chữ thường, gộp ký tự lặp, bỏ ký tự xen kẽ kiểu "đ.ụ".
  5. severity='block' -> từ chối ngay (HTTP 422: 'Nội dung chưa phù hợp').
  6. severity='flag' -> lưu vào flag_reasons, chuyển vào hàng đợi kiểm duyệt.
  7. Phát hiện số điện thoại, email, link -> gắn cờ 'contact_info' / 'link'.
  8. Độ dài hợp lệ: 5–1000 ký tự.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BannedTerm


GUIDELINES_VI = [
    "Chia sẻ đánh giá về học phần bạn đã học. Hãy ghi học kỳ đã học và giảng viên phụ trách.",
    "Cho phép phê bình thẳng và nặng về chất lượng giảng dạy, độ khó, cách chấm điểm, miễn là mang tính xây dựng; các góp ý gay gắt về chuyên môn vẫn được giữ lại nếu không công kích cá nhân.",
    "Cấm tuyệt đối: công kích cá nhân, ngoại hình hoặc đời tư của giảng viên hay người khác; ngôn từ thù ghét, phân biệt, lăng mạ, đe dọa, quấy rối; nội dung tình dục; spam hoặc quảng cáo (không để liên kết, số điện thoại, tài khoản mạng xã hội để mời gọi).",
    "Đánh giá vi phạm sẽ được chuyển sang chờ duyệt hoặc gỡ, dù tích cực hay tiêu cực.",
    "Tài khoản vi phạm nhiều lần (từ 3 lần vi phạm nghiêm trọng trong 30 ngày) sẽ bị tự động khóa tạm thời cả tài khoản và địa chỉ IP đã dùng; vi phạm nghiêm trọng hoặc tái phạm sau khi được mở lại có thể bị quản trị viên khóa vĩnh viễn.",
    "Lưu ý: nhà trường (UEL) không kiểm duyệt các đánh giá này. Muốn phản hồi chính thức, dùng kênh góp ý của trường. Nội dung do sinh viên tự viết, chưa được xác minh.",
]

# Từ mẫu trung tính (để test và khởi tạo mặc định)
DEFAULT_SAMPLE_BANNED_TERMS: list[tuple[str, str]] = [
    ("blockword", "block"),
    ("tucam_block", "block"),
    ("cam_tuyet_doi", "block"),
    ("du", "block"),
    ("kys", "block"),
    ("kill yourself", "block"),
    ("flagword", "flag"),
    ("tucam_flag", "flag"),
    ("can_kiem_duyet", "flag"),
    ("spam_advertising", "flag"),
    ("vay tien", "flag"),
    ("ca cuoc", "flag"),
]


# Các nhóm lý do của đánh giá học phần, dùng để chuyển nội dung sang chờ duyệt.
_REVIEW_TERMS = {
    "hate_or_slur": (
        "dit", "dm", "dcm", "dkm", "vcl", "vkl", "con cho", "con lon", "thang ngu", "do ngu", "ngu nhu bo", "oc cho",
        "con di", "thieu nang", "cave", "me may", "lon ma", "cu ngu",
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
        "thang giang vien", "con giang vien", "giang vien ngu", "giang vien do", "giang vien ngu dot",
        "lua dao", "gian lan", "dao duc kem", "cho chet", "xau xa", "ban than no",
    ),
    "spam_advertising": (
        "inbox", "ib", "lien he zalo", "zalo", "telegram", "kiem tien", "lam giau", "dang ky ngay", "giam gia",
        "mua ngay", "link nhom", "tham gia nhom", "bit.ly", "tinyurl",
        "casino", "ca cuoc", "vay tien", "cho vay", "dich vu lam", "nhan tai lieu",
    ),
}
_REVIEW_FLAG_REASONS = {"contact_info": "personal_info", "link": "spam_advertising"}


def normalize_for_moderation(text: str) -> tuple[str, str]:
    """Chuẩn hóa văn bản để kiểm duyệt:
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


def check_content(
    text: str,
    db: Session | None = None,
    min_len: int = 5,
    max_len: int = 1000,
) -> list[str]:
    """Kiểm tra nội dung theo Brief A3:
    1. Kiểm tra độ dài 5–1000 ký tự (vi phạm -> 422).
    2. Phát hiện số điện thoại / email -> cờ 'contact_info'.
    3. Phát hiện liên kết web -> cờ 'link'.
    4. So khớp từ cấm (BannedTerm từ DB + mẫu trung tính):
       - severity='block': ném HTTP 422 ('Nội dung chưa phù hợp').
       - severity='flag': gắn cờ 'banned_term'.
    5. Trả về danh sách cờ vi phạm (list rỗng nếu an toàn).
    """
    raw = validate_content_length(text, min_len, max_len)
    flags: list[str] = []

    # 1. Phát hiện số điện thoại VN (10-11 số bắt đầu bằng 0)
    if re.search(r"(?<!\d)(0\d{9,10})(?!\d)", raw):
        flags.append("contact_info")

    # 2. Phát hiện email
    if re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", raw):
        flags.append("contact_info")

    # 3. Phát hiện link
    if re.search(r"(https?://|www\.|\bbit\.ly/|\btinyurl\.com/)\S+", raw, re.I):
        flags.append("link")

    # 4. Chuẩn hóa văn bản
    clean, collapsed = normalize_for_moderation(raw)

    # 5. Danh sách từ cấm
    terms: list[tuple[str, str]] = []
    if db is not None:
        try:
            db_terms = list(db.scalars(select(BannedTerm)).all())
            for bt in db_terms:
                terms.append((bt.term.strip(), bt.severity.strip()))
        except Exception:
            pass

    for st, ssev in DEFAULT_SAMPLE_BANNED_TERMS:
        if not any(t[0].lower() == st.lower() for t in terms):
            terms.append((st, ssev))

    # Kiểm tra block trước (chặn ngay)
    for term, severity in terms:
        if severity != "block":
            continue
        norm_term, _ = normalize_for_moderation(term)
        if norm_term and _match_term(norm_term, clean, collapsed):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Nội dung chưa phù hợp",
            )

    # Kiểm tra flag (gắn cờ chờ duyệt)
    for term, severity in terms:
        if severity != "flag":
            continue
        norm_term, _ = normalize_for_moderation(term)
        if norm_term and _match_term(norm_term, clean, collapsed):
            flags.append("banned_term")

    return list(dict.fromkeys(flags))


@dataclass
class ModerationResult:
    status: str  # "approved" | "pending"
    reasons: list[str] = field(default_factory=list)
    matched: list[str] = field(default_factory=list)


def moderate(text: str, db: Session | None = None) -> ModerationResult:
    """Hàm tương thích ngược cho endpoint review hiện có."""
    try:
        flags = check_content(text, db=db, min_len=1, max_len=5000)
    except HTTPException as e:
        if e.status_code == 422:
            return ModerationResult(status="pending", reasons=["blocked_content"], matched=["blocked_content"])
        raise

    clean, collapsed = normalize_for_moderation(text)
    reasons = []
    matched = []
    for reason, terms in _REVIEW_TERMS.items():
        hits = [term for term in terms if _match_term(term, clean, collapsed)]
        if hits:
            reasons.append(reason)
            matched.extend(hits[:5])
    reasons.extend(_REVIEW_FLAG_REASONS.get(flag, flag) for flag in flags)
    if re.search(r"(.)\1{7,}", text):
        reasons.append("repeated_chars")
    return ModerationResult(
        status="pending" if reasons else "approved",
        reasons=list(dict.fromkeys(reasons)),
        matched=matched[:10],
    )
