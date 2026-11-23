"""Dịch vụ nạp chương trình đào tạo THẠC SĨ từ 10 workbook BĐCL (Brief D6).

Quy tắc thực hiện:
1. Nguồn dữ liệu:
   - Quét các file `THS_*.xlsx` trong thư mục `data/raw/ctdt_bdcl/`.
   - Bỏ qua file trùng lặp (chứa `_copy` trong tên file, vd `THS_KinhTeDoiNgoai_copy1.xlsx`).
   - Bỏ qua sheet dữ liệu tổng (`Data`, `Data tổng`), sheet tiến sĩ (`Kế toán (TS)`),
     và các sheet đại học nằm lẫn trong workbook (vd sheet ngành 405, 408, 402...).
2. Bậc đào tạo & chương trình:
   - Gắn `degree='thac_si'` cho mọi CTĐT thạc sĩ và môn học nạp từ các workbook này.
   - Mỗi sheet thạc sĩ tạo thành một chương trình riêng.
   - Với ngành có 2 nhánh NC (nghiên cứu / nâng cao) và UD (ứng dụng), tạo 2 chương trình phân biệt:
     Mã chương trình quy ước: `M{major_code}{branch}` (vd: `M601NC`, `M601UD`, `M602`, `M605`...).
   - Khóa áp dụng: gán tạm `2025-2026` và ghi chú rõ ràng chưa xác nhận chính thức.
3. Học phần & đánh giá:
   - Nạp tất cả môn (đặc biệt tiền tố M) vào bảng `modules` với `degree='thac_si'`.
   - Giữ nguyên các môn có sẵn trong DB không nằm trong 10 file này (không đặt lại degree của chúng).
   - `suggested_semester` để None (file không có cột học kỳ).
   - Nạp đầy đủ tỉ lệ điểm, hình thức đánh giá, loại thi, thời lượng thi, tài liệu chính.
4. Idempotent & --dry-run:
   - `--dry-run` chỉ xuất file `data/processed/ths_import_preview.csv` mà không sửa DB.
"""

from __future__ import annotations

import csv
from datetime import datetime, timezone
from pathlib import Path
import re
from typing import Any

import openpyxl
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Module, ModuleAssessment, ModuleTextbook, Program, ProgramModule
from app.services.ctdt_files_import import parse_credits_val
from app.services.faculty_names import canonical_faculty_vi, clean_raw_text
from app.services.importer import clip
from app.services.lineage import log_run
from app.services.master_data_import import normalize_final_assessment, parse_ratio
from app.services.program_names import normalize_master_program_name
from app.services.text import normalize_search

_REPO_ROOT = Path(__file__).resolve().parents[3]
_API_DIR = Path(__file__).resolve().parents[2]
_DATA_DIR = (_REPO_ROOT / "data") if (_REPO_ROOT / "data").exists() else (_API_DIR / "data")

DEFAULT_BDCL_DIR = _DATA_DIR / "raw" / "ctdt_bdcl"
DEFAULT_PREVIEW_CSV = _DATA_DIR / "processed" / "ths_import_preview.csv"

# Ánh xạ tên file workbook -> Khoa phụ trách
WORKBOOK_FACULTY_MAP: dict[str, str] = {
    "ths_hethongthongtin": "Khoa Hệ thống thông tin",
    "ths_ketoankiemtoan": "Khoa Kế toán - Kiểm toán",
    "ths_kinhte": "Khoa Kinh tế",
    "ths_kinhtedoingoai": "Khoa Kinh tế đối ngoại",
    "ths_luat": "Khoa Luật",
    "ths_luatkinhte": "Khoa Luật Kinh tế",
    "ths_taichinhnganhang": "Khoa Tài chính - Ngân hàng",
    "ths_toankinhte": "Khoa Toán kinh tế",
    "ths_quantrikinhdoanh": "Khoa Quản trị kinh doanh",
}

