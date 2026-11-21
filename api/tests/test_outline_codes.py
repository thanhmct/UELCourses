"""Ô mã CO/CLO dính cả phần mô tả: tách mã ra (cột code là varchar(16) trong Postgres)."""
import pytest

from app.services.outline_parse import _split_code, classify_table, tables_from_raw, tables_to_records


@pytest.mark.parametrize("cell,prefix,expected", [
    ("CO1", "CO", ("CO1", "")),
    ("co 2", "CO", ("CO2", "")),
    ("CO1-Trang bị cho người học các kiến thức", "CO", ("CO1", "Trang bị cho người học các kiến thức")),
    ("CO1 Cung cấp cho sinh viên lý thuyết", "CO", ("CO1", "Cung cấp cho sinh viên lý thuyết")),
    ("CO3: Provides students", "CO", ("CO3", "Provides students")),
    ("CLO2.1 Giải thích được", "CLO", ("CLO2.1", "Giải thích được")),
    ("CLO12", "CLO", ("CLO12", "")),
    ("CO123", "CO", (None, "")),   # 3 chữ số: không phải mã mục tiêu
    ("COx", "CO", (None, "")),
    ("Mục tiêu", "CO", (None, "")),
    ("", "CO", (None, "")),
    (None, "CLO", (None, "")),
])
def test_split_code(cell, prefix, expected):
    assert _split_code(cell, prefix) == expected


def test_objectives_and_clos_keep_short_codes_when_description_is_in_code_cell():
    tables = {
        "objectives": [["Mục tiêu (COx)", "Mô tả", "CĐR (CLOx)"],
                       ["CO1 Cung cấp kiến thức nền tảng", "", "CLO1"],
                       ["CO2", "Rèn luyện kỹ năng", "CLO2"]],
        "clos": [["CĐR (CLOx)", "Mô tả CĐR", "Mức độ giảng dạy"],
                 ["CLO1-Trình bày được khái niệm", "", "I"],
                 ["CLO2", "Vận dụng được", "T"]],
    }
    recs = tables_to_records(tables)
    assert [o["code"] for o in recs["objectives"]] == ["CO1", "CO2"]
    assert recs["objectives"][0]["description"] == "Cung cấp kiến thức nền tảng"
    assert recs["objectives"][1]["description"] == "Rèn luyện kỹ năng"
    assert [c["code"] for c in recs["clos"]] == ["CLO1", "CLO2"]
    assert recs["clos"][0]["description"] == "Trình bày được khái niệm"
    assert all(len(r["code"]) <= 16 for r in recs["objectives"] + recs["clos"])


# ----------------------------------------------------------------------------- nhận dạng bảng (bản tiếng Anh / bảng ngắt trang)
@pytest.mark.parametrize("header,kind", [
    (["CLO (1)", "CLO Description (2)", "Program Learning Outcomes", "Bloom Scale/Teaching Level"], "clos"),
    (["Assessment Component (1)", "Assessment codes (Ax.x) (2)", "CLO (CLOx) (3)", "Assessment types (4)", "Proportion (6)"], "assessments"),
    (["Thành phần đánh giá", "Bài đánh giá (Ax.x)", "CĐR môn học", "Tỷ lệ %"], "assessments"),
    (["Time", "Content", "CLOs", "PLOs", "Teaching and learning activities", "Assessments"], "schedule"),
    (["Số tiết", "Nội dung", "Video bài giảng", "CĐR môn học", "Hoạt động dạy và học", "Hoạt động đánh giá"], "schedule"),
    (["Classification", "10-point scale", "100-point scale", "4-point scale"], None),
    (["Tiêu chí", "Chưa đạt", "Đạt yêu cầu", "Tốt", "Rất tốt"], None),
])
def test_classify_table_english_and_translated_headers(header, kind):
    assert classify_table(header) == kind


def test_table_split_across_pages_is_continued_without_header():
    raw = [
        {"page": 3, "rows": [["CĐR (1)", "Mô tả CĐR (2)", "Mức độ giảng dạy (I, T, U)"], ["CLO1", "Trình bày", "I"]]},
        {"page": 4, "rows": [["CLO2", "Vận dụng", "T"], ["CLO3", "Đánh giá", "U"]]},
        {"page": 4, "rows": [["Xếp loại", "Thang 10", "Thang 4"], ["A", "9-10", "4"]]},  # bảng khác, không liên quan
    ]
    recs = tables_to_records(tables_from_raw(raw))
    assert [c["code"] for c in recs["clos"]] == ["CLO1", "CLO2", "CLO3"]


