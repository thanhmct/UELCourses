from __future__ import annotations

import csv
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.models import Base, Module, OutlineCourse, OutlineDocument, OutlineModuleLink, OutlineSection
from app.services.fill_description_en import (
    clean_english_description,
    fill_description_en,
    is_english_description,
)


def test_is_english_description():
    # Chuỗi tiếng Anh hợp lệ (không dấu tiếng Việt, >= 8 từ thông dụng)
    en_text = (
        "This course provides students with fundamental knowledge and practical skills in financial economics. "
        "Students will explore various analytical methods and learn how to solve real-world economic problems."
    )
    assert is_english_description(en_text) is True

    # Chuỗi tiếng Việt có dấu -> Bị từ chối
    vi_text = (
        "Học phần này cung cấp cho sinh viên kiến thức nền tảng và kỹ năng thực hành về kinh tế học tài chính. "
        "Sinh viên sẽ nghiên cứu các phương pháp phân tích và giải quyết vấn đề."
    )
    assert is_english_description(vi_text) is False

    # Chuỗi tiếng Anh nhưng quá ngắn (< 40 ký tự)
    assert is_english_description("Short intro course.") is False

    # Chuỗi dính tiếng Việt không dấu nhưng thiếu từ tiếng Anh thông dụng
    assert is_english_description("hoc phan nay rat hay va sinh vien se rat thich mon hoc nay") is False


def test_clean_english_description():
    raw = (
        "2. Course Description:\n"
        "This course is designed to introduce students to the essential concepts and techniques of corporate finance. "
        "Students will develop analytical thinking to solve valuation and investment problems.\n\n"
        "3. Course Objectives:\n"
        "- Objective 1: Understand financial valuation\n"
        "- Objective 2: Analyze investments\n"
    )
    cleaned = clean_english_description(raw)
    assert cleaned is not None
    assert cleaned.startswith("This course is designed")
    # Đã cắt bỏ mục kế tiếp "3. Course Objectives"
    assert "3. Course Objectives" not in cleaned
    assert "Objective 1" not in cleaned


def test_clean_english_description_rejoins_words_split_by_pdf_extraction():
    description = "The main content of the course aims to provide students with knowledge related to the nature of taxation."
    raw = "2. Course Description:\n" + "\n\n".join(description.split())
    assert clean_english_description(raw) == description


