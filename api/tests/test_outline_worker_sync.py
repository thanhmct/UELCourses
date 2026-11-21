"""colab/outline_worker.py chép lại classify_table của outline_parse (notebook Colab không có mã API): phải cho cùng kết quả."""
import importlib.util
from pathlib import Path

import pytest

from app.services.outline_parse import classify_table

pytest.importorskip("pymupdf")
_spec = importlib.util.spec_from_file_location("outline_worker", Path(__file__).resolve().parents[2] / "colab" / "outline_worker.py")
worker = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(worker)

HEADERS = [
    ["Mục tiêu (COx)", "Mô tả", "CĐR (CLOx)", "TĐNL"],
    ["Objectives (COx) (1)", "Descriptions (2)", "Course learning outcomes (CLOx) (3)", "Bloom’s scale (4)"],
    ["CĐR", "Mô tả CĐR", "Mức độ giảng dạy"],
    ["CLOx", "Description", "Teaching level"],
    ["Thành phần đánh giá", "Bài đánh giá", "CĐR", "Trọng số"],
    ["Assessment component", "Assessment item", "Weight (%)"],
    ["TUẦ N", "Nội dung", "Chuẩn đầu ra"],
    ["Week", "Content", "CLO"],
    ["STT", "Tên tài liệu", "Năm xuất bản"],
    ["CLO (1)", "CLO Description (2)", "Program Learning Outcomes", "Bloom Scale/Teaching Level"],
    ["Assessment Component (1)", "Assessment codes (Ax.x) (2)", "CLO (CLOx) (3)", "Assessment types (4)", "Times (5)", "Proportion (6)"],
    ["Time", "Content", "CLOs", "PLOs", "Teaching and learning activities", "Assessments"],
    ["Số tiết", "Nội dung", "Video bài giảng", "CĐR môn học", "Hoạt động dạy và học", "", "Hoạt động đánh giá"],
    ["Compone nt of assess", "Assessment(Ax.x ) (2)", "CLO (CLOx) (3)", "Assessment criteria (4)", "Period (time) (5)", "Scale (6)"],
    ["Classification", "10-point scale", "100-point scale", "4-point scale"],
    ["Kí hiệu CLO", "Nội dung CLO", "Cần đánh giá mức độ CLO", "Có sử dụng để đánh giá mức độ PLO"],
    ["Fans (1)", "Description of the Complaints (2)", "PLOs", "Level of instruction (I, T, U)"],
    [],
]


@pytest.mark.parametrize("header", HEADERS)
def test_classify_table_in_sync(header):
    assert worker.classify_table(header) == classify_table(header)




ROUND3 = [
    ["General Goals COx", "Description", "Course Learning Outcomes", "Level capacity"],
    ["Learning outcomes (1)", "Description of Objectives (2)", "Program learning outcomes (PLOs)", "Level of instruction (I, T, U)"],
    ["CLO", "Chuẩn đầu ra môn học (CLOs)", "Trình độ năng lực*", "Chuẩn đầu ra CTĐT (PLOs)"],
    ["Evaluation component", "Evaluation code", "CLO", "Criteria", "Duration", "Percentage"],
    ["Class", "Description", "Activities", "CLOs and Evaluation"],
]


@pytest.mark.parametrize("header", ROUND3)
def test_classify_table_round3_in_sync(header):
    assert worker.classify_table(header) == classify_table(header)
