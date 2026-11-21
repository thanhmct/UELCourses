"""Phân tích đề cương chi tiết học phần (PDF → dữ liệu có cấu trúc, truy vấn được).

Quy trình (xác định, không dùng LLM):
  1. Văn bản `pdftotext -layout` (đã lưu ở outline_documents.text) → tách các mục đánh số (1. Thông tin tổng quát, 2. Mô tả …)
     bằng bảng từ khóa tiếng Việt + tiếng Anh; mọi mục đều được lưu nguyên văn vào outline_sections.
  2. Mục "Thông tin tổng quát" → outline_courses (tên, mã, tín chỉ, giờ, tiên quyết/học trước, giảng viên…) bằng regex nhãn → giá trị.
  3. Bảng (mục tiêu CO, chuẩn đầu ra CLO, đánh giá, kế hoạch giảng dạy) → nhận diện hình học bằng PyMuPDF `find_tables`,
     lấy chữ theo vùng ô, ghép các dòng bảng bị ngắt qua trang.
  4. `parse_status`: ok | partial | failed (syllabus); skipped (báo cáo thống kê CLO, không phải đề cương).

Đề cương không đồng nhất 100% (có bản tiếng Anh, bản báo cáo CLO…), nên kết quả luôn kèm `parse_detail` để biết thiếu gì;
tài liệu `partial`/`failed` là ứng viên cho bước LLM dự phòng (parse_method = "llm").
"""

from __future__ import annotations

import re
import unicodedata
import warnings
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    OutlineAssessment,
    OutlineClo,
    OutlineCourse,
    OutlineDocument,
    OutlineMaterial,
    OutlineModuleLink,
    OutlineObjective,
    OutlineScheduleItem,
    OutlineSection,
)
from app.services.text import normalize_search

warnings.filterwarnings("ignore")


_ZERO_WIDTH = re.compile("[\u200b\u200c\u200d\u2060\ufeff]")


def normalize_text(text: str) -> str:
    """Bỏ ký tự vô hình (U+200B…) và NBSP: nhiều đề cương có "1.\u200b Thông tin chung" làm hỏng nhận diện đề mục."""
    return _ZERO_WIDTH.sub("", text or "").replace("\xa0", " ")


def fold(s: str | None) -> str:
    s = unicodedata.normalize("NFD", (s or "").replace("đ", "d").replace("Đ", "D"))
    return re.sub(r"\s+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn")).strip().lower()


def clean(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("​", "")).strip()


# --------------------------------------------------------------------------- 1. tách mục
# '1. Thông tin…' và cả '1.Thông tin…' / '1.General Information' (dính, không dấu cách) — nhưng không nhận '1.1' (mục con).
_NUM_HEAD = re.compile(r"^[ \t]{0,12}(\d{1,2})\.(?:[ \t]+|(?=[^\W\d_]))(\S[^\n]{2,110}?)[ \t]*:?[ \t]*$", re.M)
_KINDS: list[tuple[str, re.Pattern]] = [
    ("clo_report", re.compile(r"thong ke ty le nguoi hoc dat|statistics on the percentage|nhan xet,? danh gia chung|general comments and evaluations|^ket luan$|^conclusion$")),
    ("general", re.compile(r"thong tin (tong quat|chung)|g?e?neral inf\w*|course general inf\w*")),
    ("description", re.compile(r"mo ta (hoc phan|mon hoc|khoa hoc)|course description|^chuong trinh giang day")),
    ("materials", re.compile(r"tai lieu hoc tap|learning materials|textbooks?|sach giao khoa|giao trinh|course reference|course books|reference (?:books|materials)|course materials|tai lieu")),
    ("objectives", re.compile(r"muc tieu (cua )?(hoc phan|mon hoc|khoa hoc)|course (objectives|goals|purposes)|purposes/aims")),
    ("clos", re.compile(r"chuan dau ra (cua )?(hoc phan|mon hoc)|ket qua hoc tap (cua )?(hoc phan|mon hoc|khoa hoc)|(course|expected) learning outcomes|learning outcomes")),
    ("assessment", re.compile(r"danh gia (hoc phan|mon hoc|khoa hoc)|course assessment|assessment methods?")),
    ("schedule", re.compile(r"ke hoach giang day|noi dung (hoc phan|mon hoc|khoa hoc)|hoat dong giang day|detailed (course )?(syllabus|plan|schedule|teaching plan)|teaching plan|course (schedule|outline|content)")),
    ("workload", re.compile(r"tong thoi luong|total (study|learning)")),
    ("rules", re.compile(r"quy dinh (cua|ve) (hoc phan|mon hoc|khoa hoc)|course (rules|regulations|requirements)|general rules")),
    ("responsible", re.compile(r"phu trach (hoc phan|mon hoc|khoa hoc)|course (in charge|coordinator)|faculty in-charge")),
]


def split_sections(text: str) -> list[dict]:
    """[{kind, heading, text, ord}] — chỉ coi là ranh giới mục khi tiêu đề khớp bảng từ khóa (tránh nhầm danh sách đánh số)."""
    marks: list[tuple[int, int, str, str]] = []  # (start, end_of_heading_line, kind, heading)
    for m in _NUM_HEAD.finditer(text):
        title = clean(m.group(2))
        f = fold(title)
        for kind, rx in _KINDS:
            if rx.search(f):
                marks.append((m.start(), m.end(), kind, f"{m.group(1)}. {title}"))
                break
    out: list[dict] = []
    head_text = text[: marks[0][0]] if marks else text
    if head_text.strip():
        out.append({"kind": "front", "heading": "Đầu trang", "text": head_text.strip(), "ord": 0})
    for i, (start, hend, kind, heading) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        out.append({"kind": kind, "heading": heading, "text": text[hend:end].strip("\n"), "ord": len(out)})
    return out


# --------------------------------------------------------------------------- 2. thông tin tổng quát
def _val(block: str, label: str) -> str | None:
    """Giá trị cùng dòng với nhãn (cách nhau ≥ 2 khoảng trắng)."""
    m = re.search(rf"^[ \t]*(?:{label})[ \t]{{2,}}([^\n]*\S)", block, re.M | re.I)
    return clean(m.group(1)) if m else None


def _next_line_val(block: str, label: str) -> str | None:
    """Nhãn dài bị ngắt dòng: giá trị nằm ở dòng kế tiếp (thụt vào)."""
    lines = block.splitlines()
    for i, ln in enumerate(lines):
        if re.search(label, ln, re.I):
            tail = re.split(label, ln, flags=re.I)[-1]
            if clean(tail):
                return clean(tail)
            for nxt in lines[i + 1 : i + 3]:
                if nxt.strip() and not re.fullmatch(r"\s*(dạy|day)\s*", nxt, re.I):
                    return clean(nxt)
    return None


_NOT_A_VALUE = re.compile(r"^(?:viet|anh|\(vietnamese\)|\(english\)|trong|giang|day|giang day|teaching|instruction|module|-+|\.+|x{2,}|n/?a)$")
_CODE_LIKE = re.compile(r"^[A-Z]{2,5}\s?\d{3,6}[A-Za-z]?$")


def _dedupe_repeat(s: str) -> str:
    """Ô giá trị đôi khi bị chép lặp (cột giảng viên + cột trợ giảng dồn lại): cắt phần lặp lại từ đầu."""
    head = s[:25]
    if len(s) > 60 and len(head) == 25:
        j = s.find(head, 25)
        if j > 0:
            return s[:j].strip()
    return s