# Ánh xạ mã ngành thạc sĩ -> tên ngành
MASTER_MAJOR_NAMES: dict[str, str] = {
    "601": "Kinh tế chính trị",
    "602": "Kinh tế quốc tế",
    "603": "Kinh tế và Quản lý công",
    "604": "Tài chính - Ngân hàng",
    "605": "Kế toán",
    "607": "Quản trị kinh doanh",
    "609": "Luật dân sự và Tố tụng dân sự",
    "610": "Luật kinh tế",
    "611": "Thương mại điện tử",
    "614": "Công nghệ tài chính",
    "618": "Quản lý công",
    "619": "Phân tích dữ liệu và AI trong kinh tế và kinh doanh",
    "657": "Luật",
}


def clean_cell_str(val: Any) -> str:
    """Loại bỏ ký tự khoảng trắng đặc biệt \xa0 và strip."""
    if val is None:
        return ""
    return str(val).replace("\xa0", " ").strip()


def is_master_sheet(sheet_name: str, sample_text: str) -> bool:
    """Xác định sheet có phải là chương trình thạc sĩ hợp lệ hay không."""
    s_name = sheet_name.lower().replace("\xa0", " ").strip()
    s_full = f"{sheet_name} {sample_text}".lower().replace("\xa0", " ")

    # Bỏ qua sheet dữ liệu tổng
    if s_name.startswith("data") or "dữ liệu tổng" in s_name:
        return False

    # Bỏ qua sheet tiến sĩ
    if "(ts)" in s_name or "tiến sĩ" in s_name or "(ts)" in s_full or "tiến sĩ" in s_full:
        return False

    # Bỏ qua các sheet đại học có mã 4xx hoặc 5xx ở tên sheet
    if re.search(r"(?<!\d)(4\d{2}|5\d{2})(?!\d)", s_name):
        return False

    # Bỏ qua các sheet đại học MyUEL
    if "ct chuẩn" in s_name or "myuel" in s_name:
        return False

    # Sheet thạc sĩ phải có dấu hiệu thạc sĩ
    has_ths_marker = (
        "thạc sĩ" in s_full
        or "ths" in s_full
        or "thạc sĩ" in s_name
        or "ths" in s_name
    )
    if not has_ths_marker:
        return False

    return True


def detect_major_and_branch(sheet_name: str, header_text: str) -> tuple[str, str, str]:
    """Phát hiện mã ngành thạc sĩ (6xx hoặc 605), nhánh đào tạo (NC / UD / '') và tên ngành."""
    combined = f"{sheet_name} {header_text}".replace("\xa0", " ")
    comb_upper = combined.upper()
    comb_lower = combined.lower()

    # Nhánh đào tạo: NC (Nghiên cứu / Nâng cao) hoặc UD (Ứng dụng)
    branch = ""
    if re.search(r"(?:-|\b)(?:NC|NGHIÊN CỨU|NÂNG CAO)\b", comb_upper):
        branch = "NC"
    elif re.search(r"(?:-|\b)(?:UD|ỨNG DỤNG)\b", comb_upper):
        branch = "UD"

    # Phát hiện mã ngành (601, 602, 603, 604, 607, 609, 610, 611, 614, 618, 619, 657 hoặc 605 Kế toán)
    m = re.search(r"(?<!\d)(6\d{2})(?!\d)", comb_upper)
    major_code = ""
    if m:
        major_code = m.group(1)
    else:
        # Nhận diện theo tên ngành đặc thù
        if "kế toán" in comb_lower or "ke toan" in comb_lower:
            major_code = "605"
        elif "thương mại điện tử" in comb_lower or "tmdt" in comb_lower:
            major_code = "611"
        elif "kinh tế chính trị" in comb_lower or "ktct" in comb_lower:
            major_code = "601"
        elif "kinh tế quốc tế" in comb_lower or "ktqt" in comb_lower:
            major_code = "602"
        elif "quản trị kinh doanh" in comb_lower or "qtkd" in comb_lower:
            major_code = "607"
        elif "quản lý công" in comb_lower or "qlc" in comb_lower:
            major_code = "618"
        elif "công nghệ tài chính" in comb_lower or "cntc" in comb_lower:
            major_code = "614"
        elif "tài chính ngân hàng" in comb_lower or "tcnh" in comb_lower:
            major_code = "604"
        elif "dữ liệu và ai" in comb_lower or "ptdl&ai" in comb_lower or "toán kinh tế" in comb_lower:
            major_code = "619"
        elif "luật kinh tế" in comb_lower:
            major_code = "610"
        elif "dân sự" in comb_lower or "lds" in comb_lower:
            major_code = "609"
        elif "luật" in comb_lower:
            major_code = "657"

    major_name = MASTER_MAJOR_NAMES.get(major_code, major_code)
    return major_code, branch, major_name


