"""Split Vietnamese legal text into Chương / Mục / Điều / Khoản / Điểm and build retrieval chunks.

Text is kept verbatim (only whitespace inside a line is normalised and soft-wrapped lines are
joined with a single space).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from .models import Article, Chunk, Clause, Point, RegulationDoc
from .textnorm import nfc

_CHAPTER_RE = re.compile(r"^(?:chương|chuong)\s+([IVXLCDM]+|\d+)\b\s*[.:\-–]?\s*(.*)$", re.IGNORECASE)
_SECTION_RE = re.compile(r"^(?:mục|muc)\s+(\d+|[IVXLCDM]+)\b\s*[.:\-–]?\s*(.*)$", re.IGNORECASE)
_ARTICLE_RE = re.compile(r"^(?:điều|dieu)\s+(\d+[a-zđ]?)\s*[.:]\s*(.*)$", re.IGNORECASE)
_CLAUSE_RE = re.compile(r"^(\d{1,2})\.(?!\d)\s*(\S.*)$")
_POINT_RE = re.compile(r"^([a-zđ])\)\s*(\S.*)$")

_POINT_ORDER = "abcdđefghiklmnopqrstuvxyz"

DECISION_RE = re.compile(r"(?:Quyết định|Quyết Định|QUYẾT ĐỊNH)\s+số[:\s]*([0-9]+\s*/\s*[0-9A-Za-zĐđ\-–/]+)")
HEADER_NO_RE = re.compile(r"^\s*Số\s*[:.]?\s*(\d+\s*/\s*[0-9A-Za-zĐđ\-–/]*[A-Za-zĐđ][0-9A-Za-zĐđ\-–/]*)", re.IGNORECASE)
KEM_THEO_RE = re.compile(r"kèm\s+theo\s+(?:Quyết\s+định|Thông\s+tư)\s+số\s*[:\s]*(\d+\s*/\s*[0-9A-Za-zĐđ\-–/]+)",
                         re.IGNORECASE)
PLACE_DATE_RE = re.compile(r"(?:Thành\s+phố|TP\.|Tp\.|Hà\s+Nội)[^,]*,\s*ngày", re.IGNORECASE)
DATE_RE = re.compile(r"ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})", re.IGNORECASE)

MAX_CHUNK_CHARS = 1400
CHUNK_OVERLAP_CHARS = 180
_APPENDIX_RE = re.compile(
    r"(?:(?<=\./\.)\s*(?:\d+\s+)?)?(?P<label>(?:DANH\s+MỤC\s+CÁC\s+)?PHỤ\s+LỤC(?:\s+[IVXLCDM\d]+)?)\b",
    re.IGNORECASE,
)
_APPENDIX_PAGE_RE = re.compile(r"^Phụ\s+lục\s+([IVXLCDM]+|\d+)\s*:", re.IGNORECASE)


@dataclass
class AppendixPage:
    label: str
    page: int
    text: str
    cohorts: list[str] | None


@dataclass
class ParsedDocument:
    articles: list[Article] = field(default_factory=list)
    preamble: str = ""
    decision_no: str | None = None
    issued_date: str | None = None
    warnings: list[str] = field(default_factory=list)
    appendices: list[AppendixPage] = field(default_factory=list)

    def counts(self) -> dict[str, int]:
        clauses = sum(len([c for c in a.clauses if c.clause]) for a in self.articles)
        points = sum(len(c.points) for a in self.articles for c in a.clauses)
        return {"articles": len(self.articles), "clauses": clauses, "points": points}


def _is_marker(line: str) -> bool:
    return bool(
        _CHAPTER_RE.match(line) or _SECTION_RE.match(line) or _ARTICLE_RE.match(line)
        or _CLAUSE_RE.match(line) or _POINT_RE.match(line)
    )


def _append(existing: str, extra: str) -> str:
    return f"{existing} {extra}".strip() if existing else extra


def _art_int(num: str) -> int | None:
    m = re.match(r"\d+", num)
    return int(m.group()) if m else None


def segment(pages: list[tuple[int, str]] | str) -> ParsedDocument:
    """Parse text (or [(page_no, text)]) into articles with clauses and points."""
    if isinstance(pages, str):
        pages = [(1, pages)]
    result = ParsedDocument()
    lines: list[tuple[int, str]] = []
    for page_no, text in pages:
        page_lines = [line.strip() for line in nfc(text).split("\n") if line.strip()]
        first = next((i for i, line in enumerate(page_lines) if not line.isdigit()), None)
        if first is not None and (appendix := _APPENDIX_PAGE_RE.match(page_lines[first])):
            page_lines = page_lines[first:]
            scope = next((line for line in page_lines[1:4] if line.casefold().startswith("áp dụng")), "")
            cohorts = [f"K{value}" for value in re.findall(r"\bKhóa\s+(?:K\s*)?(?:20)?(\d{2})\b", scope, re.IGNORECASE)]
            if cohorts and re.match(r"Áp dụng từ\b", scope, re.IGNORECASE):
                cohorts[0] += "+"
            result.appendices.append(AppendixPage(f"Phụ lục {appendix[1].upper()}", page_no,
                                                   "\n".join(page_lines), cohorts or None))
            continue
        lines.extend((page_no, line) for line in page_lines)

    preamble: list[str] = []
    chapter: str | None = None
    section: str | None = None
    pending_heading: str | None = None  # "chapter" | "section" waiting for title on next line
    article: Article | None = None
    clause: Clause | None = None
    point: Point | None = None
    last_art_no: int | None = None
    part = 0
    in_title = False  # still possibly reading a wrapped article title

    def close_article():
        nonlocal article, clause, point
        if article is not None:
            result.articles.append(article)
        article, clause, point = None, None, None

    for idx, (page_no, line) in enumerate(lines):
        m = _CHAPTER_RE.match(line)
        if m and line[0].isupper():
            close_article()
            chapter = f"Chương {m.group(1).upper()}"
            section = None
            if m.group(2):
                chapter += f". {m.group(2)}"
                pending_heading = None
            else:
                pending_heading = "chapter"
            continue
        m = _SECTION_RE.match(line)
        if m and line[0].isupper():
            close_article()
            section = f"Mục {m.group(1)}"
            if m.group(2):
                section += f". {m.group(2)}"
                pending_heading = None
            else:
                pending_heading = "section"
            continue
        m = _ARTICLE_RE.match(line)
        if m and line[0].isupper() and not m.group(2)[:1].islower():
            close_article()
            num = m.group(1)
            n = _art_int(num)
            if n is not None and last_art_no is not None and n <= last_art_no:
                part += 1
            last_art_no = n
            article = Article(article=num, title=m.group(2).strip(), chapter=chapter, section=section,
                              page=page_no, part=part)
            pending_heading = None
            in_title = True
            continue

        if pending_heading and article is None and not _is_marker(line):
            if pending_heading == "chapter" and chapter:
                chapter += f". {line}"
            elif pending_heading == "section" and section:
                section += f". {line}"
            pending_heading = None
            continue

        if article is None:
            preamble.append(line)
            continue

        m = _CLAUSE_RE.match(line)
        if m:
            num = int(m.group(1))
            numbered = [int(c.clause) for c in article.clauses if c.clause.isdigit()]
            last = numbered[-1] if numbered else 0
            if num == last + 1:
                clause = Clause(clause=str(num), text=line, page=page_no)
                article.clauses.append(clause)
                point = None
                in_title = False
                continue
        m = _POINT_RE.match(line)
        if m:
            letter = m.group(1)
            if clause is None:
                clause = Clause(clause="", text=article.intro, page=article.page)
                article.intro = ""
                article.clauses.append(clause)
            prev = clause.points[-1].point if clause.points else None
            if prev is None or (_POINT_ORDER.find(letter) > _POINT_ORDER.find(prev) >= 0):
                point = Point(point=letter, text=line, page=page_no)
                clause.points.append(point)
                in_title = False
                continue

        # continuation line
        if in_title and clause is None and not article.intro and line[:1].islower():
            article.title = _append(article.title, line)
            continue
        in_title = False
        if point is not None:
            point.text = _append(point.text, line)
        elif clause is not None:
            clause.text = _append(clause.text, line)
        else:
            article.intro = _append(article.intro, line)
    close_article()

    result.preamble = "\n".join(preamble)
    # Only trust the document's own header ("Số: 1268/QĐ-ĐHKTL", "Ban hành kèm theo Quyết định số …",
    # "TP. Hồ Chí Minh, ngày …"), never "Căn cứ Quyết định số …" lines which cite other documents.
    head_lines = [ln for ln in result.preamble.split("\n") if not re.match(r"^\s*căn\s+cứ", ln, re.IGNORECASE)]
    for ln in head_lines:
        m = HEADER_NO_RE.match(ln) or KEM_THEO_RE.search(ln)
        if m:
            result.decision_no = re.sub(r"\s+", "", m.group(1))
            break
    for ln in head_lines:
        if KEM_THEO_RE.search(ln) or PLACE_DATE_RE.search(ln):
            dt = DATE_RE.search(ln)
            if dt:
                d, mo, y = (int(x) for x in dt.groups())
                try:
                    result.issued_date = date(y, mo, d).isoformat()
                except ValueError:
                    pass
                break
    if not result.articles:
        result.warnings.append("Không nhận diện được Điều nào trong văn bản.")
    return result


def build_chunks(doc: RegulationDoc, parsed: ParsedDocument) -> list[Chunk]:
    """Build bounded verbatim retrieval windows while preserving their legal locator."""
    chunks: list[Chunk] = []
    seen: set[str] = set()

    def split_windows(text: str) -> list[str]:
        """Return overlapping substrings no longer than MAX_CHUNK_CHARS."""
        if len(text) <= MAX_CHUNK_CHARS:
            return [text]
        windows: list[str] = []
        start = 0
        while start < len(text):
            hard_end = min(len(text), start + MAX_CHUNK_CHARS)
            end = hard_end
            if hard_end < len(text):
                floor = start + MAX_CHUNK_CHARS // 2
                candidates = [
                    text.rfind("\n", floor, hard_end),
                    text.rfind(". ", floor, hard_end),
                    text.rfind("; ", floor, hard_end),
                    text.rfind(" ", floor, hard_end),
                ]
                boundary = max(candidates)
                if boundary >= floor:
                    end = boundary + (0 if text[boundary] == "\n" else 1)
            window = text[start:end].strip()
            if window:
                windows.append(window)
            if end >= len(text):
                break
            next_start = max(start + 1, end - CHUNK_OVERLAP_CHARS)
            while next_start > start and next_start < len(text) and not text[next_start - 1].isspace():
                next_start += 1
            start = min(next_start, end)
        return windows

    def sections(text: str) -> list[tuple[str, str, str | None]]:
        """Detach an annex accidentally appended to the final clause."""
        if len(text) <= MAX_CHUNK_CHARS:
            return [("clause", text, None)]
        marker = _APPENDIX_RE.search(text)
        if marker is None or marker.start() < 20:
            return [("clause", text, None)]
        main = text[:marker.start()].rstrip()
        appendix = text[marker.start():].lstrip()
        out = [("clause", main, None)] if main else []
        out.append(("appendix", appendix, " ".join(marker.group("label").split()).title()))
        return out

    def make(article: Article, clause: Clause | None, text: str, page: int | None, suffix: str) -> None:
        if not text.strip():
            return
        head_parts = [p for p in (article.chapter, article.section) if p]
        head_parts.append(f"Điều {article.article}. {article.title}".strip())
        base_id = f"{doc.doc_id}:{article.key}{suffix}"
        for chunk_type, section_text, appendix_label in sections(text):
            for window_part, window in enumerate(split_windows(section_text), 1):
                extra = ""
                if chunk_type == "appendix":
                    extra += f":A{window_part}"
                elif window_part > 1:
                    extra += f":P{window_part}"
                cid = base_id + extra
                base, k = cid, 2
                while cid in seen:
                    cid = f"{base}#{k}"
                    k += 1
                seen.add(cid)
                heading = list(head_parts)
                if appendix_label:
                    heading.append(appendix_label)
                chunks.append(Chunk(
                    chunk_id=cid,
                    doc_id=doc.doc_id,
                    text=window,
                    decision_no=doc.decision_no,
                    title=doc.title,
                    article=article.article,
                    article_title=article.title,
                    clause=(clause.clause or None) if clause else None,
                    point=None,
                    heading=" > ".join(heading),
                    chapter=article.chapter,
                    section=article.section,
                    effective_from=doc.effective_from,
                    effective_to=doc.effective_to,
                    status=doc.status,
                    applies_to_cohorts=list(doc.applies_to_cohorts),
                    page=page,
                    points=[{"point": p.point, "text": p.text} for p in clause.points if p.text in window]
                    if clause else [],
                    part=article.part,
                    chunk_type=chunk_type,
                    window_part=window_part,
                    appendix_label=appendix_label,
                ))

    for art in parsed.articles:
        if not art.clauses:
            make(art, None, art.intro or art.title, art.page, "")
            continue
        if art.intro:
            make(art, None, art.intro, art.page, ":K0")
        for c in art.clauses:
            make(art, c, c.full_text(), c.page, f":K{c.clause}" if c.clause else "")
    for appendix in parsed.appendices:
        anchor = f"phu-luc-{appendix.label.split()[-1].lower()}-trang-{appendix.page}"
        for part, window in enumerate(split_windows(appendix.text), 1):
            chunks.append(Chunk(
                chunk_id=f"{doc.doc_id}:{anchor}:{part}", doc_id=doc.doc_id, text=window,
                title=doc.title, decision_no=doc.decision_no, page=appendix.page,
                heading=appendix.text.splitlines()[0], source_anchor=anchor,
                chunk_type="appendix", appendix_label=appendix.label, window_part=part,
                applies_to_cohorts=appendix.cohorts or list(doc.applies_to_cohorts),
                effective_from=doc.effective_from, effective_to=doc.effective_to, status=doc.status,
            ))
    return chunks
