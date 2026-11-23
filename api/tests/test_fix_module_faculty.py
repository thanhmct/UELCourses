import csv
from pathlib import Path
import openpyxl
import pytest

from app.config import get_settings
from app.models import Module, OutlineCourse, OutlineDocument, OutlineModuleLink
from app.services.ctdt_import import import_ctdt
from app.services.faculty_names import (
    CANONICAL_FACULTIES_VI,
    PrefixEntry,
    apply_outline_faculties,
    audit_faculty_command,
    audit_module_faculties,
    audit_module_faculties_with_unmapped,
    build_prefix_table_from_db,
    canonical_faculty_vi,
    clean_raw_text,
    department_en,
    department_vi,
    extract_module_prefix,
    faculty_en,
    faculty_vi,
    fill_faculties,
    fix_module_faculties,
    is_department,
    load_prefix_table,
    normalize_department,
    rebuild_prefix_table,
    resolve_module_faculty,
    summarize_audit,
    write_prefix_conflicts_csv,
)
from app.services.importer import import_classes
from app.services.text import normalize_search


def test_eff2045_like_outline_overrides_ctdt(db):
    """EFF2045: Đề cương TCNH -> 'Khoa Tài chính - Ngân hàng' / 'Bộ môn Tài chính'
    dù CTĐT trước đó ghi Khoa HTTT."""
    db.add_all([
        Module(
            code="EFF2045",
            name="Quản trị tài chính (E)",
            faculty="Khoa Hệ thống thông tin",
            department="Bộ môn Thương mại điện tử",
            language_track="en",
        ),
        OutlineDocument(id=1, sha256="1" * 64, file_name="eff2045.pdf", rel_path="eff2045.pdf", size_bytes=100),
    ])
    db.flush()
    db.add(OutlineCourse(
        document_id=1,
        course_code_norm="EFF2045",
        doc_type="syllabus_en",
        faculty="FACULTY OF FINANCE AND BANKING",
        department="DEPARTMENT OF FINANCE",
        parse_status="ok",
    ))
    db.add(OutlineModuleLink(document_id=1, module_code="EFF2045", source="catalog"))
    db.commit()

    res = apply_outline_faculties(db)
    assert res["applied_changes"] == 1

    m = db.get(Module, "EFF2045")
    assert m.faculty == "Khoa Tài chính - Ngân hàng"
    assert m.department == "Bộ môn Tài chính"
    assert normalize_search("Khoa Tài chính - Ngân hàng") in m.search_text


def test_no_outline_keeps_old_value(db):
    """Brief B6h: Môn không có đề cương của mình lẫn của bản tương ứng:
    KHÔNG ghi 'Phòng Đào tạo', giữ nguyên giá trị cũ (cả trường hợp có giá trị và trống)."""
    db.add_all([
        Module(
            code="BBB1068",
            name="Kỹ năng lãnh đạo",
            faculty="Khoa Quản trị kinh doanh",
            department="Bộ môn Quản trị",
        ),
        Module(
            code="EBB1068",
            name="Kỹ năng lãnh đạo (E)",
            faculty="Khoa Tài chính - Ngân hàng",
            department="Bộ môn Tài chính",
        ),
        Module(
            code="EMPTY101",
            name="Môn chưa có khoa",
            faculty=None,
            department=None,
        ),
    ])
    db.commit()

    res = apply_outline_faculties(db)
    assert res["applied_changes"] == 0

    m1 = db.get(Module, "BBB1068")
    assert m1.faculty == "Khoa Quản trị kinh doanh"
    assert m1.department == "Bộ môn Quản trị"

    m2 = db.get(Module, "EBB1068")
    assert m2.faculty == "Khoa Tài chính - Ngân hàng"
    assert m2.department == "Bộ môn Tài chính"

    m3 = db.get(Module, "EMPTY101")
    assert m3.faculty is None
    assert m3.department is None

    # Kiểm tra báo cáo audit
    rows = audit_module_faculties(db)
    by_code = {r["code"]: r for r in rows}
    assert by_code["BBB1068"]["kết_luận"] == "giữ nguyên"
    assert by_code["BBB1068"]["lý do"] == "không có đề cương – chưa kiểm chứng"
    assert by_code["BBB1068"]["vấn_đề"] == "không có đề cương – chưa kiểm chứng"
    assert by_code["EMPTY101"]["kết_luận"] == "giữ nguyên"
    assert by_code["EMPTY101"]["faculty_chuẩn"] == ""


def test_counterpart_outline_borrowing(db):
    """Brief B6h: Bản E không có đề cương mà bản VI có đề cương ghi khoa
    -> nhận khoa/bộ môn từ đề cương của bản VI (nguồn counterpart_outline)."""
    db.add_all([
        Module(
            code="BBB2001",
            name="Quản trị học",
            faculty="Khoa Quản trị kinh doanh",
            department="Bộ môn Quản trị",
            counterpart_code="EBB2001",
        ),
        Module(
            code="EBB2001",
            name="Management (E)",
            faculty=None,
            department=None,
            counterpart_code="BBB2001",
        ),
        OutlineDocument(id=1001, sha256="1001" * 16, file_name="bbb2001.pdf", rel_path="bbb2001.pdf", size_bytes=100),
    ])
    db.flush()
    db.add(OutlineCourse(
        document_id=1001,
        course_code_norm="BBB2001",
        faculty="FACULTY OF BUSINESS ADMINISTRATION",
        department="DEPARTMENT OF MANAGEMENT",
        parse_status="ok",
    ))
    db.add(OutlineModuleLink(document_id=1001, module_code="BBB2001", source="catalog"))
    db.commit()

    # Audit trước khi áp dụng để kiểm tra quyết định cập nhật.
    rows = audit_module_faculties(db)
    by_code = {r["code"]: r for r in rows}
    r_ebb = by_code["EBB2001"]
    assert r_ebb["có_đề_cương"] == "không"
    assert r_ebb["nguồn"] == "counterpart_outline"
    assert r_ebb["faculty_chuẩn"] == "Khoa Quản trị kinh doanh"
    assert r_ebb["department_theo_đề_cương"] == "Bộ môn Quản trị"
    assert r_ebb["kết_luận"] == "đổi"
    assert "BBB2001" in r_ebb["lý do"]

    apply_outline_faculties(db)
    ebb = db.get(Module, "EBB2001")
    assert ebb.faculty == "Khoa Quản trị kinh doanh"
    assert ebb.department == "Bộ môn Quản trị"
    assert normalize_search("Khoa Quản trị kinh doanh") in ebb.search_text
    updated = next(row for row in audit_module_faculties(db) if row["code"] == ebb.code)
    assert updated["kết_luận"] == "giữ nguyên"

    # Idempotent: chạy lại lần 2 không có thay đổi
    res2 = apply_outline_faculties(db)
    assert res2["applied_changes"] == 0


def test_no_transitive_counterpart_borrowing(db):
    """Brief B6h: Không bắc cầu khi mượn từ bản tương ứng:
    A trỏ B, B trỏ C; C có đề cương nhưng B không có đề cương riêng -> A không mượn từ C."""
    db.add_all([
        Module(code="MOD_A", name="Môn A", faculty=None, counterpart_code="MOD_B"),
        Module(code="MOD_B", name="Môn B", faculty=None, counterpart_code="MOD_C"),
        Module(code="MOD_C", name="Môn C", faculty=None, counterpart_code="MOD_B"),
        OutlineDocument(id=1002, sha256="1002" * 16, file_name="mod_c.pdf", rel_path="mod_c.pdf", size_bytes=100),
    ])
    db.flush()
    db.add(OutlineCourse(
        document_id=1002,
        course_code_norm="MOD_C",
        faculty="FACULTY OF ECONOMICS",
        department="DEPARTMENT OF ECONOMICS",
        parse_status="ok",
    ))
    db.add(OutlineModuleLink(document_id=1002, module_code="MOD_C", source="catalog"))
    db.commit()

    apply_outline_faculties(db)

    mod_c = db.get(Module, "MOD_C")
    assert mod_c.faculty == "Khoa Kinh tế"

    mod_b = db.get(Module, "MOD_B")
    assert mod_b.faculty == "Khoa Kinh tế"  # B mượn trực tiếp 1 bước từ C

    mod_a = db.get(Module, "MOD_A")
    # A chỉ xét B. Nhưng B không có đề cương riêng trong DB -> A không bắc cầu qua B để lấy C
    assert mod_a.faculty is None