def _usable(val: str | None) -> str | None:
    """Giá trị thật, không phải mảnh nhãn ('Việt', '(English)') hay ô mẫu chưa điền ('XXXX')."""
    v = clean(val)
    if not v or _NOT_A_VALUE.match(fold(v)):
        return None
    return v


def _kv(block: str, *attempts: tuple, cont: bool = True, max_cont: int = 3) -> str | None:
    """Giá trị của một nhãn trong bảng 'thông tin tổng quát' (pdftotext -layout). Mỗi attempt = (nhãn, phần cuối nhãn | None).

    Xử lý ba kiểu bố cục:
    1. cùng dòng, cách bằng dấu ':' / ≥ 2 khoảng trắng / 1 khoảng trắng ('Tên học phần tiếng Việt Cơ sở dữ liệu');
       dòng sau thụt ngang cột giá trị là phần nối tiếp ('giảng dạy   TS. Lê Thanh Hoa');
    2. nhãn bị ngắt dòng, giá trị nằm GIỮA: 'Ngôn ngữ sử dụng trong' / <giá trị> / 'giảng dạy' (cần phần cuối nhãn);
    3. nhãn để trống → None (không suy diễn từ ô kế bên)."""
    lines = block.splitlines()
    for attempt in attempts:
        label, end, *flags = attempt
        wrapped_only = bool(flags and flags[0])  # chỉ nhận giá trị nằm giữa nhãn bị ngắt dòng (tránh nhận 'Course Name (English) …')
        # nhãn có thể đứng sau số mục ('1.2. Mã số môn học: …') hoặc gạch đầu dòng
        rx = re.compile(rf"^([ \t]*)(?:\d{{1,2}}(?:\.\d{{1,2}})*\.?[ \t]+)?(?:[-●•+*–][ \t]*)?(?:{label})(?!\w)", re.I)
        end_rx = re.compile(rf"^[ \t]*(?:{end})(?![^\s])[ \t]*$", re.I) if end else None
        end_pref = re.compile(rf"^[ \t]*(?:{end})[ \t]{{2,}}(\S.*)$", re.I) if end else None
        for i, ln in enumerate(lines):
            m = rx.match(ln)
            if not m:
                continue
            val = ln[m.end():].lstrip(" \t:：")
            if val.strip():
                if wrapped_only:
                    continue
                col = len(ln) - len(val)
                parts = [val.strip()]
                for nxt in lines[i + 1 : i + 1 + max_cont]:
                    if not nxt.strip() or _CODE_LIKE.match(nxt.strip()):
                        break
                    pm = end_pref.match(nxt) if end_pref else None
                    if pm:
                        parts.append(pm.group(1))
                    elif cont and len(nxt) - len(nxt.lstrip()) >= col - 2 and not rx.match(nxt):
                        parts.append(nxt.strip())
                    else:
                        break
                ok = _usable(_dedupe_repeat(" ".join(parts)))
                if ok:
                    return ok
                continue
            if end_rx is None:
                continue
            between: list[str] = []
            for nxt in lines[i + 1 : i + 6]:
                if end_rx.match(nxt):
                    ok = _usable(" ".join(between))
                    if ok:
                        return ok
                    break
                if nxt.strip():
                    if len(nxt) - len(nxt.lstrip()) <= len(m.group(1)):  # thụt ngang bằng nhãn = không phải giá trị
                        break
                    between.append(nxt.strip())
    return None


def _num(s: str | None) -> float | None:
    if not s:
        return None
    m = re.search(r"\d+(?:[.,]\d+)?", s)
    return float(m.group(0).replace(",", ".")) if m else None


def _people(s: str | None) -> list[str] | None:
    if not s:
        return None
    parts = [clean(p) for p in re.split(r";|\s{3,}|\s*(?<=[a-zà-ỹ\.])\s+(?=(?:GS|PGS|TS|ThS|CN|NCS)\b\.?)", s) if clean(p)]
    return parts or None


