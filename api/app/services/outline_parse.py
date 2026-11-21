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
_NUM_HEAD = re.compile(r"^[ \t]{0,12}(\d{1,2})\.[ \t]+(\S[^\n]{2,110}?)[ \t]*:?[ \t]*$", re.M)
_KINDS: list[tuple[str, re.Pattern]] = [
    ("clo_report", re.compile(r"thong ke ty le nguoi hoc dat|statistics on the percentage|nhan xet,? danh gia chung|general comments and evaluations|^ket luan$|^conclusion$")),
    ("general", re.compile(r"thong tin (tong quat|chung)|general information")),
    ("description", re.compile(r"mo ta (hoc phan|mon hoc|khoa hoc)|course description|^chuong trinh giang day")),
    ("materials", re.compile(r"tai lieu hoc tap|learning materials|textbooks?|sach giao khoa|giao trinh|course reference|tai lieu")),
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
    d["name_vi"] = _val(text, r"Tên (?:học phần|môn học|khóa học)(?: bằng)? tiếng Việt|Tên khóa học|Course title \(Vietnamese\)")
    d["name_en"] = _val(text, r"Tên (?:học phần|môn học)(?: bằng)? tiếng Anh|Course title \(English\)|Course title")
    code = _val(text, r"Mã (?:học phần|môn học|khóa học)|Course code")
    d["course_code"] = code
    d["course_code_norm"] = re.sub(r"\s+", "", code).upper() if code else None
    d["level"] = _val(text, r"Trình độ|Cấp độ khóa học|Level of the course|Level")
    d["major"] = _val(text, r"Ngành học|Ngành đào tạo|Chuyên ngành|Major")
    d["cohort_range"] = _val(text, r"Khóa học|Cohort")
    d["academic_year"] = _val(text, r"Năm học|Academic year")
    d["term"] = _val(text, r"Học kỳ|Semester")
    m = re.search(r"(\d{1,2})\s*(?:tín chỉ|credits?)", text, re.I)
    d["credits"] = float(m.group(1)) if m else None
    d["hours_lecture"] = _num((re.search(r"(?:Lý thuyết[^\n]*?\):|Theory:)\s*([^\n]*)", text) or [None, None])[1])
    d["hours_practice"] = _num((re.search(r"(?:Thực hành[^\n]*?\):|Exercises?:|Practice:)\s*([^\n]*)", text) or [None, None])[1])
    d["hours_self_study"] = _num((re.search(r"(?:Tự học[^\n]*?\):|Self-?study:)\s*([^\n]*)", text) or [None, None])[1])
    d["prerequisite_raw"] = _val(text, r"Học phần tiên quyết|Môn học tiên quyết|Điều kiện tiên quyết|Pre-?requisites?")
    d["previous_raw"] = _val(text, r"Học phần trước|Môn học trước|Previous (?:subjects?|courses?)")
    d["next_raw"] = _val(text, r"Học phần sau|Môn học sau|Following (?:subjects?|courses?)|Next course")
    d["corequisite_raw"] = _val(text, r"Học phần song hành|Môn học song hành|Điều kiện đồng thời|Co-?requisites?")
    d["teaching_language"] = _next_line_val(text, r"Ngôn ngữ sử dụng trong giảng|Ngôn ngữ giảng dạy|Language of instruction")
    d["lecturers"] = _people(_next_line_val(text, r"Các giảng viên phụ trách giảng|Tên giảng viên|Lecturers?"))
    d["assistants"] = _people(_val(text, r"Các giảng viên trợ giảng|Teaching assistants?"))
    kb = re.search(r"^[ \t]*(Kiến thức[^\n]*?)\s{2,}", text, re.M)
    d["knowledge_block"] = _val(text, r"Knowledge block") or (clean(kb.group(1)) if kb else None)
    return d


# --------------------------------------------------------------------------- 3. tài liệu
def parse_materials(body: str) -> list[dict]:
    out: list[dict] = []
    kind, cur = "reference", None
    for raw in body.splitlines():
        s = clean(raw)
        if not s:
            continue
        f = fold(s)
        if re.match(r"^\d+\.\d+\.?\s*giao trinh", f) or f.startswith("giao trinh:") or f.startswith("textbook"):
            kind, cur = "textbook", None
            continue
        if re.match(r"^\d+\.\d+\.?\s*(tai lieu|references?)", f) or f.startswith("tai lieu khac") or f.startswith("references"):
            kind, cur = "reference", None
            continue
        m = re.match(r"^(\d{1,2})[.)]\s+(.*)", s)
        if m:
            cur = {"kind": kind, "ord": len(out) + 1, "citation": m.group(2)}
            out.append(cur)
        elif cur is not None:
            cur["citation"] += " " + s
    return out


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
    ):
        return "objectives"
    if ("motacdr" in h or "motachuandaura" in h) or ("cdr" in h and ("mucdogiangday" in h or "teachinglevel" in h)) or (
        "clox" in h and "cox" not in h and ("teachinglevel" in h or "description" in h)
    ):
        return "clos"
    if "thanhphandanhgia" in h or ("baidanhgia" in h and "trongso" in h) or ("assessment" in h and "weight" in h):
        return "assessments"
    if ("tuan" in h or "week" in h or "buoi" in h) and ("noidung" in h or "content" in h):
        return "schedule"
    return None


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


