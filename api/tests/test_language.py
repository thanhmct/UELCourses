import pytest

from app.models import Module
from app.services.language import CNTN_ENGLISH_CONFIRMED, classify_languages, counterpart_of, is_talent, language_of


@pytest.mark.parametrize(
    "code,name,expected",
    [
        ("EEE1038", "Kinh tế vĩ mô (E)", ("en", "code_and_name")),
        ("EIE3004", "Cơ sở dữ liệu", ("en", "code_pattern")),
        ("BEE1038", "Kinh tế vĩ mô", ("vi", "default")),
        ("MI71", "Phân tích dữ liệu (E)", ("en", "name_marker")),
        ("EC01", "Nhập môn ngành Kinh tế học", ("vi", "legacy_e_code")),  # mã cũ bắt đầu bằng E nhưng không phải tiếng Anh
        ("EN21", "Tiếng Anh 1", ("vi", "legacy_e_code")),
        ("EKTT017", "Luật kinh doanh quốc tế - CNTN", ("en", "cntn_confirmed")),  # CNTN: tên tiếng Việt nhưng dạy bằng tiếng Anh
        ("EUUT071", "Khóa luận tốt nghiệp", ("en", "cntn_confirmed")),
        ("EAUT021", "Phân tích Báo cáo tài chính (E)", ("en", "code_and_name")),  # dạng E+XX+T+số + "(E)"
        ("EAUT099", "Môn giả định chưa xác nhận", ("en", "code_pattern")),  # cùng dạng mã tài năng, chưa nằm trong danh sách xác nhận
        ("BBBT068", "Kỹ năng lãnh đạo (Leadership) - CNTN", ("vi", "default")),  # bản tiếng Việt của CNTN
        ("BBU 402501", None, ("vi", "default")),
        (None, None, ("vi", "default")),
    ],
)
def test_language_of(code, name, expected):
    assert language_of(code, name) == expected


def test_confirmed_list_has_29_codes():
    assert len(CNTN_ENGLISH_CONFIRMED) == 29


def test_is_talent():
    assert is_talent("EKTT017", None)
    assert is_talent("BBBT068", "Kỹ năng lãnh đạo - CNTN")
    assert is_talent("BKTT067", None)  # mã dạng B+XX+T+số
    assert is_talent("MBM4016", "Môn X - CNTN")  # tên có CNTN
    assert not is_talent("EEE1038", "Kinh tế vĩ mô (E)")
    assert not is_talent("BEE1038", "Kinh tế vĩ mô")


def test_counterpart():
    codes = {"EEE1038", "BEE1038", "EIE3004", "EBBT068", "BBBT068"}
    assert counterpart_of("EEE1038", codes) == "BEE1038"
    assert counterpart_of("BEE1038", codes) == "EEE1038"
    assert counterpart_of("EIE3004", codes) is None
    assert counterpart_of("EBBT068", codes) == "BBBT068"  # cặp CNTN Anh–Việt
    assert counterpart_of("BBBT068", codes) == "EBBT068"


def test_classify_languages_updates_modules(db):
    db.add_all([Module(code="EEE1038", name="Kinh tế vĩ mô (E)"), Module(code="BEE1038", name="Kinh tế vĩ mô"),
                Module(code="EC01", name="Nhập môn ngành Kinh tế học"),
                Module(code="EBBT068", name="Kỹ năng lãnh đạo (Leadership) - CNTN"),
                Module(code="BBBT068", name="Kỹ năng lãnh đạo (Leadership) - CNTN")])
    db.commit()
    res = classify_languages(db)
    assert res["modules_en"] == 2 and res["modules_vi"] == 3 and res["pairs"] == 2 and res["legacy_e_code"] == 1
    en = db.get(Module, "EEE1038")
    assert (en.language_track, en.counterpart_code, en.is_talent_program) == ("en", "BEE1038", False)
    assert db.get(Module, "EC01").language_basis == "legacy_e_code"
    cntn = db.get(Module, "EBBT068")
    assert (cntn.language_track, cntn.language_basis, cntn.is_talent_program, cntn.counterpart_code) == ("en", "cntn_confirmed", True, "BBBT068")
    assert db.get(Module, "BBBT068").is_talent_program is True
