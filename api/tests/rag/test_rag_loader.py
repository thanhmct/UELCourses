import unicodedata

from conftest import make_pdf

from app.rag.loader import diacritic_ratio, load_document, text_quality
from app.rag.segmenter import segment


def test_txt_is_nfc_normalised(tmp_path):
    decomposed = unicodedata.normalize("NFD", "Điều 1. Phạm vi điều chỉnh\n1. Quy chế này áp dụng.")
    p = tmp_path / "a.txt"
    p.write_text(decomposed, encoding="utf-8")
    d = load_document(p)
    assert d.ok
    assert d.text == unicodedata.normalize("NFC", decomposed)
    assert "Điều 1." in d.text


def test_txt_form_feed_pages(tmp_path):
    p = tmp_path / "b.txt"
    p.write_text("Điều 1. A\n1. x\fĐiều 2. B\n1. y", encoding="utf-8")
    d = load_document(p)
    assert [n for n, _ in d.pages] == [1, 2]
    parsed = segment(d.pages)
    assert [a.page for a in parsed.articles] == [1, 2]


def test_html_strips_script_and_keeps_blocks(fixture_dir):
    d = load_document(fixture_dir / "raw" / "qc-tin-chi-2015-mau.html")
    assert d.ok
    assert "console.log" not in d.text
    assert "\nĐiều 5. Đăng ký khối lượng học tập\n" in d.text


def test_docx_with_word_auto_numbering(tmp_path):
    import docx

    doc = docx.Document()
    doc.add_paragraph("Điều 3. Đăng ký học phần")
    doc.add_paragraph("Sinh viên đăng ký học phần trực tuyến.", style="List Number")
    doc.add_paragraph("Sinh viên không được đăng ký trùng lịch.", style="List Number")
    table = doc.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Ô 1"
    table.rows[0].cells[1].text = "Ô 2"
    p = tmp_path / "c.docx"
    doc.save(p)
    d = load_document(p)
    assert d.ok, d.error
    parsed = segment(d.pages)
    art = parsed.articles[0]
    assert art.article == "3"
    assert [c.clause for c in art.clauses] == ["1", "2"]
    assert art.clauses[1].text.startswith("2. Sinh viên không được")
    assert "Ô 1 | Ô 2" in d.text


def test_scanned_pdf_flagged_for_ocr(tmp_path):
    p = tmp_path / "scan.pdf"
    p.write_bytes(make_pdf([[], [], []]))
    d = load_document(p)
    assert d.needs_ocr and d.ocr_reason == "scan"
    assert not d.ok


def test_text_pdf_is_read(tmp_path):
    p = tmp_path / "t.pdf"
    p.write_bytes(make_pdf([["Dieu 1. Pham vi dieu chinh", "1. Quy che nay ap dung cho sinh vien chinh quy."]]))
    d = load_document(p)
    assert not d.needs_ocr, d.warnings
    parsed = segment(d.pages)
    assert parsed.articles[0].article == "1"
    assert parsed.articles[0].clauses[0].text.startswith("1. Quy che")


def test_pdf_without_diacritics_is_rejected(tmp_path):
    line = "Sinh vien phai dang ky toi thieu muoi bon tin chi trong moi hoc ky chinh theo quy dinh"
    p = tmp_path / "ocr.pdf"
    p.write_bytes(make_pdf([["Dieu 5. Dang ky khoi luong hoc tap"] + [f"{i}. {line}" for i in range(1, 6)]]))
    d = load_document(p)
    assert d.needs_ocr and d.ocr_reason == "no_diacritics"


def test_quality_metrics():
    good = "Sinh viên phải đăng ký tối thiểu mười bốn tín chỉ trong mỗi học kỳ chính theo quy định. " * 6
    garbage = "DQc l$p - Tg do Hgnh phtic ndm thdng crAM DOc QUoc cIA cdn cri Quy-lt ai*r vi6n hAnh " * 6
    assert text_quality(good) > 0.9
    assert diacritic_ratio(good) > 0.4
    assert text_quality(garbage) < 0.6
    assert text_quality("ngắn") is None


def test_missing_and_unsupported(tmp_path):
    assert load_document(tmp_path / "nope.pdf").error
    p = tmp_path / "x.doc"
    p.write_bytes(b"\xd0\xcf")
    assert ".doc" in load_document(p).error