def _collect_table(found: dict[str, dict], rows: list[list[str]]) -> None:
    """Gom một bảng (dòng đầu là tiêu đề) vào đúng loại bảng; bỏ qua bảng không liên quan."""
    if not rows:
        return
    kind = classify_table(rows[0])
    if kind is None:
        return
    slot = found.setdefault(kind, {"header": rows[0], "rows": []})
    slot["rows"].extend(rows[1:] if fold(" ".join(rows[0])) == fold(" ".join(slot["header"])) else rows)


def _finish_tables(found: dict[str, dict]) -> dict[str, list[list[str]]]:
    result: dict[str, list[list[str]]] = {}
    for kind, slot in found.items():
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
        _collect_table(found, [[clean(c) for c in row] for row in t["rows"]])
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
    for page in doc:
        # find_tables chậm: chỉ chạy trên trang có từ khóa của các bảng cần lấy (CO/CLO/đánh giá/kế hoạch tuần).
        low = fold(page.get_text("text"))
        if not any(k in low for k in TABLE_PAGE_KEYS):
            continue
        try:
            tabs = page_tables(page)
        except Exception:  # noqa: BLE001
            continue
        for t in tabs:
            rows = [[clean(page.get_text("text", clip=pymupdf.Rect(c), sort=True)) if c else "" for c in row.cells] for row in t.rows]
            if not rows:
                continue
            _collect_table(found, rows)
    doc.close()
    return _finish_tables(found)


def extract_tables_isolated(pdf_path: str, timeout: int = int(os.environ.get("OUTLINE_TABLE_TIMEOUT", "240"))) -> dict[str, list[list[str]]] | None:
    """Chạy extract_tables trong TIẾN TRÌNH RIÊNG: PDF làm PyMuPDF sập/treo chỉ mất riêng file đó (trả None)."""
    try:
        r = subprocess.run([sys.executable, "-m", "app.services.outline_parse", pdf_path], capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout.decode("utf-8"))
    except ValueError:
        return None