def test_import_ctdt_and_classes_do_not_overwrite_faculty(db):
    """Nạp CTĐT hoặc lớp học phần không được ghi đè khoa/bộ môn của học phần (B6b)."""
    db.add_all([
        Module(
            code="EFF2045",
            name="Quản trị tài chính (E)",
            faculty="Khoa Tài chính - Ngân hàng",
            department="Bộ môn Tài chính",
        ),
        OutlineDocument(id=2, sha256="2" * 64, file_name="eff.pdf", rel_path="eff.pdf", size_bytes=100),
    ])
    db.flush()
    db.add(OutlineCourse(
        document_id=2,
        course_code_norm="EFF2045",
        doc_type="syllabus_en",
        faculty="FACULTY OF FINANCE AND BANKING",
        department="DEPARTMENT OF FINANCE",
        parse_status="ok",
    ))
    db.add(OutlineModuleLink(document_id=2, module_code="EFF2045", source="catalog"))
    db.commit()

    # Import CTĐT nạp sau (vd Thương mại điện tử của Khoa HTTT)
    payload = {
        "K25411": [
            {
                "MaCTDT": "K25411",
                "TenCTDT": "Thương mại điện tử",
                "MaHP": "EFF2045",
                "TenHP": "Quản trị tài chính (E)",
                "STC": 3,
                "Khoa": "Khoa Hệ thống thông tin",
                "BoMon": "Bộ môn Thương mại điện tử",
            }
        ]
    }
    import_ctdt(db, payload)

    m = db.get(Module, "EFF2045")
    # Vẫn giữ nguyên khoa/bộ môn theo đề cương, không bị CTĐT ghi đè
    assert m.faculty == "Khoa Tài chính - Ngân hàng"
    assert m.department == "Bộ môn Tài chính"


def test_conflicting_outlines_flagged_for_review(db):
    """Một môn có nhiều đề cương mâu thuẫn khoa: ưu tiên đề cương đúng mã (course_code_norm)
    và trạng thái ok/syllabus_vi; đánh dấu 'cần duyệt' trong báo cáo."""
    db.add_all([
        Module(
            code="FIN101",
            name="Tài chính nhập môn",
            faculty="Chưa rõ khoa",
            department=None,
        ),
        OutlineDocument(id=10, sha256="a" * 64, file_name="f1.pdf", rel_path="f1.pdf", size_bytes=100),
        OutlineDocument(id=11, sha256="b" * 64, file_name="f2.pdf", rel_path="f2.pdf", size_bytes=100),
    ])
    db.flush()
    # Đề cương 1: đúng mã FIN101, parse ok, syllabus_vi -> Khoa Tài chính - Ngân hàng
    db.add(OutlineCourse(
        document_id=10,
        course_code_norm="FIN101",
        doc_type="syllabus_vi",
        faculty="Khoa Tài chính - Ngân hàng",
        department="Bộ môn Tài chính",
        parse_status="ok",
    ))
    db.add(OutlineModuleLink(document_id=10, module_code="FIN101", source="catalog"))

    # Đề cương 2: liên kết tới FIN101 nhưng mã norm khác, parse partial, syllabus_en -> Khoa HTTT
    db.add(OutlineCourse(
        document_id=11,
        course_code_norm="FIN999",
        doc_type="syllabus_en",
        faculty="FACULTY OF INFORMATION SYSTEMS",
        department="DEPARTMENT OF E-COMMERCE",
        parse_status="partial",
    ))
    db.add(OutlineModuleLink(document_id=11, module_code="FIN101", source="catalog"))
    db.commit()

    rows = audit_module_faculties(db)
    row = next(r for r in rows if r["code"] == "FIN101")
    assert row["kết_luận"] == "cần duyệt"
    assert "mâu thuẫn" in row["vấn_đề"]
    assert "Khoa Tài chính - Ngân hàng" in row["vấn_đề"]
    assert "Khoa Hệ thống thông tin" in row["vấn_đề"]
    # Bản ưu tiên đúng mã norm khớp:
    assert row["faculty_theo_đề_cương"] == "Khoa Tài chính - Ngân hàng"
    assert row["department_theo_đề_cương"] == "Bộ môn Tài chính"

    apply_outline_faculties(db)
    m = db.get(Module, "FIN101")
    assert m.faculty == "Khoa Tài chính - Ngân hàng"
    assert m.department == "Bộ môn Tài chính"


def test_idempotent(db):
    """Chạy apply_outline_faculties nhiều lần: lần 2 không có thay đổi nào."""
    db.add_all([
        Module(code="M01", name="Môn 1", faculty="Khoa Kinh tế"),
        Module(code="M02", name="Môn 2", faculty="Khoa Luật"),
        OutlineDocument(id=20, sha256="c" * 64, file_name="m1.pdf", rel_path="m1.pdf", size_bytes=100),
    ])
    db.flush()
    db.add(OutlineCourse(
        document_id=20,
        course_code_norm="M01",
        faculty="FACULTY OF ECONOMICS",
        department="DEPARTMENT OF ECONOMICS",
        parse_status="ok",
    ))
    db.add(OutlineModuleLink(document_id=20, module_code="M01"))
    db.commit()

    res1 = apply_outline_faculties(db)
    assert res1["applied_changes"] > 0

    res2 = apply_outline_faculties(db)
    assert res2["applied_changes"] == 0


def test_csv_columns_and_dry_run(db, tmp_path):
    """Xuất CSV đúng 14 cột theo Brief B6h; dry_run=True không sửa DB."""
    db.add_all([
        Module(
            code="EFF2045",
            name="Quản trị tài chính (E)",
            faculty="Khoa Hệ thống thông tin",
            department="Bộ môn Thương mại điện tử",
        ),
        Module(
            code="BBB1068",
            name="Kỹ năng lãnh đạo",
            faculty="Khoa Quản trị kinh doanh",
            department="Bộ môn Quản trị",
        ),
        OutlineDocument(id=30, sha256="d" * 64, file_name="eff.pdf", rel_path="eff.pdf", size_bytes=100),
    ])
    db.flush()
    db.add(OutlineCourse(
        document_id=30,
        course_code_norm="EFF2045",
        faculty="FACULTY OF FINANCE AND BANKING",
        department="DEPARTMENT OF FINANCE",
        parse_status="ok",
    ))
    db.add(OutlineModuleLink(document_id=30, module_code="EFF2045"))
    db.commit()

    csv_path = tmp_path / "module_faculty_audit.csv"
    res = fix_module_faculties(db, dry_run=True, csv_path=csv_path)
    assert res["dry_run"] is True
    assert res["applied_changes"] == 0

    # DB không đổi
    assert db.get(Module, "EFF2045").faculty == "Khoa Hệ thống thông tin"
    assert db.get(Module, "BBB1068").faculty == "Khoa Quản trị kinh doanh"

    # File CSV tồn tại và có đúng cột
    assert csv_path.exists()
    with csv_path.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        expected_cols = [
            "code",
            "name",
            "faculty_hiện_tại",
            "department_hiện_tại",
            "faculty_gốc_đề_cương",
            "faculty_chuẩn",
            "faculty_theo_đề_cương",
            "department_theo_đề_cương",
            "có_đề_cương",
            "nguồn",
            "needs_review",
            "kết_luận",
            "lý do",
            "vấn_đề",
        ]
        assert reader.fieldnames == expected_cols
        rows = list(reader)
        by_code = {r["code"]: r for r in rows}

        eff = by_code["EFF2045"]
        assert eff["faculty_hiện_tại"] == "Khoa Hệ thống thông tin"
        assert eff["faculty_gốc_đề_cương"] == "FACULTY OF FINANCE AND BANKING"
        assert eff["faculty_chuẩn"] == "Khoa Tài chính - Ngân hàng"
        assert eff["faculty_theo_đề_cương"] == "Khoa Tài chính - Ngân hàng"
        assert eff["department_theo_đề_cương"] == "Bộ môn Tài chính"
        assert eff["có_đề_cương"] == "có"
        assert eff["nguồn"] == "outline"
        assert eff["needs_review"] == "không"
        assert eff["kết_luận"] == "đổi"

        bbb = by_code["BBB1068"]
        assert bbb["faculty_hiện_tại"] == "Khoa Quản trị kinh doanh"
        assert bbb["faculty_gốc_đề_cương"] == ""
        assert bbb["faculty_chuẩn"] == "Khoa Quản trị kinh doanh"
        assert bbb["faculty_theo_đề_cương"] == ""
        assert bbb["department_theo_đề_cương"] == ""
        assert bbb["có_đề_cương"] == "không"
        assert bbb["nguồn"] == ""
        assert bbb["needs_review"] == "không"
        assert bbb["kết_luận"] == "giữ nguyên"
        assert bbb["lý do"] == "không có đề cương – chưa kiểm chứng"