def parse_general(text: str, front: str) -> dict:
    d: dict[str, Any] = {}
    fm = re.search(r"^[ \t]*KHOA[ \t]+(.+)$", front, re.M)
    bm = re.search(r"^[ \t]*B[ỘO][ \t]*M[ÔO]N[ \t]+(.+)$", front, re.M)
    fe = re.search(r"^[ \t]*FACULTY OF[ \t]+(.+)$", front, re.M)
    be = re.search(r"^[ \t]*DEPARTMENT OF[ \t]+(.+)$", front, re.M)
    d["faculty"] = clean(fm.group(1)) if fm else (clean(fe.group(1)) if fe else None)
    d["department"] = clean(bm.group(1)) if bm else (clean(be.group(1)) if be else None)
    d["name_vi"] = _kv(
        text,
        (r"Tên (?:học phần|môn học|khóa học)(?: bằng)? tiếng Việt|Tên (?:học phần|môn học)\s*\(tiếng Việt\)|Tên tiếng Việt|"
         r"Vietnames?e? (?:course|module|subject) (?:title|name)|(?:Course|Module) (?:title|name)\s*\(Vietnamese\)|(?:Course|Module|Subject) (?:title|name) in Vietnamese", None),
        (r"Tiếng Việt\s*:", None),  # 'Tên môn học' / '- Tiếng Việt: …' / '- Tiếng Anh: …'
        (r"Tên (?:học phần|môn học)(?: bằng)? tiếng", r"Việt", True),
        (r"Tên (?:học phần|môn học)", r"tiếng Việt", True),
        (r"Tên (?:học phần|môn học)(?: bằng)? tiếng Việt", r"Tên (?:học phần|môn học)(?: bằng)? tiếng Anh.*", True),  # giá trị nằm dưới nhãn
        (r"Course (?:name|title)|Name of Vietnamese(?: Module)?", r"\(Vietnamese\)|Module(?: Name)?", True),
        (r"(?:Course|Module|Subject) (?:name|title) in", r"Vietnamese", True),
        (r"Tên (?:học phần|môn học|khóa học)(?!\s+(?:bằng\s+)?tiếng)", None),
        max_cont=1,
    )
    d["name_en"] = _kv(
        text,
        (r"Tên (?:học phần|môn học)(?: bằng)? tiếng Anh|Tên (?:học phần|môn học)\s*\(tiếng Anh\)|Tên tiếng Anh|"
         r"English (?:course|module|subject) (?:title|name)|(?:Course|Module) (?:title|name)\s*\(English\)|(?:Course|Module|Subject) (?:title|name) in English", None),
        (r"Tiếng Anh\s*:", None),
        (r"Tên (?:học phần|môn học)(?: bằng)? tiếng", r"Anh", True),
        (r"Tên (?:học phần|môn học)", r"tiếng Anh", True),
        (r"Tên (?:học phần|môn học)(?: bằng)? tiếng Anh", r"Mã (?:số )?(?:học phần|môn học).*", True),  # giá trị nằm dưới nhãn
        (r"Course (?:name|title)", r"\(English\)", True),
        (r"(?:Course|Module|Subject) (?:name|title) in", r"English", True),
        (r"Course[’']?s? (?:name|title)(?!\s*\((?:Vietnamese|English)\))", None),
        max_cont=1,
    )
    code = _kv(
        text,
        (r"Mã (?:số )?(?:học phần|môn học|khóa học)(?!\s+(?:tiên quyết|trước|sau|song hành))|(?:Course|Module|Subject)[’']?s? code", None),
        cont=False,
    )
    if code and not re.search(r"\d", code):  # '(COOP Propram)', 'Chưa có mã'… không phải mã học phần
        code = None
    d["course_code"] = code
    d["course_code_norm"] = re.sub(r"\s+", "", code).upper() if code else None
    d["level"] = _kv(text, (r"Trình độ(?: đào tạo)?|Cấp độ khóa học|Level of (?:the course|training)|Level|Degree(?: training)?", None), cont=False)
    prog = _kv(text, (r"Program(?![/\w])", None))  # 'Program Bachelor' (trình độ) hoặc 'Program Accounting' (ngành) tùy mẫu
    if prog and re.search(r"bachelor|undergraduate|đại học|cử nhân", prog, re.I):
        d["level"] = d["level"] or prog
        prog = None
    d["major"] = _kv(text, (r"Ngành học|Ngành đào tạo|Chuyên ngành|Program/Major|Majors?|Field of study", None)) or prog
    d["cohort_range"] = _kv(text, (r"Khóa học|Cohort", None), cont=False)
    d["academic_year"] = _kv(text, (r"Năm học|Academic year|School year", None), cont=False)
    d["term"] = _kv(text, (r"Học kỳ|Semester", None), cont=False)
    m = re.search(r"(\d{1,2})\s*(?:tín chỉ|credits?)", text, re.I)
    d["credits"] = float(m.group(1)) if m else None
    if d["credits"] is None:  # 'Số tín chỉ: 3 (lý thuyết)', 'SỐ TÍN CHỈ   03', '- Credits:  2', 'Số tín chỉ: 2 TC'
        c = _num(_kv(text, (r"Số tín chỉ|Number of credits?|Credits?", None), cont=False))
        d["credits"] = c if c and 0 < c <= 30 else None
    d["hours_lecture"] = _num((re.search(r"(?:Lý thuyết[^\n]*?\):|Theory:)\s*([^\n]*)", text) or [None, None])[1])
    d["hours_practice"] = _num((re.search(r"(?:Thực hành[^\n]*?\):|Exercises?:|Practice:)\s*([^\n]*)", text) or [None, None])[1])
    d["hours_self_study"] = _num((re.search(r"(?:Tự học[^\n]*?\):|Self-?study:)\s*([^\n]*)", text) or [None, None])[1])
    d["prerequisite_raw"] = _val(text, r"Học phần tiên quyết|Môn học tiên quyết|Điều kiện tiên quyết|Pre-?requisites?")
    d["previous_raw"] = _val(text, r"Học phần trước|Môn học trước|Previous (?:subjects?|courses?)")
    d["next_raw"] = _val(text, r"Học phần sau|Môn học sau|Following (?:subjects?|courses?)|Next course")
    d["corequisite_raw"] = _val(text, r"Học phần song hành|Môn học song hành|Điều kiện đồng thời|Co-?requisites?")
    d["teaching_language"] = (
        _kv(text, (r"Ngôn ngữ sử dụng trong(?: giảng(?: dạy)?)?", r"(?:giảng )?dạy"), (r"Ngôn ngữ sử dụng", r"trong giảng dạy"),
            (r"Languages?\s+(?:of|used\s+in)", r"instruction|teaching"),
            (r"Ngôn ngữ giảng dạy|Languages?\s+(?:of\s+instruction|used\s+in\s+teaching)|Teaching language|Languages?", None), cont=False)
        or _next_line_val(text, r"Ngôn ngữ sử dụng trong giảng|Ngôn ngữ giảng dạy|Language of instruction")
    )
    if d["teaching_language"] and len(d["teaching_language"]) > 100:  # lẫn sang ô giảng viên: không phải tên ngôn ngữ
        d["teaching_language"] = None
    d["lecturers"] = _people(
        _kv(text, (r"Các giảng viên phụ trách(?: giảng(?: dạy)?)?", r"(?:giảng )?dạy"), (r"Các giảng viên phụ", r"trách giảng dạy"),
            (r"Các giảng viên", r"phụ trách giảng dạy"),
            (r"(?:Lecturers?|Instructors?)(?:\s+in\s+charge(?:\s+of)?)?(?:\s+teaching)?", r"teaching"),
            (r"Tên giảng viên|Các giảng viên(?!\s+trợ)|(?:Lecturers?|Instructors?)(?:\s+in\s+charge(?:\s+of)?)?", None))
        or _next_line_val(text, r"Các giảng viên phụ trách giảng|Tên giảng viên|Lecturers?")
    )
    d["assistants"] = _people(_kv(text, (r"Các giảng viên trợ giảng|Teaching assistants?", None)))
    kb = re.search(r"^[ \t]*(Kiến thức[^\n]*?)\s{2,}", text, re.M)
    d["knowledge_block"] = _val(text, r"Knowledge block") or (clean(kb.group(1)) if kb else None)
    return d


# --------------------------------------------------------------------------- 3. tài liệu
_MAT_HEAD = [  # (loại, mẫu tiêu đề đã fold). Tiêu đề ngắn, thường kết thúc bằng ':', có thể có số mục '3.1.' ở đầu.
    ("textbook", re.compile(r"^(?:\d+\.\d+\.?\s*)?(?:giao trinh|sach giao trinh|textbooks?|required (?:reading|textbooks?)|main (?:textbooks?|references?))\b[^.]{0,40}:?$")),
    ("software", re.compile(r"^(?:\d+\.\d+\.?\s*)?(?:phan mem|software)\b[^.]{0,40}:?$")),
    ("reference", re.compile(r"^(?:\d+\.\d+\.?\s*)?(?:tai lieu(?: hoc tap)?(?: tham khao| khac| bo sung)?|sach tham khao|references?|further reading|(?:other|additional|supplementary) (?:materials|references|readings?))\b[^.]{0,40}:?$")),
]
# '[1]', '[GT1]', '1.', '1)', '-', '•' ở đầu mục; sau đó có thể còn nhãn '[GT1]'.
_MAT_ITEM = re.compile(r"^(?:\[\s*[A-Za-z]{0,3}\s*\d{1,2}\s*\]|\(\s*\d{1,2}\s*\)|\d{1,2}\s*[.)]|[-•*–▪●])\s*(?:\[\s*[A-Za-z]{1,3}\s*\d{0,2}\s*\]\s*)*(.*)$")
# 'Tài liệu chính: Bài giảng của giảng viên.' — tiêu đề kèm luôn nội dung trên cùng dòng
_MAT_INLINE = re.compile(r"^(?:tai lieu chinh|giao trinh chinh|giao trinh|main textbook|textbook)\s*:\s*(\S.*)$")
_MAT_HINT = re.compile(r"^\(.*(?:khong qua|toi da|toi thieu|cac giao trinh|not more than|at most|textbooks?,? references).*\)$")


def _material_head(s: str) -> str | None:
    if len(s) > 80 or s.endswith("."):
        return None
    f = fold(s)
    for kind, rx in _MAT_HEAD:
        if rx.match(f):
            return kind
    return None


