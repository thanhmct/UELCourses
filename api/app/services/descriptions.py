"""Mô tả học phần song ngữ: điền `modules.description` (tiếng Việt) và `modules.description_en` (tiếng Anh).

Nguồn: phần "Mô tả học phần" của đề cương đã phân tích (`outline_courses.description`, liên kết qua `outline_module_links`).
Ngôn ngữ theo loại tài liệu:
  - Nếu đề cương tiếng Anh (`outline_courses.doc_type='syllabus_en'`) -> luôn xếp vào tiếng Anh (`modules.description_en`).
  - Nếu đề cương tiếng Việt (`outline_courses.doc_type='syllabus_vi'`) -> luôn xếp vào tiếng Việt (`modules.description`).
  - Loại khác: nhận diện theo văn bản (chữ cái tiếng Việt có dấu -> vi, ngược lại -> en).
Bước 2: học phần chưa có một bản thì chép từ bản Anh<->Việt tương ứng (`counterpart_code`, cùng một môn học ở hai ngôn ngữ giảng dạy)
và ghi `*_source = 'counterpart'`.

Đồng thời điền `modules.faculty` và `modules.department` khi rỗng/không khớp từ đề cương và bản đối ứng (fill_faculties).

Idempotent. Không ghi đè mô tả nhập tay (có nội dung nhưng `*_source` NULL). Đề cương có `parse_status = failed` vẫn được dùng nếu
đoạn mô tả có độ dài hợp lý (60–2500 ký tự): lỗi phân tích thường ở các mục khác; đoạn quá dài thường là phân tích nuốt thêm mục khác.
"""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Module, OutlineCourse, OutlineModuleLink
from app.services.faculty_names import fill_faculties

_VI_CHARS = re.compile(r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]", re.I)
MIN_LEN, MAX_LEN = 60, 2500
_RANK = {"ok": 0, "partial": 1}