def build_program_name(major_name: str, branch: str, header_text: str) -> str:
    """Tạo tên hiển thị chuẩn cho chương trình thạc sĩ theo Brief W31b và D8."""
    # Thử trích xuất từ dòng CHƯƠNG TRÌNH: ...
    m = re.search(r"CHƯƠNG TRÌNH:\s*([^-\n\r]+(?:-[^-\n\r]+)*)", header_text, re.IGNORECASE)
    raw_str = clean_cell_str(m.group(1)) if m else major_name
    return normalize_master_program_name(raw_str, branch=branch)


def detect_ths_columns(ws: Any) -> dict[str, int]:
    """Dò vị trí các cột trong dòng 8-9 của sheet BĐCL Thạc sĩ."""
    # Đọc dòng 8 và dòng 9
    row8 = [clean_cell_str(c) for c in next(ws.iter_rows(min_row=8, max_row=8, values_only=True), [])]
    row9 = [clean_cell_str(c) for c in next(ws.iter_rows(min_row=9, max_row=9, values_only=True), [])]

    max_len = max(len(row8), len(row9))
    col_map: dict[str, int] = {}

    current_group = ""
    for idx in range(max_len):
        r8_val = row8[idx] if idx < len(row8) else ""
        r9_val = row9[idx] if idx < len(row9) else ""

        if r8_val:
            current_group = r8_val

        combined = f"{current_group} {r9_val}".lower().strip()
        r8_lower = r8_val.lower().strip()
        r9_lower = r9_val.lower().strip()

        # Mã học phần
        if any(k in r8_lower or k in r9_lower or k in combined for k in ("mã học phần", "mã hp", "mã môn")):
            if "code" not in col_map:
                col_map["code"] = idx

        # Tên học phần
        elif any(k in r8_lower or k in r9_lower or k in combined for k in ("tên học phần", "tên hp", "tên môn")):
            if "tiếng anh" in combined:
                if "name_en" not in col_map:
                    col_map["name_en"] = idx
            else:
                if "name" not in col_map:
                    col_map["name"] = idx

        # Tín chỉ
        elif any(k in r8_lower or k in r9_lower or k in combined for k in ("số tín chỉ", "tín chỉ", "stc")):
            if "credits" not in col_map:
                col_map["credits"] = idx

        # Quá trình
        elif "quá trình" in combined or "qua trinh" in combined:
            if "tỉ lệ" in r9_lower or "tỷ lệ" in r9_lower or "%" in r9_lower:
                col_map["process_ratio"] = idx
            elif "hình thức" in r9_lower or "hinh thuc" in r9_lower:
                col_map["process_form"] = idx

        # Giữa kỳ
        elif "giữa kỳ" in combined or "giua ky" in combined:
            if "tỉ lệ" in r9_lower or "tỷ lệ" in r9_lower or "%" in r9_lower:
                col_map["midterm_ratio"] = idx
            elif "hình thức" in r9_lower or "hinh thuc" in r9_lower:
                col_map["midterm_form"] = idx

        # Cuối kỳ
        elif "cuối kỳ" in combined or "cuoi ky" in combined:
            if "tỉ lệ" in r9_lower or "tỷ lệ" in r9_lower or "%" in r9_lower:
                col_map["final_ratio"] = idx
            elif "hình thức" in r9_lower or "hinh thuc" in r9_lower:
                col_map["final_form"] = idx

        # Nâng cao
        elif "nâng cao" in combined or "nang cao" in combined:
            if "tỉ lệ" in r9_lower or "tỷ lệ" in r9_lower or "%" in r9_lower:
                col_map["advanced_ratio"] = idx
            elif "hình thức" in r9_lower or "hinh thuc" in r9_lower:
                col_map["advanced_form"] = idx

        # Loại thi
        elif "loại thi" in combined or "loai thi" in combined or (r8_lower == "thi" and "thời lượng" not in r9_lower):
            if "exam_type" not in col_map:
                col_map["exam_type"] = idx

        # Thời lượng thi
        elif "thời lượng" in combined or "thoi luong" in combined:
            if "exam_duration" not in col_map:
                col_map["exam_duration"] = idx

        # Tài liệu chính
        elif any(k in combined for k in ("tài liệu chính", "tai lieu chinh", "giáo trình")):
            if "textbook" not in col_map:
                col_map["textbook"] = idx

        # Mã tài liệu
        elif "mã tài liệu" in combined or "mã tl" in combined or "ma tai lieu" in combined:
            if "document_code" not in col_map:
                col_map["document_code"] = idx

        # Ghi chú
        elif "ghi chú" in combined or "ghi chu" in combined or "note" in combined:
            if "note" not in col_map:
                col_map["note"] = idx

    return col_map


