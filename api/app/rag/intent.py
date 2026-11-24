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
    (r"\bđăng\s+kí\b|\b[đd]ki\b|\b[đd]ăng\s?ki\b", "đăng ký"),
    (r"\bq(?:s|su)\b", "quân sự"),
    (r"\b(?:học|đi|kỳ|kì)\s+quân\s+sự\b(?!\s*\()", r"\g<0> (giáo dục quốc phòng an ninh)"),
    (r"\bhki\s*(\d)\b", r"học kỳ \1"),
    (r"\bhki\b", "học kỳ"),
    (r"\bk[ìi]\s+(?=\d|này|sau|tới|trước|hè|phụ)", "kỳ "),
    (r"\b(?:ko|k|hong|hông|khum|kh|hok)\b", "không"),
    (r"\b(?:đc|dc)\b", "được"),
    (r"\b(?:mn|mng)\b", "mọi người"),
    # Unambiguous abbreviations mined from ~5,000 posts of the UEL student group (frequency order).
    # Ambiguous ones ("bv", "sk", "đk", "tn", "tl") are left to the understanding step (understand.py).
    (r"\bppnckh\b", "phương pháp nghiên cứu khoa học"),
    (r"\bnckh\b", "nghiên cứu khoa học"),
    (r"\bkthp\b", "kết thúc học phần"),
    (r"\bksk\b", "khám sức khỏe"),
    (r"\bbhyt\b", "bảo hiểm y tế"),
    (r"\bkkht\b", "khuyến khích học tập"),
    (r"\bcccd\b", "căn cước công dân"),
    (r"\bmssv\b", "mã số sinh viên"),
    (r"\bctsv\b", "công tác sinh viên"),
    (r"\bccnn\b", "chứng chỉ ngoại ngữ"),
    (r"\bkltn\b", "khóa luận tốt nghiệp"),
    (r"\btttn\b", "thực tập tốt nghiệp"),
    (r"\bgvhd\b", "giảng viên hướng dẫn"),
    (r"\bgcn\b", "giấy chứng nhận"),
    (r"\b[đd]hqg\b", "Đại học Quốc gia"),
    (r"\bclb\b", "câu lạc bộ"),
    (r"\bbcs\b", "ban cán sự"),
    (r"\bc[đd]r\b", "chuẩn đầu ra"),
    (r"\bct[đd]t\b", "chương trình đào tạo"),
    (r"\bkq\b", "kết quả"),
    (r"\bnmlh\b", "Nhập môn luật học"),
    (r"\bktvm\b", "Kinh tế vi mô"),
    (r"\bqth\b", "Quản trị học"),
    (r"\bcnxhkh\b", "Chủ nghĩa xã hội khoa học"),
    (r"\btthcm\b", "Tư tưởng Hồ Chí Minh"),
    (r"\blsđ\b", "Lịch sử Đảng"),
    (r"\bktct\b", "Kinh tế chính trị"),
    (r"\bxstk\b", "Xác suất thống kê"),
    (r"\bnlkt\b", "Nguyên lý kế toán"),
    (r"\bkttc\b", "Kế toán tài chính"),
    (r"\bcsdl\b", "Cơ sở dữ liệu"),
    # English phrasing -> the Vietnamese wording of the regulations (scope gate and BM25 are Vietnamese).
    (r"\b(?:register(?:ing)?|registration|enrol(?:l|ling|lment)?)\b", "đăng ký"),
    (r"\b(?:withdraw(?:al|ing)?|drop(?:ping)?)\b", "rút"),
    (r"\b(?:subjects?|courses?|modules?|classes)\b", "học phần"),
    (r"\b(?:semesters?|terms?)\b", "học kỳ"),
    (r"\bcredits?\b", "tín chỉ"),
    (r"\b(?:maximum|max|at most|most)\b", "tối đa"),
    (r"\b(?:minimum|min|at least)\b", "tối thiểu"),
    (r"\bhow many\b", "bao nhiêu"),
    (r"\b(?:graduat(?:e|ion|ing))\b", "tốt nghiệp"),
    (r"\b(?:scholarships?)\b", "học bổng"),
    (r"\b(?:tuition|fees?)\b", "học phí"),
    (r"\b(?:regulations?|rules?|policy|policies)\b", "quy chế"),
    (r"\b(?:requirements?|conditions?)\b", "điều kiện"),
    (r"\b(?:deadline|time limit)\b", "thời hạn"),
    (r"\b(?:exams?|examinations?|finals?)\b", "thi kết thúc học phần"),
    (r"\b(?:retake|re-?study|repeat)\b", "học lại"),
    (r"\b(?:gpa|grade point average)\b", "điểm trung bình tích lũy (GPA)"),
    (r"\b(?:english (?:requirement|certificate|output standard)|ielts|toeic)\b", "chuẩn đầu ra tiếng Anh"),
    (r"\b(?:suspend(?:ed)?|leave of absence|deferment)\b", "bảo lưu"),
    (r"\b(?:dormitory|dorm)\b", "ký túc xá"),
    (r"\b(?:sem)\b", "học kỳ"),
    (r"\b(?:training|conduct|discipline) (?:scores?|points?|results?)\b", "điểm rèn luyện (kết quả rèn luyện)"),
    (r"\b(?:academic|school) years?\b", "năm học"),
    (r"\b(?:evaluat(?:e|ed|es|ion|ing)|assess(?:ed|ment|ing)?)\b", "đánh giá"),
    (r"\b(?:every|each|per)\b", "mỗi"),
    (r"\b(?:is|are|was|were|be|been|do|does|did|the|of|to|or|and|in|on|for|what|which|can|could|should|"
     r"how|long|much|one|there|any)\b", " "),
    (r"\b(?:certificates?|certification)\b", "chứng chỉ"),
    (r"\b(?:valid(?:ity)?|expir(?:e|es|ed|y|ation))\b", "thời hạn"),
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
    r"có được|có bị|phải làm gì|bao lâu|hay không|hỏi về|thắc mắc|nên (?:đăng ký|học|làm))\b", re.IGNORECASE)
