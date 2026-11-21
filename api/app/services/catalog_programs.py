"""Dựng chương trình đào tạo (programs / program_modules / module_relations) của khóa 25 từ danh mục "Đề cương CTĐT 2025"
(bảng program_catalog_entries), dùng khi cổng portal chưa trả CTĐT K25.

Cách làm: chuyển các dòng catalog có cột học kỳ sang đúng định dạng dòng của cổng (`studyProgram`) rồi gọi `import_ctdt`
— cùng đường nhập đã dùng cho K23/K24, nên quan hệ tiên quyết/học trước, môn thiếu trong `modules`… xử lý như nhau.
Khi có dữ liệu thật của cổng cho cùng mã CTĐT, `import_ctdt` sẽ ghi đè (idempotent).

Giả định đã ghi rõ (không suy diễn thêm):
  * Mã CTĐT = "K25" + mã ngành, mã ngành lấy theo CTĐT K24 cùng tên (bảng MAJOR_CODE). Ngành chưa rõ mã (Luật, Luật kinh tế,
    ngành mới) dùng mã chữ: K25LUAT, K25LKT… Chương trình dựng từ catalog có programs.source = 'catalog2025'.
  * HK01…HK10 là THỨ TỰ học kỳ trong khóa (suggested_order); catalog không ghi năm học nên suggested_semester để trống.
  * Cột "bắt buộc": 'X' = bắt buộc; trống = không đánh dấu bắt buộc (tự chọn / chưa rõ).
  * Mỗi sheet có cột học kỳ là một bản chương trình: sheet đầu (ưu tiên 'Dữ liệu gốc') lấy mã gốc, các sheet sau thêm -V2, -V3…
"""

from __future__ import annotations

import re
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Program, ProgramCatalogEntry, ProgramModule
from app.services.ctdt_import import import_ctdt

MAJOR_CODE = {
    "Kinh tế": "401", "Kinh tế quốc tế": "402", "Tài chính - Ngân hàng": "404", "Kế toán": "405",
    "Hệ thống thông tin quản lý": "406", "Quản trị kinh doanh": "407", "Kinh doanh quốc tế": "408", "Kiểm toán": "409",
    "Marketing": "410", "Thương mại điện tử": "411", "Toán kinh tế": "413", "Công nghệ tài chính": "414",
    "Quản lý công": "418",
}
SLUG_ID = {"Luật": "LUAT", "Luật kinh tế": "LKT", "KDTMHQ": "KDTMHQ",
           "Kinh doanh nông nghiệp số": "KDNNS", "Kinh tế đất đai": "KTDD"}

_TERM = re.compile(r"HK\s*0*(\d+)", re.I)
_BRACKET_CODE = re.compile(r"\[([A-Za-z0-9]{3,12})\]")
_PLAIN_CODE = re.compile(r"\b[A-Z]{2,4}\d{3,5}[A-Z]?\b")


def prev_codes(raw: str | None) -> str | None:
    """Cột "học phần học trước" của catalog dạng "[BAA2028]Nguyên lý kế toán, [BEE1037]Kinh tế vi mô" (có kèm tên môn).
    Chỉ giữ mã, nối bằng dấu phẩy như dữ liệu cổng — nếu đưa nguyên chuỗi vào bộ phân tích thì tên môn bị tách thành "mã" rác.
    Văn bản tự do không có mã (vd "Luật Hiến pháp; Luật Hành chính") -> None."""
    if not raw:
        return None
    codes = _BRACKET_CODE.findall(raw) or _PLAIN_CODE.findall(raw)
    return ", ".join(dict.fromkeys(codes)) or None


def _base_id(label: str, cohort: str) -> str:
    return f"{cohort}{MAJOR_CODE.get(label) or SLUG_ID.get(label) or re.sub(r'[^A-Za-z0-9]', '', label).upper()[:12]}"


def _sheet_title(track: str | None) -> str:
    return re.sub(r"^\s*\d+\s*[.\-)]?\s*", "", track or "").strip()


def build_catalog_programs(db: Session, cohort: str = "K25") -> dict:
    rows = db.scalars(
        select(ProgramCatalogEntry).where(ProgramCatalogEntry.term.is_not(None), ProgramCatalogEntry.module_code.is_not(None))
        .order_by(ProgramCatalogEntry.program_label, ProgramCatalogEntry.source_file, ProgramCatalogEntry.source_sheet,
                  ProgramCatalogEntry.source_row)
    ).all()
    sheets: dict[str, dict[tuple, list]] = defaultdict(lambda: defaultdict(list))
    for e in rows:
        sheets[e.program_label][(e.source_file, e.source_sheet, e.track_label, e.category)].append(e)

    year = cohort[1:]
    payload: dict[str, list[dict]] = {}
    orders: dict[str, dict[str, int]] = {}
    report: list[dict] = []
    dup_dropped = 0
    for label, by_sheet in sorted(sheets.items()):
        ordered = sorted(by_sheet.items(), key=lambda kv: (kv[0][3] != "curriculum_source", "(E)" in (kv[0][2] or ""), kv[0][2] or "", kv[0][1] or ""))
        base = _base_id(label, cohort)
        k24 = db.get(Program, "K24" + MAJOR_CODE[label]) if label in MAJOR_CODE else None
        faculty = k24.faculty if k24 else None
        for i, ((_f, _s, track, _c), entries) in enumerate(ordered):
            pid = base if i == 0 else f"{base}-V{i + 1}"
            name = f"{label} Khóa {year}" if i == 0 else f"{label} – {_sheet_title(track)} Khóa {year}"
            seen: set[str] = set()
            out: list[dict] = []
            order: dict[str, int] = {}
            for e in sorted(entries, key=lambda x: (int(_TERM.search(x.term).group(1)) if _TERM.search(x.term or "") else 99, x.source_row)):
                if e.module_code in seen:
                    dup_dropped += 1
                    continue
                seen.add(e.module_code)
                m = _TERM.search(e.term or "")
                order[e.module_code] = int(m.group(1)) if m else None
                out.append({
                    "MaCTDT": pid, "TenCTDT": name, "KhoaHoc": f"Khóa {year}", "Khoa": faculty,
                    "HocKy": e.term, "HocKyHienThi": e.term,  # chỉ là thứ tự "HK03"; parse_suggested_semester sẽ bỏ qua (không có năm học)
                    "BatBuoc": "Bắt Buộc" if (e.required_raw or "").strip().upper() == "X" else "",
                    "MaHP": e.module_code, "TenHP": e.module_name, "STC": int(e.credits) if e.credits is not None else None,
                    "HPHocTruoc": prev_codes(e.previous_raw), "TenKhoiKienThuc": None,
                })
            payload[pid] = out
            orders[pid] = order
            report.append({"id": pid, "name": name, "modules": len(out), "sheet": track})

    res = import_ctdt(db, payload).model_dump()
    # import_ctdt đặt source='ctdt'; thứ tự kỳ lấy từ HKnn của catalog
    for pid, order in orders.items():
        prog = db.get(Program, pid)
        if not prog:
            continue
        prog.source = "catalog2025"
        for pm in db.scalars(select(ProgramModule).where(ProgramModule.program_id == pid)).all():
            pm.suggested_order = order.get(pm.module_code)
    db.commit()
    return {**res, "cohort": cohort, "programs": report, "duplicate_rows_dropped": dup_dropped}