def test_continuation_requires_adjacent_page_and_matching_rows():
    raw = [
        {"page": 3, "rows": [["CĐR (1)", "Mô tả CĐR (2)", "Mức độ giảng dạy"], ["CLO1", "Trình bày", "I"]]},
        {"page": 7, "rows": [["CLO2", "Quá xa trang trước", "T"]]},
    ]
    assert [c["code"] for c in tables_to_records(tables_from_raw(raw))["clos"]] == ["CLO1"]
    raw = [
        {"page": 3, "rows": [["CĐR (1)", "Mô tả CĐR (2)", "Mức độ giảng dạy"], ["CLO1", "Trình bày", "I"]]},
        {"page": 4, "rows": [["Ghi chú", "Không phải CLO", "x"]]},
    ]
    assert [c["code"] for c in tables_to_records(tables_from_raw(raw))["clos"]] == ["CLO1"]


def test_assessment_english_columns_item_code_and_sub_weights():
    raw = [{"page": 4, "rows": [
        ["Assessment Component", "Assessments (Ax.x)", "Course Learning Outcomes", "Evaluation Criteria", "Duration", "Weights (6)", "Sub weights (7)"],
        ["A1. Process Evaluation", "A1.1 Small personal assignment", "CLO1; CLO2", "- Quiz", "15 minutes", "30%", "10%"],
        ["", "A1.2. Teamwork", "CLO2", "- Report", "", "", "20%"],
        ["A2. Final", "A2.1 Exam", "CLO1", "", "60m", "70%", "70%"],
    ]}]
    a = tables_to_records(tables_from_raw(raw))["assessments"]
    assert [(x["item_code"], x["weight_pct"], x["sub_weight_pct"]) for x in a] == [("A1.1", 30.0, 10.0), ("A1.2", None, 20.0), ("A2.1", 70.0, 70.0)]
    assert sum(x["weight_pct"] or 0 for x in a) == 100


def test_assessment_item_code_falls_back_to_component_code_and_ratio_column():
    raw = [{"page": 5, "rows": [
        ["Thành phần đánh giá", "Bài đánh giá", "CĐR môn học", "Tỷ lệ %"],
        ["A1. Đánh giá quá trình", "Tham gia lớp học", "CLO1", "50"],
        ["A2. Đánh giá cuối kỳ", "Bài kiểm tra viết", "CLO2", "50"],
    ]}]
    a = tables_to_records(tables_from_raw(raw))["assessments"]
    assert [(x["item_code"], x["weight_pct"]) for x in a] == [("A1", 50.0), ("A2", 50.0)]


def test_schedule_swapped_week_and_content_columns_and_long_week_label():
    raw = [{"page": 4, "rows": [
        ["Weeks/ Session (1)", "Content (2)", "CLO (3)", "Teaching and Learning activities", "Assessments (5)"],
        ["Chapter 1: Python basics 1.1 What is Python ? 1.2 Install Python 1.3 First program with a very long outline text", "1 -2", "CLO1", "Lecturer", "A1.1"],
        ["3", "Chapter 2: Statements", "CLO1", "Lecturer", "A1.2"],
    ]}]
    s = tables_to_records(tables_from_raw(raw))["schedule"]
    assert s[0]["week_label"] == "1 -2" and s[0]["content"].startswith("Chapter 1")
    assert s[1]["week_label"] == "3" and s[1]["content"] == "Chapter 2: Statements"
    assert all(len(x["week_label"] or "") <= 40 for x in s)


def test_clo_assessment_planning_table_is_not_a_schedule():
    assert classify_table(["Kí hiệu CLO", "Nội dung CLO", "Cần đánh giá mức độ CLO", "Có sử dụng để đánh giá mức độ PLO", "PP/công cụ đánh giá"]) is None


def test_schedule_maps_cdr_column_and_drops_repeated_header_rows():
    raw = [{"page": 5, "rows": [
        ["Tuần/ Buổi học", "Nội dung", "CĐR môn học", "Hoạt động dạy và học", "Bài đánh giá"],
        ["1", "Chương 1: Giới thiệu", "CLO1, CLO2", "Giảng", "A1.1"],
        ["Tuần/ Buổi học (1)", "Nội dung (2)", "CĐR môn học (3)", "Hoạt động dạy và học (4)", "Bài đánh giá (5)"],
        ["(1)", "(2)", "(3)", "(4)", "(5)"],
        ["2", "Chương 2: Cơ bản", "CLO2", "Giảng", "A1.2"],
    ]}]
    s = tables_to_records(tables_from_raw(raw))["schedule"]
    assert [(x["week_label"], x["clo_codes"], x["assessment"]) for x in s] == [("1", ["CLO1", "CLO2"], "A1.1"), ("2", ["CLO2"], "A1.2")]