# Tiêu đề mục KHÁC (mục tiêu, chuẩn đầu ra, đánh giá, kế hoạch…): gặp thì dừng, vì ranh giới mục trong text không phải lúc nào cũng nhận ra được.
_NEXT_SECTION = re.compile(
    r"^(?:\d{1,2}\s*\.\s*)?(?:muc tieu|chuan dau ra|danh gia|ke hoach|quy dinh|noi dung|course (?:objectives?|goals?|learning outcomes?|assessment|schedule|content|rules)|"
    r"objectives|learning outcomes|assessment|teaching plan|general rules|workload|tong thoi luong)\b"
)
_MAT_MAX_CHARS = 450  # một trích dẫn dài hơn thế nhiều khả năng đã nuốt phần mô tả khác


def parse_materials(body: str) -> list[dict]:
    out: list[dict] = []
    kind, cur = "reference", None
    for raw in body.splitlines():
        s = clean(raw)
        if not s or re.fullmatch(r"\d{1,3}", s):  # dòng trống / số trang
            continue
        f = fold(s)
        if len(s) < 90 and _NEXT_SECTION.match(f):
            break
        if _MAT_HINT.match(f):
            continue
        head = _material_head(s)
        if head:
            kind, cur = head, None
            continue
        inline = _MAT_INLINE.match(f)
        if inline and len(s) < 200:  # giữ nguyên chữ gốc (không fold) cho phần nội dung
            cur = {"kind": "textbook", "ord": len(out) + 1, "citation": s.split(":", 1)[1].strip()}
            out.append(cur)
            continue
        m = _MAT_ITEM.match(s)
        if m:
            if not m.group(1):
                continue
            cur = {"kind": kind, "ord": len(out) + 1, "citation": m.group(1)}
            out.append(cur)
        elif cur is not None and len(cur["citation"]) < _MAT_MAX_CHARS:
            cur["citation"] += " " + s
    return out or _loose_materials(body)


def _loose_materials(body: str) -> list[dict]:
    """Danh sách không đánh số: mỗi mục kết thúc bằng '.', ')' hoặc ';'; dòng sau bắt đầu mục mới."""
    out: list[dict] = []
    kind, buf = "reference", []

    def flush() -> None:
        nonlocal buf
        if buf:
            out.append({"kind": kind, "ord": len(out) + 1, "citation": " ".join(buf)})
        buf = []

    for raw in body.splitlines():
        s = clean(raw)
        if not s or re.fullmatch(r"\d{1,3}", s):
            continue
        f = fold(s)
        if len(s) < 90 and _NEXT_SECTION.match(f):
            break
        if _MAT_HINT.match(f):
            continue
        head = _material_head(s)
        if head:
            flush()
            kind = head
            continue
        buf.append(s)
        if re.search(r"[.;)]$", s) and len(" ".join(buf)) > 25:
            flush()
    flush()
    return [m for m in out if len(m["citation"]) <= 2 * _MAT_MAX_CHARS]


_LOOSE_MAT_HEAD = re.compile(r"^(?:\d{1,2}\s*\.\s*)?(?:tai lieu hoc tap|tai lieu tham khao|giao trinh|course books|learning materials|references?|reference materials)\b")


def best_materials(sections: list[dict], full_text: str | None = None) -> list[dict]:
    """Một đề cương có thể có nhiều mục 'tài liệu' (tiêu đề khớp lỏng): lấy mục cho nhiều trích dẫn nhất.
    Không có mục nào nhận ra (tiêu đề không đánh số) → tìm dòng tiêu đề ngắn trong toàn văn."""
    best: list[dict] = []
    for s in sections:
        if s["kind"] == "materials":
            got = parse_materials(s["text"])
            if len(got) > len(best):
                best = got
    if not best and full_text:
        lines = full_text.splitlines()
        for i, ln in enumerate(lines):
            if len(ln.strip()) < 90 and _LOOSE_MAT_HEAD.match(fold(ln)) and not ln.rstrip().endswith("."):
                got = parse_materials("\n".join(lines[i : i + 120]))
                if len(got) > len(best):
                    best = got
                if best:
                    break
    return best


# --------------------------------------------------------------------------- 4. bảng
_CLO_RX = re.compile(r"CLO\s*\d+(?:\.\d+)?", re.I)


_NOISE_LEAD = re.compile(r"^(?:[a-zà-ỹ]{1,2}\s+){1,6}(?=[A-ZĐÀ-Ỹ])")


def _denoise(s: str | None) -> str | None:
    """Bỏ vài ký tự rác đầu ô ("g q ý g Vận dụng…") do vùng cắt chạm chữ của ô lân cận."""
    s = clean(s)
    return _NOISE_LEAD.sub("", s) or None


def _clo_list(s: str) -> list[str]:
    return [re.sub(r"\s+", "", c).upper() for c in _CLO_RX.findall(s or "")]


def fold_ns(s: str | None) -> str:
    """fold + bỏ mọi khoảng trắng: chữ trong ô PDF đôi khi bị tách ("TUẦ N", "WEE K")."""
    return fold(s).replace(" ", "")


