"""Chuyển docs/DATA_DICTIONARY.md thành PDF (A4 dọc) theo phong cách mẫu data dictionary.

Cần `reportlab` (không nằm trong requirements của dự án — cài vào một venv tạm):
    python -m venv .pdfenv && .pdfenv\\Scripts\\pip install reportlab
    .pdfenv\\Scripts\\python scripts\\dictionary_to_pdf.py [vào.md] [ra.pdf]

Font: Arial + Consolas của Windows (hỗ trợ tiếng Việt); trên máy khác sửa FONT_DIRS. Ký tự không có trong Consolas
trong đoạn `code` sẽ tự chuyển sang Arial để không bị ô vuông.
"""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, PageBreak, PageTemplate, Paragraph, Spacer, Table,
                                TableStyle)

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs" / "DATA_DICTIONARY.md"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else SRC.with_suffix(".pdf")
FONT_DIRS = [Path(r"C:\Windows\Fonts"), Path("/usr/share/fonts/truetype/dejavu")]

NAVY = colors.HexColor("#17365D")
BLUE = colors.HexColor("#2F6EA5")
LIGHT = colors.HexColor("#EAF1F8")
ZEBRA = colors.HexColor("#F6F8FA")
GRID = colors.HexColor("#C9D3DE")
AMBER = colors.HexColor("#FFF4D6")


def find_font(*names: str) -> Path:
    for d in FONT_DIRS:
        for n in names:
            if (d / n).exists():
                return d / n
    raise SystemExit(f"Không tìm thấy font {names} trong {FONT_DIRS}")


def register_fonts() -> tuple[set[int], set[int]]:
    pdfmetrics.registerFont(TTFont("Body", str(find_font("arial.ttf", "DejaVuSans.ttf"))))
    pdfmetrics.registerFont(TTFont("Body-B", str(find_font("arialbd.ttf", "DejaVuSans-Bold.ttf"))))
    pdfmetrics.registerFont(TTFont("Body-I", str(find_font("ariali.ttf", "DejaVuSans-Oblique.ttf"))))
    pdfmetrics.registerFont(TTFont("Body-BI", str(find_font("arialbi.ttf", "DejaVuSans-BoldOblique.ttf"))))
    pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-B", italic="Body-I", boldItalic="Body-BI")
    pdfmetrics.registerFont(TTFont("Code", str(find_font("consola.ttf", "DejaVuSansMono.ttf"))))
    return set(pdfmetrics.getFont("Code").face.charToGlyph), set(pdfmetrics.getFont("Body").face.charToGlyph)


CODE_GLYPHS, BODY_GLYPHS = register_fonts()


def S(name: str, **kw) -> ParagraphStyle:
    base = dict(fontName="Body", fontSize=9, leading=12.5, textColor=colors.HexColor("#1F2933"), alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, **base)


ST = {
    "p": S("p", spaceAfter=4),
    "sub": S("sub", fontName="Body-I", fontSize=10, leading=14, textColor=colors.HexColor("#52606D"), spaceAfter=6),
    "h2": S("h2", fontName="Body-B", fontSize=14, leading=18, textColor=NAVY, spaceBefore=14, spaceAfter=6, keepWithNext=1),
    "h3": S("h3", fontName="Body-B", fontSize=11.5, leading=15, textColor=BLUE, spaceBefore=12, spaceAfter=4, keepWithNext=1),
    "h4": S("h4", fontName="Body-B", fontSize=10.5, leading=14, textColor=NAVY, spaceBefore=10, spaceAfter=2, keepWithNext=1),
    "li": S("li", leftIndent=12, bulletIndent=2, spaceAfter=2.5),
    "note": S("note", fontName="Body-I", fontSize=8.5, leading=11.5, textColor=colors.HexColor("#4A5568")),
    "th": S("th", fontName="Body-B", fontSize=7.5, leading=9.5, textColor=colors.white),
    "td": S("td", fontSize=7.5, leading=9.6),
}


def code_span(m: re.Match) -> str:
    t = m.group(1)
    if all(ord(c) in CODE_GLYPHS or c == " " for c in t):
        return f'<font face="Code" size="{ST_SIZE[0]}" color="#0B4F8A">{t}</font>'
    return f'<font color="#0B4F8A">{t}</font>'  # có ký tự Consolas không có (tiếng Việt) -> giữ Arial


ST_SIZE = [8.4]  # cỡ chữ của đoạn `code` (nhỏ hơn chữ thường một chút)


def inline(s: str, small: bool = False) -> str:
    ST_SIZE[0] = 6.9 if small else 8.4
    s = html.escape(s.replace("\\|", "|"), quote=False)
    s = re.sub(r"`([^`]+)`", code_span, s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<![\w*])\*([^*\n]+?)\*(?![\w*])", r"<i>\1</i>", s)
    return s


def split_row(line: str) -> list[str]:
    parts = re.split(r"(?<!\\)\|", line.strip())
    return [p.strip() for p in parts[1:-1]]


WIDTHS = {
    ("Cột", "Kiểu / khóa", "Ví dụ", "Mô tả"): [0.17, 0.25, 0.21, 0.37],
    ("#", "Nguồn", "Dùng cho"): [0.05, 0.43, 0.52],
    ("Bảng con (cột)", "Bảng cha (cột)", "Khi xóa cha"): [0.42, 0.40, 0.18],
    ("Câu hỏi", "Đường nối khuyến nghị"): [0.24, 0.76],
}