def tables_to_records(tables: dict[str, list[list[str]]]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {"objectives": [], "clos": [], "assessments": [], "schedule": []}
    if "objectives" in tables:
        header, *rows = tables["objectives"]
        cm = _col_map(header, {"code": ("muc tieu", "objective"), "desc": ("mo ta",), "clo": ("cdr", "clo"), "level": ("tdn", "nang luc", "competency")})
        for r in rows:
            code = clean(r[cm.get("code", 0)]).upper() if r else ""
            if not re.match(r"^CO\s*\d+", code):
                continue
            out["objectives"].append({
                "code": re.sub(r"\s+", "", code), "description": _denoise(r[cm["desc"]]) if "desc" in cm and cm["desc"] < len(r) else None,
                "clo_codes": _clo_list(r[cm["clo"]]) if "clo" in cm and cm["clo"] < len(r) else [],
                "competency_level": clean(r[cm["level"]]) if "level" in cm and cm["level"] < len(r) else None,
            })
    if "clos" in tables:
        header, *rows = tables["clos"]
        cm = _col_map(header, {"code": ("cdr", "clo"), "desc": ("mo ta",), "levels": ("muc do", "teaching", "i, t, u", "i t u")})
        for r in rows:
            code = clean(r[0]).upper() if r else ""
            if not re.match(r"^CLO\s*\d+", code):
                continue
            out["clos"].append({
                "code": re.sub(r"\s+", "", code), "description": _denoise(r[cm["desc"]]) if "desc" in cm and cm["desc"] < len(r) else (_denoise(r[1]) if len(r) > 1 else None),
                "teaching_levels": clean(r[cm["levels"]]) if "levels" in cm and cm["levels"] < len(r) else (clean(r[-1]) if len(r) > 2 else None),
            })
    if "assessments" in tables:
        header, *rows = tables["assessments"]
        cm = _col_map(header, {"component": ("thanh phan", "component"), "item": ("bai danh gia", "assessment item"), "clo": ("cdr", "clo"),
                               "criteria": ("tieu chi", "criteria"), "duration": ("thoi luong", "duration"), "weight": ("trong so", "weight")})
        sub_idx = next((i for i, h in enumerate(header) if "trongso" in fold_ns(h) and "con" in fold_ns(h)), None)
        w_idx = next((i for i, h in enumerate(header) if "trongso" in fold_ns(h) and "con" not in fold_ns(h)), cm.get("weight"))
        comp = None
        for n, r in enumerate(rows, 1):
            def g(field):
                i = cm.get(field)
                return clean(r[i]) if i is not None and i < len(r) else None
            comp = g("component") or comp
            item = g("item") or ""
            m = re.match(r"^(A\d+(?:\.\d+)?)\s*[:.\-]?\s*(.*)$", item)
            out["assessments"].append({
                "ord": n, "component": comp, "item_code": m.group(1) if m else None, "item_name": (m.group(2) if m else item) or None,
                "clo_codes": _clo_list(g("clo") or ""), "criteria": g("criteria"), "duration": g("duration"),
                "weight_pct": _num(clean(r[w_idx])) if w_idx is not None and w_idx < len(r) else None,
                "sub_weight_pct": _num(clean(r[sub_idx])) if sub_idx is not None and sub_idx < len(r) else None,
            })
    if "schedule" in tables:
        header, *rows = tables["schedule"]
        cm = _col_map(header, {"week": ("tuan", "week", "buoi"), "content": ("noi dung", "content"), "clo": ("chuan dau ra", "clo", "outcome"),
                               "activities": ("hoat dong day", "teaching"), "assessment": ("hoat dong danh gia", "assessment")})
        for n, r in enumerate(rows, 1):
            def g(field):
                i = cm.get(field)
                return clean(r[i]) if i is not None and i < len(r) else None
            if not (g("week") or g("content")):
                continue
            out["schedule"].append({"ord": n, "week_label": g("week"), "content": g("content"), "clo_codes": _clo_list(g("clo") or ""),
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
    materials = parse_materials(body["materials"]) if "materials" in body else []
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
    wsum = round(sum(a["weight_pct"] or 0 for a in records.get("assessments", []) if a.get("item_code")), 1)
    detail = {"sections": sorted(kinds), "counts": {k: len(records.get(k, [])) for k in ("objectives", "clos", "assessments", "schedule")},
              "materials": len(materials), "missing": missing, "weight_sum": wsum, "tables_failed": tables_failed}
    if doc_type == "clo_report":
        status = "skipped"
    elif doc_type == "other":
        status = "failed"
    elif not missing:
        status = "ok"
    elif len(missing) <= 3 and "name" not in missing:
        status = "partial"
    else:
        status = "failed" if len(missing) >= 6 else "partial"
    return {"doc_type": doc_type, "course": course, "sections": sections, "materials": materials, **records, "detail": detail, "status": status}


def _worker(args: tuple[int, str, str]) -> tuple[int, dict | None, str | None]:
    doc_id, text, path = args
    try:
        return doc_id, parse_document(text, path), None
    except Exception as e:  # noqa: BLE001
        return doc_id, None, f"{type(e).__name__}: {e}"[:300]


# --------------------------------------------------------------------------- 6. ghi DB
PARSER_VERSION = "rules-5"  # tăng khi đổi logic phân tích; parse_outlines bỏ qua tài liệu đã phân tích bằng đúng phiên bản này


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
                   force: bool = False) -> dict:
    q = select(OutlineDocument.id, OutlineDocument.text, OutlineDocument.rel_path).where(OutlineDocument.text_status == "extracted")
    if only_ids:
        q = q.where(OutlineDocument.id.in_(only_ids))
    if not force:  # chạy lại được sau khi bị ngắt: lọc tài liệu đã phân tích bằng phiên bản hiện tại TRƯỚC khi giới hạn số lượng
        done_ids = select(OutlineCourse.document_id).where(OutlineCourse.parse_method == PARSER_VERSION)
        q = q.where(OutlineDocument.id.not_in(done_ids))
    q = q.order_by(OutlineDocument.id)
    if limit:
        q = q.limit(limit)
    jobs = [(i, t or "", str(data_dir / rel)) for i, t, rel in db.execute(q).all()]
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
                save_parsed(db, doc_id, parsed)
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
