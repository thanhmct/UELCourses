"""rename program suffixes -V2/-V3 to canonical codes (Brief W31, W31b, D8)

Revision ID: 0024
Revises: 0023
Create Date: 2026-11-23 01:15:00

"""
from __future__ import annotations

from pathlib import Path
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.orm import Session

# revision identifiers, used by Alembic.
revision: str = "0024"
down_revision: Union[str, Sequence[str], None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Bảng đổi mã chính thức theo Brief W31 (áp dụng cho K25 và K26)
# Thứ tự ưu tiên: đổi -V2 của LKT trước, sau đó đổi LKT sang 501
RENAMES = [
    # (old_id, new_id, new_name, cohort, faculty)
    ("K25414-V2", "K25414H", "Công nghệ tài chính – Coop Khóa 25", "K25", "Khoa Tài chính - Ngân hàng"),
    ("K26414-V2", "K26414H", "Công nghệ tài chính – Coop Khóa 26", "K26", "Khoa Tài chính - Ngân hàng"),
    ("K25405-V3", "K25405E", "Kế toán – Hệ tiếng Anh Khóa 25", "K25", "Khoa Kế toán - Kiểm toán"),
    ("K26405-V3", "K26405E", "Kế toán – Hệ tiếng Anh Khóa 26", "K26", "Khoa Kế toán - Kiểm toán"),
    ("K25411-V2", "K25411E", "Thương mại điện tử – Hệ tiếng Anh Khóa 25", "K25", "Khoa Hệ thống thông tin"),
    ("K26411-V2", "K26411E", "Thương mại điện tử – Hệ tiếng Anh Khóa 26", "K26", "Khoa Hệ thống thông tin"),
    ("K25405-V2", "K25422", "Kế toán và Phân tích dữ liệu Khóa 25", "K25", "Khoa Kế toán - Kiểm toán"),
    ("K26405-V2", "K26422", "Kế toán và Phân tích dữ liệu Khóa 26", "K26", "Khoa Kế toán - Kiểm toán"),
    ("K25LKT-V2", "K25502", "Luật thương mại quốc tế Khóa 25", "K25", "Khoa Luật Kinh tế"),
    ("K26LKT-V2", "K26502", "Luật thương mại quốc tế Khóa 26", "K26", "Khoa Luật Kinh tế"),
    ("K25LKT", "K25501", "Luật kinh doanh Khóa 25", "K25", "Khoa Luật Kinh tế"),
    ("K26LKT", "K26501", "Luật kinh doanh Khóa 26", "K26", "Khoa Luật Kinh tế"),
]

# Các bản trùng lặp cần gộp và xóa theo Brief W31 mục 3b & 3c
DUPLICATE_MERGES = [
    ("K25409-V2", "K25409"),
    ("K26409-V2", "K26409"),
    ("K25418-V2", "K25418"),
    ("K26418-V2", "K26418"),
]


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Thực hiện đổi mã an toàn (chèn mới -> chuyển khóa ngoại -> xóa cũ)
    for old_id, new_id, new_name, cohort, faculty in RENAMES:
        old_prog = bind.execute(
            sa.text("SELECT id, name, cohort, faculty, degree, search_text, is_sample, source FROM programs WHERE id = :oid"),
            {"oid": old_id},
        ).fetchone()

        if not old_prog:
            continue

        new_exists = bind.execute(
            sa.text("SELECT id FROM programs WHERE id = :nid"),
            {"nid": new_id},
        ).fetchone()

        p_deg = old_prog[4] or "dai_hoc"
        p_sample = old_prog[6] or False
        p_src = old_prog[7] or "bdcl_w31"
        search_txt = f"{new_id} {new_name} {faculty}".lower()

        if not new_exists:
            bind.execute(
                sa.text(
                    "INSERT INTO programs (id, name, cohort, faculty, degree, search_text, is_sample, source) "
                    "VALUES (:nid, :name, :cohort, :faculty, :degree, :search_text, :is_sample, :source)"
                ),
                {
                    "nid": new_id,
                    "name": new_name,
                    "cohort": cohort or old_prog[2],
                    "faculty": faculty or old_prog[3],
                    "degree": p_deg,
                    "search_text": search_txt,
                    "is_sample": p_sample,
                    "source": p_src,
                },
            )
        else:
            bind.execute(
                sa.text("UPDATE programs SET name = :name, search_text = :st WHERE id = :nid"),
                {"name": new_name, "st": search_txt, "nid": new_id},
            )

        # Chuyển các khóa ngoại sang new_id
        # Tránh xung đột UNIQUE(program_id, module_code) nếu new_id đã có môn trùng
        existing_new_modules = {
            r[0] for r in bind.execute(
                sa.text("SELECT module_code FROM program_modules WHERE program_id = :nid"),
                {"nid": new_id},
            ).fetchall()
        }

        if existing_new_modules:
            delete_duplicates = sa.text(
                "DELETE FROM program_modules "
                "WHERE program_id = :oid AND module_code IN :dup_codes"
            ).bindparams(sa.bindparam("dup_codes", expanding=True))
            bind.execute(
                delete_duplicates,
                {"oid": old_id, "dup_codes": tuple(existing_new_modules)},
            )

        bind.execute(
            sa.text("UPDATE program_modules SET program_id = :nid WHERE program_id = :oid"),
            {"nid": new_id, "oid": old_id},
        )
        bind.execute(
            sa.text("UPDATE module_relations SET program_id = :nid WHERE program_id = :oid"),
            {"nid": new_id, "oid": old_id},
        )

        # Xóa bản ghi cũ
        bind.execute(sa.text("DELETE FROM programs WHERE id = :oid"), {"oid": old_id})

    # 2. Xóa các bản trùng lặp đã gộp (K25409-V2, K26409-V2, K25418-V2, K26418-V2)
    for dup_id, target_id in DUPLICATE_MERGES:
        target_prog = bind.execute(
            sa.text("SELECT id FROM programs WHERE id = :tid"),
            {"tid": target_id},
        ).fetchone()

        if target_prog:
            bind.execute(sa.text("DELETE FROM program_modules WHERE program_id = :did"), {"did": dup_id})
            bind.execute(sa.text("DELETE FROM module_relations WHERE program_id = :did"), {"did": dup_id})
            bind.execute(sa.text("DELETE FROM programs WHERE id = :did"), {"did": dup_id})

    # 3. Nạp lại 69 môn học cho K25422 / K26422 từ sheet 4.422-Kế toán&PTDL nếu file tồn tại
    try:
        import openpyxl

        repo_root = Path(__file__).resolve().parents[3]
        bdcl_path = repo_root / "data" / "raw" / "ctdt_bdcl" / "DH_KeToanKiemToan.xlsx"
        if bdcl_path.exists():
            wb = openpyxl.load_workbook(bdcl_path, data_only=True, read_only=True)
            sheet_422 = None
            for sname in wb.sheetnames:
                if "422" in sname and "kế toán" in sname.lower():
                    sheet_422 = wb[sname]
                    break

            if sheet_422:
                # Tìm cột mã môn, tên môn, tín chỉ
                rows_iter = sheet_422.iter_rows(values_only=True)
                header_row = None
                code_col = 1
                name_col = 2
                cr_col = 3
                block_col = 0
                term_col = None

                for r_idx, row in enumerate(rows_iter):
                    if not row:
                        continue
                    str_cells = [str(c).lower().strip() if c is not None else "" for c in row]
                    if any("mã học phần" in c or "mã hp" in c or "mã môn" in c for c in str_cells):
                        header_row = r_idx
                        for c_idx, val in enumerate(str_cells):
                            if "mã" in val and any(k in val for k in ("hp", "học phần", "môn")):
                                code_col = c_idx
                            elif "tên" in val and any(k in val for k in ("hp", "học phần", "môn")):
                                name_col = c_idx
                            elif any(k in val for k in ("tín chỉ", "stc")):
                                cr_col = c_idx
                            elif "khối" in val:
                                block_col = c_idx
                            elif "kỳ" in val or "học kỳ" in val:
                                term_col = c_idx
                        break

                parsed_modules = []
                for row in rows_iter:
                    if not row or len(row) <= code_col:
                        continue
                    c_val = str(row[code_col]).replace("\xa0", " ").strip() if row[code_col] else ""
                    if not c_val or len(c_val) < 4 or c_val.lower().startswith("mã"):
                        continue
                    # Mã học phần UEL chuẩn
                    m_code = re.match(r"^[A-Z]{2,4}\d{3,5}[A-Z]?$", c_val)
                    if not m_code:
                        continue
                    code = m_code.group(0)
                    name = str(row[name_col]).replace("\xa0", " ").strip() if len(row) > name_col and row[name_col] else ""
                    cr_raw = row[cr_col] if len(row) > cr_col else None
                    try:
                        cr = int(float(str(cr_raw).strip())) if cr_raw is not None else None
                    except (ValueError, TypeError):
                        cr = None
                    blk = str(row[block_col]).replace("\xa0", " ").strip() if len(row) > block_col and row[block_col] else None

                    parsed_modules.append((code, name, cr, blk))

                if len(parsed_modules) >= 60:
                    for prog_id in ("K25422", "K26422"):
                        prog_in_db = bind.execute(
                            sa.text("SELECT id FROM programs WHERE id = :pid"),
                            {"pid": prog_id},
                        ).fetchone()
                        if not prog_in_db:
                            continue

                        # Đảm bảo các môn tồn tại trong modules
                        for code, name, cr, _ in parsed_modules:
                            m_exists = bind.execute(
                                sa.text("SELECT code FROM modules WHERE code = :c"),
                                {"c": code},
                            ).fetchone()
                            if not m_exists:
                                bind.execute(
                                    sa.text(
                                        "INSERT INTO modules "
                                        "(code, name, credits, degree, is_english, is_sample, search_text, updated_at) "
                                        "VALUES (:c, :n, :cr, 'dai_hoc', false, false, :st, CURRENT_TIMESTAMP)"
                                    ),
                                    {"c": code, "n": name, "cr": cr, "st": f"{code} {name}".lower()},
                                )

                        # Xóa danh sách môn cũ (đang chép nhầm 61 môn của 405)
                        bind.execute(
                            sa.text("DELETE FROM program_modules WHERE program_id = :pid"),
                            {"pid": prog_id},
                        )

                        # Chèn danh sách 69 môn mới
                        for idx, (code, name, cr, blk) in enumerate(parsed_modules, start=1):
                            bind.execute(
                                sa.text(
                                    "INSERT INTO program_modules (program_id, module_code, block, required, suggested_order) "
                                    "VALUES (:pid, :c, :blk, true, :ord)"
                                ),
                                {"pid": prog_id, "c": code, "blk": blk or "Kiến thức chuyên ngành", "ord": idx},
                            )
            wb.close()
    except Exception as exc:
        raise RuntimeError("Không thể nạp danh sách môn ngành 422 trong migration 0024") from exc

    # 4. Chuẩn hóa tên các chương trình thạc sĩ hiện có trong DB (Brief W31b)
    ths_programs = bind.execute(
        sa.text("SELECT id, name FROM programs WHERE degree = 'thac_si'")
    ).fetchall()

    if ths_programs:
        from app.services.program_names import normalize_master_program_name

        for pid, pname in ths_programs:
            if not pname:
                continue
            norm_name = normalize_master_program_name(pname)
            if norm_name and norm_name != pname:
                bind.execute(
                    sa.text("UPDATE programs SET name = :name, search_text = :st WHERE id = :pid"),
                    {"name": norm_name, "st": f"{pid} {norm_name}".lower(), "pid": pid},
                )


def downgrade() -> None:
    bind = op.get_bind()

    # Hoàn tác đổi mã: chuyển từ new_id về old_id
    for old_id, new_id, _, cohort, _ in reversed(RENAMES):
        new_prog = bind.execute(
            sa.text("SELECT id, name, cohort, faculty, degree, search_text, is_sample, source FROM programs WHERE id = :nid"),
            {"nid": new_id},
        ).fetchone()

        if not new_prog:
            continue

        old_exists = bind.execute(
            sa.text("SELECT id FROM programs WHERE id = :oid"),
            {"oid": old_id},
        ).fetchone()

        if not old_exists:
            bind.execute(
                sa.text(
                    "INSERT INTO programs (id, name, cohort, faculty, degree, search_text, is_sample, source) "
                    "VALUES (:oid, :name, :cohort, :faculty, :degree, :search_text, :is_sample, :source)"
                ),
                {
                    "oid": old_id,
                    "name": new_prog[1],
                    "cohort": new_prog[2],
                    "faculty": new_prog[3],
                    "degree": new_prog[4] or "dai_hoc",
                    "search_text": new_prog[5] or "",
                    "is_sample": new_prog[6] or False,
                    "source": new_prog[7] or "bdcl_w31",
                },
            )

        bind.execute(
            sa.text("UPDATE program_modules SET program_id = :oid WHERE program_id = :nid"),
            {"oid": old_id, "nid": new_id},
        )
        bind.execute(
            sa.text("UPDATE module_relations SET program_id = :oid WHERE program_id = :nid"),
            {"oid": old_id, "nid": new_id},
        )
        bind.execute(sa.text("DELETE FROM programs WHERE id = :nid"), {"nid": new_id})

    # Phục hồi các bản trùng lặp nếu cần
    for dup_id, target_id in DUPLICATE_MERGES:
        target_prog = bind.execute(
            sa.text("SELECT id, cohort, faculty, degree, is_sample, source FROM programs WHERE id = :tid"),
            {"tid": target_id},
        ).fetchone()
        if target_prog:
            dup_exists = bind.execute(
                sa.text("SELECT id FROM programs WHERE id = :did"),
                {"did": dup_id},
            ).fetchone()
            if not dup_exists:
                name_dup = "Kiểm toán - TV rà soát" if "409" in dup_id else "Quản lý công - QLC_Tài liệu"
                bind.execute(
                    sa.text(
                        "INSERT INTO programs (id, name, cohort, faculty, degree, search_text, is_sample, source) "
                        "VALUES (:did, :name, :cohort, :faculty, :degree, :st, :is_sample, :source)"
                    ),
                    {
                        "did": dup_id,
                        "name": name_dup,
                        "cohort": target_prog[1],
                        "faculty": target_prog[2],
                        "degree": target_prog[3] or "dai_hoc",
                        "st": f"{dup_id} {name_dup}".lower(),
                        "is_sample": target_prog[4] or False,
                        "source": target_prog[5] or "ctdt",
                    },
                )
