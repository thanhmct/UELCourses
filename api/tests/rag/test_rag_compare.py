from app.rag.compare import compare, sentence_diff, split_sentences


def test_compare_graduation_k22_vs_k24(index, today):
    r = compare(index, "điều kiện tốt nghiệp", ["K22", "2024"], today)
    rows = {row["cohort"]: row for row in r["rows"]}
    assert rows["K22"]["doc"]["doc_id"] == "QC-DT-2021-MAU" and rows["K22"]["article"] == "15"
    assert rows["K24"]["doc"]["doc_id"] == "QC-DT-2023-MAU" and rows["K24"]["article"] == "15"
    changed = [d for d in r["differences"] if d["type"] == "changed"]
    assert any("120 tín chỉ" in d["a"] and "125 tín chỉ" in d["b"] for d in changed)
    assert any("TOEIC 450" in d["a"] and "bậc 3" in d["b"] for d in changed)
    assert all(d["cohorts"] == ["K22", "K24"] for d in r["differences"])


def test_compare_aligns_renumbered_article(index, today):
    # "Cảnh báo kết quả học tập" is Điều 12 in the 2021 rules but Điều 13 in the 2023 rules
    r = compare(index, "buộc thôi học", ["K21", "K23"], today)
    arts = {row["cohort"]: row["article"] for row in r["rows"]}
    assert arts == {"K21": "12", "K23": "13"}
    assert any(d["type"] == "changed" and "3 lần" in d["a"] and "2 lần" in d["b"] for d in r["differences"])


def test_compare_same_doc(index, today):
    r = compare(index, "học cải thiện điểm", ["K21", "K22"], today)
    assert r["differences"][0]["type"] == "same"


def test_compare_missing_cohort(index, today):
    r = compare(index, "học trực tuyến", ["K21", "K23"], today)
    rows = {row["cohort"]: row for row in r["rows"]}
    assert rows["K23"]["article"] == "7"
    assert any("K21" in w for w in r["warnings"]) or rows["K21"]["doc"] is not None


def test_sentence_diff_units():
    assert split_sentences("1. A b c. D e f;\na) g h") == ["1. A b c.", "D e f;", "a) g h"]
    d = sentence_diff("1. Tối thiểu 14 tín chỉ.\n2. Giữ nguyên.", "1. Tối thiểu 12 tín chỉ.\n2. Giữ nguyên.\n3. Mới.")
    assert [x["type"] for x in d] == ["changed", "added"]