def test_audit_faculty_command(db, tmp_path):
    """Lệnh audit_faculty_command: không sửa DB, xuất CSV và trả về tóm tắt đầy đủ (Brief B6h)."""
    db.add(Module(code="XYZ1", name="Môn XYZ", faculty="Khoa Luật"))
    db.commit()

    csv_path = tmp_path / "audit.csv"
    summary = audit_faculty_command(db, csv_path=csv_path)

    assert summary["total_modules"] == 1
    assert summary["with_outline"] == 0
    assert summary["from_outline"] == 0
    assert summary["from_counterpart"] == 0
    assert summary["changed"] == 0
    assert summary["conflicts"] == 0
    assert summary["from_prefix"] == 0
    assert summary["prefix_conflicts"] == 0
    assert summary["no_source"] == 1
    assert "prefix_table" in summary
    assert summary["kept_unchanged"] == 1
    assert summary["kept_unverified"] == 1
    assert summary["kept_empty"] == 0
    assert "academic_affairs" not in summary
    assert "Khoa Luật" in summary["by_faculty"]

    # DB không bị sửa
    assert db.get(Module, "XYZ1").faculty == "Khoa Luật"


def test_unmapped_faculty_name_preserved(db):
    """Tên khoa chưa ánh xạ trong đề cương: giữ nguyên chuỗi gốc, ghi vào unmapped_names."""
    db.add_all([
        Module(code="QTC101", name="Lượng tử"),
        OutlineDocument(id=40, sha256="e" * 64, file_name="qtc.pdf", rel_path="qtc.pdf", size_bytes=100),
    ])
    db.flush()
    db.add(OutlineCourse(
        document_id=40,
        course_code_norm="QTC101",
        faculty="Faculty of Advanced Quantum Tech",
        department="Department of Quantum AI",
        parse_status="ok",
    ))
    db.add(OutlineModuleLink(document_id=40, module_code="QTC101"))
    db.commit()

    rows, unmapped = audit_module_faculties_with_unmapped(db)
    row = next(r for r in rows if r["code"] == "QTC101")
    assert row["faculty_theo_đề_cương"] == "Faculty of Advanced Quantum Tech"
    assert row["department_theo_đề_cương"] == "Department of Quantum AI"
    assert "Faculty of Advanced Quantum Tech" in unmapped
    assert "tên khoa chưa ánh xạ" in row["vấn_đề"]

    apply_outline_faculties(db)
    m = db.get(Module, "QTC101")
    assert m.faculty == "Faculty of Advanced Quantum Tech"
    assert m.department == "Department of Quantum AI"


def test_faculty_en_and_vi_academic_affairs():
    """Ánh xạ song ngữ cho 'Phòng Đào tạo' <-> 'Academic Affairs Office'."""
    assert faculty_en("Phòng Đào tạo") == "Academic Affairs Office"
    assert faculty_vi("Academic Affairs Office") == "Phòng Đào tạo"
    assert faculty_en("Khoa Tài chính - Ngân hàng") == "Faculty of Finance and Banking"
    assert faculty_vi("FACULTY OF FINANCE AND BANKING") == "Khoa Tài chính - Ngân hàng"
    assert faculty_en("Phòng Bảo đảm chất lượng") == "Department of Quality Assurance"
    assert faculty_vi("Quality Assurance Office") == "Phòng Bảo đảm chất lượng"
    assert faculty_vi("Department of Quality Assurance") == "Phòng Bảo đảm chất lượng"


def test_module_facets_and_summary_show_academic_affairs(client, db):
    """Facet 'Khoa' ở API (/api/modules/facets và /api/module-facets) hiện 'Phòng Đào tạo',
    chi tiết môn trả faculty_en = 'Academic Affairs Office'."""
    db.add(Module(
        code="BBB1068",
        name="Kỹ năng lãnh đạo",
        faculty="Phòng Đào tạo",
        department=None,
    ))
    db.commit()

    # Thử cả hai route
    res1 = client.get("/api/module-facets")
    assert res1.status_code == 200
    facs = {f["value"]: f["count"] for f in res1.json()["faculty"]}
    assert "Phòng Đào tạo" in facs
    assert facs["Phòng Đào tạo"] >= 1

    res2 = client.get("/api/modules/facets")
    assert res2.status_code == 200

    # Chi tiết học phần
    detail_res = client.get("/api/modules/BBB1068")
    assert detail_res.status_code == 200
    data = detail_res.json()
    assert data["faculty"] == "Phòng Đào tạo"
    assert data["faculty_en"] == "Academic Affairs Office"


def test_aliases_map_to_canonical_faculty():
    """Yêu cầu 1: các alias B6d ánh xạ đúng về khoa chuẩn."""
    # Các alias chỉ định rõ trong Brief B6d
    assert canonical_faculty_vi("QTKD") == "Khoa Quản trị kinh doanh"
    assert canonical_faculty_vi("MIS") == "Khoa Hệ thống thông tin"
    assert canonical_faculty_vi("BANKING AND FINANCE") == "Khoa Tài chính - Ngân hàng"
    assert canonical_faculty_vi("ACCOUNTING – AUDITING") == "Khoa Kế toán - Kiểm toán"
    assert canonical_faculty_vi("ECONOMIC MATHEMATICS") == "Khoa Toán kinh tế"
    assert canonical_faculty_vi("ECONOMIC RELATION") == "Khoa Kinh tế đối ngoại"
    assert canonical_faculty_vi("ECONOMIC RELATIONS") == "Khoa Kinh tế đối ngoại"
    assert canonical_faculty_vi("ECONOMIC LAW") == "Khoa Luật Kinh tế"

    # Tên viết hoa / không dấu / có dấu
    assert canonical_faculty_vi("QUẢN TRỊ KINH DOANH") == "Khoa Quản trị kinh doanh"
    assert canonical_faculty_vi("TÀI CHÍNH NGÂN HÀNG") == "Khoa Tài chính - Ngân hàng"
    assert canonical_faculty_vi("FINANCE AND BANKING") == "Khoa Tài chính - Ngân hàng"
    assert canonical_faculty_vi("HỆ THỐNG THÔNG TIN") == "Khoa Hệ thống thông tin"
    assert canonical_faculty_vi("KẾ TOÁN – KIỂM TOÁN") == "Khoa Kế toán - Kiểm toán"
    assert canonical_faculty_vi("TOÁN KINH TẾ") == "Khoa Toán kinh tế"
    assert canonical_faculty_vi("Toán Kinh tế") == "Khoa Toán kinh tế"
    assert canonical_faculty_vi("MATHEMATICAL ECONOMICS") == "Khoa Toán kinh tế"
    assert canonical_faculty_vi("KINH TẾ") == "Khoa Kinh tế"
    assert canonical_faculty_vi("KINH TẾ ĐỐI NGOẠI") == "Khoa Kinh tế đối ngoại"
    assert canonical_faculty_vi("LUẬT") == "Khoa Luật"
    assert canonical_faculty_vi("LUẬT KINH TẾ") == "Khoa Luật Kinh tế"

    # Bộ môn không được ánh xạ nhầm thành khoa
    assert canonical_faculty_vi("Bộ môn Toán kinh tế") is None
    assert canonical_faculty_vi("Department of Mathematical Economics") is None


