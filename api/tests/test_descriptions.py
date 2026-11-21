from app.models import Module, OutlineCourse, OutlineDocument, OutlineModuleLink
from app.services.descriptions import clean_description, detect_lang, fill_descriptions

VI = "Môn học cung cấp cho sinh viên kiến thức nền tảng về kinh tế vi mô, hành vi người tiêu dùng và cấu trúc thị trường."
EN = "This course introduces the foundations of microeconomics, consumer behaviour and market structures for first-year students."


def _doc(db, i, code, desc, status="partial"):
    db.add(OutlineDocument(id=i, sha256=f"{i:064d}", file_name=f"{i}.pdf", rel_path=f"x/{i}.pdf", size_bytes=1))
    db.flush()
    db.add(OutlineCourse(document_id=i, doc_type="outline", description=desc, parse_status=status))
    db.add(OutlineModuleLink(document_id=i, module_code=code, source="catalog"))


def test_detect_and_clean():
    assert detect_lang(VI) == "vi" and detect_lang(EN) == "en"
    assert clean_description(None) is None and clean_description("ngắn") is None   # quá ngắn
    assert clean_description("x" * 3000) is None                                   # quá dài (phân tích nuốt mục khác)
    assert clean_description("  " + EN.replace(" ", "   ") + "\n\n\n\n") == EN  # gọn khoảng trắng và dòng trống thừa


def test_fill_routes_by_language_and_copies_from_counterpart(db):
    db.add_all([
        Module(code="BEE1037", name="Kinh tế vi mô", counterpart_code="EEE1037"),
        Module(code="EEE1037", name="Microeconomics (E)", counterpart_code="BEE1037"),
        Module(code="BAA1", name="Chỉ có bản Việt"),
        Module(code="BAA2", name="Nhập tay", description="Mô tả viết tay", description_en=None),
        Module(code="BAA3", name="Không có đề cương"),
    ])
    db.flush()
    _doc(db, 1, "BEE1037", VI)                     # đề cương tiếng Việt của bản Việt
    _doc(db, 2, "EEE1037", EN, status="failed")     # đề cương tiếng Anh của bản Anh (parse failed nhưng đoạn mô tả hợp lệ)
    _doc(db, 3, "BAA1", VI)
    _doc(db, 4, "BAA2", EN)
    db.commit()

    res = fill_descriptions(db)
    g = lambda c: db.get(Module, c)  # noqa: E731
    # bản Việt: có VI từ đề cương, EN chép từ bản Anh tương ứng
    assert g("BEE1037").description == VI and g("BEE1037").description_source == "outline"
    assert g("BEE1037").description_en == EN and g("BEE1037").description_en_source == "counterpart"
    # bản Anh: có EN từ đề cương, VI chép từ bản Việt
    assert g("EEE1037").description_en == EN and g("EEE1037").description_en_source == "outline"
    assert g("EEE1037").description == VI and g("EEE1037").description_source == "counterpart"
    # chỉ một ngôn ngữ, không có bản tương ứng: bản còn lại NULL (không dịch)
    assert g("BAA1").description == VI and g("BAA1").description_en is None
    # mô tả nhập tay không bị ghi đè; EN lấy từ đề cương
    assert g("BAA2").description == "Mô tả viết tay" and g("BAA2").description_source is None
    assert g("BAA2").description_en == EN
    assert g("BAA3").description is None and g("BAA3").description_en is None
    assert res["kept_manual"]["vi"] == 1
    assert fill_descriptions(db) == res  # idempotent


def test_api_returns_both_descriptions(client, db):
    db.add(Module(code="D1", name="Môn D1", description=VI, description_source="outline", description_en=EN,
                  description_en_source="outline", search_text="d1 mon d1"))
    db.commit()
    item = [i for i in client.get("/api/modules", params={"q": "d1"}).json()["items"] if i["code"] == "D1"][0]
    assert item["description"] == VI and item["description_en"] == EN
    detail = client.get("/api/modules/D1").json()
    assert detail["description"] == VI and detail["description_en"] == EN
