from app.services.importer import clean_module_name


def test_bo_hau_to_o_trong_kieu_dash_sao():
    assert clean_module_name("Kế toán tài chính - *") == "Kế toán tài chính"
    assert clean_module_name("Kinh tế quốc tế – *") == "Kinh tế quốc tế"


def test_giu_nguyen_ten_co_dau_sao_khac():
    assert clean_module_name("Kiểm toán (Assurance - CFAB)*") == "Kiểm toán (Assurance - CFAB)*"
    assert clean_module_name("Xác suất thống kê - Lớp vét *1TC") == "Xác suất thống kê - Lớp vét *1TC"


def test_none_va_chuoi_thuong():
    assert clean_module_name(None) is None
    assert clean_module_name("Kế toán tài chính") == "Kế toán tài chính"