def test_junk_text_cleaning_and_handling(db):
    """Yêu cầu 2: cắt đuôi rác tiêu ngữ, dấu chấm, ký tự thừa."""
    # Tiêu ngữ dính sau tên khoa
    s1 = "INFORMATION SYSTEMS Independence – Liberty - Happiness"
    assert clean_raw_text(s1) == "INFORMATION SYSTEMS"
    assert canonical_faculty_vi(s1) == "Khoa Hệ thống thông tin"

    # Dấu chấm rác -> coi là không có khoa -> Phòng Đào tạo
    s2 = "……….."
    assert clean_raw_text(s2) == ""
    assert canonical_faculty_vi(s2) is None

    # Môn có đề cương chứa chuỗi rác dấu chấm -> Phòng Đào tạo
    db.add_all([
        Module(code="JNK1", name="Môn Rác", faculty="Khoa Luật"),
        OutlineDocument(id=50, sha256="f" * 64, file_name="jnk.pdf", rel_path="jnk.pdf", size_bytes=100),
    ])
    db.flush()
    db.add(OutlineCourse(
        document_id=50,
        course_code_norm="JNK1",
        faculty="………….",
        department=None,
        parse_status="ok",
    ))
    db.add(OutlineModuleLink(document_id=50, module_code="JNK1"))
    db.commit()

    rows = audit_module_faculties(db)
    row = next(r for r in rows if r["code"] == "JNK1")
    assert row["faculty_chuẩn"] == "Khoa Luật"
    assert row["faculty_theo_đề_cương"] == ""
    assert row["needs_review"] == "không"
    assert row["kết_luận"] == "giữ nguyên"
    assert "chưa kiểm chứng" in row["lý do"]


def test_department_in_faculty_column_not_assigned_as_faculty(db):
    """Yêu cầu 3 & 6: tên bộ môn ở cột khoa không bị gán thành khoa; chuyển sang bộ môn, khoa để cần duyệt."""
    db.add_all([
        Module(code="LAW01", name="Luật Nhà nước", faculty="Chưa rõ", department=None),
        OutlineDocument(id=60, sha256="6" * 64, file_name="law01.pdf", rel_path="law01.pdf", size_bytes=100),
    ])
    db.flush()
    db.add(OutlineCourse(
        document_id=60,
        course_code_norm="LAW01",
        faculty="ADMINISTRATIVE LAW - STATE",
        department=None,  # department trong đề cương trống
        parse_status="ok",
    ))
    db.add(OutlineModuleLink(document_id=60, module_code="LAW01"))
    db.commit()

    rows = audit_module_faculties(db)
    row = next(r for r in rows if r["code"] == "LAW01")
    assert row["faculty_gốc_đề_cương"] == "ADMINISTRATIVE LAW - STATE"
    assert row["faculty_chuẩn"] == "Phòng Đào tạo"
    assert row["department_theo_đề_cương"] == "Bộ môn Luật Hành chính - Nhà nước"
    assert row["needs_review"] == "có"
    assert row["kết_luận"] == "cần duyệt"
    assert "thực chất là bộ môn" in row["lý do"]

    apply_outline_faculties(db)
    m = db.get(Module, "LAW01")
    # Khoa không bao giờ bị gán thành bộ môn
    assert m.faculty == "Phòng Đào tạo"
    assert m.department == "Bộ môn Luật Hành chính - Nhà nước"


def test_same_canonical_faculty_across_outlines_not_conflict(db):
    """Yêu cầu 4: các đề cương cùng môn cho cùng khoa sau chuẩn hóa thì KHÔNG phải xung đột."""
    db.add_all([
        Module(code="MGT101", name="Quản trị học", faculty="Chưa rõ"),
        OutlineDocument(id=71, sha256="71" * 32, file_name="m1.pdf", rel_path="m1.pdf", size_bytes=100),
        OutlineDocument(id=72, sha256="72" * 32, file_name="m2.pdf", rel_path="m2.pdf", size_bytes=100),
        OutlineDocument(id=73, sha256="73" * 32, file_name="m3.pdf", rel_path="m3.pdf", size_bytes=100),
    ])
    db.flush()
    # 3 đề cương có chuỗi gốc khác nhau nhưng cùng ánh xạ về 'Khoa Quản trị kinh doanh'
    db.add(OutlineCourse(document_id=71, course_code_norm="MGT101", faculty="QUẢN TRỊ KINH DOANH", parse_status="ok"))
    db.add(OutlineCourse(document_id=72, course_code_norm="MGT101", faculty="Khoa Quản trị kinh doanh", parse_status="ok"))
    db.add(OutlineCourse(document_id=73, course_code_norm="MGT101", faculty="QTKD", parse_status="ok"))
    db.add(OutlineModuleLink(document_id=71, module_code="MGT101"))
    db.add(OutlineModuleLink(document_id=72, module_code="MGT101"))
    db.add(OutlineModuleLink(document_id=73, module_code="MGT101"))
    db.commit()

    rows = audit_module_faculties(db)
    row = next(r for r in rows if r["code"] == "MGT101")
    assert row["faculty_chuẩn"] == "Khoa Quản trị kinh doanh"
    assert row["needs_review"] == "không"
    assert row["kết_luận"] != "cần duyệt"


def test_compound_and_ambiguous_names_flagged_for_review(db):
    """Yêu cầu 1: 'QUẢN LÝ KINH DOANH' và tên ghép như 'Toán Kinh tế & Hệ thống thông tin' đưa vào cần duyệt."""
    db.add_all([
        Module(code="QLKD1", name="Môn QLKD", faculty="Chưa rõ"),
        Module(code="TKTMIS1", name="Môn Ghép", faculty="Chưa rõ"),
        OutlineDocument(id=81, sha256="81" * 32, file_name="o1.pdf", rel_path="o1.pdf", size_bytes=100),
        OutlineDocument(id=82, sha256="82" * 32, file_name="o2.pdf", rel_path="o2.pdf", size_bytes=100),
    ])
    db.flush()
    db.add(OutlineCourse(document_id=81, course_code_norm="QLKD1", faculty="QUẢN LÝ KINH DOANH", parse_status="ok"))
    db.add(OutlineCourse(document_id=82, course_code_norm="TKTMIS1", faculty="Toán Kinh tế & Hệ thống thông tin", parse_status="ok"))
    db.add(OutlineModuleLink(document_id=81, module_code="QLKD1"))
    db.add(OutlineModuleLink(document_id=82, module_code="TKTMIS1"))
    db.commit()

    rows = audit_module_faculties(db)
    r1 = next(r for r in rows if r["code"] == "QLKD1")
    assert r1["needs_review"] == "có"
    assert r1["kết_luận"] == "cần duyệt"
    assert "QUẢN LÝ KINH DOANH" in r1["lý do"]
    assert r1["faculty_chuẩn"] == "Phòng Đào tạo"

    r2 = next(r for r in rows if r["code"] == "TKTMIS1")
    assert r2["needs_review"] == "có"
    assert r2["kết_luận"] == "cần duyệt"
    assert "tên ghép" in r2["lý do"]