def test_clo_table_with_non_clo_codes_and_machine_translated_header():
    assert classify_table(["Fans (1)", "Description of the Complaints (2)", "PLOs", "Level of instruction (I, T, U)"]) == "clos"
    raw = [{"page": 4, "rows": [["CĐR", "Mô tả CĐR", "Mức độ giảng dạy (I, T, U)"], ["G1", "- Hệ thống hóa kiến thức", "T"], ["G2", "- Tổng hợp, phân tích", "T, U"]]}]
    c = tables_to_records(tables_from_raw(raw))["clos"]
    assert [(x["code"], x["teaching_levels"]) for x in c] == [("G1", "T"), ("G2", "T, U")]
    raw = [{"page": 4, "rows": [["CĐR", "Mô tả CĐR", "Mức độ giảng dạy"], ["CLO 1", "A", "I"], ["Ghi chú", "không phải mã", ""]]}]
    assert [x["code"] for x in tables_to_records(tables_from_raw(raw))["clos"]] == ["CLO1"]


# ----------------------------------------------------------------------------- tiêu đề bảng thật (vòng 3)
@pytest.mark.parametrize("header,kind", [
    (["General Goals COx", "Description", "Course Learning Outcomes", "Level capacity"], "objectives"),
    (["Mục tiêu chung Gx", "Mô tả", "Chuẩn đầu ra môn học", "Trình độ năng lực"], "objectives"),
    # mẫu ghi nhầm 'Description of Objectives' trong bảng CĐR: cột mức độ giảng dạy cho biết đó là bảng CĐR
    (["Learning outcomes (1)", "Description of Objectives (2)", "Program learning outcomes (PLOs)", "Level of instruction (I, T, U)"], "clos"),
    (["CLO", "Chuẩn đầu ra môn học (CLOs)", "Trình độ năng lực*", "Chuẩn đầu ra CTĐT (PLOs)"], "clos"),
    (["Evaluation component", "Evaluation code", "CLO", "Criteria", "Duration", "Percentage"], "assessments"),
    (["Assessment Component (Ax)", "Assessment Form (Ax.x)", "Proportion (%)", "Course Learning Outcomes"], "assessments"),
    (["Class", "Description", "Activities", "CLOs and Evaluation"], "schedule"),
    (["Score scale system", "Score scale system", "Score scale", "system 4"], None),
    (["Forms", "Teaching and learning activities", "Times", "Duration (hours)", "Total hours"], None),
])
def test_classify_table_round3_headers(header, kind):
    assert classify_table(header) == kind


def test_goal_codes_in_objectives_and_clo_code_in_second_column():
    raw = [
        {"page": 2, "rows": [["Mục tiêu chung Gx", "Mô tả", "Chuẩn đầu ra môn học", "Trình độ năng lực"], ["G1", "Hiểu kiến thức", "CLO1", "3"]]},
        {"page": 3, "rows": [["G2", "Vận dụng", "CLO2", "4"]]},  # nối tiếp qua trang, mã G
        {"page": 3, "rows": [["No.", "Course Learning Outcomes", "Level capacity", "Program Learning Outcomes"],
                             ["1", "CLO1: Analyze and evaluate the impact", "4", "PLO1"], ["2", "CLO2: Evaluate sourcing issues", "4", "PLO2"]]},
    ]
    rec = tables_to_records(tables_from_raw(raw))
    assert [o["code"] for o in rec["objectives"]] == ["G1", "G2"]
    assert [(c["code"], c["description"]) for c in rec["clos"]] == [("CLO1", "Analyze and evaluate the impact"), ("CLO2", "Evaluate sourcing issues")]


def test_level_columns_reject_long_sentences_from_shifted_columns():
    raw = [{"page": 3, "rows": [["CĐR", "Mô tả CĐR", "Mức độ giảng dạy (I, T, U)"],
                                ["CLO1", "Trình bày", "I, T"],
                                ["CLO2", "Tranh luận", "Actively search and update documents to debate and participate in social criticism on issues"]]}]
    c = tables_to_records(tables_from_raw(raw))["clos"]
    assert [(x["code"], x["teaching_levels"]) for x in c] == [("CLO1", "I, T"), ("CLO2", None)]