def _col_map(header: list[str], spec: dict[str, tuple[str, ...]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for i, h in enumerate(header):
        f = fold_ns(h)
        for field, keys in spec.items():
            if field in out:
                continue
            if any(k.replace(" ", "") in f for k in keys):
                out[field] = i
                break
    return out


def classify_table(header: list[str]) -> str | None:
    h = fold_ns(" ".join(header))
    if (("muctieu" in h or "objective" in h) and ("clo" in h or "cdr" in h) and ("mota" in h or "description" in h)) or (
        "cox" in h and "clox" in h
    ) or (
        # 'General Goals COx | Description | Course Learning Outcomes | Level capacity'
        ("goal" in h or "muctieu" in h or "objective" in h) and ("description" in h or "mota" in h) and ("learningoutcome" in h or "chuandaura" in h)
        # cột mức độ giảng dạy (I, T, U) / cột đầu 'Learning outcomes', 'CLO' chỉ có ở bảng CĐR (mẫu đôi khi ghi nhầm 'Description of Objectives')
        and not any(k in h for k in ("levelofinstruction", "teachinglevel", "levelofteaching", "mucdogiangday", "(i,t,u"))
        and not re.match(r"^(?:learningoutcome|clo|cdr|chuandaura)", fold_ns(header[0]) if header else "")
    ):
        return "objectives"
    first = fold_ns(header[0]) if header else ""
    if ("motacdr" in h or "motachuandaura" in h) or ("cdr" in h and ("mucdogiangday" in h or "teachinglevel" in h)) or (
        "clox" in h and "cox" not in h and ("teachinglevel" in h or "description" in h)
    ) or (
        # 'CLO (1) | CLO Description (2) | Program Learning Outcomes | Bloom Scale/Teaching Level' (ô đầu chỉ là 'CLO')
        re.match(r"^(?:clo|cdr)(?![a-z])", first) and ("description" in h or "mota" in h or "noidungclo" in h)
        and "weight" not in h and "trongso" not in h
    ) or (
        # dịch máy: 'Fans (1) | Description of the Complaints (2) | PLOs | Level of instruction (I, T, U)'
        ("plo" in h or "programlearningoutcome" in h) and ("levelofinstruction" in h or "teachinglevel" in h or "mucdogiangday" in h)
        and "weight" not in h and "trongso" not in h
    ) or (
        # 'CLO | Chuẩn đầu ra môn học (CLOs) | Trình độ năng lực | Chuẩn đầu ra CTĐT (PLOs)' — không có cột 'mô tả'
        re.match(r"^(?:clo|cdr)(?![a-z])", first) and ("plo" in h or "ctdt" in h or "programlearning" in h)
        and "weight" not in h and "trongso" not in h
    ) or (
        # 'No. | Course Learning Outcomes | Level capacity | Program Learning Outcomes' (cột đầu là số thứ tự)
        re.match(r"^(?:no|stt|tt|#)\b", first) and ("courselearningoutcome" in h or "chuandauramonhoc" in h)
        and ("programlearningoutcome" in h or "plo" in h or "ctdt" in h) and "weight" not in h and "trongso" not in h
    ):
        return "clos"
    if (
        "thanhphandanhgia" in h or ("baidanhgia" in h and "trongso" in h) or ("assessment" in h and "weight" in h)
        or "(ax.x)" in h or "(axx)" in h or ("ax.x" in h and ("trongso" in h or "weight" in h or "proportion" in h or "criteria" in h or "tieuchi" in h))
        # 'Evaluation component | Evaluation code | CLO | Criteria | Duration | Percentage', 'Assessment Component | Form | Proportion'
        or (("evaluation" in h or "assessment" in h or "danhgia" in h) and ("component" in h or "thanhphan" in h)
            and ("percentage" in h or "proportion" in h or "weight" in h or "tyle" in h or "tile" in h or "trongso" in h))
    ):
        return "assessments"
    if ("tuan" in h or "week" in h or "buoi" in h) and ("noidung" in h or "content" in h):
        return "schedule"
    # 'Số tiết | Nội dung | CĐR môn học | Hoạt động dạy và học', 'Time | Content | CLOs | PLOs | Teaching and learning activities'
    if (
        ("noidung" in h or "content" in h) and ("clo" in h or "cdr" in h or "chuandaura" in h)
        and ("hoatdong" in h or "teaching" in h or "activit" in h or "danhgia" in h or "assessment" in h)
        and "noidungclo" not in h and "clocontent" not in h  # 'Kí hiệu CLO | Nội dung CLO | Cần đánh giá…' là bảng kế hoạch đánh giá CLO
    ) or (
        # 'Class | Description | Activities | CLOs and Evaluation' (bảng CĐR/mục tiêu đã được nhận ở trên nên không nhầm)
        ("class" in h or "session" in h or "buoi" in h) and "description" in h and "clo" in h and "activit" in h
    ):
        return "schedule"
    return None


_ROW_START = {
    "objectives": re.compile(r"^(?:co|g|mt)\s*\d", re.I),
    "clos": re.compile(r"^clo\s*\d", re.I),
}
_WEEKISH = re.compile(r"^(?:\d{1,2}(?:\s*[-–&,/]\s*\d{1,2})*|tuan|buoi|week|session|time)\b", re.I)
_TOPICISH = re.compile(r"^(?:chuong|chapter|phan|part|bai|unit|lesson|topic|muc|\d+(?:\.\d+)+)\b", re.I)


def _continues(kind: str, row: list[str]) -> bool:
    """Dòng đầu của bảng KHÔNG tiêu đề (bảng bị ngắt qua trang) có phải phần nối tiếp của bảng loại `kind` không."""
    cells = [clean(c) for c in row]
    first = next((c for c in cells if c), "")
    if kind in _ROW_START:
        return bool(_ROW_START[kind].match(first))
    if kind == "assessments":
        return any(re.match(r"^A\s*\d", c) for c in cells[:3]) or bool(re.search(r"\d\s*%", " ".join(cells)))
    if kind == "schedule":
        return bool(
            (cells and _WEEKISH.match(fold(cells[0]) or "")) or any(_CLO_RX.search(c) for c in cells) or any(_TOPICISH.match(fold(c)) for c in cells[:3])
            or (cells and not cells[0] and sum(1 for c in cells if c) >= 2)  # nội dung ô tràn sang trang sau: ô tuần để trống
        )
    return False


def _merge_rows(rows: list[list[str]], key_col: int, header_sig: str) -> list[list[str]]:
    """Ghép dòng tiếp nối (ô khóa trống) vào dòng trước; bỏ dòng tiêu đề lặp lại ở đầu mỗi trang."""
    out: list[list[str]] = []
    for r in rows:
        if fold(" ".join(r)) == header_sig:
            continue
        if not any(clean(c) for c in r):
            continue
        key = clean(r[key_col]) if key_col < len(r) else ""
        if key or not out:
            out.append([clean(c) for c in r])
        else:
            for i, c in enumerate(r):
                if clean(c) and i < len(out[-1]):
                    out[-1][i] = (out[-1][i] + " " + clean(c)).strip()
    return out


def _collect_table(found: dict[str, dict], rows: list[list[str]], page: int | None = None) -> None:
    """Gom một bảng (dòng đầu là tiêu đề) vào đúng loại bảng; bỏ qua bảng không liên quan.

    Bảng không nhận ra tiêu đề nhưng nằm ngay sau (cùng trang / trang kế) một bảng đã nhận ra, cùng số cột (±1) và dòng đầu
    đúng dạng dữ liệu của bảng đó (CO1…, CLO1…, A1.1…, tuần/chương…) → coi là phần nối tiếp qua trang."""
    if not rows:
        return
    kind = classify_table(rows[0])
    last = found.get("__last")
    if kind is None:
        if (
            last and page is not None and 0 <= page - last["page"] <= 1 and abs(len(rows[0]) - last["ncols"]) <= 1
            and _continues(last["kind"], rows[0])
        ):
            found[last["kind"]]["rows"].extend(rows)
            last["page"] = page
        return
    slot = found.setdefault(kind, {"header": rows[0], "rows": []})
    slot["rows"].extend(rows[1:] if fold(" ".join(rows[0])) == fold(" ".join(slot["header"])) else rows)
    if page is not None:
        found["__last"] = {"kind": kind, "ncols": len(rows[0]), "page": page}


def _finish_tables(found: dict[str, dict]) -> dict[str, list[list[str]]]:
    result: dict[str, list[list[str]]] = {}
    for kind, slot in found.items():
        if kind == "__last":
            continue
        header = slot["header"]
        key_col = 1 if kind == "assessments" else 0
        # Bảng đánh giá: ô thành phần (cột 0) gộp nhiều dòng → khóa dòng mới là cột "bài đánh giá" (cột 1).
        merged = _merge_rows(slot["rows"], key_col, fold(" ".join(header)))
        result[kind] = [header, *merged]
    return result


def tables_from_raw(raw_tables: list[dict]) -> dict[str, list[list[str]]]:
    """Bảng đã trích sẵn (vd. notebook Colab ghi [{"page", "rows"}] hoặc {"page", "error"}) -> cùng kết quả như extract_tables."""
    found: dict[str, dict] = {}
    for t in raw_tables:
        if "rows" not in t:
            continue
        _collect_table(found, [[clean(c) for c in row] for row in t["rows"]], t.get("page"))
    return _finish_tables(found)


TABLE_PAGE_KEYS = ("clo", "cdr", "tuan", "week", "buoi", "trong so", "weight", "muc tieu", "objective")


def single_thread_layout() -> None:
    """Mô hình layout ONNX mặc định dùng mọi lõi (đo: ~12 lõi/tiến trình) -> nhiều worker song song làm nghẽn 100% CPU.
    Ép 1 luồng cho mọi InferenceSession (phải gọi trước khi mô hình được nạp). Đo trên máy dev: 3 trang 4,2 s -> 1,9 s."""
    try:
        import onnxruntime as ort  # noqa: PLC0415
    except ImportError:
        return
    if getattr(ort.SessionOptions, "_single_thread", False):
        return
    base = ort.SessionOptions

    def options():
        so = base()
        so.intra_op_num_threads = 1
        so.inter_op_num_threads = 1
        return so

    options._single_thread = True
    ort.SessionOptions = options


def page_tables(page) -> list:
    """find_tables nhanh. PyMuPDF >= 2.x mặc định chạy mô hình layout (ONNX): ~14 giây nạp mỗi tiến trình
    + vài giây mỗi trang, tự dùng nhiều lõi CPU, chậm 5–80 lần. Nên dò bảng theo đường kẻ trước (use_layout=False);
    chỉ chạy lại trang với layout khi có bảng CẦN LẤY (classify_table nhận ra tiêu đề) mà mới thấy dòng tiêu đề —
    vd. bảng CO không kẻ dòng bên trong. Mẫu 40 file: layout dự phòng trên mọi bảng chỉ-có-tiêu-đề không đổi kết quả file nào."""
    import pymupdf  # noqa: PLC0415

    try:
        tabs = page.find_tables(use_layout=False).tables
    except TypeError:  # PyMuPDF cũ: không có tham số use_layout và cũng không có mô hình layout
        return page.find_tables().tables

    def cell_text(c) -> str:
        return clean(page.get_text("text", clip=pymupdf.Rect(c), sort=True)) if c else ""

    def wanted_but_empty(t) -> bool:
        # Bảng cần lấy mà thân gần như rỗng (chỉ tiêu đề, hoặc trung bình <= 1 ô có chữ mỗi dòng).
        if not t.rows or len(t.rows) > 4 or classify_table([cell_text(c) for c in t.rows[0].cells]) is None:
            return False
        body = t.rows[1:]
        return sum(1 for r in body for c in r.cells if cell_text(c)) <= len(body)

    if any(wanted_but_empty(t) for t in tabs):
        single_thread_layout()
        try:
            alt = page.find_tables().tables
        except Exception:  # noqa: BLE001
            alt = []
        if sum(len(t.rows) for t in alt) > sum(len(t.rows) for t in tabs):
            return alt
    return tabs


def extract_tables(pdf_path: str) -> dict[str, list[list[str]]]:
    """{'objectives': [...], 'clos': [...], 'assessments': [...], 'schedule': [...]} — mỗi phần: [header, *rows đã ghép]."""
    import pymupdf  # noqa: PLC0415 - nặng, chỉ nạp trong worker

    found: dict[str, dict] = {}
    doc = pymupdf.open(pdf_path)
    for pno, page in enumerate(doc, 1):
        # find_tables chậm: chỉ chạy trên trang có từ khóa của các bảng cần lấy (CO/CLO/đánh giá/kế hoạch tuần),
        # và trang ngay sau một bảng đã nhận ra (phần nối tiếp có thể không còn từ khóa nào).
        low = fold(page.get_text("text"))
        last = found.get("__last")
        if not any(k in low for k in TABLE_PAGE_KEYS) and not (last and pno - last["page"] == 1):
            continue
        try:
            tabs = page_tables(page)
        except Exception:  # noqa: BLE001
            continue
        for t in tabs:
            rows = [[clean(page.get_text("text", clip=pymupdf.Rect(c), sort=True)) if c else "" for c in row.cells] for row in t.rows]
            if not rows:
                continue
            _collect_table(found, rows, pno)
    doc.close()
    return _finish_tables(found)


def extract_tables_isolated(pdf_path: str, timeout: int = int(os.environ.get("OUTLINE_TABLE_TIMEOUT", "240"))) -> dict[str, list[list[str]]] | None:
    """Chạy extract_tables trong TIẾN TRÌNH RIÊNG: PDF làm PyMuPDF sập/treo chỉ mất riêng file đó (trả None)."""
    name = Path(pdf_path).name
    try:
        r = subprocess.run([sys.executable, "-m", "app.services.outline_parse", pdf_path], capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        print(f"[parse-outlines] trích bảng quá {timeout}s: {name}", file=sys.stderr, flush=True)
        return None
    if r.returncode != 0:
        tail = (r.stderr.decode("utf-8", "replace").strip().splitlines() or ["?"])[-1][:200]
        print(f"[parse-outlines] trích bảng lỗi rc={r.returncode}: {name}: {tail}", file=sys.stderr, flush=True)
        return None
    try:
        return json.loads(r.stdout.decode("utf-8"))
    except ValueError:
        print(f"[parse-outlines] trích bảng trả về không phải JSON: {name}", file=sys.stderr, flush=True)
        return None


def _short(v: str | None, limit: int = 40) -> str | None:
    """Ô mức độ ('I, T, U', '3', 'T3') là chuỗi ngắn; câu dài là do cột bị lệch (mô tả rơi vào) → bỏ, không ghi sai."""
    return v if v and len(v) <= limit else None


def _split_code(cell: str | None, prefix: str) -> tuple[str | None, str]:
    """Ô mã mục tiêu/CLO: 'CO1' hoặc 'CO 1', nhưng nhiều PDF dính cả mô tả vào ô này ('CO1 Cung cấp…', 'CO1-Trang bị…').
    Trả về (mã chuẩn 'CO1', phần còn lại) — mã không thuộc dạng này thì (None, '')."""
    m = re.match(rf"^({prefix})\s*(\d{{1,2}}(?:\.\d+)*)(?!\d)\s*[:.\-–]?\s*(.*)$", clean(cell), re.I)
    if not m:
        return None, ""
    return f"{m.group(1).upper()}{m.group(2)}", m.group(3).strip()


def tables_to_records(tables: dict[str, list[list[str]]]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {"objectives": [], "clos": [], "assessments": [], "schedule": []}
    if "objectives" in tables:
        header, *rows = tables["objectives"]
        cm = _col_map(header, {"code": ("muc tieu", "objective"), "desc": ("mo ta",), "clo": ("cdr", "clo"), "level": ("tdn", "nang luc", "competency")})
        for r in rows:
            # bảng đã nhận ra là bảng mục tiêu: mã 'CO1', cả 'G1' (Goal), 'MT1' — giữ đúng như đề cương
            code, rest = _split_code(r[cm.get("code", 0)] if r else "", r"CO|G|MT")
            if not code:
                continue
            desc = _denoise(r[cm["desc"]]) if "desc" in cm and cm["desc"] < len(r) else None
            out["objectives"].append({
                "code": code, "description": desc or rest or None,
                "clo_codes": _clo_list(r[cm["clo"]]) if "clo" in cm and cm["clo"] < len(r) else [],
                "competency_level": _short(clean(r[cm["level"]]) if "level" in cm and cm["level"] < len(r) else None),
            })
    if "clos" in tables:
        header, *rows = tables["clos"]
        cm = _col_map(header, {"code": ("cdr", "clo"), "desc": ("mo ta",), "levels": ("muc do", "teaching", "i, t, u", "i t u")})
        for r in rows:
            # Bảng đã nhận ra là bảng CĐR: chấp nhận cả mã không có tiền tố CLO ('G1', 'LO2', 'CĐR3') — giữ đúng như trong đề cương.
            code, rest = _split_code(r[0] if r else "", r"CLO|CĐR|CDR|[A-Za-z]{1,4}")
            from_second = False
            if not code and len(r) > 1 and re.fullmatch(r"\d{1,2}\.?", clean(r[0])):
                # 'No. | Course Learning Outcomes | …' — cột đầu chỉ là số thứ tự, mã nằm đầu ô mô tả ('CLO1: Analyze…')
                code, rest = _split_code(r[1], r"CLO|CĐR|CDR")
                from_second = True
            if not code:
                continue
            if from_second:
                desc = None
            else:
                desc = _denoise(r[cm["desc"]]) if "desc" in cm and cm["desc"] < len(r) else (_denoise(r[1]) if len(r) > 1 else None)
            out["clos"].append({
                "code": code, "description": desc or rest or None,
                "teaching_levels": _short(clean(r[cm["levels"]]) if "levels" in cm and cm["levels"] < len(r) else (clean(r[-1]) if len(r) > 2 else None)),
            })
    if "assessments" in tables:
        header, *rows = tables["assessments"]
        cm = _col_map(header, {"component": ("thanh phan", "component"), "item": ("bai danh gia", "assessment item", "(ax.x)", "(axx)"), "clo": ("cdr", "clo"),
                               "criteria": ("tieu chi", "criteria"), "duration": ("thoi luong", "duration"),
                               "weight": ("trong so", "weight", "ty le", "ti le", "proportion", "percentage", "scale")})
        def _is_sub(h: str) -> bool:
            f = fold_ns(h)
            return ("trongso" in f and "con" in f) or ("sub" in f and ("weight" in f or "propor" in f or "ratio" in f or "scale" in f))

        sub_idx = next((i for i, h in enumerate(header) if _is_sub(h)), None)
        w_idx = next((i for i, h in enumerate(header) if i != sub_idx and not _is_sub(h)
                      and any(k in fold_ns(h) for k in ("trongso", "weight", "tyle", "tile", "proportion", "percentage", "scale"))), cm.get("weight"))
        comp = None
        for n, r in enumerate(rows, 1):
            def g(field):
                i = cm.get(field)
                return clean(r[i]) if i is not None and i < len(r) else None
            comp = g("component") or comp
            item = re.sub(r"^(?:\(\s*\)\s*)+", "", g("item") or "")  # '( ) A1.1' trong mẫu chưa điền
            m = re.match(r"^(A\d+(?:\.\d+)?)\s*[:.\-]?\s*(.*)$", item)
            code_m = None if m else re.match(r"^(A\d+)\b", comp or "")  # ô bài đánh giá không có mã: lấy mã thành phần ('A1. Đánh giá quá trình')
            out["assessments"].append({
                "ord": n, "component": comp, "item_code": m.group(1) if m else (code_m.group(1) if code_m else None),
                "item_name": (m.group(2) if m else item) or None,
                "clo_codes": _clo_list(g("clo") or ""), "criteria": g("criteria"), "duration": g("duration"),
                "weight_pct": _num(clean(r[w_idx])) if w_idx is not None and w_idx < len(r) else None,
                "sub_weight_pct": _num(clean(r[sub_idx])) if sub_idx is not None and sub_idx < len(r) else None,
            })
    if "schedule" in tables:
        header, *rows = tables["schedule"]
        cm = _col_map(header, {"week": ("tuan", "week", "buoi", "so tiet", "time"), "content": ("noi dung", "content"),
                               "clo": ("chuan dau ra", "cdr", "clo", "outcome"),
                               "activities": ("hoat dong day", "teaching"), "assessment": ("hoat dong danh gia", "bai danh gia", "assessment")})
        for n, r in enumerate(rows, 1):
            def g(field):
                i = cm.get(field)
                return clean(r[i]) if i is not None and i < len(r) else None
            week, content = g("week"), g("content")
            if week and len(week) > 40:
                # Tiêu đề ghi 'Tuần | Nội dung' nhưng dữ liệu đổi chỗ hai cột (nội dung đứng trước, tuần '1 -2' đứng sau), hoặc ô tuần lẫn đoạn văn dài.
                if content and len(content) <= 24 and re.match(r"^[\d\s\-–&,/.]+$|^(?:tuan|buoi|week)", fold(content)):
                    week, content = content, week
                else:
                    week, content = None, content or week
            if not (week or content):
                continue
            fc = fold(content or "")
            if (len(fc) <= 28 and re.match(r"^(?:noi dung|content)\b", fc)) or (re.fullmatch(r"\(?\d{1,2}\)?", fold(week or "x")) and re.fullmatch(r"\(\d{1,2}\)", fc)):
                continue  # dòng tiêu đề lặp lại ở đầu trang tiếp theo / dòng đánh số cột '(1) (2)'
            out["schedule"].append({"ord": n, "week_label": week, "content": content, "clo_codes": _clo_list(g("clo") or ""),
                                    "activities": g("activities"), "assessment": g("assessment")})
    return out


# --------------------------------------------------------------------------- 5. một tài liệu
def parse_document(text: str, pdf_path: str, *, with_tables: bool = True, raw_tables: list[dict] | None = None) -> dict:
    """Trả về dict JSON-được: {doc_type, course, sections, materials, objectives, clos, assessments, schedule, detail, status}.

    raw_tables: bảng đã trích sẵn (từ Colab); nếu có thì không chạy PyMuPDF cục bộ."""
    text = normalize_text(text)
    sections = split_sections(text)
    kinds = {s["kind"] for s in sections}
    body = {s["kind"]: s["text"] for s in sections}
    front = body.get("front", "")
    if "general" in kinds:
        doc_type = "syllabus_vi" if re.search(r"thong tin tong quat", fold(next(s["heading"] for s in sections if s["kind"] == "general"))) else "syllabus_en"
    elif "clo_report" in kinds:
        doc_type = "clo_report"
    else:
        doc_type = "other"

    course = parse_general(body.get("general", ""), front) if doc_type.startswith("syllabus") else {}
    if course:
        desc = body.get("description")
        course["description"] = clean(desc) if desc else None
    materials = best_materials(sections, text) if doc_type.startswith("syllabus") else []
    records = {"objectives": [], "clos": [], "assessments": [], "schedule": []}
    tables_failed = False
    if with_tables and doc_type.startswith("syllabus"):
        if raw_tables is not None:
            records = tables_to_records(tables_from_raw(raw_tables))
        else:
            tabs = extract_tables_isolated(pdf_path)
            if tabs is None:
                tables_failed = True
            else:
                records = tables_to_records(tabs)

    missing = []
    if doc_type.startswith("syllabus"):
        if not (course.get("name_vi") or course.get("name_en")):
            missing.append("name")
        for k in ("course_code", "credits"):
            if not course.get(k):
                missing.append(k)
        for k in ("objectives", "clos", "assessments", "schedule"):
            if not records.get(k):
                missing.append(k)
        if not materials:
            missing.append("materials")
    # Trọng số của thành phần chỉ nằm ở dòng đầu của nhóm (ô gộp) → cộng mọi giá trị khác rỗng; đúng thì ≈ 100.
    wsum = round(sum(a["weight_pct"] or 0 for a in records.get("assessments", [])), 1)
    detail = {"sections": sorted(kinds), "counts": {k: len(records.get(k, [])) for k in ("objectives", "clos", "assessments", "schedule")},
              "materials": len(materials), "missing": missing, "weight_sum": wsum, "tables_failed": tables_failed}
    status = outline_status(doc_type, missing)
    return {"doc_type": doc_type, "course": course, "sections": sections, "materials": materials, **records, "detail": detail, "status": status}


def outline_status(doc_type: str, missing: list[str]) -> str:
    if doc_type == "clo_report":
        return "skipped"
    if doc_type == "other":
        return "failed"
    if not missing:
        return "ok"
    if len(missing) <= 3 and "name" not in missing:
        return "partial"
    return "failed" if len(missing) >= 6 else "partial"


def apply_catalog_codes(parsed: dict, linked_codes: list[str]) -> dict:
    """Ô 'Mã học phần' để trống trong PDF nhưng danh mục CTĐT 2025 đã gắn PDF này với mã học phần → không tính là thiếu mã.
    Không chép mã vào `course_code` (cột đó giữ NGUYÊN VĂN trong file); nguồn mã ghi ở detail.course_code_from_catalog."""
    detail = parsed["detail"]
    if linked_codes and "course_code" in detail["missing"] and parsed["doc_type"].startswith("syllabus"):
        detail["missing"] = [m for m in detail["missing"] if m != "course_code"]
        detail["course_code_from_catalog"] = sorted(set(linked_codes))
        parsed["status"] = outline_status(parsed["doc_type"], detail["missing"])
    return parsed


def _worker(args: tuple[int, str, str]) -> tuple[int, dict | None, str | None]:
    doc_id, text, path = args
    try:
        return doc_id, parse_document(text, path), None
    except Exception as e:  # noqa: BLE001
        return doc_id, None, f"{type(e).__name__}: {e}"[:300]


# --------------------------------------------------------------------------- 6. ghi DB
PARSER_VERSION = "rules-7"  # tăng khi đổi logic phân tích; parse_outlines bỏ qua tài liệu đã phân tích bằng đúng phiên bản này


def save_parsed(db: Session, doc_id: int, p: dict, *, method: str = PARSER_VERSION) -> None:
    for model in (OutlineSection, OutlineMaterial, OutlineObjective, OutlineClo, OutlineAssessment, OutlineScheduleItem):
        db.execute(delete(model).where(model.document_id == doc_id))
    db.execute(delete(OutlineCourse).where(OutlineCourse.document_id == doc_id))
    c = p["course"]
    db.add(OutlineCourse(
        document_id=doc_id, doc_type=p["doc_type"], parse_status=p["status"], parse_detail=p["detail"], parse_method=method,
        parsed_at=datetime.now(timezone.utc),
        **{k: c.get(k) for k in ("faculty", "department", "name_vi", "name_en", "course_code", "course_code_norm", "knowledge_block", "level",
                                  "major", "cohort_range", "academic_year", "term", "credits", "hours_lecture", "hours_practice",
                                  "hours_self_study", "prerequisite_raw", "previous_raw", "next_raw", "corequisite_raw", "teaching_language",
                                  "lecturers", "assistants", "description")},
    ))
    for s in p["sections"]:
        db.add(OutlineSection(document_id=doc_id, kind=s["kind"], ord=s["ord"], heading=(s["heading"] or "")[:512], text=s["text"],
                              search_text=normalize_search(s["text"][:30000])))
    for m in p["materials"]:
        db.add(OutlineMaterial(document_id=doc_id, kind=m["kind"], ord=m["ord"], citation=m["citation"]))
    for o in p["objectives"]:
        db.add(OutlineObjective(document_id=doc_id, **o))
    for o in p["clos"]:
        db.add(OutlineClo(document_id=doc_id, **o))
    for o in p["assessments"]:
        db.add(OutlineAssessment(document_id=doc_id, **o))
    for o in p["schedule"]:
        db.add(OutlineScheduleItem(document_id=doc_id, **o))


def parse_outlines(db: Session, data_dir: Path, *, limit: int | None = None, workers: int = 4, only_ids: list[int] | None = None,
                   force: bool = False, include_ok: bool = False) -> dict:
    """Mặc định: chỉ tài liệu CHƯA phân tích bằng phiên bản hiện tại và CHƯA đạt 'ok' (đề cương đủ thì không chạy lại).
    force: chạy lại cả tài liệu đã phân tích bằng phiên bản này (vẫn bỏ qua 'ok'); include_ok: chạy lại cả tài liệu đã 'ok'."""
    q = select(OutlineDocument.id, OutlineDocument.text, OutlineDocument.rel_path).where(OutlineDocument.text_status == "extracted")
    if only_ids:
        q = q.where(OutlineDocument.id.in_(only_ids))
    if not include_ok:
        ok_ids = select(OutlineCourse.document_id).where(OutlineCourse.parse_status == "ok")
        q = q.where(OutlineDocument.id.not_in(ok_ids))
    if not force:  # chạy lại được sau khi bị ngắt: lọc tài liệu đã phân tích bằng phiên bản hiện tại TRƯỚC khi giới hạn số lượng
        done_ids = select(OutlineCourse.document_id).where(OutlineCourse.parse_method == PARSER_VERSION)
        q = q.where(OutlineDocument.id.not_in(done_ids))
    q = q.order_by(OutlineDocument.id)
    if limit:
        q = q.limit(limit)
    jobs = [(i, t or "", str(data_dir / rel)) for i, t, rel in db.execute(q).all()]
    linked: dict[int, list[str]] = {}
    for doc_id, code in db.execute(select(OutlineModuleLink.document_id, OutlineModuleLink.module_code)):
        linked.setdefault(doc_id, []).append(code)
    stats = {"docs": len(jobs), "ok": 0, "partial": 0, "failed": 0, "skipped": 0, "errors": 0}
    # Luồng chỉ để chờ các tiến trình con (extract_tables_isolated) — an toàn khi một PDF làm sập PyMuPDF.
    with ThreadPoolExecutor(max_workers=workers) as ex:
        # as_completed: ghi ngay khi file nào xong (không bị file chậm phía trước chặn).
        for n, fut in enumerate(as_completed([ex.submit(_worker, j) for j in jobs]), 1):
            doc_id, parsed, err = fut.result()
            if parsed is None:
                stats["errors"] += 1
                print(f"[parse-outlines] lỗi tài liệu {doc_id}: {err}", flush=True)
            else:
                apply_catalog_codes(parsed, linked.get(doc_id, []))
                try:
                    with db.begin_nested():  # savepoint: một tài liệu lỗi (vd. chuỗi quá dài cho cột) không làm hỏng cả lượt
                        save_parsed(db, doc_id, parsed)
                except Exception as e:  # noqa: BLE001
                    stats["errors"] += 1
                    print(f"[parse-outlines] không lưu được tài liệu {doc_id}: {type(e).__name__}: {str(e).splitlines()[0][:300]}", flush=True)
                else:
                    stats[parsed["status"]] += 1
            if n % 8 == 0:  # lưu thường xuyên để thấy tiến độ và không mất việc khi bị ngắt
                db.commit()
                print(f"[parse-outlines] {n}/{len(jobs)} {stats}", flush=True)
    db.commit()
    stats["imported"] = stats["ok"] + stats["partial"]
    return stats


if __name__ == "__main__":  # chạy bởi extract_tables_isolated: in JSON các bảng của một PDF
    sys.stdout.reconfigure(encoding="utf-8")
    for _k in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):  # trước khi numpy được nạp
        os.environ.setdefault(_k, "1")
    print(json.dumps(extract_tables(sys.argv[1]), ensure_ascii=False))