def test_canonical_faculty_count_at_most_ten(db):
    """Yêu cầu 5: số khoa chuẩn sau chuẩn hóa phải <= 10 nhãn (9 khoa + Phòng Đào tạo)."""
    summary = audit_faculty_command(db)
    assert summary["canonical_faculty_count"] <= 10
    for fac in summary["by_faculty"]:
        assert fac in CANONICAL_FACULTIES_VI


def test_summarize_audit_includes_sample_codes_for_needs_review():
    """Brief B6e: needs_review_list chứa sample_codes (tối đa 5 mã môn mỗi mục)."""
    rows = [
        {
            "code": f"MOD{i:02d}",
            "faculty_chuẩn": "Phòng Đào tạo",
            "faculty_gốc_đề_cương": "QUẢN LÝ KINH DOANH",
            "needs_review": "có",
            "có_đề_cương": "có",
            "is_changed": False,
            "kết_luận": "cần duyệt",
            "lý do": "tên khoa chưa chắc chắn (QUẢN LÝ KINH DOANH)",
        }
        for i in range(7)
    ]
    summary = summarize_audit(rows)
    assert summary["needs_review_count"] == 7
    assert len(summary["needs_review_list"]) == 1
    item = summary["needs_review_list"][0]
    assert item["name"] == "QUẢN LÝ KINH DOANH"
    assert item["count"] == 7
    assert item["sample_codes"] == ["MOD00", "MOD01", "MOD02", "MOD03", "MOD04"]


def test_no_recursion_on_unmapped_and_edge_case_inputs():
    """Brief B6f: Đảm bảo không xảy ra đệ quy vô hạn (RecursionError)
    giữa các hàm chuẩn hóa/ánh xạ khi gặp đầu vào lạ hoặc tên chưa ánh xạ:
    chuỗi rỗng, None, ký tự rác, chuỗi rất dài, chỉ gồm 'Khoa', 'Bộ môn',
    hoặc tên khoa/bộ môn chưa có trong từ điển."""
    weird_inputs = [
        "",
        None,
        "   ",
        "\t\n  \r",
        "……………",
        "........",
        "---___---",
        "@#$%^&*!?",
        "Khoa",
        "khoa",
        "KHOA",
        "Khoa   ",
        "Bộ môn",
        "bộ môn",
        "Department of",
        "Faculty of",
        "Bộ môn:",
        "Khoa:",
        "Department of:",
        "Faculty of:",
        "Khoa " * 500,
        "Department of " * 500,
        "A" * 10000,
        "Faculty of Advanced Quantum Tech",
        "Department of Quantum AI",
        "Deep Learning & Robotics Lab",
    ]

    for s in weird_inputs:
        # Không có hàm nào được văng RecursionError hay crash
        c_raw = clean_raw_text(s)
        assert isinstance(c_raw, str)

        c_fac = canonical_faculty_vi(s)
        assert c_fac is None or isinstance(c_fac, str)

        f_vi = faculty_vi(s)
        assert f_vi is None or isinstance(f_vi, str)

        d_vi = department_vi(s)
        assert d_vi is None or isinstance(d_vi, str)

        f_en = faculty_en(s)
        assert f_en is None or isinstance(f_en, str)

        d_en = department_en(s)
        assert d_en is None or isinstance(d_en, str)

        is_d, mapped_d = is_department(s)
        assert isinstance(is_d, bool)
        assert mapped_d is None or isinstance(mapped_d, str)

        norm_d = normalize_department(s)
        assert norm_d is None or isinstance(norm_d, str)

    # Kiểm tra cụ thể các giá trị kỳ vọng
    assert canonical_faculty_vi("Faculty of Advanced Quantum Tech") is None
    assert faculty_vi("Faculty of Advanced Quantum Tech") is None
    assert department_vi("Department of Quantum AI") is None
    assert normalize_department("Department of Quantum AI") == "Department of Quantum AI"
    is_d, d_val = is_department("Department of Quantum AI")
    assert is_d is True
    assert d_val == "Department of Quantum AI"
    assert canonical_faculty_vi("Khoa") is None
    assert faculty_vi("Khoa") is None
    assert canonical_faculty_vi("Bộ môn") is None
    assert faculty_vi("Bộ môn") is None
    assert department_vi("Bộ môn") is None
    assert department_vi("Khoa") is None
    assert faculty_vi("Bộ môn:") is None
    assert department_vi("Bộ môn:") is None

    # Brief B6g: Các chuỗi chỉ gồm tiền tố/từ khung mà không có tên thật KHÔNG phải tên khoa (trả None)
    prefix_only_inputs = [
        "Khoa",
        "khoa",
        "KHOA",
        "Khoa   ",
        "Khoa:",
        "Bộ môn",
        "bộ môn",
        "BỘ MÔN",
        "Bộ môn:",
        "Bo mon",
        "bo mon",
        "Faculty of",
        "Faculty",
        "Department of",
        "Department",
        "Department of:",
        "Faculty of:",
        "Khoa " * 500,
        "Department of " * 500,
        "……………",
        "........",
        "---___---",
    ]
    for p in prefix_only_inputs:
        assert canonical_faculty_vi(p) is None
        assert faculty_vi(p) is None
        assert department_vi(p) is None
        assert normalize_department(p) is None
        is_d, _ = is_department(p)
        assert is_d is False


def test_resolve_module_faculty_counterpart_and_keep_old(db):
    """Brief B6h: resolve_module_faculty ưu tiên đề cương chính nó -> đề cương counterpart -> giữ nguyên giá trị cũ."""
    # Module có đề cương
    db.add(Module(code="MOD_OWN", name="Môn có đề cương", faculty="Khoa Luật"))
    db.add(OutlineDocument(id=2001, sha256="2001" * 16, file_name="own.pdf", rel_path="own.pdf", size_bytes=100))
    db.flush()
    db.add(OutlineCourse(
        document_id=2001,
        course_code_norm="MOD_OWN",
        faculty="FACULTY OF BUSINESS ADMINISTRATION",
        department="DEPARTMENT OF MANAGEMENT",
        parse_status="ok",
    ))
    db.add(OutlineModuleLink(document_id=2001, module_code="MOD_OWN", source="catalog"))

    # Module không có đề cương nhưng có counterpart có đề cương
    db.add(Module(code="MOD_CP", name="Môn counterpart", faculty=None, counterpart_code="MOD_OWN"))

    # Module không có đề cương của mình lẫn counterpart
    db.add(Module(code="MOD_NONE", name="Môn không có đề cương", faculty="Khoa Kinh tế", department="Bộ môn Kinh tế học"))

    db.commit()

    # 1. MOD_OWN -> lấy từ đề cương chính nó
    fac1, dept1 = resolve_module_faculty(db, "MOD_OWN")
    assert fac1 == "Khoa Quản trị kinh doanh"
    assert dept1 == "Bộ môn Quản trị"

    # 2. MOD_CP -> lấy từ đề cương của MOD_OWN (counterpart)
    fac2, dept2 = resolve_module_faculty(db, "MOD_CP")
    assert fac2 == "Khoa Quản trị kinh doanh"
    assert dept2 == "Bộ môn Quản trị"

    # 3. MOD_NONE -> giữ nguyên giá trị DB cũ ("Khoa Kinh tế", "Bộ môn Kinh tế học"), không gán "Phòng Đào tạo"
    fac3, dept3 = resolve_module_faculty(db, "MOD_NONE")
    assert fac3 == "Khoa Kinh tế"
    assert dept3 == "Bộ môn Kinh tế học"

    # 4. Mã chưa có trong DB và không có đề cương -> giữ nguyên raw_faculty/raw_department
    fac4, dept4 = resolve_module_faculty(db, "NON_EXIST", raw_faculty="Khoa Tài chính - Ngân hàng", raw_department="Bộ môn Ngân hàng")
    assert fac4 == "Khoa Tài chính - Ngân hàng"
    assert dept4 == "Bộ môn Ngân hàng"


