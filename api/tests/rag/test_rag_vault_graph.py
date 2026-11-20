import re

from app.rag.graph import build_graph
from app.rag.vault import build_vault


def test_vault_markdown_structure(index, tmp_path):
    v = build_vault(index.docs, index.articles)
    md = v.docs["QC-DT-2021-MAU"].markdown
    assert md.startswith("---\n") and '\ndoc_id: "QC-DT-2021-MAU"\n' in md
    assert '\napplies_to_cohorts: ["K21", "K22"]\n' in md
    assert "\n## Điều 5. Đăng ký khối lượng học tập ^dieu-5\n" in md
    assert "\n**2.** Khối lượng học tập tối thiểu" in md and " ^dieu-5-khoan-2\n" in md
    assert "\na) 14 tín chỉ đối với sinh viên có kết quả học tập bình thường; ^dieu-5-khoan-2-diem-a\n" in md
    # internal reference "khoản 2 Điều 2 của Quy chế này" -> wikilink to own doc
    assert "[[QC-DT-2021-MAU#^dieu-2-khoan-2|khoản 2 Điều 2 của Quy chế này]]" in md
    # block ids unique (Obsidian requirement)
    ids = re.findall(r" \^([\w-]+)$", md, re.M)
    assert len(ids) == len(set(ids))
    out = v.write(tmp_path / "vault")
    assert (out / "QC-DT-2021-MAU.md").read_text(encoding="utf-8") == md
    assert (out / "_unresolved_links.json").exists()


def test_vault_cross_doc_links_and_backlinks(index):
    v = build_vault(index.docs, index.articles)
    md23 = v.docs["QC-DT-2023-MAU"].markdown
    assert "[[QC-DT-2021-MAU#^dieu-15-khoan-1|khoản 1 Điều 15 Quyết định số 1001/QĐ-ĐHKTL]]" in md23
    back = v.backlinks["QC-DT-2021-MAU"]
    froms = {(b["from_doc_id"], b["from_anchor"], b["to_anchor"]) for b in back}
    assert ("QC-DT-2023-MAU", "dieu-20-khoan-2", "dieu-15-khoan-1") in froms
    assert ("QD-CDR-NN-TH-MAU", "dieu-6-khoan-1", "dieu-15-khoan-1-diem-c") in froms
    assert all(b["context_snippet"] for b in back)
    assert any("08/2021/TT-BGDĐT" in u["text"] for u in v.unresolved)


def test_graph_edges_and_cohort_filter(index):
    v = build_vault(index.docs, index.articles)
    g = build_graph(index.docs, v.backlinks)
    ids = {n["id"] for n in g["nodes"]}
    assert ids == {"QC-DT-2015-MAU", "QC-DT-2021-MAU", "QC-DT-2023-MAU", "QD-CDR-NN-TH-MAU"}
    edges = {(e["source"], e["target"], e["type"]) for e in g["edges"]}
    assert ("QC-DT-2021-MAU", "QC-DT-2015-MAU", "supersedes") in edges
    assert ("QC-DT-2023-MAU", "QC-DT-2021-MAU", "references") in edges
    assert ("QD-CDR-NN-TH-MAU", "QC-DT-2021-MAU", "guides") in edges
    status = {n["id"]: n["status"] for n in g["nodes"]}
    assert status["QC-DT-2015-MAU"] == "superseded"

    g25 = build_graph(index.docs, v.backlinks, cohort="K25")
    assert {n["id"] for n in g25["nodes"]} == {"QC-DT-2023-MAU", "QD-CDR-NN-TH-MAU"}
    assert all(e["source"] in {"QC-DT-2023-MAU", "QD-CDR-NN-TH-MAU"} for e in g25["edges"])


def test_graph_article_nodes(index):
    v = build_vault(index.docs, index.articles)
    g = build_graph(index.docs, v.backlinks, include_articles=True)
    art = {n["id"] for n in g["nodes"] if n["type"] == "article"}
    assert "QC-DT-2021-MAU#dieu-15" in art and "QC-DT-2023-MAU#dieu-20" in art
    edges = {(e["source"], e["target"], e["type"]) for e in g["edges"]}
    assert ("QC-DT-2023-MAU#dieu-20", "QC-DT-2021-MAU#dieu-15", "references") in edges
    assert ("QC-DT-2021-MAU", "QC-DT-2021-MAU#dieu-15", "contains") in edges
