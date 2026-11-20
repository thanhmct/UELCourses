import pytest

from app.rag.links import LinkContext, Resolver, find_references, linkify, resolve_ref

D21, D23, CDR = "QC-DT-2021-MAU", "QC-DT-2023-MAU", "QD-CDR-NN-TH-MAU"


@pytest.fixture()
def resolver(index):
    return Resolver(index.docs, index.articles)


CTX = LinkContext(doc_id=D23, article="20")

CASES = [
    # (text, expected [(target_doc, anchor)] in order)
    ("theo quy định tại khoản 2 Điều 13 Quy chế này", [(D23, "dieu-13-khoan-2")]),
    ("thực hiện theo Điều 5 Quy chế này", [(D23, "dieu-5")]),
    ("theo Điều 16 của Quy chế này", [(D23, "dieu-16")]),
    ("theo quy định tại điểm b khoản 2 Điều 13", [(D23, "dieu-13-khoan-2-diem-b")]),
    ("theo quy định tại khoản 1 Điều này", [(D23, "dieu-20-khoan-1")]),
    ("theo quy định tại khoản 3", [(D23, "dieu-20-khoan-3")]),
    ("theo khoản 1 Điều 15 Quyết định số 1001/QĐ-ĐHKTL", [(D21, "dieu-15-khoan-1")]),
    ("theo Điều 12 QĐ 1001", [(D21, "dieu-12")]),
    ("Quy chế ban hành kèm theo Quyết định số 1001/QĐ-ĐHKTL ngày 15 tháng 7 năm 2021", [(D21, None)]),
    ("áp dụng theo Điều 3 Quy định chuẩn đầu ra ngoại ngữ và tin học ban hành kèm theo Quyết định số 456/QĐ-ĐHKTL",
     [(CDR, "dieu-3")]),
    ("điểm c khoản 1 Điều 15 Quy chế đào tạo ban hành kèm theo Quyết định số 1001/QĐ-ĐHKTL",
     [(D21, "dieu-15-khoan-1-diem-c")]),
    ("căn cứ Quyết định số 1001/QĐ-ĐHKTL và Quyết định số 456/QĐ-ĐHKTL", [(D21, None), (CDR, None)]),
    ("Thông tư số 08/2021/TT-BGDĐT của Bộ Giáo dục và Đào tạo", [(None, None)]),
    ("theo Điều 7 Nghị định số 238/2025/NĐ-CP", [(None, None)]),
    ("theo Điều 9 của Luật Giáo dục đại học", [(None, None)]),
]


@pytest.mark.parametrize("text,expected", CASES)
def test_reference_patterns(resolver, text, expected):
    refs = find_references(text, CTX, resolver)
    assert [(r.target_doc, r.anchor) for r in refs] == expected, [r.to_dict() for r in refs]


def test_linkify_wikilinks_and_unresolved_log(resolver):
    text = "theo khoản 1 Điều 15 Quyết định số 1001/QĐ-ĐHKTL và Thông tư số 08/2021/TT-BGDĐT"
    out, refs = linkify(text, CTX, resolver)
    assert ("[[QC-DT-2021-MAU#^dieu-15-khoan-1|khoản 1 Điều 15 Quyết định số 1001/QĐ-ĐHKTL]]") in out
    assert "Thông tư số 08/2021/TT-BGDĐT" in out and "[[" not in out.split("và", 1)[1]
    assert any("08/2021" in u["text"] for u in resolver.unresolved)


def test_missing_article_falls_back_to_doc(resolver):
    refs = find_references("theo Điều 99 Quyết định số 1001/QĐ-ĐHKTL", CTX, resolver)
    assert refs[0].target_doc == D21 and refs[0].anchor is None and refs[0].resolved
    assert resolver.unresolved and "Điều 99" in resolver.unresolved[-1]["reason"]


def test_edge_kind(resolver):
    refs = find_references("Văn bản này hướng dẫn thực hiện Quyết định số 1001/QĐ-ĐHKTL", CTX, resolver)
    assert refs[0].edge == "guides"
    refs = find_references("sửa đổi, bổ sung một số điều của Quyết định số 1001/QĐ-ĐHKTL", CTX, resolver)
    assert refs[0].edge == "amends"


def test_resolve_ref(resolver):
    r = resolve_ref("Điều 10 QĐ 1001", resolver)
    assert r["doc_id"] == D21 and r["anchor"] == "dieu-10" and r["resolved"]
    r = resolve_ref("khoản 2 Điều 5 Quyết định số 789/QĐ-ĐHKTL", resolver)
    assert (r["doc_id"], r["anchor"]) == (D23, "dieu-5-khoan-2")
    r = resolve_ref("Điều 5", resolver, from_doc=D21)
    assert (r["doc_id"], r["anchor"]) == (D21, "dieu-5")
    assert not resolve_ref("xin chào", resolver)["resolved"]
    assert not resolve_ref("Điều 3 Thông tư 99/2030/TT-X", resolver)["resolved"]
