"""Page-aware segmentation of student handbooks."""
from __future__ import annotations

import re
import textwrap
from collections.abc import Iterator

from .models import Chunk, RegulationDoc
from .textnorm import collapse_ws

MAX_CHUNK_CHARS = 1200
SOURCE_LABEL = "Nguồn tóm tắt: sổ tay"
SUMMARY_WARNING = "Tóm tắt trong sổ tay sinh viên; đối chiếu văn bản gốc"
_CHAPTER = re.compile(r"^Chương\s+(?:[IVXLCDM]+|\d+)\b", re.IGNORECASE)
_CHAPTER_TITLES = {
    "TỔNG QUAN", "GIỚI THIỆU TRƯỜNG ĐẠI HỌC KINH TẾ - LUẬT", "QUYỀN VÀ NGHĨA VỤ CỦA SINH VIÊN",
    "CHƯƠNG TRÌNH ĐÀO TẠO", "HOẠT ĐỘNG HỌC TẬP", "TÀI NGUYÊN HỖ TRỢ HỌC TẬP",
    "HOẠT ĐỘNG RÈN LUYỆN", "HOẠT ĐỘNG HỖ TRỢ SINH VIÊN", "HOẠT ĐỘNG ĐOÀN THỂ - PHONG TRÀO",
}
_RUNNING_FOOTER = re.compile(r"(?:\d|\s)*(?:STUDENT HANDBOOK(?:\d|\s)*)+", re.IGNORECASE)
_NUMBERED_TITLE = re.compile(r"^(?:\d+\.\s*|[A-Z]\.\s+)")
_LIST_ITEM = re.compile(r"^(?:[-+–•▪]\s+|\d+(?:\.\d+)*[.)]?\s+|[a-zđ]\)\s+)")
_DUPLICATE = re.compile(r"^(.{5,}?)\s*\1$")
_CONTACT_VALUE = re.compile(
    r"^(?:SĐT|Hotline|Điện thoại|Email|Chức vụ|Địa chỉ|Số trực ban)\s*:", re.IGNORECASE
)
_EXAM_SCORE_ROW = re.compile(r"^(?:IELTS|TOEIC|TOEFL|VSTEP|CEFR|Aptis|PTE|PEIC)\b.*\d", re.IGNORECASE)


def _is_title(line: str) -> bool:
    # OCR often renders contact labels in uppercase. They are evidence values,
    # not headings; dropping them here makes phone-number answers impossible.
    if _CONTACT_VALUE.match(line) or _EXAM_SCORE_ROW.match(line):
        return False
    return bool(_CHAPTER.match(line)) or (
        5 <= len(line) <= 135 and line.isupper() and " " in line and not _LIST_ITEM.match(line)
    ) or bool(_NUMBERED_TITLE.match(line) and line.isupper() and len(line) <= 135)


def _lines(text: str) -> list[str]:
    lines = [collapse_ws(line) for line in text.splitlines()]
    while lines and (not lines[0] or lines[0].isdigit()):
        lines.pop(0)
    while lines and (not lines[-1] or re.fullmatch(r"\d+(?: \d+)?", lines[-1])):
        lines.pop()
    return [line for line in lines if not _RUNNING_FOOTER.fullmatch(line)]


def _blocks(lines: list[str]) -> Iterator[tuple[str, str]]:
    """Keep consecutive title lines together unless a new numbered heading starts."""
    titles: list[str] = []
    for line in lines:
        if _is_title(line):
            repeated = _DUPLICATE.fullmatch(line)
            title = repeated[1].strip() if repeated else line
            if titles and (_NUMBERED_TITLE.match(title) or _CHAPTER.match(title)):
                yield "title", " ".join(titles)
                titles = []
            if titles and all(part in title for part in titles):
                titles = []
            if title not in titles:
                titles.append(title)
            continue
        if titles:
            yield "title", " ".join(titles)
            titles = []
        yield "body", line
    if titles:
        yield "title", " ".join(titles)


def _chunk_text(lines: list[str]) -> Iterator[str]:
    paragraphs: list[str] = []
    for line in lines:
        if (not line or not paragraphs or not paragraphs[-1] or _LIST_ITEM.match(line)
                or "@" in line or "@" in paragraphs[-1]):
            paragraphs.append(line)
        else:
            paragraphs[-1] += " " + line
    block = ""
    for paragraph in paragraphs:
        for piece in textwrap.wrap(paragraph, width=MAX_CHUNK_CHARS, break_on_hyphens=False):
            if block and len(block) + len(piece) + 1 > MAX_CHUNK_CHARS:
                yield block
                block = ""
            block = f"{block}\n{piece}" if block else piece
    if block:
        yield block


def build_handbook_chunks(doc: RegulationDoc, pages: list[tuple[int, str]]) -> list[Chunk]:
    chunks: list[Chunk] = []
    chapter = section = heading = "Giới thiệu"
    for page, text in pages:
        lines = _lines(text)
        if not lines or lines[0] == "MỤC LỤC":
            continue
        body: list[str] = []
        part = 0
        for kind, value in [*_blocks(lines), ("title", "")]:
            if kind == "body":
                body.append(value)
                continue
            for block in _chunk_text(body):
                part += 1
                anchor = f"trang-{page}-muc-{part}"
                chunks.append(Chunk(
                    chunk_id=f"{doc.doc_id}:{anchor}", doc_id=doc.doc_id, text=block,
                    title=doc.title, heading=heading, chapter=chapter, page=page,
                    source_type=doc.source_type, source_anchor=anchor,
                    applies_to_cohorts=list(doc.applies_to_cohorts),
                ))
            body.clear()
            if not value:
                continue
            if value in _CHAPTER_TITLES or _CHAPTER.match(value):
                chapter = section = heading = value
            elif _NUMBERED_TITLE.match(value):
                heading = f"{section} — {value}"
            else:
                section = heading = value
    return chunks


def citation_label(doc: RegulationDoc, chunk: Chunk) -> str:
    return f"Sổ tay SV {', '.join(doc.applies_to_cohorts)}, tr. {chunk.page} — {chunk.heading}"
