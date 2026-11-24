"""Bộ đọc đề cương Word: 'Khóa học' (niên khóa) không được nhận nhầm thành 'Khoa' (đơn vị quản lý)."""
from __future__ import annotations

import io

import docx
import pytest

from app.services.outline_docx import _faculty_from_header, _is_faculty_label, parse_docx_document


def _build_docx(header: str, rows: list[tuple[str, str]]) -> io.BytesIO:
    d = docx.Document()
    d.add_paragraph(header)
    d.add_paragraph("ĐỀ CƯƠNG CHI TIẾT HỌC PHẦN")
    d.add_paragraph("1. Thông tin tổng quát:")
    table = d.add_table(rows=0, cols=2)
    for label, value in rows:
        cells = table.add_row().cells
        cells[0].text = label
        cells[1].text = value
    buf = io.BytesIO()
    d.save(buf)
    buf.seek(0)
    return buf


@pytest.mark.parametrize(
    "label,expected",
    [
        ("Khoa", True),
        ("Khoa quản lý", True),
        ("Khoa/Bộ môn", True),
        ("Faculty", True),
        ("Khóa học", False),
        ("Khóa", False),
        ("Khoa học", False),  # 'Khóa học' gõ không dấu
        ("Năm học", False),
        ("Ngành học", False),
        ("", False),
    ],
)
def test_is_faculty_label(label, expected):
    assert _is_faculty_label(label) is expected


@pytest.mark.parametrize(
    "text,expected",
    [
        ("\tTRƯỜNG ĐẠI HỌC KINH TẾ - LUẬT KHOA QUẢN TRỊ KINH DOANH BỘ MÔN QUẢN TRỊ\nĐỀ CƯƠNG", "Khoa Quản trị kinh doanh"),
        ("TRƯỜNG ĐẠI HỌC KINH TẾ - LUẬT KHOA QTKD BỘ MÔN: QUẢN TRỊ\n", "Khoa Quản trị kinh doanh"),
        ("KHOA LUẬT\nBỘ MÔN LUẬT DÂN SỰ", "Khoa Luật"),
        # Chú thích đánh số trong tiêu đề đề cương Luật
        ("TRƯỜNG ĐẠI HỌC KINH TẾ - LUẬT [1] KHOA LUẬT [2] BỘ MÔN LUẬT DÂN SỰ ĐỀ CƯƠNG", "Khoa Luật"),
        # Đề cương tiếng Anh
        ("UNIVERSITY OF ECONOMICS AND LAW FACULTY OF BUSINESS ADMINISTRATION DEPARTMENT OF MARKETING", "Khoa Quản trị kinh doanh"),
        ("FACULTY OF FINANCE AND BANKING\nDETAILED SYLLABUS", "Khoa Tài chính - Ngân hàng"),
        ("không có tiêu đề khoa", None),
        ("KHOA XYZ KHÔNG TỒN TẠI", None),
    ],
)
def test_faculty_from_header(text, expected):
    assert _faculty_from_header(text) == expected


def test_cohort_row_is_not_taken_as_faculty():
    buf = _build_docx(
        "TRƯỜNG ĐẠI HỌC KINH TẾ - LUẬT KHOA QUẢN TRỊ KINH DOANH BỘ MÔN QUẢN TRỊ",
        [
            ("Tên học phần tiếng Việt", "QUẢN TRỊ LỮ HÀNH"),
            ("Mã học phần", "BUS 1407"),
            ("Khóa học", "2023-2027"),
            ("Năm học", "2023"),
            ("Học kỳ", "I, II"),
        ],
    )
    course = parse_docx_document(buf, target_code="BBB5044")["course"]
    assert course["faculty"] == "Khoa Quản trị kinh doanh"
    assert course["faculty"] not in ("2023-2027", "2023")


def test_year_only_faculty_is_dropped_without_header():
    buf = _build_docx(
        "ĐẠI HỌC KINH TẾ - LUẬT",
        [("Tên học phần tiếng Việt", "MÔN X"), ("Khóa học", "K25"), ("Khoa", "2023")],
    )
    course = parse_docx_document(buf, target_code="BBB0001")["course"]
    assert not course.get("faculty")


def test_real_faculty_row_still_used():
    buf = _build_docx(
        "ĐẠI HỌC KINH TẾ - LUẬT",
        [("Tên học phần tiếng Việt", "MÔN Y"), ("Khóa học", "2023-2027"), ("Khoa", "Khoa Luật")],
    )
    course = parse_docx_document(buf, target_code="BLB0001")["course"]
    assert course["faculty"] == "Khoa Luật"
