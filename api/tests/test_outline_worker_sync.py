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
    [],
]


@pytest.mark.parametrize("header", HEADERS)
def test_classify_table_in_sync(header):
    assert worker.classify_table(header) == classify_table(header)
