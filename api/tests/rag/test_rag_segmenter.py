from app.rag.handbook import build_handbook_chunks
from app.rag.models import RegulationDoc
from app.rag.segmenter import build_chunks, segment

SAMPLE = """TRƯỜNG ĐẠI HỌC KINH TẾ - LUẬT
Số: 1268/QĐ-ĐHKTL
Thành phố Hồ Chí Minh, ngày 14 tháng 10 năm 2022
Căn cứ Quyết định số 26/2014/QĐ-TTg ngày 26 tháng 3 năm 2014 của Thủ tướng Chính phủ;

Chương I
QUY ĐỊNH CHUNG
Điều 1. Phạm vi điều chỉnh
và đối tượng áp dụng
1. Quy chế này quy định về đào tạo.
2. Quy chế này áp dụng cho các khóa K22, K23.
Mục 1. ĐĂNG KÝ HỌC PHẦN
Điều 2. Đăng ký học phần
Sinh viên đăng ký học phần theo kế hoạch.
1. Khối lượng tối thiểu:
a) 14 tín chỉ đối với sinh viên bình thường;
b) 10 tín chỉ đối với sinh viên bị cảnh báo
kết quả học tập.
đ) mục đ ngoài thứ tự
2. Sinh viên không đăng ký thì xử lý theo
Điều 5. của Quy chế này.
5. dòng đánh số nhảy cóc được coi là nối tiếp
Chương II. TỔ CHỨC ĐÀO TẠO
Điều 3: Học phí
Học phí thu theo tín chỉ.
"""


def test_structure():
    p = segment(SAMPLE)
    assert [a.article for a in p.articles] == ["1", "2", "3"]
    a1, a2, a3 = p.articles
    assert a1.title == "Phạm vi điều chỉnh và đối tượng áp dụng"  # wrapped title joined
    assert a1.chapter == "Chương I. QUY ĐỊNH CHUNG"
    assert a1.section is None
    assert a2.section == "Mục 1. ĐĂNG KÝ HỌC PHẦN"
    assert a2.intro == "Sinh viên đăng ký học phần theo kế hoạch."
    assert [c.clause for c in a2.clauses] == ["1", "2"]
    pts = a2.clauses[0].points
    assert [x.point for x in pts] == ["a", "b", "đ"]
    assert pts[1].text == "b) 10 tín chỉ đối với sinh viên bị cảnh báo kết quả học tập."
    # a wrapped line starting with "Điều 5. của …" is a continuation, not a new article;
    # "5." after clause 2 is not the next clause number -> continuation as well
    assert a2.clauses[1].text == ("2. Sinh viên không đăng ký thì xử lý theo Điều 5. của Quy chế này. "
                                  "5. dòng đánh số nhảy cóc được coi là nối tiếp")
    assert a3.chapter == "Chương II. TỔ CHỨC ĐÀO TẠO"
    assert a3.title == "Học phí" and a3.intro == "Học phí thu theo tín chỉ."


def test_header_metadata_ignores_can_cu():
    p = segment(SAMPLE)
    assert p.decision_no == "1268/QĐ-ĐHKTL"
    assert p.issued_date == "2022-10-14"


def test_non_sequential_number_is_continuation():
    p = segment("Điều 7. Thi\n1. Thi kết thúc học phần.\n2. Điểm thi làm tròn\n3,5 điểm được giữ nguyên.\n9. không phải khoản")
    c = p.articles[0].clauses
    assert [x.clause for x in c] == ["1", "2"]
    assert c[1].text == "2. Điểm thi làm tròn 3,5 điểm được giữ nguyên. 9. không phải khoản"


def test_inline_article_reference_not_split():
    p = segment("Điều 4. Học lại\n1. Sinh viên học lại theo quy định tại Điều 9 của Quy chế này.")
    assert len(p.articles) == 1
    assert "Điều 9 của Quy chế này" in p.articles[0].clauses[0].text


def test_points_without_clause():
    p = segment("Điều 8. Hồ sơ\nHồ sơ gồm:\na) Đơn;\nb) Bảng điểm.")
    c = p.articles[0].clauses
    assert len(c) == 1 and c[0].clause == "" and c[0].text == "Hồ sơ gồm:"
    assert [x.point for x in c[0].points] == ["a", "b"]


def test_article_numbering_restart_creates_part():
    text = ("QUYẾT ĐỊNH\nĐiều 1. Ban hành kèm theo Quyết định này Quy chế.\nĐiều 2. Hiệu lực thi hành.\n"
            "QUY CHẾ\nĐiều 1. Phạm vi\n1. Nội dung.")
    p = segment(text)
    assert [(a.article, a.part) for a in p.articles] == [("1", 0), ("2", 0), ("1", 1)]
    doc = RegulationDoc(doc_id="X", title="X")
    ids = [c.chunk_id for c in build_chunks(doc, p)]
    assert len(ids) == len(set(ids))
    assert "X:D1p1:K1" in ids


def test_chunks_metadata(fixture_dir):
    from app.rag.loader import load_document

    doc = RegulationDoc(doc_id="QC", title="Quy chế", decision_no="1001/QĐ-ĐHKTL", effective_from="2021-08-01",
                        applies_to_cohorts=["K21"])
    p = segment(load_document(fixture_dir / "raw" / "qc-dao-tao-2021-mau.txt").pages)
    chunks = {c.chunk_id: c for c in build_chunks(doc, p)}
    c = chunks["QC:D5:K2"]
    assert c.article == "5" and c.clause == "2" and c.decision_no == "1001/QĐ-ĐHKTL"
    assert c.heading == "Chương II. TỔ CHỨC ĐÀO TẠO > Mục 1. ĐĂNG KÝ HỌC PHẦN > Điều 5. Đăng ký khối lượng học tập"
    assert [x["point"] for x in c.points] == ["a", "b"]
    assert c.text.startswith("2. Khối lượng học tập tối thiểu") and "a) 14 tín chỉ" in c.text
    assert c.applies_to_cohorts == ["K21"] and c.page == 1
    assert c.anchor() == "dieu-5-khoan-2" and c.anchor("a") == "dieu-5-khoan-2-diem-a"
    assert p.counts() == {"articles": 9, "clauses": 20, "points": 15}


def test_chunks_detach_appendix_and_limit_verbatim_windows():
    clause = "1. Nội dung chính kết thúc tại đây./. 6 PHỤ LỤC I " + ("dữ liệu bảng " * 260)
    parsed = segment("Điều 9. Điều khoản thi hành\n" + clause)
    doc = RegulationDoc(doc_id="QD", title="Quy định", decision_no="9/QĐ-ĐHKTL")

    chunks = build_chunks(doc, parsed)

    assert chunks[0].text == "1. Nội dung chính kết thúc tại đây./."
    assert chunks[0].chunk_type == "clause"
    appendix = chunks[1:]
    assert appendix and all(c.chunk_type == "appendix" for c in appendix)
    assert appendix[0].appendix_label == "Phụ Lục I"
    assert all(len(c.text) <= 1400 for c in chunks)
    assert all(c.text in clause for c in chunks)
    assert [c.window_part for c in appendix] == list(range(1, len(appendix) + 1))
    assert len({c.chunk_id for c in chunks}) == len(chunks)


def test_handbook_contact_values_are_body_evidence():
    doc = RegulationDoc(doc_id="handbook", title="Sổ tay", source_type="handbook")
    chunks = build_handbook_chunks(doc, [(63, "PHÒNG Y TẾ\nY SĨ NGUYỄN THỊ PHI NGA\nSĐT: 0918.181.707")])

    assert any("SĐT: 0918.181.707" in chunk.text for chunk in chunks)