def test_bkb4060_outline_via_outline_module_links_union(db):
    """Brief B6h: Nguồn đề cương cho một học phần là HỢP của:
      (1) outline_module_links của mã đó -> outline_courses theo document_id (như BKB4060)
      (2) outline_courses khớp trực tiếp course_code_norm (như DIRECT1)
    Đồng thời bản VI/EN của cùng tài liệu (LUẬT KINH TẾ / ECONOMIC LAW) KHÔNG phải xung đột."""
    db.add_all([
        Module(
            code="BKB4060",
            name="Luật sở hữu trí tuệ",
            faculty=None,
            department=None,
        ),
        Module(
            code="DIRECT1",
            name="Môn có đề cương trực tiếp",
            faculty=None,
            department=None,
        ),
        OutlineDocument(id=33, sha256="33" * 32, file_name="bkb4060_vi.pdf", rel_path="bkb4060_vi.pdf", size_bytes=100),
        OutlineDocument(id=191, sha256="191" * 21 + "1", file_name="bkb4060_en.pdf", rel_path="bkb4060_en.pdf", size_bytes=100),
        OutlineDocument(id=501, sha256="501" * 21 + "1", file_name="direct1.pdf", rel_path="direct1.pdf", size_bytes=100),
    ])
    db.flush()

    # BKB4060 không có outline_courses nào ghi course_code_norm='BKB4060', đề cương ghi mã cũ BKB4020
    db.add(OutlineCourse(
        document_id=33,
        course_code="BKB4020",
        course_code_norm="BKB4020",
        doc_type="syllabus_vi",
        faculty="LUẬT KINH TẾ",
        department="LUẬT KINH DOANH",
        parse_status="ok",
    ))
    db.add(OutlineCourse(
        document_id=191,
        course_code="BKB4020",
        course_code_norm="BKB4020",
        doc_type="syllabus_en",
        faculty="ECONOMIC LAW",
        department="BUSINESS LAW",
        parse_status="ok",
    ))
    # Liên kết qua OutlineModuleLink
    db.add(OutlineModuleLink(document_id=33, module_code="BKB4060", source="catalog"))
    db.add(OutlineModuleLink(document_id=191, module_code="BKB4060", source="catalog"))

    # DIRECT1 KHÔNG có OutlineModuleLink, chỉ có OutlineCourse với course_code_norm="DIRECT1"
    db.add(OutlineCourse(
        document_id=501,
        course_code="DIRECT1",
        course_code_norm="DIRECT1",
        doc_type="syllabus_vi",
        faculty="Khoa Kinh tế đối ngoại",
        department="Bộ môn Kinh doanh quốc tế",
        parse_status="ok",
    ))
    db.commit()

    rows = audit_module_faculties(db)
    by_code = {r["code"]: r for r in rows}

    # BKB4060: lấy được qua outline_module_links, bản VI/EN cùng khoa chuẩn không tính xung đột
    r_bkb = by_code["BKB4060"]
    assert r_bkb["có_đề_cương"] == "có"
    assert r_bkb["nguồn"] == "outline"
    assert r_bkb["faculty_chuẩn"] == "Khoa Luật Kinh tế"
    assert r_bkb["department_theo_đề_cương"] == "Bộ môn Luật Kinh doanh"
    assert r_bkb["needs_review"] == "không"
    assert r_bkb["kết_luận"] == "đổi"

    # DIRECT1: lấy được qua course_code_norm trực tiếp
    r_dir = by_code["DIRECT1"]
    assert r_dir["có_đề_cương"] == "có"
    assert r_dir["nguồn"] == "outline"
    assert r_dir["faculty_chuẩn"] == "Khoa Kinh tế đối ngoại"
    assert r_dir["department_theo_đề_cương"] == "Bộ môn Kinh doanh quốc tế"
    assert r_dir["needs_review"] == "không"
    assert r_dir["kết_luận"] == "đổi"

    # Áp dụng thay đổi
    res = apply_outline_faculties(db)
    assert res["applied_changes"] == 2

    m_bkb = db.get(Module, "BKB4060")
    assert m_bkb.faculty == "Khoa Luật Kinh tế"
    assert m_bkb.department == "Bộ môn Luật Kinh doanh"

    m_dir = db.get(Module, "DIRECT1")
    assert m_dir.faculty == "Khoa Kinh tế đối ngoại"
    assert m_dir.department == "Bộ môn Kinh doanh quốc tế"

    # resolve_module_faculty cũng trả đúng kết quả cho BKB4060
    fac_res, dept_res = resolve_module_faculty(db, "BKB4060")
    assert fac_res == "Khoa Luật Kinh tế"
    assert dept_res == "Bộ môn Luật Kinh doanh"


def test_prefix_table_build_threshold_and_mixed_filtered(db):
    """Brief B6i: Bảng tiền tố dựng đúng: ngưỡng >= 5 mẫu và >= 90%; tiền tố hỗn hợp loại.
    DG có 6 QTKD, 3 Toán kinh tế (66.7% < 90%) -> LOẠI.
    LD có 4 mẫu (< 5 mẫu) -> LOẠI.
    AA có 5 mẫu (100% >= 90%) -> DÙNG (Khoa Kế toán - Kiểm toán).
    IE có 46 HTTT, 3 QTKD (93.9% >= 90%) -> DÙNG (Khoa Hệ thống thông tin).
    """
    doc_id_counter = 10000

    def add_outline_course(code, fac_name):
        nonlocal doc_id_counter
        doc_id_counter += 1
        db.add_all([
            Module(code=code, name=f"Môn {code}", faculty=None),
            OutlineDocument(
                id=doc_id_counter,
                sha256=f"{doc_id_counter:064d}",
                file_name=f"{code}.pdf",
                rel_path=f"{code}.pdf",
                size_bytes=100,
            ),
        ])
        db.flush()
        db.add(OutlineCourse(
            document_id=doc_id_counter,
            course_code_norm=code,
            faculty=fac_name,
            parse_status="ok",
        ))
        db.add(OutlineModuleLink(document_id=doc_id_counter, module_code=code, source="catalog"))

    # AA: 5 mẫu -> Khoa Kế toán - Kiểm toán (100% >= 90%, đủ >= 5)
    for i in range(5):
        add_outline_course(f"BAA{i:03d}", "Khoa Kế toán - Kiểm toán")

    # LD: 4 mẫu -> Khoa Luật (< 5 mẫu -> LOẠI)
    for i in range(4):
        add_outline_course(f"BLD{i:03d}", "Khoa Luật")

    # DG: 9 mẫu -> 6 QTKD, 3 Toán kinh tế (66.7% < 90% -> LOẠI)
    for i in range(6):
        add_outline_course(f"BDG{i:03d}", "Khoa Quản trị kinh doanh")
    for i in range(6, 9):
        add_outline_course(f"BDG{i:03d}", "Khoa Toán kinh tế")

    # IE: 49 mẫu -> 46 HTTT, 3 QTKD (93.9% >= 90% -> DÙNG)
    for i in range(46):
        add_outline_course(f"BIE{i:03d}", "Khoa Hệ thống thông tin")
    for i in range(46, 49):
        add_outline_course(f"BIE{i:03d}", "Khoa Quản trị kinh doanh")

    db.commit()

    entries = build_prefix_table_from_db(db, min_samples=5, min_ratio=0.90)
    by_pref = {e.prefix: e for e in entries}

    # AA đạt
    assert "AA" in by_pref
    assert by_pref["AA"].faculty_chuẩn == "Khoa Kế toán - Kiểm toán"
    assert by_pref["AA"].sample_count == 5
    assert by_pref["AA"].ratio == 1.0

    # IE đạt (~93.9%)
    assert "IE" in by_pref
    assert by_pref["IE"].faculty_chuẩn == "Khoa Hệ thống thông tin"
    assert by_pref["IE"].sample_count == 49
    assert abs(by_pref["IE"].ratio - 46 / 49) < 0.001

    # DG không đạt (hỗn hợp loại)
    assert "DG" not in by_pref

    # LD không đạt (thiếu mẫu < 5)
    assert "LD" not in by_pref