def build_table(rows: list[list[str]], width: float) -> Table:
    head = tuple(rows[0])
    rel = WIDTHS.get(head) or [1 / len(head)] * len(head)
    data = [[Paragraph(inline(c, True), ST["th"]) for c in rows[0]]]
    for r in rows[1:]:
        data.append([Paragraph(inline(c, True), ST["td"]) for c in r])
    t = Table(data, colWidths=[width * x for x in rel], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, GRID), ("LEFTPADDING", (0, 0), (-1, -1), 3.5), ("RIGHTPADDING", (0, 0), (-1, -1), 3.5),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]
    for i in range(2, len(data), 2):
        style.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    t.setStyle(TableStyle(style))
    return t


def stat_boxes(rows: list[list[str]], width: float) -> Table:
    labels, values = rows[0], [re.sub(r"\*", "", c) for c in rows[1]]
    cells = [[Paragraph(f'<font size="22" color="#17365D"><b>{html.escape(v)}</b></font>', S("v", leading=26, alignment=1)),
              ] for v in values]
    t = Table([[Paragraph(f'<font size="22" color="#17365D"><b>{html.escape(v)}</b></font>', S("v", leading=26, alignment=1)) for v in values],
               [Paragraph(f'<font size="8" color="#52606D">{html.escape(l.upper())}</font>', S("l", leading=10, alignment=1)) for l in labels]],
              colWidths=[width / len(labels)] * len(labels))
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), LIGHT), ("BOX", (0, 0), (-1, -1), 0.5, GRID),
                           ("LINEAFTER", (0, 0), (-2, -1), 0.5, colors.white), ("TOPPADDING", (0, 0), (-1, 0), 8),
                           ("BOTTOMPADDING", (0, 1), (-1, 1), 8)]))
    return t


class Doc(BaseDocTemplate):
    def __init__(self, path: str, title: str):
        super().__init__(path, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=18 * mm, bottomMargin=16 * mm,
                         title=title, author="UELPATH", subject="Từ điển dữ liệu")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate(id="p", frames=[frame], onPage=self.decorate)])

    def decorate(self, canv, doc):
        canv.saveState()
        w, h = A4
        canv.setFillColor(NAVY)
        canv.rect(0, h - 9 * mm, w, 9 * mm, stroke=0, fill=1)
        canv.setFillColor(colors.white)
        canv.setFont("Body-B", 8)
        canv.drawString(15 * mm, h - 6 * mm, "UELPATH · TỪ ĐIỂN DỮ LIỆU")
        canv.setFont("Body", 8)
        canv.drawRightString(w - 15 * mm, h - 6 * mm, f"v{VERSION}")
        canv.setFillColor(colors.HexColor("#52606D"))
        canv.setFont("Body", 7.5)
        canv.drawString(15 * mm, 9 * mm, "UELPATH · Database Data Dictionary")
        canv.drawRightString(w - 15 * mm, 9 * mm, f"Trang {doc.page} / {TOTAL_PAGES[0]}")
        canv.restoreState()


VERSION = "1.0"
TOTAL_PAGES = [0]


def story_from_markdown(md: str, width: float) -> list:
    global VERSION
    m = re.search(r"Phiên bản tài liệu ([\d.]+)", md)
    if m:
        VERSION = m.group(1)
    story: list = []
    lines = md.splitlines()
    i = 0
    first_table = True
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1
            continue
        if ln.startswith("# "):
            banner = Table([[Paragraph(f'<font color="white" size="20"><b>{inline(ln[2:])}</b></font>', S("b", leading=25))]],
                           colWidths=[width])
            banner.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY), ("LEFTPADDING", (0, 0), (-1, -1), 10),
                                        ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 12)]))
            story += [banner, Spacer(1, 6)]
        elif ln.startswith("## "):
            story.append(Paragraph(inline(ln[3:]), ST["h2"]))
        elif ln.startswith("### "):
            story.append(Paragraph(inline(ln[4:]), ST["h3"]))
        elif ln.startswith("#### "):
            story.append(Paragraph(inline(ln[5:]), ST["h4"]))
        elif ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                if not re.match(r"^\|[\s:|-]+\|$", lines[i]):
                    rows.append(split_row(lines[i]))
                i += 1
            i -= 1
            if first_table and rows[0][0].startswith("Bảng vật lý"):
                story += [Spacer(1, 4), stat_boxes(rows, width), Spacer(1, 6)]
            else:
                story += [build_table(rows, width), Spacer(1, 5)]
            first_table = False
        elif ln.startswith("> "):
            note = Table([[Paragraph(inline(ln[2:]), ST["note"])]], colWidths=[width])
            note.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), AMBER), ("LEFTPADDING", (0, 0), (-1, -1), 6),
                                      ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                                      ("LINEBEFORE", (0, 0), (0, -1), 2, colors.HexColor("#E0A800"))]))
            story += [note, Spacer(1, 4)]
        elif ln.startswith("- "):
            story.append(Paragraph(inline(ln[2:]), ST["li"], bulletText="•"))
        elif ln.startswith("*") and ln.endswith("*") and not ln.startswith("**"):
            story.append(Paragraph(inline(ln), ST["sub"]))
        else:
            story.append(Paragraph(inline(ln), ST["p"]))
        i += 1
    return story


def main() -> int:
    md = SRC.read_text(encoding="utf-8")
    title = md.splitlines()[0].lstrip("# ").strip()
    for attempt in range(2):  # lần 1 đếm số trang, lần 2 in "Trang x / y"
        doc = Doc(str(OUT), title)
        doc.build(story_from_markdown(md, doc.width))
        TOTAL_PAGES[0] = doc.page
    print(f"ghi {OUT} ({TOTAL_PAGES[0]} trang, {OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
