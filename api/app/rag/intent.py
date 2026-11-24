"""Understand student-forum phrasing before retrieval.

Forum posts use abbreviations ("đrl", "đkhp", "thi ck"), spelling variants ("kì", "đăng kí") and slang
("ko", "mn"). ``expand_forum`` rewrites them into the wording used by regulations so that the scope gate and
BM25 match. ``forum_redirect`` recognises requests the regulation assistant cannot answer (buying/selling
books, asking for study materials or past papers, reviewing lecturers, a specific class's timetable) and
points to the page of the app that handles them instead of a bare refusal.
"""
from __future__ import annotations

import re
from typing import Any

from .textnorm import strip_accents

_FLAGS = re.IGNORECASE
# (pattern on the original text, replacement). Order matters: longer forms first.
_EXPANSIONS: list[tuple[re.Pattern[str], str]] = [(re.compile(p, _FLAGS), r) for p, r in (
    (r"\bthi\s+(?:ck|cuối\s+k[ìỳ]|cuoi\s+ki)\b", "thi kết thúc học phần (cuối kỳ)"),
    (r"\bthi\s+(?:gk|giữa\s+k[ìỳ])\b", "thi giữa kỳ"),
    (r"\b[đd]\s?k\s?hp\b|\b[đd]kmh\b", "đăng ký học phần"),
    (r"\b[đd]rl\b", "điểm rèn luyện"),
    (r"\bctxh\b", "công tác xã hội"),
    (r"\bhbkkht\b|\bhbkk\b", "học bổng khuyến khích học tập"),
    (r"\bhb\b", "học bổng"),
    (r"\bgdtc\s*(\d?)", r"giáo dục thể chất \1"),
    (r"\bgdqp(?:an)?\b", "giáo dục quốc phòng an ninh"),
    (r"\bnvqs\b", "nghĩa vụ quân sự"),
    (r"\b(lễ|xét|xet|điều kiện)\s+tn\b", r"\1 tốt nghiệp"),
    (r"\btkb\b", "thời khóa biểu"),
    (r"\bktx\b", "ký túc xá"),
    (r"\bnhà\s+vh\b", "nhà văn hóa"),
    (r"\bhk\s*(\d)\b", r"học kỳ \1"),
    (r"\bhk\b", "học kỳ"),
    (r"\bhp\b", "học phần"),
    (r"\btc\b", "tín chỉ"),
    (r"\bck\b", "cuối kỳ"),
    (r"\bgk\b", "giữa kỳ"),
    (r"\bgpa\b", "điểm trung bình tích lũy (GPA)"),
    (r"\bsv\b", "sinh viên"),
    (r"\bgv\b", "giảng viên"),
    (r"\bcvht\b", "cố vấn học tập"),
    (r"\b(?:lms|mooc)\b", "học trực tuyến"),
    (r"\bđăng\s+kí\b", "đăng ký"),
    (r"\bk[ìi]\s+(?=\d|này|sau|tới|trước|hè|phụ)", "kỳ "),
    (r"\b(?:ko|k|hong|hông|khum|kh|hok)\b", "không"),
    (r"\b(?:đc|dc)\b", "được"),
    (r"\b(?:mn|mng)\b", "mọi người"),
)]


# Greetings, politeness and filler that carry no regulation meaning but dilute term coverage.
_CHATTER = [re.compile(p, _FLAGS) for p in (
    r"\b(?:em|e|mình|tui|tôi|tớ)\s+(?:xin\s+)?chào\s+(?:mọi người|các anh chị(?:\s+và các bạn)?|anh chị|các bạn|ad)\b",
    r"\b(?:mọi người|anh chị|anh/chị(?:/bạn)?|a/c|ac|các bạn|ad|mấy (?:a chị|anh chị|bạn))\s+(?:ơi|oi)\b",
    r"\b(?:cho|chỉ cho)\s+(?:em|e|mình|tui|tớ|tôi)\s+(?:xin\s+(?:phép\s+)?)?hỏi(?:\s+(?:là|với|chút|xíu))?\b",
    r"\b(?:em|e|mình)\s+(?:xin\s+)?cảm ơn(?:\s+(?:nhiều|nha|ạ))?\b|\bcảm ơn(?:\s+mọi người)?\b",
    r"\b(?:dạ|ạ+|huhu+|hic+|sos|nha|nhé|nhe|hen|ạaa+)\b",
    r"[:;]\(+|[:;]\)+|\bT\.T\b|[\U0001F300-\U0001FAFF☀-➿]+",
)]


def expand_forum(text: str) -> str:
    out = text
    for pattern in _CHATTER:
        out = pattern.sub(" ", out)
    for pattern, repl in _EXPANSIONS:
        out = pattern.sub(repl, out)
    out = re.sub(r"[ \t]+", " ", out)
    return re.sub(r"\s*\n\s*", "\n", out).strip(" \n,.")