FOCUS_MIN_CHARS = 160


def focus_question(text: str) -> str:
    """Keep only the sentences of a long post that actually ask something (narrative dilutes retrieval)."""
    if len(text) < FOCUS_MIN_CHARS:
        return text
    parts = [p.strip(" -–•\t") for p in re.split(r"(?<=[.?!])\s+|\n+", text) if p.strip(" -–•\t")]
    asking = [p for p in parts if _QUESTION_CUE.search(p)]
    # The opening sentence usually names the topic ("về việc đăng ký học phần tự chọn …"), even when the
    # greeting cue ("cho em hỏi") was stripped from it.
    if asking and parts[0] not in asking and len(parts[0]) >= 15:
        asking.insert(0, parts[0])
    focused = " ".join(asking) if asking else text
    return focused if len(focused) >= 12 else text


def _fold(text: str) -> str:
    return strip_accents(text.casefold())


_MARKET = re.compile(
    r"\b(?:pass\s+(?:lai|sach|giao trinh|tai lieu|do|ao|dong phuc|de)|thanh ly|ban lai|mua lai|can mua|muon mua|"
    r"tim mua|gom don|order)\b|"
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


_FOLLOWUP_START = re.compile(
    r"^\s*(?:còn|vậy|thế|thì|và|nữa|nếu vậy|như vậy|trường hợp (?:đó|này)|and|then|so|also|what about|"
    r"how about|what if|how so)\b", _FLAGS)
_ANAPHORA = re.compile(r"\b(?:nó|cái đó|điều đó|việc đó|như thế|họ|it|them|they|those)\b", _FLAGS)
FOLLOWUP_MAX_TERMS = 4


def _term_count(text: str) -> int:
    from .textnorm import content_terms
    return len(content_terms(text))


def followup_cue(question: str) -> bool:
    """The question leans on an earlier one: a connective opener ("Còn…", "And…") or a pronoun in a short question."""
    return bool(_FOLLOWUP_START.match(question)
                or (_ANAPHORA.search(question) and _term_count(question) <= FOLLOWUP_MAX_TERMS))


def maybe_elliptical(question: str) -> bool:
    """Too short to stand alone, so a miss is worth one retry with the earlier questions as context."""
    return _term_count(question) <= FOLLOWUP_MAX_TERMS


def with_context(question: str, previous: list[str] | None) -> str:
    """Prefix the last earlier questions so retrieval and the model see the topic the follow-up refers to."""
    earlier = [p.strip() for p in (previous or [])[-2:] if p and p.strip()]
    if not earlier:
        return question
    return " ".join([*earlier, question])[:1500]


OUT_OF_SCOPE = ("Mình chỉ tra cứu quy chế, thủ tục học vụ và thông tin trong sổ tay sinh viên (kèm trích dẫn "
                "nguyên văn). Câu hỏi về nội dung môn học, bài tập hay kinh nghiệm cá nhân mình chưa hỗ trợ; "
                "bạn thử hỏi cụ thể về quy định, ví dụ điều kiện, thời hạn hoặc thủ tục.")