# Một số đề cương PDF bị mất ngắt trang/ngắt mục khi trích xuất, khiến phần
# giáo trình được nối thẳng vào `outline_courses.description`. Chỉ nhận các
# tiêu đề mục rõ ràng; không cắt những câu hợp lệ như "dựa trên giáo trình...".
_MATERIAL_SECTION_RE = re.compile(
    r"""
    (?:
        (?:\b\d+(?:\.\d+)*[.)]?\s+)?
        (?:
            tài\s+liệu\s+học\s+tập
            | tài\s+liệu\s+tham\s+khảo
            | study\s+materials?
            | study\s+documents?
            | learning\s+materials?
            | course\s+books?\s*,?\s*reference\s+books?\s+and\s+softwares?
        )\b
        |
        (?:^|(?<=[\n.!?]))\s*(?:\d+(?:\.\d+)*[.)]?\s*)?
        (?:
            giáo\s+trình\s*(?=[:：\[])
            | (?:study\s+)?materials?\s*(?=(?:textbooks?|books?|references?)\b)
            | textbooks?\s*(?=[:：\[])
            | (?:other\s+)?references?\s*(?=[:：\[])
        )
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)
_PAGE_MARKER_RE = re.compile(r"\b(?:trang|page)\s*\d+\s*/\s*\d+\b", re.IGNORECASE)
_EMBEDDED_OUTLINE_HEADER_RE = re.compile(
    r"\b(?:đề\s+cương\s+(?:môn\s+học|học\s+phần)|course\s+syllabus)\b.{0,120}?"
    r"(?=\b(?:trang|page)\s*\d+\s*/\s*\d+\b)",
    re.IGNORECASE,
)
_PDF_TEMPLATE_LINE_RE = re.compile(
    r"^\s*(?:mẫu\s+\d+\s*:\s*)?đề\s+cương\s+chi\s+tiết\s+học\s+phần\s*$",
    re.IGNORECASE | re.MULTILINE,
)
_PDF_CONTROL_LINE_RE = re.compile(r"^\s*(?:\d{1,3}|x)\s*$", re.IGNORECASE | re.MULTILINE)


def detect_lang(text: str) -> str:
    return "vi" if len(_VI_CHARS.findall(text)) >= 3 else "en"


def _leading_parenthetical_end(text: str) -> int | None:
    """Vị trí dấu `)` đóng ngoặc đầu chuỗi, có hỗ trợ ngoặc lồng như `(CTĐT)`."""
    if not text.startswith("("):
        return None
    depth = 0
    for i, char in enumerate(text):
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return i
    return None


def _is_description_instruction(prefix: str) -> bool:
    """Nhận diện câu hướng dẫn mẫu về vị trí/mục tiêu/nội dung, không phải mô tả thật."""
    p = prefix.casefold()
    vi = (
        "vị trí" in p
        and any(term in p for term in ("môn học", "học phần", "khóa học"))
        and any(term in p for term in ("chương trình", "ctđt"))
    )
    en = (
        any(term in p for term in ("position", "location"))
        and any(term in p for term in ("course", "subject", "module"))
        and any(term in p for term in ("program", "programme", "curriculum"))
    )
    return vi or en


def strip_description_artifacts(text: str | None) -> str | None:
    """Bỏ câu hướng dẫn mẫu, đầu/dấu trang PDF bị chèn vào mô tả."""
    if not text:
        return None

    cleaned = text
    changed = False
    stripped = cleaned.lstrip()
    end = _leading_parenthetical_end(stripped)
    if end is not None and _is_description_instruction(stripped[: end + 1]):
        cleaned = stripped[end + 1 :]
        # Số trang đơn lẻ thường đứng ngay sau câu hướng dẫn, ví dụ `) 2 The course...`.
        cleaned = re.sub(r"^\s*\d{1,3}\s+(?=\S)", "", cleaned, count=1)
        changed = True

    without_headers = _EMBEDDED_OUTLINE_HEADER_RE.sub(" ", cleaned)
    without_templates = _PDF_TEMPLATE_LINE_RE.sub(" ", without_headers)
    without_controls = _PDF_CONTROL_LINE_RE.sub(" ", without_templates)
    without_pages = _PAGE_MARKER_RE.sub(" ", without_controls)
    changed = changed or without_pages != cleaned
    if not changed:
        return text
    cleaned = re.sub(r"[ \t]+", " ", without_pages.replace("\r", "")).strip()
    cleaned = re.sub(r"(?:\n[ \t]*){2,}", "\n\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned or None


def strip_material_sections(text: str | None) -> str | None:
    """Bỏ mục giáo trình/tài liệu bị nối vào mô tả, giữ nguyên phần mô tả trước đó."""
    if not text:
        return None
    match = _MATERIAL_SECTION_RE.search(text)
    if not match:
        return text
    cleaned = text[:match.start()]
    cleaned = cleaned.rstrip(" \t\r\n:;-")
    return cleaned or None


_BULLET_RE = re.compile(r"^(?:[•●▪]|(?:[-–*]|\d{1,3}[.)])\s)")
_SENTENCE_END_CHARS = '.!?:;…)”"'


def _is_bullet(text: str) -> bool:
    return bool(_BULLET_RE.match(text))


def _starts_paragraph(text: str) -> bool:
    first = text[:1]
    return bool(first) and (first.isupper() or first.isdigit() or first in '"“')


def _join_pdf_lines(block: str) -> str:
    """Nối các dòng bị PDF ngắt theo độ rộng trang. Giữ xuống dòng trước dòng bullet hoặc sau dấu hai chấm."""
    lines = [line.strip() for line in block.split("\n") if line.strip()]
    if not lines:
        return ""
    out = lines[0]
    for prev, line in zip(lines, lines[1:]):
        out += ("\n" if prev.endswith(":") or _is_bullet(line) else " ") + line
    return out


def _join_pdf_blocks(blocks: list[str]) -> str:
    """Ghép các khối (cách nhau bởi dòng trống). Chỉ giữ thành đoạn mới khi khối trước kết thúc câu
    và khối sau bắt đầu đoạn mới; còn lại là ngắt trang giữa câu nên nối bằng khoảng trắng."""
    out = blocks[0] if blocks else ""
    for block in blocks[1:]:
        last = out[-1:]
        ends_sentence = bool(last) and last in _SENTENCE_END_CHARS
        if _is_bullet(block) or (ends_sentence and _starts_paragraph(block)):
            out += "\n\n" + block
        else:
            out += " " + block
    return out


def normalize_description_line_breaks(text: str | None) -> str | None:
    cleaned = (text or "").strip()
    if not cleaned:
        return None

    # Một số PDF tách mỗi từ thành một đoạn riêng. Chỉ nối khi mẫu này lặp suốt mô tả.
    paragraphs = re.split(r"\r?\n(?:[ \t]*\r?\n)+", cleaned)
    if len(paragraphs) >= 10 and all(len(part.split()) == 1 for part in paragraphs):
        return " ".join(part.strip() for part in paragraphs)

    # PDF ngắt dòng cứng theo độ rộng trang (đôi khi kèm một dòng trống giữa câu khi qua trang): nối lại thành câu liền mạch.
    blocks = [block for block in re.split(r"\n\s*\n", cleaned.replace("\r", "")) if block.strip()]
    return _join_pdf_blocks([_join_pdf_lines(block) for block in blocks])


def clean_description(text: str | None) -> str | None:
    """Bỏ phần tài liệu, gọn khoảng trắng; loại đoạn quá ngắn/quá dài."""
    stripped = strip_material_sections(strip_description_artifacts(text))
    stripped = normalize_description_line_breaks(stripped)
    if not stripped:
        return None
    t = re.sub(r"[ \t]+", " ", stripped.replace("\r", "")).strip()
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t if MIN_LEN <= len(t) <= MAX_LEN else None


def fill_descriptions(db: Session) -> dict:
    cand: dict[str, dict[str, str]] = {}  # module_code -> {"vi": ..., "en": ...} (đề cương tốt nhất cho từng ngôn ngữ)
    rows = db.execute(
        select(
            OutlineModuleLink.module_code,
            OutlineCourse.description,
            OutlineCourse.parse_status,
            OutlineCourse.document_id,
            OutlineCourse.doc_type,
        )
        .join(OutlineCourse, OutlineCourse.document_id == OutlineModuleLink.document_id)
        .where(OutlineCourse.description.is_not(None))
    ).all()
    for code, desc, status, doc_id, doc_type in sorted(rows, key=lambda r: (r[0], _RANK.get(r[2], 2), r[3])):
        d = clean_description(desc)
        if d:
            if doc_type == "syllabus_en":
                lang = "en"
            elif doc_type == "syllabus_vi":
                lang = "vi"
            else:
                lang = detect_lang(d)
            cand.setdefault(code, {}).setdefault(lang, d)

    mods = {m.code: m for m in db.scalars(select(Module))}
    manual_vi = manual_en = 0
    # Bước 1: từ đề cương của chính học phần
    plan: dict[str, dict[str, tuple[str, str]]] = {c: {} for c in mods}
    for code, langs in cand.items():
        if code in plan:
            for lang, d in langs.items():
                plan[code][lang] = (d, "outline")
    # Bước 2: chép chéo từ bản Anh<->Việt tương ứng (chỉ khi thiếu)
    for code, m in mods.items():
        other = mods.get(m.counterpart_code) if m.counterpart_code else None
        if other is None:
            continue
        for lang in ("vi", "en"):
            if lang not in plan[code] and lang in plan.get(other.code, {}) and plan[other.code][lang][1] == "outline":
                plan[code][lang] = (plan[other.code][lang][0], "counterpart")

    stats = {"vi": {"outline": 0, "counterpart": 0}, "en": {"outline": 0, "counterpart": 0}}
    for code, m in mods.items():
        for lang, text_attr, src_attr in (("vi", "description", "description_source"), ("en", "description_en", "description_en_source")):
            if getattr(m, text_attr) and not getattr(m, src_attr):  # nhập tay: không đụng
                manual_vi += lang == "vi"
                manual_en += lang == "en"
                continue
            val = plan[code].get(lang)
            setattr(m, text_attr, val[0] if val else None)
            setattr(m, src_attr, val[1] if val else None)
            if val:
                stats[lang][val[1]] += 1

    # Đồng thời điền faculty/department khi rỗng/không khớp từ đề cương và counterpart
    fill_faculties(db)

    db.commit()
    return {"modules": len(mods), "vi": stats["vi"], "en": stats["en"],
            "vi_total": sum(stats["vi"].values()) + manual_vi, "en_total": sum(stats["en"].values()) + manual_en,
            "kept_manual": {"vi": manual_vi, "en": manual_en}}