_QUESTION_CUE = re.compile(
    r"\?|\b(?:không|sao|nào|bao nhiêu|mấy|khi nào|ở đâu|thế nào|như nào|ra sao|được không|có phải|"
    r"có được|có bị|phải làm gì|bao lâu|hay không)\b", re.IGNORECASE)
FOCUS_MIN_CHARS = 160


def focus_question(text: str) -> str:
    """Keep only the sentences of a long post that actually ask something (narrative dilutes retrieval)."""
    if len(text) < FOCUS_MIN_CHARS:
        return text
    parts = [p.strip(" -–•\t") for p in re.split(r"(?<=[.?!])\s+|\n+", text) if p.strip(" -–•\t")]
    asking = [p for p in parts if _QUESTION_CUE.search(p)]
    focused = " ".join(asking) if asking else text
    return focused if len(focused) >= 12 else text


def _fold(text: str) -> str:
    return strip_accents(text.casefold())


_MARKET = re.compile(
    r"\b(?:pass|thanh ly|ban lai|mua lai|can mua|muon mua|tim mua|gom don|order)\b|"
    r"\b(?:mua|ban)\b.{0,40}\b(?:sach|giao trinh|tai lieu|ao|dong phuc|do dung)\b"
)
_MATERIALS = re.compile(
    r"\b(?:tim|xin|can|kiem|co ai co|ai co|share|chia se|cho (?:em|e|minh|tui) (?:xin|muon))\b.{0,50}"
    r"\b(?:tai lieu|tlieu|tl|de cu|de thi|de (?:ck|gk|cuoi ky|cuoi ki|giua ky|giua ki)|slide|bai giang|"
    r"sach goc|giao trinh|file|tips?)\b"
)
# Lecturer by name, on the accented original text ("cô Ngọc", "thầy C"): folded "co" would also match
# "có"/"cố" (cố vấn học tập) and misroute regulation questions.
_LECTURER = re.compile(r"(?:\b[Tt]hầy|\b[Cc]ô|\bGV|\bgv)\s+[A-ZĐÀ-Ỹ]")
_REVIEW_WORDS = re.compile(
    r"\b(?:khó|dễ|ôn gì|dặn|review|chấm|gắt|cho điểm|đề)\b", re.IGNORECASE)
_REVIEW = re.compile(
    r"\b(?:review|đánh giá)\s+(?:thầy|cô|gv|giảng viên|môn)\b|"
    r"\bđề\b.{0,40}\b(?:khó|dễ)\s+(?:ko|không|k|kh|hong|khum)\b|\bôn\s+(?:chương|phần)\s+nào\b",
    re.IGNORECASE,
)
_SCHEDULE_WORDS = re.compile(r"\b(?:lịch học|thời gian|lớp|môn)\b", re.IGNORECASE)


def _is_review(text: str) -> bool:
    return bool(_REVIEW.search(text) or (_LECTURER.search(text) and _REVIEW_WORDS.search(text)))


def _is_class_schedule(text: str) -> bool:
    return bool(_LECTURER.search(text) and _SCHEDULE_WORDS.search(text))

_REDIRECTS: list[tuple[str, Any, str, str]] = [
    ("market", lambda text: _MARKET.search(_fold(text)),
     "Mua bán, pass sách, giáo trình hay đồ dùng học tập không thuộc phần tra cứu quy chế. "
     "Bạn đăng hoặc tìm ở mục Trao đổi sách của UELPATH nhé.", "/books"),
    ("review", _is_review,
     "Mình không đánh giá giảng viên hay đoán đề thi. Hình thức thi và trọng số đánh giá của từng học phần "
     "có trong đề cương ở mục Học phần.", "/modules"),
    ("materials", lambda text: _MATERIALS.search(_fold(text)),
     "Mình không cung cấp tài liệu hay đề thi cũ. Mục Học phần có đề cương (mục tiêu, nội dung, tài liệu tham "
     "khảo, hình thức đánh giá); sách và tài liệu do sinh viên chia sẻ nằm ở mục Trao đổi sách.", "/modules"),
    ("schedule", _is_class_schedule,
     "Lịch của một lớp học phần cụ thể xem ở mục Thời khóa biểu; mình chỉ trả lời quy định về đăng ký và "
     "điều chỉnh học phần.", "/timetable"),
]


def forum_redirect(question: str) -> dict[str, Any] | None:
    for kind, matches, message, href in _REDIRECTS:
        if matches(question):
            return {"answer": message, "citations": [], "warnings": [], "mode": "redirect", "found": False,
                    "redirect": {"kind": kind, "href": href}}
    return None


OUT_OF_SCOPE = ("Mình chỉ tra cứu quy chế, thủ tục học vụ và thông tin trong sổ tay sinh viên (kèm trích dẫn "
                "nguyên văn). Câu hỏi về nội dung môn học, bài tập hay kinh nghiệm cá nhân mình chưa hỗ trợ; "
                "bạn thử hỏi cụ thể về quy định, ví dụ điều kiện, thời hạn hoặc thủ tục.")
