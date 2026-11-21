"""Luật trích 'Thông tin tổng quát' và 'Tài liệu' — mỗi mẫu bố cục dưới đây lấy từ đề cương thật (pdftotext -layout)."""
import pytest

from app.services.outline_parse import best_materials, normalize_text, parse_general, parse_materials, split_sections


def g(block: str) -> dict:
    return parse_general(block, "")


def test_name_same_line_single_space():
    d = g("Tên học phần tiếng Việt Cơ sở dữ liệu\nTên học phần tiếng Anh Database\nMã học phần        BUS1206\n")
    assert (d["name_vi"], d["name_en"], d["course_code"]) == ("Cơ sở dữ liệu", "Database", "BUS1206")


def test_name_wrapped_label_value_in_middle_vi():
    d = g("     Tên học phần tiếng\n                                QUẢN TRỊ RỦI RO NGÂN HÀNG\n     Việt\n"
          "     Tên học phần tiếng\n                                RISK MANAGEMENT IN BANKING\n     Anh\n     Mã học phần                BFF4072\n")
    assert d["name_vi"] == "QUẢN TRỊ RỦI RO NGÂN HÀNG"
    assert d["name_en"] == "RISK MANAGEMENT IN BANKING"
    assert d["course_code"] == "BFF4072"


def test_name_wrapped_label_en():
    d = g("     Course Name\n                           QUẢN TRỊ TÀI CHÍNH\n     (Vietnamese)\n"
          "     Course Name (English) Financial Management\n     Course Code           EFF2045\n")
    assert d["name_vi"] == "QUẢN TRỊ TÀI CHÍNH"
    assert d["name_en"] == "Financial Management"
    assert d["course_code"] == "EFF2045"


def test_name_does_not_take_english_line_as_vietnamese_or_vice_versa():
    d = g("Tên học phần tiếng Việt\nTên học phần tiếng Anh Introduction to Law\nMã học phần  LAW1001\n")
    assert d["name_vi"] is None
    assert d["name_en"] == "Introduction to Law"


def test_name_bullet_and_colon_layout():
    d = g("1.1. Tên môn học\n      - Tiếng Việt: NHỮNG VẤN ĐỀ CƠ BẢN\n      - Tiếng Anh: FUNDAMENTAL ISSUES\n1.2. Mã số môn học: LAW1021\n")
    assert (d["name_vi"], d["name_en"], d["course_code"]) == ("NHỮNG VẤN ĐỀ CƠ BẢN", "FUNDAMENTAL ISSUES", "LAW1021")


def test_name_continuation_line_is_joined_but_code_line_is_not():
    d = g(" Tên học phần tiếng Việt      NHẬP MÔN NGÀNH LUẬT VÀ ĐẠO ĐỨC NGHỀ\n                              LUẬT\n\n"
          " Tên học phần tiếng Anh       Introduction to legal major\n Mã học phần\n")
    assert d["name_vi"] == "NHẬP MÔN NGÀNH LUẬT VÀ ĐẠO ĐỨC NGHỀ LUẬT"
    d2 = g("Tên học phần tiếng Việt     Luật Môi trường\nTên học phần tiếng Anh      ENVIRONMENTAL LAW\n                            BLB4015\n"
           "                            Kiến thức đại cương\n")
    assert d2["name_en"] == "ENVIRONMENTAL LAW"


@pytest.mark.parametrize("block", [
    "Mã học phần              XXXXXXXXXX\n",   # ô mẫu chưa điền
    "Mã học phần\n                  Kiến thức đại cương\nThuộc khối kiến thức\n",  # ô trống: không lấy giá trị của ô kế bên
    "Mã học phần   (COOP Propram)\n",         # không có chữ số
])
def test_course_code_placeholder_or_blank_is_none(block):
    assert g(block)["course_code"] is None


def test_course_code_not_polluted_by_next_row_value():
    d = g("Mã học phần                BUS 1206\n                           Kiến thức chuyên ngành\nThuộc khối kiến thức   Bắt buộc\n")
    assert d["course_code"] == "BUS 1206"


def test_language_and_lecturers_value_between_wrapped_label_parts():
    d = g("Ngôn ngữ sử dụng trong\n                            Tiếng Anh\ngiảng dạy\n"
          "Các giảng viên phụ trách\n                            ThS. Lâm Hồng Thanh, ThS. Trần Quang Thân\ngiảng dạy\nCác giảng viên trợ giảng\n")
    assert d["teaching_language"] == "Tiếng Anh"
    assert d["lecturers"] == ["ThS. Lâm Hồng Thanh, ThS. Trần Quang Thân"] or "ThS. Lâm Hồng Thanh" in d["lecturers"][0]
    assert d["assistants"] is None


def test_language_label_fragments_are_not_values():
    for block in ("Ngôn ngữ sử dụng trong giảng\n                    Tiếng Việt\ndạy\n",
                  "Ngôn ngữ sử dụng trong giảng       Tiếng Việt\ndạy\n"):
        assert g(block)["teaching_language"] == "Tiếng Việt"
    assert g("Ngôn ngữ sử dụng trong\ngiảng dạy\nCác giảng viên phụ trách  X\n")["teaching_language"] is None