def test_fill_description_en_two_sample_outlines(tmp_path: Path):
    """Tạo 2 đề cương mẫu nhỏ (1 tiếng Anh, 1 tiếng Việt) chứng minh:
    1. Chỉ lấy mô tả từ bản tiếng Anh cho modules.description_en.
    2. Bản tiếng Việt không được dùng làm description_en (để nguyên rỗng).
    3. Không ghi đè mô tả khi học phần đã có sẵn mô tả.
    4. Cập nhật search_text và đặt description_en_source = 'outline'.
    5. Xuất danh sách môn thiếu ra CSV kèm lý do chính xác.
    """
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        # 1. Môn EAA4014: Chưa có mô tả, có đề cương tiếng Anh
        m1 = Module(code="EAA4014", name="Kế toán tài chính 1 (E)", name_en="Financial Accounting 1", credits=3)
        # 2. Môn EAU4003: Chưa có mô tả, chỉ có đề cương tiếng Việt
        m2 = Module(code="EAU4003", name="Kiểm toán căn bản (E)", name_en="Fundamentals of Auditing", credits=3)
        # 3. Môn EBB1068: ĐÃ CÓ mô tả sẵn -> Không được ghi đè
        m3 = Module(
            code="EBB1068",
            name="Quản trị học (E)",
            name_en="Principles of Management",
            credits=3,
            description_en="Existing pre-set English description that must not be overwritten.",
            description_en_source="manual",
        )
        # 4. Môn EDG1007: Hoàn toàn không có đề cương
        m4 = Module(code="EDG1007", name="Kinh tế vi mô (E)", name_en="Microeconomics", credits=3)

        db.add_all([m1, m2, m3, m4])
        db.flush()

        # Tạo đề cương 1 (TIẾNG ANH) cho EAA4014
        doc_en = OutlineDocument(
            sha256="sha256_sample_en",
            file_name="EAA4014_syllabus.pdf",
            rel_path="outlines/EAA4014.pdf",
            size_bytes=1024,
            language="en",
        )
        db.add(doc_en)
        db.flush()

        db.add(OutlineModuleLink(document_id=doc_en.id, module_code="EAA4014", source="catalog"))
        db.add(OutlineCourse(
            document_id=doc_en.id,
            doc_type="syllabus_en",
            teaching_language="English",
            description=(
                "This course provides students with comprehensive knowledge and understanding of modern financial accounting principles. "
                "Students will learn how to prepare, analyze, and interpret financial statements in accordance with international reporting standards."
            ),
            parse_status="ok",
        ))

        # Tạo đề cương 2 (TIẾNG VIỆT) cho EAU4003
        doc_vi = OutlineDocument(
            sha256="sha256_sample_vi",
            file_name="EAU4003_syllabus.pdf",
            rel_path="outlines/EAU4003.pdf",
            size_bytes=1024,
            language="vi",
        )
        db.add(doc_vi)
        db.flush()

        db.add(OutlineModuleLink(document_id=doc_vi.id, module_code="EAU4003", source="catalog"))
        db.add(OutlineCourse(
            document_id=doc_vi.id,
            doc_type="syllabus_vi",
            teaching_language="Tiếng Việt",
            description=(
                "Học phần này cung cấp cho người học các nguyên tắc, chuẩn mực và kỹ thuật kiểm toán cơ bản "
                "được áp dụng trong quy trình kiểm toán báo cáo tài chính của doanh nghiệp."
            ),
            parse_status="ok",
        ))
        db.commit()

        # Đường dẫn file CSV xuất danh sách môn còn thiếu
        missing_csv = tmp_path / "E_modules_still_missing_description_en.csv"

        # Chạy fill_description_en
        res = fill_description_en(
            db,
            data_dir=tmp_path,
            missing_out=missing_csv,
            dry_run=False,
            only_missing=True,
        )

        assert res["total_e_modules"] == 4
        assert res["before"]["with_description_en"] == 1
        assert res["before"]["without_description_en"] == 3
        assert res["newly_filled"] == 1
        assert res["after"]["with_description_en"] == 2
        assert res["after"]["without_description_en"] == 2

        # 1. EAA4014 nhận được mô tả tiếng Anh từ đề cương mẫu tiếng Anh
        mod_eaa = db.get(Module, "EAA4014")
        assert mod_eaa is not None
        assert mod_eaa.description_en is not None
        assert "comprehensive knowledge and understanding" in mod_eaa.description_en
        assert mod_eaa.description_en_source == "outline"
        assert "eaa4014" in mod_eaa.search_text.lower()

        # 2. EAU4003: Đề cương tiếng Việt -> KHÔNG được lấy làm description_en (vẫn rỗng)
        mod_eau = db.get(Module, "EAU4003")
        assert mod_eau is not None
        assert mod_eau.description_en is None
        assert mod_eau.description_en_source is None

        # 3. EBB1068: Đã có mô tả sẵn -> Không bị ghi đè
        mod_ebb = db.get(Module, "EBB1068")
        assert mod_ebb is not None
        assert mod_ebb.description_en == "Existing pre-set English description that must not be overwritten."
        assert mod_ebb.description_en_source == "manual"

        # 4. Kiểm tra file CSV xuất danh sách thiếu
        assert missing_csv.is_file()
        with missing_csv.open("r", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
            missing_map = {r["code"]: r for r in rows}
            assert "EAU4003" in missing_map
            assert missing_map["EAU4003"]["reason"] == "đề cương chỉ tiếng Việt"
            assert "EDG1007" in missing_map
            assert missing_map["EDG1007"]["reason"] == "không có đề cương"


def test_fill_description_en_counterpart_fallback(tmp_path: Path):
    """Chứng minh khi mã E chưa có đề cương riêng nhưng mã đối ứng (B-code) có phần tiếng Anh,
    hệ thống bóc tách đúng phần tiếng Anh cho mã E."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        # Môn E và môn B đối ứng
        m_e = Module(code="EBB4015", name="Quản trị chuỗi cung ứng (E)", name_en="Supply Chain Management", counterpart_code="BBB4015")
        m_b = Module(code="BBB4015", name="Quản trị chuỗi cung ứng", name_en="Supply Chain Management")
        db.add_all([m_e, m_b])
        db.flush()

        # Đề cương của BBB4015 có đoạn song ngữ (phần tiếng Anh rõ ràng)
        doc_b = OutlineDocument(
            sha256="sha256_bbb4015",
            file_name="BBB4015.pdf",
            rel_path="outlines/BBB4015.pdf",
            size_bytes=2048,
        )
        db.add(doc_b)
        db.flush()

        db.add(OutlineModuleLink(document_id=doc_b.id, module_code="BBB4015"))
        db.add(OutlineSection(
            document_id=doc_b.id,
            kind="description",
            ord=1,
            heading="2. Mô tả học phần / Course Description",
            text=(
                "Mô tả tiếng Việt: Học phần cung cấp kiến thức quản trị chuỗi cung ứng.\n\n"
                "Course Description: This course provides students with comprehensive concepts and analytical methods in supply chain management. "
                "Students will examine logistical operations, procurement strategies, and coordination mechanisms in global business networks."
            ),
        ))
        db.commit()

        missing_csv = tmp_path / "still_missing.csv"
        res = fill_description_en(db, data_dir=tmp_path, missing_out=missing_csv, dry_run=False)

        assert res["newly_filled"] == 1
        mod_e = db.get(Module, "EBB4015")
        assert mod_e is not None
        assert mod_e.description_en is not None
        assert "supply chain management" in mod_e.description_en.lower()
        assert mod_e.description_en_source == "outline"


def test_fill_description_en_uses_reviewed_translation_only_as_last_resort(tmp_path: Path):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        db.add(Module(
            code="EBB3025",
            name="Mô hình kinh doanh số - Lớp vét",
            description="Môn học cung cấp kiến thức về mô hình kinh doanh số trong thời đại công nghệ.",
        ))
        db.commit()

        res = fill_description_en(
            db,
            data_dir=tmp_path,
            missing_out=tmp_path / "missing.csv",
            dry_run=False,
        )

        module = db.get(Module, "EBB3025")
        assert res["newly_filled"] == 1
        assert module is not None
        assert module.description_en_source == "translated"
        assert module.description_en is not None
        assert "Digital Business Models" in module.description_en
        assert "Vị trí" not in module.description_en