def test_e_module_prefix_extraction(db):
    """Brief B6i: Môn E (EFF…) dùng đúng 2 chữ cái sau chữ đầu làm tiền tố đơn vị."""
    assert extract_module_prefix("EFF2045") == "FF"
    assert extract_module_prefix("BBB1068") == "BB"
    assert extract_module_prefix("BEE1050") == "EE"
    assert extract_module_prefix("EBMT065") == "BM"
    assert extract_module_prefix("EKTT017") == "KT"
    assert extract_module_prefix("M01") is None
    assert extract_module_prefix("GDQP") is None
    assert extract_module_prefix(None) is None
    assert extract_module_prefix("") is None

    # Môn E trống có tiền tố FF -> Khoa Tài chính - Ngân hàng (nguồn prefix)
    db.add(Module(code="EFF9999", name="Tài chính nâng cao (E)", faculty=None, department=None))
    db.commit()

    rows = audit_module_faculties(db)
    r = next(row for row in rows if row["code"] == "EFF9999")
    assert r["faculty_chuẩn"] == "Khoa Tài chính - Ngân hàng"
    assert r["nguồn"] == "prefix"
    assert r["kết_luận"] == "đổi"

    apply_outline_faculties(db)
    m = db.get(Module, "EFF9999")
    assert m.faculty == "Khoa Tài chính - Ngân hàng"
    assert m.faculty_source == "prefix"
    assert normalize_search("Khoa Tài chính - Ngân hàng") in m.search_text


def test_empty_module_filled_by_prefix(db):
    """Brief B6i: Môn trống có tiền tố BB → Khoa Quản trị kinh doanh (nguồn prefix)."""
    db.add(Module(code="BBB9999", name="Quản trị học đặc biệt", faculty=None, department=None))
    db.commit()

    rows = audit_module_faculties(db)
    r = next(row for row in rows if row["code"] == "BBB9999")
    assert r["faculty_chuẩn"] == "Khoa Quản trị kinh doanh"
    assert r["nguồn"] == "prefix"
    assert r["kết_luận"] == "đổi"
    assert "BB" in r["lý do"]

    res = apply_outline_faculties(db)
    assert res["from_prefix"] == 1
    assert res["applied_changes"] == 1

    m = db.get(Module, "BBB9999")
    assert m.faculty == "Khoa Quản trị kinh doanh"
    assert m.faculty_source == "prefix"


def test_existing_faculty_conflict_with_prefix_not_overwritten(db, tmp_path):
    """Brief B6i: Môn có khoa cũ khác tiền tố → không ghi đè, vào danh sách mâu thuẫn (cần duyệt).
    Ví dụ BBB1068 đang ghi Khoa Tài chính - Ngân hàng nhưng tiền tố BB → Khoa Quản trị kinh doanh.
    Xuất ra file module_faculty_prefix_conflicts.csv.
    """
    db.add(Module(
        code="BBB1068",
        name="Kỹ năng lãnh đạo",
        faculty="Khoa Tài chính - Ngân hàng",
        department="Bộ môn Tài chính",
    ))
    db.commit()

    conflicts_csv = tmp_path / "module_faculty_prefix_conflicts.csv"
    res = fix_module_faculties(db, dry_run=False, conflicts_csv_path=conflicts_csv)

    # DB KHÔNG bị ghi đè: vẫn là Khoa Tài chính - Ngân hàng
    m = db.get(Module, "BBB1068")
    assert m.faculty == "Khoa Tài chính - Ngân hàng"
    assert res["applied_changes"] == 0
    assert res["prefix_conflicts"] >= 1

    # Kiểm tra trong audit rows
    rows = audit_module_faculties(db)
    r = next(row for row in rows if row["code"] == "BBB1068")
    assert r["kết_luận"] == "cần duyệt"
    assert r["needs_review"] == "có"
    assert r["is_changed"] is False
    assert "mâu thuẫn tiền tố" in r["lý do"]
    assert r["is_prefix_conflict"] is True
    assert r["faculty_theo_tiền_tố"] == "Khoa Quản trị kinh doanh"

    # File CSV mâu thuẫn được tạo và chứa BBB1068
    assert conflicts_csv.exists()
    with conflicts_csv.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        c_rows = list(reader)
        c_by_code = {row["code"]: row for row in c_rows}
        assert "BBB1068" in c_by_code
        c_bbb = c_by_code["BBB1068"]
        assert c_bbb["faculty_hiện_tại"] == "Khoa Tài chính - Ngân hàng"
        assert c_bbb["faculty_theo_tiền_tố"] == "Khoa Quản trị kinh doanh"
        assert c_bbb["prefix"] == "BB"


def test_prefix_filling_is_idempotent(db):
    """Brief B6i: Chạy apply_outline_faculties nhiều lần: kết quả không đổi, lần 2 có 0 thay đổi."""
    db.add(Module(code="BBU8888", name="Quản trị mua hàng", faculty=None, department=None))
    db.commit()

    # Lần 1: điền từ tiền tố BU -> Khoa Quản trị kinh doanh
    res1 = apply_outline_faculties(db)
    assert res1["applied_changes"] == 1
    m1 = db.get(Module, "BBU8888")
    assert m1.faculty == "Khoa Quản trị kinh doanh"

    # Lần 2: không thay đổi gì trong DB
    res2 = apply_outline_faculties(db)
    assert res2["applied_changes"] == 0
    m2 = db.get(Module, "BBU8888")
    assert m2.faculty == "Khoa Quản trị kinh doanh"

    # Lần 3: tiếp tục 0 thay đổi
    res3 = apply_outline_faculties(db)
    assert res3["applied_changes"] == 0


def test_outline_priority_over_prefix(db):
    """Brief B6i: Thứ tự ưu tiên nguồn: Đề cương (a)/(b) > Tiền tố (c).
    Module BIE1001 có tiền tố IE (Khoa HTTT), nhưng đề cương ghi Khoa Quản trị kinh doanh
    -> lấy theo đề cương (Khoa Quản trị kinh doanh, nguồn outline).
    """
    db.add_all([
        Module(code="BIE1001", name="Môn liên ngành", faculty=None, department=None),
        OutlineDocument(id=9901, sha256="9901" * 16, file_name="bie1001.pdf", rel_path="bie1001.pdf", size_bytes=100),
    ])
    db.flush()
    db.add(OutlineCourse(
        document_id=9901,
        course_code_norm="BIE1001",
        faculty="Khoa Quản trị kinh doanh",
        department="Bộ môn Quản trị",
        parse_status="ok",
    ))
    db.add(OutlineModuleLink(document_id=9901, module_code="BIE1001", source="catalog"))
    db.commit()

    rows = audit_module_faculties(db)
    r = next(row for row in rows if row["code"] == "BIE1001")
    assert r["faculty_chuẩn"] == "Khoa Quản trị kinh doanh"
    assert r["nguồn"] == "outline"
    assert r["kết_luận"] == "đổi"
    assert r["faculty_theo_tiền_tố"] == "Khoa Hệ thống thông tin"

    apply_outline_faculties(db)
    m = db.get(Module, "BIE1001")
    assert m.faculty == "Khoa Quản trị kinh doanh"
    assert m.department == "Bộ môn Quản trị"
    assert m.faculty_source == "outline"