def import_ths_curricula(
    db: Session,
    bdcl_dir: Path | str | None = None,
    *,
    dry_run: bool = False,
    preview_csv: Path | str | None = None,
) -> dict[str, Any]:
    """Lệnh nạp chương trình đào tạo Thạc sĩ từ 10 workbook BĐCL (Brief D6)."""
    p_dir = Path(bdcl_dir) if bdcl_dir else DEFAULT_BDCL_DIR
    out_csv = Path(preview_csv) if preview_csv else DEFAULT_PREVIEW_CSV

    if not p_dir.exists():
        raise FileNotFoundError(f"Không tìm thấy thư mục BĐCL: {p_dir}")

    # 1. Tìm tất cả file THS_*.xlsx (loại trừ các file sao chép *_copy*.xlsx và file tạm ~$*)
    all_files = sorted(p_dir.glob("THS_*.xlsx")) + sorted(p_dir.glob("ths_*.xlsx"))
    unique_files: dict[str, Path] = {}
    for f in all_files:
        fn = f.name.lower()
        if fn.startswith("~$") or "_copy" in fn:
            continue
        unique_files[fn] = f

    workbooks_to_process = sorted(unique_files.values(), key=lambda p: p.name)

    programs_count = 0
    modules_created = 0
    modules_updated = 0
    program_modules_count = 0
    assessments_count = 0
    textbooks_count = 0

    preview_rows: list[dict[str, Any]] = []
    program_summaries: list[dict[str, Any]] = []

    # Lấy danh sách mã môn đang có trong DB để kiểm tra
    existing_modules = {m.code: m for m in db.scalars(select(Module)).all()}
    existing_programs = {p.id: p for p in db.scalars(select(Program)).all()}
    existing_pms = {
        (pm.program_id, pm.module_code): pm for pm in db.scalars(select(ProgramModule)).all()
    }
    existing_assessments = {
        a.module_code: a for a in db.scalars(select(ModuleAssessment)).all()
    }
    existing_textbooks = {
        (tb.module_code, tb.name): tb for tb in db.scalars(select(ModuleTextbook)).all()
    }

    # 2. Xử lý từng workbook
    for wb_path in workbooks_to_process:
        base_stem = wb_path.stem.lower()
        faculty_name = WORKBOOK_FACULTY_MAP.get(base_stem, "Trường Đại học Kinh tế - Luật")

        try:
            wb = openpyxl.load_workbook(str(wb_path), data_only=True)
        except Exception as e:
            continue

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]

            # Đọc 7 dòng đầu để lấy text thông tin ngành / chương trình
            header_lines: list[str] = []
            for r in ws.iter_rows(min_row=1, max_row=7, values_only=True):
                line = " ".join(clean_cell_str(c) for c in r if c is not None)
                if line:
                    header_lines.append(line)
            sample_text = " ".join(header_lines)

            # Lọc sheet: chỉ lấy sheet thạc sĩ hợp lệ
            if not is_master_sheet(sheet_name, sample_text):
                continue

            major_code, branch, major_name = detect_major_and_branch(sheet_name, sample_text)
            if not major_code:
                continue

            # Quy ước mã chương trình: M + major_code + branch (vd: M601NC, M601UD, M602, M605)
            program_id = f"M{major_code}{branch}".upper()
            program_name = build_program_name(major_name, branch, sample_text)

            # Phát hiện vị trí các cột
            col_map = detect_ths_columns(ws)
            col_code = col_map.get("code")
            col_name = col_map.get("name")
            col_credits = col_map.get("credits")

            if col_code is None or col_name is None:
                continue

            programs_count += 1
            sheet_mod_count = 0

            # 3. Đọc dữ liệu học phần từ dòng 10 trở đi
            for row in ws.iter_rows(min_row=10, values_only=True):
                if not row or len(row) <= col_code or not row[col_code]:
                    continue

                raw_code = clean_cell_str(row[col_code]).upper()
                if not raw_code or raw_code.startswith("#"):
                    continue

                # Bỏ qua dòng tổng kết hoặc dòng tiêu đề nhóm
                if any(k in raw_code.lower() for k in ("tổng", "khối", "học phần", "stt", "tt")):
                    continue

                raw_name = clean_cell_str(row[col_name]) if len(row) > col_name else ""
                if not raw_name:
                    continue

                # Parse tín chỉ
                credits_val = None
                if col_credits is not None and len(row) > col_credits:
                    credits_val = parse_credits_val(row[col_credits])

                # Parse đánh giá
                qt_ratio = parse_ratio(row[col_map["process_ratio"]]) if "process_ratio" in col_map and len(row) > col_map["process_ratio"] else None
                qt_form = clean_cell_str(row[col_map["process_form"]]) if "process_form" in col_map and len(row) > col_map["process_form"] else None
                gk_ratio = parse_ratio(row[col_map["midterm_ratio"]]) if "midterm_ratio" in col_map and len(row) > col_map["midterm_ratio"] else None
                gk_form = clean_cell_str(row[col_map["midterm_form"]]) if "midterm_form" in col_map and len(row) > col_map["midterm_form"] else None
                ck_ratio = parse_ratio(row[col_map["final_ratio"]]) if "final_ratio" in col_map and len(row) > col_map["final_ratio"] else None
                ck_form = clean_cell_str(row[col_map["final_form"]]) if "final_form" in col_map and len(row) > col_map["final_form"] else None
                nc_ratio = parse_ratio(row[col_map["advanced_ratio"]]) if "advanced_ratio" in col_map and len(row) > col_map["advanced_ratio"] else None
                nc_form = clean_cell_str(row[col_map["advanced_form"]]) if "advanced_form" in col_map and len(row) > col_map["advanced_form"] else None

                exam_type = clean_cell_str(row[col_map["exam_type"]]) if "exam_type" in col_map and len(row) > col_map["exam_type"] else None
                exam_dur = clean_cell_str(row[col_map["exam_duration"]]) if "exam_duration" in col_map and len(row) > col_map["exam_duration"] else None

                tb_name = clean_cell_str(row[col_map["textbook"]]) if "textbook" in col_map and len(row) > col_map["textbook"] else None
                doc_code = clean_cell_str(row[col_map["document_code"]]) if "document_code" in col_map and len(row) > col_map["document_code"] else None
                note = clean_cell_str(row[col_map["note"]]) if "note" in col_map and len(row) > col_map["note"] else None

                final_assessment_kind = normalize_final_assessment(ck_form)

                sheet_mod_count += 1

                # Lưu vào danh sách xem trước
                preview_rows.append({
                    "program_id": program_id,
                    "program_name": program_name,
                    "faculty": faculty_name,
                    "cohort": "2025-2026",
                    "degree": "thac_si",
                    "module_code": raw_code,
                    "module_name": raw_name,
                    "credits": credits_val,
                    "required": True,
                    "process_ratio": qt_ratio,
                    "process_form": qt_form,
                    "midterm_ratio": gk_ratio,
                    "midterm_form": gk_form,
                    "final_ratio": ck_ratio,
                    "final_form": ck_form,
                    "advanced_ratio": nc_ratio,
                    "advanced_form": nc_form,
                    "exam_type": exam_type,
                    "exam_duration": exam_dur,
                    "final_assessment_kind": final_assessment_kind,
                    "textbook_name": tb_name,
                    "document_code": doc_code,
                    "note": note,
                })

                if not dry_run:
                    # Upsert Module với degree='thac_si'
                    if raw_code not in existing_modules:
                        m_obj = Module(
                            code=raw_code,
                            name=raw_name,
                            credits=credits_val,
                            faculty=faculty_name,
                            degree="thac_si",
                            search_text=normalize_search(f"{raw_code} {raw_name}"),
                            final_assessment=final_assessment_kind,
                        )
                        db.add(m_obj)
                        existing_modules[raw_code] = m_obj
                        modules_created += 1
                    else:
                        m_obj = existing_modules[raw_code]
                        # Cập nhật degree='thac_si' cho môn thạc sĩ nạp từ file này
                        m_obj.degree = "thac_si"
                        if not m_obj.credits and credits_val:
                            m_obj.credits = credits_val
                        if not m_obj.name and raw_name:
                            m_obj.name = raw_name
                        if not m_obj.final_assessment and final_assessment_kind:
                            m_obj.final_assessment = final_assessment_kind
                        modules_updated += 1

                    # Upsert ProgramModule
                    pm_key = (program_id, raw_code)
                    if pm_key not in existing_pms:
                        pm_obj = ProgramModule(
                            program_id=program_id,
                            module_code=raw_code,
                            required=True,
                            suggested_semester=None,  # Để trống per Brief D6 Requirement 2
                            note=note,
                        )
                        db.add(pm_obj)
                        existing_pms[pm_key] = pm_obj
                        program_modules_count += 1
                    else:
                        pm_obj = existing_pms[pm_key]
                        pm_obj.suggested_semester = None
                        if note:
                            pm_obj.note = note

                    # Upsert ModuleAssessment
                    if any([qt_ratio, qt_form, gk_ratio, gk_form, ck_ratio, ck_form, exam_type, exam_dur]):
                        if raw_code not in existing_assessments:
                            ass_obj = ModuleAssessment(
                                module_code=raw_code,
                                process_ratio=qt_ratio,
                                process_form=qt_form,
                                midterm_ratio=gk_ratio,
                                midterm_form=gk_form,
                                final_ratio=ck_ratio,
                                final_form=ck_form,
                                advanced_ratio=nc_ratio,
                                advanced_form=nc_form,
                                exam_type=exam_type,
                                exam_duration=exam_dur,
                                final_assessment_kind=final_assessment_kind,
                                source="ctdt_ths",
                                updated_at=datetime.now(timezone.utc),
                            )
                            db.add(ass_obj)
                            existing_assessments[raw_code] = ass_obj
                            assessments_count += 1
                        else:
                            ass_obj = existing_assessments[raw_code]
                            ass_obj.process_ratio = qt_ratio or ass_obj.process_ratio
                            ass_obj.process_form = qt_form or ass_obj.process_form
                            ass_obj.midterm_ratio = gk_ratio or ass_obj.midterm_ratio
                            ass_obj.midterm_form = gk_form or ass_obj.midterm_form
                            ass_obj.final_ratio = ck_ratio or ass_obj.final_ratio
                            ass_obj.final_form = ck_form or ass_obj.final_form
                            ass_obj.advanced_ratio = nc_ratio or ass_obj.advanced_ratio
                            ass_obj.advanced_form = nc_form or ass_obj.advanced_form
                            ass_obj.exam_type = exam_type or ass_obj.exam_type
                            ass_obj.exam_duration = exam_dur or ass_obj.exam_duration
                            ass_obj.final_assessment_kind = final_assessment_kind or ass_obj.final_assessment_kind
                            ass_obj.source = "ctdt_ths"
                            ass_obj.updated_at = datetime.now(timezone.utc)

                    # Upsert ModuleTextbook
                    if tb_name:
                        tb_key = (raw_code, tb_name)
                        if tb_key not in existing_textbooks:
                            tb_obj = ModuleTextbook(
                                module_code=raw_code,
                                name=tb_name,
                                document_code=doc_code,
                                note=note,
                                is_main=True,
                            )
                            db.add(tb_obj)
                            existing_textbooks[tb_key] = tb_obj
                            textbooks_count += 1

            if not dry_run:
                # Upsert Program
                if program_id not in existing_programs:
                    prog_obj = Program(
                        id=program_id,
                        name=program_name,
                        cohort="2025-2026",
                        faculty=faculty_name,
                        degree="thac_si",
                        search_text=normalize_search(f"{program_id} {program_name} {faculty_name}"),
                    )
                    db.add(prog_obj)
                    existing_programs[program_id] = prog_obj
                else:
                    prog_obj = existing_programs[program_id]
                    prog_obj.name = program_name
                    prog_obj.faculty = faculty_name
                    prog_obj.degree = "thac_si"
                    prog_obj.cohort = "2025-2026"
                    prog_obj.search_text = normalize_search(f"{program_id} {program_name} {faculty_name}")

            program_summaries.append({
                "program_id": program_id,
                "name": program_name,
                "faculty": faculty_name,
                "branch": branch or "chuẩn",
                "modules_count": sheet_mod_count,
            })

        wb.close()

    # 4. Xuất file preview CSV
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "program_id",
        "program_name",
        "faculty",
        "cohort",
        "degree",
        "module_code",
        "module_name",
        "credits",
        "required",
        "process_ratio",
        "process_form",
        "midterm_ratio",
        "midterm_form",
        "final_ratio",
        "final_form",
        "advanced_ratio",
        "advanced_form",
        "exam_type",
        "exam_duration",
        "final_assessment_kind",
        "textbook_name",
        "document_code",
        "note",
    ]
    with out_csv.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for r in preview_rows:
            writer.writerow(r)

    result_summary = {
        "workbooks_scanned": len(workbooks_to_process),
        "programs_count": len(program_summaries),
        "programs": program_summaries,
        "preview_rows_count": len(preview_rows),
        "preview_csv": str(out_csv),
        "dry_run": dry_run,
        "modules_created": modules_created,
        "modules_updated": modules_updated,
        "program_modules_count": program_modules_count,
        "assessments_count": assessments_count,
        "textbooks_count": textbooks_count,
    }

    if not dry_run:
        db.commit()
        log_run(db, "ctdt_ths", None, result_summary)

    return result_summary