def test_lecturers_continuation_in_value_column_and_no_duplication():
    d = g("Các giảng viên phụ trách   PGS. TS. Phạm Hoàng Uyên, TS. Nguyễn Phúc Sơn.,\n"
          "giảng dạy                  TS. Lê Thanh Hoa\nCác giảng viên trợ giảng\n")
    assert "Lê Thanh Hoa" in " ".join(d["lecturers"])
    d = g("Các giảng viên phụ trách   Ths. Trương Hoài Phan, TS. Trần Duy Thanh, Ths.\n"
          "giảng dạy                  Nguyễn Quang Phúc\n"
          "                           Ths. Trương Hoài Phan, TS. Trần Duy Thanh, Ths.\nCác giảng viên trợ giảng\n")
    assert " ".join(d["lecturers"]).count("Trương Hoài Phan") == 1


def test_level_and_major_program_label_ambiguity():
    assert g("Level   Bachelor\nProgram   Accounting\n")["major"] == "Accounting"
    d = g("Program      Bachelor\nMajors       Accounting\n")
    assert d["level"] == "Bachelor" and d["major"] == "Accounting"


# ----------------------------------------------------------------------------- tài liệu
def test_materials_bracket_numbers_headings_and_software():
    body = ("(Các giáo trình, tài liệu tham khảo, các phần mềm, không quá 5 cuốn)\nGiáo trình:\n[1] [GT1] Hoffer, Modern Database\nManagement 12th, Prentice Hall\n"
            "Tài liệu khác:\n[2] Database Design and Relational Theory, 2020\nPhần mềm:\n[3] Microsoft SQL Server 2020\n")
    m = parse_materials(body)
    assert [(x["kind"], x["citation"][:12]) for x in m] == [("textbook", "Hoffer, Mode"), ("reference", "Database Des"), ("software", "Microsoft SQ")]
    assert "Management 12th" in m[0]["citation"]


def test_materials_page_number_noise_and_parenthesized_numbers():
    m = parse_materials("Tài liệu chính: Bài giảng của giảng viên.\nTài liệu tham khảo:\n\n   2\n(3) Nguyễn Đình Phan (2007), Giáo trình Kinh tế.\n(4) Smith (2010), Economics.\n")
    assert [x["kind"] for x in m] == ["textbook", "reference", "reference"]
    assert m[0]["citation"] == "Bài giảng của giảng viên."


def test_materials_unnumbered_entries_split_on_sentence_end():
    m = parse_materials("Giáo trình:\nPGS.TS Ngô Hữu Phước, Giáo trình Luật biển, Nhà xuất bản Chính trị,\n2018.\n"
                        "Tài liệu khác:\nĐại học Luật Hà Nội, Giáo trình Luật Quốc tế (NXB Công an,\n2020).\n")
    assert [(x["kind"], x["citation"].endswith(("2018.", "2020)."))) for x in m] == [("textbook", True), ("reference", True)]


def test_materials_stop_at_next_section_and_cap_length():
    m = parse_materials("1. Giáo trình A (2020).\n2. Sách B (2019).\n4. Mục tiêu học phần\n3. Không phải tài liệu\n")
    assert len(m) == 2
    long_tail = "\n".join(["tiếp nối"] * 400)
    m = parse_materials("1. Sách rất dài\n" + long_tail)
    assert len(m[0]["citation"]) < 700


def test_best_materials_uses_loose_heading_when_section_not_detected():
    text = "KẾ HOẠCH\nTài liệu học tập\nGiáo trình chính:\n1. Sách A (2020).\n2. Sách B (2019).\n4. Mục tiêu học phần\n"
    assert len(best_materials(split_sections(text), text)) == 2


def test_best_materials_picks_section_with_most_items():
    text = ("3. Tài liệu học tập\n1. Sách A (2020).\n2. Sách B (2019).\n3. Sách C (2018).\n"
            "5. Tài liệu giảng dạy khác\n1. Chỉ một\n")
    secs = split_sections(text)
    assert len(best_materials(secs)) == 3


def test_section_headings_without_space_after_number_and_typos():
    text = ("ĐỀ CƯƠNG\n1.Thông tin tổng quát:\nTên học phần tiếng Việt   X\n2.Mô tả học phần\nabc\n3.Tài liệu học tập\n1. Sách A (2020).\n")
    assert [s["kind"] for s in split_sections(text)] == ["front", "general", "description", "materials"]
    text = "COURSE SYLLABUS\n1.General Information\nCourse name   Y\n2. Course description\nabc\n"
    assert [s["kind"] for s in split_sections(text)] == ["front", "general", "description"]
    text = "COURSE SYLLABUS\n1.​      Gneral infomation::\nCourse name   Y\n2. Course description\nabc\n"
    assert "general" in [s["kind"] for s in split_sections(normalize_text(text))]  # parse_document luôn bỏ ký tự vô hình (U+200B) trước


def test_subsection_numbers_are_not_section_headings():
    text = "1. Thông tin tổng quát\n1.1. Tên môn học\n1.2. Mô tả học phần\nabc\n"
    assert [s["kind"] for s in split_sections(text)] == ["general"]