def test_resolve_module_faculty_with_prefix(db):
    """Brief B6i: resolve_module_faculty tra cứu được khoa từ tiền tố khi không có đề cương."""
    # Module chưa có trong DB, truyền mã BBB9000 không có faculty
    fac1, dept1 = resolve_module_faculty(db, "BBB9000")
    assert fac1 == "Khoa Quản trị kinh doanh"

    # Module chưa có trong DB, truyền mã EFF9000 không có faculty -> Khoa Tài chính - Ngân hàng
    fac2, dept2 = resolve_module_faculty(db, "EFF9000")
    assert fac2 == "Khoa Tài chính - Ngân hàng"

    # Module có khoa cũ mâu thuẫn tiền tố: không ghi đè, giữ nguyên khoa cũ
    fac3, dept3 = resolve_module_faculty(db, "BBB9001", raw_faculty="Khoa Luật")
    assert fac3 == "Khoa Luật"

    # Alias đã có trong DB vẫn được giữ nguyên dù cùng khoa với tiền tố.
    fac4, _ = resolve_module_faculty(db, "BBB9001", raw_faculty="Faculty of Business Administration")
    assert fac4 == "Faculty of Business Administration"


def test_master_data_priority_and_missing_cells_in_faculty_audit(db, tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "raw_data_dir", tmp_path)
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Data_Course"
    sheet.append(["Mã Môn", "Tên Môn", "Tên Tiếng Anh", "Mã Khoa / BM", "Tên Khoa / BM", "GV phụ trách", "Khoa"])
    sheet.append(["BBB9001", "Môn mẫu", None, None, "Bộ môn Marketing", None, "#N/A"])
    sheet.append(["BBB9002", "Môn mẫu", None, None, None, None, "Khoa Tài chính - Ngân hàng"])
    sheet.append(["BBB9003", "Môn mẫu", None, None, "#N/A", None, None])
    workbook.save(tmp_path / "Master_data.xlsx")
    workbook.close()

    db.add_all([
        Module(code="BBB9001", name="Môn mẫu", faculty="Khoa Luật"),
        Module(code="BBB9002", name="Môn mẫu", department="Bộ môn Phân tích dữ liệu"),
        Module(code="BBB9003", name="Môn mẫu"),
        OutlineDocument(id=9001, sha256="90" * 32, file_name="outline.pdf", rel_path="outline.pdf", size_bytes=100),
    ])
    db.flush()
    db.add_all([
        OutlineCourse(document_id=9001, faculty="Khoa Kinh tế", department="Bộ môn Kinh tế học", parse_status="ok"),
        OutlineModuleLink(document_id=9001, module_code="BBB9002", source="catalog"),
    ])
    db.commit()

    rows = {row["code"]: row for row in audit_module_faculties(db)}
    assert rows["BBB9001"]["nguồn"] == "master_data"
    assert rows["BBB9002"]["faculty_theo_đề_cương"] == "Khoa Kinh tế"
    assert rows["BBB9003"]["kết_luận"] == "giữ nguyên"
    expected = {
        "BBB9001": ("Khoa Luật", "Bộ môn Marketing"),
        "BBB9002": ("Khoa Tài chính - Ngân hàng", "Bộ môn Phân tích dữ liệu"),
        "BBB9003": ("", None),
    }
    for code, affiliation in expected.items():
        assert resolve_module_faculty(db, code) == affiliation

    conflicts = tmp_path / "master_conflicts.csv"
    assert apply_outline_faculties(db, master_conflicts_csv_path=conflicts)["applied_changes"] == 2
    assert "BBB9002" in conflicts.read_text(encoding="utf-8-sig")
    for code, (faculty, department) in expected.items():
        module = db.get(Module, code)
        assert (module.faculty, module.department) == (faculty or None, department)
    assert apply_outline_faculties(db, master_conflicts_csv_path=conflicts)["applied_changes"] == 0


@pytest.mark.parametrize("command", [audit_faculty_command, fix_module_faculties])
def test_rebuild_prefix_table_command(db, tmp_path, monkeypatch, command):
    """Brief B6i: lệnh audit-faculty có tùy chọn --rebuild-prefix-table tạo lại file từ DB."""
    # Thêm 5 đề cương cho tiền tố KB -> Khoa Luật Kinh tế
    for i in range(5):
        code = f"BKB900{i}"
        doc_id = 9100 + i
        db.add_all([
            Module(code=code, name=f"Luật {i}", faculty=None),
            OutlineDocument(id=doc_id, sha256=f"{doc_id}" * 16, file_name=f"kb{i}.pdf", rel_path=f"kb{i}.pdf", size_bytes=100),
        ])
        db.flush()
        db.add(OutlineCourse(
            document_id=doc_id,
            course_code_norm=code,
            faculty="Khoa Luật Kinh tế",
            parse_status="ok",
        ))
        db.add(OutlineModuleLink(document_id=doc_id, module_code=code, source="catalog"))
    db.commit()

    prefix_path = tmp_path / "prefix_to_faculty.tsv"
    monkeypatch.setattr("app.services.faculty_names.SEED_PREFIX_TSV", prefix_path)
    options = {"dry_run": True} if command is fix_module_faculties else {}
    summary = command(db, rebuild_prefix_table=True, **options)
    assert "prefix_table" in summary
    assert "KB" in summary["prefix_table"]
    assert summary["prefix_table"]["KB"] == "Khoa Luật Kinh tế"
    assert load_prefix_table(prefix_path)["KB"].faculty_chuẩn == "Khoa Luật Kinh tế"


def test_faculty_override_highest_priority(db):
    """Brief W29: Môn trong faculty_overrides.tsv có ưu tiên cao nhất,
    vượt trên đề cương và tiền tố, kết luận 'chỉ định tay' và gán faculty_source='admin'."""
    # BDG1001 nằm trong faculty_overrides.tsv chỉ định: Phòng Đào tạo / Phòng Đào tạo
    db.add_all([
        Module(
            code="BDG1001",
            name="Học phần thử nghiệm override",
            faculty="Khoa Quản trị kinh doanh",
            department="Bộ môn Quản trị",
        ),
        OutlineDocument(
            id=8801,
            sha256="88" * 32,
            file_name="bdg1001.pdf",
            rel_path="bdg1001.pdf",
            size_bytes=100,
        ),
    ])
    db.flush()
    db.add(OutlineCourse(
        document_id=8801,
        course_code_norm="BDG1001",
        faculty="Khoa Kinh tế",
        department="Bộ môn Kinh tế học",
        parse_status="ok",
    ))
    db.add(OutlineModuleLink(document_id=8801, module_code="BDG1001", source="catalog"))
    db.commit()

    # Chạy fix_module_faculties
    res = fix_module_faculties(db, dry_run=False)
    assert res["applied_changes"] >= 1

    m = db.get(Module, "BDG1001")
    assert m.faculty == "Phòng Đào tạo"
    assert m.department == "Phòng Đào tạo"
    assert m.faculty_source == "admin"

    # Kiểm tra audit row
    rows = audit_module_faculties(db)
    r = next(row for row in rows if row["code"] == "BDG1001")
    assert r["faculty_chuẩn"] == "Phòng Đào tạo"
    assert r["nguồn"] == "override"
    assert r["kết_luận"] == "chỉ định tay"

    # resolve_module_faculty cũng trả về đúng giá trị override
    fac, dept = resolve_module_faculty(db, "BDG1001")
    assert fac == "Phòng Đào tạo"
    assert dept == "Phòng Đào tạo"






