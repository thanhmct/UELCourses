from sqlalchemy import select

from app.models import Module, Program, ProgramCatalogEntry, ProgramModule
from app.models import ModuleRelation
from app.services.catalog_programs import build_catalog_programs, prev_codes


def test_prev_codes_keeps_codes_only():
    assert prev_codes("[BAA2028]Nguyên lý kế toán") == "BAA2028"
    assert prev_codes("[BEE1037]Kinh tế vi mô, [BEE1038]Kinh tế vĩ mô") == "BEE1037, BEE1038"
    assert prev_codes("BMA2045, Nhập môn phân tích dữ liệu") == "BMA2045"
    assert prev_codes("Luật Hiến pháp; Luật Hành chính") is None   # văn bản tự do, không có mã
    assert prev_codes("7340115_417_Chuyên ngành Digital Marketing") is None
    assert prev_codes(None) is None and prev_codes("") is None


def _entry(i, label, sheet, cat, code, term, req="X", prev=None, credits=3):
    return ProgramCatalogEntry(id=f"e{i}", program_label=label, track_label=sheet, category=cat, module_code=code,
                               module_name=f"Môn {code}", term=term, credits=credits, required_raw=req, previous_raw=prev,
                               source_file="f.xlsx", source_sheet=sheet, source_row=i)


def test_build_k25_from_catalog(db):
    db.add(Program(id="K24404", name="Tài chính - Ngân hàng Khoá 24", cohort="K24", faculty="Khoa Tài chính - Ngân hàng"))
    db.add(Module(code="BFF1001", name="Môn BFF1001"))
    db.flush()
    db.add_all([
        _entry(1, "Tài chính - Ngân hàng", "1. Dữ liệu gốc", "curriculum_source", "BFF1001", "HK01"),
        _entry(2, "Tài chính - Ngân hàng", "1. Dữ liệu gốc", "curriculum_source", "BFF2002", "HK03", req="", prev="[BFF1001]Môn BFF1001 và tên dài"),
        _entry(3, "Tài chính - Ngân hàng", "1. Dữ liệu gốc", "curriculum_source", "BFF2002", "HK04"),  # trùng mã: bỏ
        _entry(4, "Tài chính - Ngân hàng", "2. TCNH (TA)", "track_or_review", "BFF1001", None),  # không có kỳ: bỏ
        _entry(5, "Luật", "1. Dữ liệu gốc", "curriculum_source", "BLB1001", "HK02"),
        _entry(6, "Kế toán", "1. DLG Kế toán", "curriculum_source", "BAA1001", "HK01"),
        _entry(7, "Kế toán", "1 DLG Kế toán (E)", "curriculum_source", "BAA1001", "HK02"),
    ])
    db.commit()

    res = build_catalog_programs(db, "K25")
    ids = {p["id"] for p in res["programs"]}
    assert ids == {"K25404", "K25LUAT", "K25405", "K25405-V2"}
    assert res["duplicate_rows_dropped"] == 1

    p = db.get(Program, "K25404")
    assert p.cohort == "K25" and p.source == "catalog2025" and p.faculty == "Khoa Tài chính - Ngân hàng"
    mods = {pm.module_code: pm for pm in db.scalars(select(ProgramModule).where(ProgramModule.program_id == "K25404"))}
    assert set(mods) == {"BFF1001", "BFF2002"}
    assert mods["BFF1001"].required is True and mods["BFF2002"].required is False
    assert (mods["BFF1001"].suggested_order, mods["BFF2002"].suggested_order) == (1, 3)
    assert mods["BFF2002"].suggested_semester is None  # catalog không có năm học
    assert mods["BFF2002"].previous_raw == "BFF1001"
    rel = {(r.source, r.target, r.type) for r in db.scalars(select(ModuleRelation).where(ModuleRelation.program_id == "K25404"))}
    assert rel == {("BFF1001", "BFF2002", "previous")}  # không có "mã" rác sinh từ tên môn
    assert db.get(Module, "BFF2002") is not None  # môn thiếu được tạo như đường nhập CTĐT chuẩn
    assert db.get(Program, "K25405-V2").name == "Kế toán – DLG Kế toán (E) Khóa 25"

    again = build_catalog_programs(db, "K25")  # idempotent
    assert len(db.scalars(select(ProgramModule).where(ProgramModule.program_id == "K25404")).all()) == 2
    assert again["imported"] == res["imported"]
