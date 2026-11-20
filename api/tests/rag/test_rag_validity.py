from datetime import date

import pytest

from app.rag.models import RegulationDoc
from app.rag.validity import (applicable_docs, cohort_applies, cohort_matches, compute_status, expiring,
                              infer_applies_from, normalize_cohort, refresh_statuses, validity_warnings)

T = date(2026, 11, 20)


@pytest.mark.parametrize("raw,expected", [
    ("K22", "K22"), ("k22", "K22"), ("22", "K22"), ("2022", "K22"), ("Khóa 2022", "K22"), (" K 23 ", "K23"),
    (22, "K22"), ("K5", "K05"), ("all", "all"), ("tất cả", "all"), ("", None), (None, None),
])
def test_normalize_cohort(raw, expected):
    assert normalize_cohort(raw) == expected


def test_cohort_matches_specs():
    assert cohort_matches(["K22", "K23"], "2022")
    assert not cohort_matches(["K22", "K23"], "K24")
    assert cohort_matches(["K15-K20"], "K18") and not cohort_matches(["K15-K20"], "K21")
    assert cohort_matches(["2015-2020"], "K16")
    assert cohort_matches(["K23+"], "K30") and not cohort_matches(["K23+"], "K22")
    assert cohort_matches(["từ K23"], "K25")
    assert cohort_matches(["all"], "K99")
    assert cohort_matches([], "K22")  # unknown cohorts: possibly applicable (flagged by a warning)
    assert cohort_matches(["K22"], None)


def _d(doc_id, **kw):
    kw.setdefault("title", doc_id)
    return RegulationDoc(doc_id=doc_id, **kw)


def test_status_rules():
    new = _d("new", effective_from="2026-01-01")
    old = _d("old", effective_from="2020-01-01", superseded_by="new")
    later = _d("later", effective_from="2027-01-01")
    pending_replacement = _d("p", effective_from="2020-01-01", superseded_by="later")
    exp = _d("exp", effective_from="2020-01-01", effective_to="2025-12-31")
    declared = _d("decl", catalog_status="superseded")
    by_id = {x.doc_id: x for x in (new, old, later, pending_replacement, exp, declared)}
    assert compute_status(new, T, by_id) == "active"
    assert compute_status(old, T, by_id) == "superseded"
    assert compute_status(later, T, by_id) == "upcoming"
    assert compute_status(pending_replacement, T, by_id) == "active"
    assert compute_status(exp, T, by_id) == "expired"
    assert compute_status(declared, T, by_id) == "superseded"


def test_supersedes_backfills_superseded_by():
    a, b = _d("a"), _d("b", supersedes=["a"])
    refresh_statuses([a, b], T)
    assert a.superseded_by == "b" and a.status == "superseded" and b.status == "active"


def test_expiring_and_warnings():
    soon = _d("soon", decision_no="1/QĐ", effective_to="2027-01-15", verified=True)
    far = _d("far", decision_no="2/QĐ", effective_to="2028-01-01", verified=True)
    refresh_statuses([soon, far], T)
    assert [d.doc_id for d in expiring([soon, far], T, 90)] == ["soon"]
    w = validity_warnings(soon, T)
    assert any("sắp hết hiệu lực" in x and "15/01/2027" in x for x in w)
    assert validity_warnings(far, T) == []


def test_metadata_unverified_warning():
    w1 = validity_warnings(_d("x", decision_no="", verified=True), T)
    w2 = validity_warnings(_d("y", decision_no="5/QĐ", verified=False), T)
    assert any("metadata chưa được xác minh" in x for x in w1)
    assert any("metadata chưa được xác minh" in x for x in w2)


@pytest.mark.parametrize("text,expected", [
    ("Quy chế này áp dụng từ khóa tuyển sinh K23 trở về sau.", "K23"),
    ("áp dụng cho khóa tuyển sinh từ tháng 09 năm 2025", "K25"),
    ("áp dụng đối với sinh viên từ khóa 2024 trở đi", "K24"),
    ("các khóa tuyển sinh K21 và K22", None),
])
def test_infer_applies_from(text, expected):
    assert infer_applies_from(text) == expected


def test_open_ended_applicability_with_cap():
    old = _d("qc2021", title="Quy chế đào tạo trình độ đại học 2021", applies_to_cohorts=["K21", "K22"],
             effective_from="2021-08-01")
    new = _d("qc2023", title="Quy chế đào tạo trình độ đại học 2023", applies_to_cohorts=["K23"],
             effective_from="2023-08-15", applies_from_cohort="K23")
    other = _d("hocphi", title="Quy định học phí", applies_to_cohorts=["K22"])
    docs = [old, new, other]
    refresh_statuses(docs, T)
    by_id = {d.doc_id: d for d in docs}
    assert cohort_applies(new, "K23", by_id) and cohort_applies(new, "K26", by_id)
    assert not cohort_applies(new, "K22", by_id)
    assert not cohort_applies(old, "K24", by_id)
    assert not cohort_applies(other, "K23", by_id)
    assert [d.doc_id for d in applicable_docs(docs, "2025", T)] == ["qc2023"]


def test_chain_inference_capped_by_later_family_member():
    old = _d("qc-old", title="Quy chế đào tạo trình độ đại học cũ", applies_to_cohorts=["K15"])
    mid = _d("qc-mid", title="Quy chế đào tạo trình độ đại học giữa", applies_to_cohorts=["K22", "K23", "K24"],
             supersedes=["qc-old"])
    new = _d("qc-new", title="Quy chế đào tạo trình độ đại học mới", applies_to_cohorts=["K25", "K26"])
    docs = [old, mid, new]
    refresh_statuses(docs, T)
    by_id = {d.doc_id: d for d in docs}
    assert mid.applies_from_cohort == "K22" and mid.applies_from_source == "chain"
    assert mid.applies_until_cohort == "K24"
    assert not cohort_applies(mid, "K25", by_id)
    assert cohort_applies(new, "K25", by_id) and not cohort_applies(new, "K27", by_id)


def test_fixture_statuses(index):
    st = {d.doc_id: d.status for d in index.docs}
    assert st == {"QC-DT-2015-MAU": "superseded", "QC-DT-2021-MAU": "active",
                  "QC-DT-2023-MAU": "active", "QD-CDR-NN-TH-MAU": "active"}
    new = index.docs_by_id["QC-DT-2023-MAU"]
    assert new.applies_from_cohort == "K23" and new.applies_from_source == "text"
    old = index.docs_by_id["QC-DT-2021-MAU"]
    assert old.applies_until_cohort == "K22"  # chain-inferred open range capped by the 2023 regulation
    ids = lambda c: sorted(d.doc_id for d in applicable_docs(index.docs, c, T))  # noqa: E731
    assert ids("K22") == ["QC-DT-2021-MAU", "QD-CDR-NN-TH-MAU"]
    assert ids("K25") == ["QC-DT-2023-MAU", "QD-CDR-NN-TH-MAU"]
    assert ids("2018") == ["QD-CDR-NN-TH-MAU"]
