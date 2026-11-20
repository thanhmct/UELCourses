"""Load regulation files (PDF / DOCX / HTML / TXT) into page-aware, NFC-normalised text."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

from .textnorm import nfc

# A PDF page with fewer extractable characters than this is treated as "no text layer".
MIN_CHARS_PER_PAGE = 40
_VN_CHARS = set("ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ")


@dataclass
class LoadedDocument:
    path: str
    pages: list[tuple[int, str]] = field(default_factory=list)  # (page_no starting at 1, text)
    needs_ocr: bool = False
    warnings: list[str] = field(default_factory=list)
    error: str | None = None
    quality: float | None = None
    ocr_reason: str | None = None  # "scan" | "low_quality" | "no_diacritics"

    @property
    def text(self) -> str:
        return "\n".join(t for _, t in self.pages)

    @property
    def ok(self) -> bool:
        return self.error is None and not self.needs_ocr and bool(self.text.strip())


class LoaderError(Exception):
    pass


def load_document(path: str | Path) -> LoadedDocument:
    p = Path(path)
    doc = LoadedDocument(path=str(p))
    if not p.exists():
        doc.error = f"Không tìm thấy file: {p}"
        return doc
    ext = p.suffix.lower()
    try:
        if ext == ".pdf":
            _load_pdf(p, doc)
        elif ext == ".docx":
            _load_docx(p, doc)
        elif ext in (".html", ".htm"):
            doc.pages = _split_pages(_html_to_text(_read_text_file(p)))
        elif ext in (".txt", ".md", ""):
            doc.pages = _split_pages(_read_text_file(p))
        elif ext == ".doc":
            doc.error = "Định dạng .doc (Word 97-2003) chưa hỗ trợ — hãy chuyển sang .docx hoặc PDF."
            return doc
        else:
            doc.error = f"Định dạng chưa hỗ trợ: {ext}"
            return doc
    except Exception as exc:  # noqa: BLE001 - report any parser failure per file
        doc.error = f"Lỗi đọc file {p.name}: {type(exc).__name__}: {exc}"
        return doc

    doc.pages = [(n, nfc(t)) for n, t in doc.pages]
    _check_legacy_font(doc)
    if ext == ".pdf" and not doc.needs_ocr:
        q = text_quality(doc.text)
        dr = diacritic_ratio(doc.text)
        doc.quality = q
        if q is not None and q < MIN_TEXT_QUALITY:
            doc.needs_ocr = True
            doc.ocr_reason = "low_quality"
            doc.warnings.append(f"Lớp văn bản PDF kém chất lượng (OCR lỗi/font cũ, chỉ {q:.0%} âm tiết hợp lệ) "
                                "— cần OCR lại, không đưa vào chỉ mục.")
        elif dr is not None and dr < MIN_DIACRITIC_RATIO:
            doc.needs_ocr = True
            doc.ocr_reason = "no_diacritics"
            doc.warnings.append(f"Lớp văn bản PDF mất dấu tiếng Việt (chỉ {dr:.0%} âm tiết có dấu, OCR lỗi) "
                                "— cần OCR lại, không đưa vào chỉ mục.")
    return doc


MIN_DIACRITIC_RATIO = 0.2


def diacritic_ratio(text: str) -> float | None:
    """Share of alphabetic tokens carrying Vietnamese diacritics (normal text ~0.5-0.7)."""
    toks = re.findall(r"[^\W\d_]+", text.lower())
    if len(toks) < 50:
        return None
    return sum(1 for t in toks if any(c in _VN_CHARS for c in t)) / len(toks)


_ONSET = r"(?:ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdghklmnpqrstvx])?"
_SYLLABLE_RE = re.compile(rf"^{_ONSET}(?:[aeiouy]{{1,3}})(?:ch|ng|nh|[cmnpt])?$")
MIN_TEXT_QUALITY = 0.6


def text_quality(text: str) -> float | None:
    """Share of alphabetic tokens that are well-formed Vietnamese syllables (None if too little text).

    Good Unicode Vietnamese text scores ~0.85-0.95; broken OCR / legacy-font text scores much lower.
    """
    from .textnorm import strip_accents

    toks = re.findall(r"[^\W\d_]+", text.lower())
    if len(toks) < 50:
        return None
    ok = 0
    for t in toks:
        s = strip_accents(t)
        if _SYLLABLE_RE.match(s) and _valid_marks(t):
            ok += 1
    return ok / len(toks)


def _valid_marks(tok: str) -> bool:
    """At most one tone mark per syllable; only Vietnamese letters."""
    import unicodedata

    tones = 0
    for ch in unicodedata.normalize("NFD", tok):
        if unicodedata.category(ch) == "Mn":
            if ch in "̣̀́̃̉":
                tones += 1
            elif ch not in "̛̂̆":
                return False
        elif not ("a" <= ch <= "z" or ch == "đ"):
            return False
    return tones <= 1


def _read_text_file(p: Path) -> str:
    raw = p.read_bytes()
    for enc in ("utf-8-sig", "utf-16"):
        try:
            text = raw.decode(enc)
            if enc == "utf-16" and not raw.startswith((b"\xff\xfe", b"\xfe\xff")):
                continue
            return text
        except UnicodeDecodeError:
            continue
    return raw.decode("cp1258", errors="replace")


def _split_pages(text: str) -> list[tuple[int, str]]:
    """Form feed (\\f) separates pages in plain-text exports."""
    parts = text.split("\f")
    return [(i + 1, t) for i, t in enumerate(parts)]


def _load_pdf(p: Path, doc: LoadedDocument) -> None:
    from pypdf import PdfReader

    reader = PdfReader(str(p))
    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception:  # noqa: BLE001
            doc.error = "PDF được mã hóa, không đọc được."
            return
    empty_pages = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception as exc:  # noqa: BLE001
            text = ""
            doc.warnings.append(f"Trang {i}: lỗi trích xuất ({exc})")
        if len(text.strip()) < MIN_CHARS_PER_PAGE:
            empty_pages.append(i)
        doc.pages.append((i, text))
    n = len(reader.pages)
    if n == 0 or len(empty_pages) >= max(1, int(0.8 * n)):
        doc.needs_ocr = True
        doc.ocr_reason = "scan"
        doc.warnings.append("PDF dạng ảnh scan (không có lớp văn bản) — cần OCR.")
    elif empty_pages:
        doc.warnings.append(f"Các trang không có văn bản (có thể là ảnh): {empty_pages}")


# ---------------------------------------------------------------- DOCX ----
_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _load_docx(p: Path, doc: LoadedDocument) -> None:
    import docx  # python-docx

    d = docx.Document(str(p))
    numbering = _DocxNumbering(d)
    lines: list[str] = []
    body = d.element.body
    for child in body.iterchildren():
        tag = child.tag
        if tag == _W + "p":
            from docx.text.paragraph import Paragraph

            para = Paragraph(child, d)
            text = para.text
            prefix = numbering.prefix_for(para)
            if prefix and text.strip() and not re.match(r"^\s*(\d+\.|[a-zđ]\))\s", text):
                text = f"{prefix} {text.strip()}"
            lines.append(text)
        elif tag == _W + "tbl":
            from docx.table import Table

            for row in Table(child, d).rows:
                cells = []
                for c in row.cells:
                    t = c.text.strip()
                    if t and (not cells or cells[-1] != t):
                        cells.append(t)
                if cells:
                    lines.append(" | ".join(cells))
    doc.pages = [(1, "\n".join(lines))]


class _DocxNumbering:
    """Re-create Word automatic list numbers ("1.", "a)") that are not part of paragraph text."""

    def __init__(self, document) -> None:
        self.formats: dict[tuple[str, str], tuple[str, str]] = {}  # (numId, ilvl) -> (numFmt, lvlText)
        self.counters: dict[tuple[str, str], int] = {}
        try:
            numbering_el = document.part.numbering_part.element
        except Exception:  # noqa: BLE001 - document without numbering part
            return
        abstract: dict[str, dict[str, tuple[str, str]]] = {}
        for an in numbering_el.findall(_W + "abstractNum"):
            aid = an.get(_W + "abstractNumId")
            lvls = {}
            for lvl in an.findall(_W + "lvl"):
                fmt = lvl.find(_W + "numFmt")
                txt = lvl.find(_W + "lvlText")
                lvls[lvl.get(_W + "ilvl")] = (
                    fmt.get(_W + "val") if fmt is not None else "decimal",
                    txt.get(_W + "val") if txt is not None else "%1.",
                )
            abstract[aid] = lvls
        for num in numbering_el.findall(_W + "num"):
            nid = num.get(_W + "numId")
            ref = num.find(_W + "abstractNumId")
            if ref is None:
                continue
            for ilvl, val in abstract.get(ref.get(_W + "val"), {}).items():
                self.formats[(nid, ilvl)] = val

    def _num_pr(self, para):
        ppr = para._p.pPr
        if ppr is not None and ppr.numPr is not None:
            return ppr.numPr
        style = para.style
        while style is not None:
            sppr = style.element.pPr
            if sppr is not None and sppr.numPr is not None:
                return sppr.numPr
            style = style.base_style
        return None

    def prefix_for(self, para) -> str | None:
        if not self.formats:
            return None
        num_pr = self._num_pr(para)
        if num_pr is None or num_pr.numId is None:
            return None
        nid = str(num_pr.numId.val)
        ilvl = str(num_pr.ilvl.val) if num_pr.ilvl is not None else "0"
        if nid == "0" or (nid, ilvl) not in self.formats:
            return None
        fmt, lvl_text = self.formats[(nid, ilvl)]
        key = (nid, ilvl)
        self.counters[key] = self.counters.get(key, 0) + 1
        # reset deeper levels
        for k in list(self.counters):
            if k[0] == nid and int(k[1]) > int(ilvl):
                self.counters[k] = 0
        n = self.counters[key]
        if fmt == "decimal":
            label = str(n)
        elif fmt == "lowerLetter":
            label = "abcdefghijklmnopqrstuvwxyz"[(n - 1) % 26]
        elif fmt == "upperLetter":
            label = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[(n - 1) % 26]
        elif fmt == "bullet":
            return "-"
        else:
            label = str(n)
        return re.sub(r"%\d", label, lvl_text)


# ---------------------------------------------------------------- HTML ----
class _HTMLText(HTMLParser):
    BLOCK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "table", "ul", "ol"}
    SKIP = {"script", "style", "noscript", "head"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data.replace("\n", " "))


def _html_to_text(html: str) -> str:
    parser = _HTMLText()
    parser.feed(html)
    text = "".join(parser.out)
    lines = [ln.strip() for ln in text.split("\n")]
    return "\n".join(ln for ln in lines if ln)


def _check_legacy_font(doc: LoadedDocument) -> None:
    """Warn when text looks like legacy Vietnamese encodings (TCVN3/VNI) rendered as Latin-1 garbage."""
    text = doc.text.lower()
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 200:
        return
    vn = sum(1 for c in letters if c in _VN_CHARS)
    odd = sum(1 for c in letters if not c.isascii() and c not in _VN_CHARS)
    if vn / len(letters) < 0.02 and odd / len(letters) > 0.03:
        doc.warnings.append("Văn bản có thể dùng font cũ (TCVN3/VNI) — cần chuyển mã sang Unicode.")
