"""Document graph: nodes = documents (+ optional articles); edges = supersedes / amends / references / guides."""
from __future__ import annotations

from typing import Any

from .models import RegulationDoc, anchor_for
from .validity import cohort_applies, doc_label

EDGE_TYPES = ("supersedes", "amends", "references", "guides")


def build_graph(docs: list[RegulationDoc], backlinks: dict[str, list[dict[str, Any]]],
                cohort: str | None = None, include_articles: bool = False,
                articles: dict[str, list[dict[str, Any]]] | None = None,
                catalog_extra: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    """`backlinks` is Vault.backlinks ({to_doc_id: [{from_doc_id, from_anchor, to_anchor, edge}]}).

    `catalog_extra` may hold {doc_id: {"amends": [...], "guides": [...]}} from catalog fields.
    """
    by_id = {d.doc_id: d for d in docs}
    keep = {d.doc_id for d in docs if cohort is None or cohort_applies(d, cohort, by_id)}
    nodes: list[dict[str, Any]] = []
    for d in docs:
        if d.doc_id not in keep:
            continue
        nodes.append({"id": d.doc_id, "label": doc_label(d) if d.decision_no else d.title, "title": d.title,
                      "type": "doc", "status": d.status, "cohorts": list(d.applies_to_cohorts),
                      "indexed": d.indexed})
    edges: dict[tuple[str, str, str], dict[str, Any]] = {}

    def add(src: str, dst: str, typ: str) -> None:
        if src == dst:
            return
        key = (src, dst, typ)
        if key in edges:
            edges[key]["weight"] += 1
        else:
            edges[key] = {"source": src, "target": dst, "type": typ, "weight": 1}

    for d in docs:
        if d.doc_id not in keep:
            continue
        for old in d.supersedes or []:
            if old in keep:
                add(d.doc_id, old, "supersedes")
        if d.superseded_by and d.superseded_by in keep:
            add(d.superseded_by, d.doc_id, "supersedes")
        for typ in ("amends", "guides"):
            targets = list(getattr(d, typ, []) or []) + list((catalog_extra or {}).get(d.doc_id, {}).get(typ, []) or [])
            for tgt in targets:
                if tgt in keep:
                    add(d.doc_id, tgt, typ)
    # dedupe supersedes added from both directions
    for (s, t, typ), e in list(edges.items()):
        if typ == "supersedes":
            e["weight"] = 1

    art_nodes: set[str] = set()
    for target, items in backlinks.items():
        for b in items:
            src, edge = b["from_doc_id"], b.get("edge", "references")
            if src not in keep or target not in keep:
                continue
            if include_articles:
                s_node = _art_node(src, b.get("from_anchor"))
                t_node = _art_node(target, b.get("to_anchor"))
                for n in (s_node, t_node):
                    if n != src and n != target and n not in art_nodes:
                        art_nodes.add(n)
                if s_node != src:
                    add(src, s_node, "contains")
                if t_node != target:
                    add(target, t_node, "contains")
                if s_node != t_node:
                    add(s_node, t_node, edge)
            elif src != target:
                add(src, target, edge)
    if include_articles:
        for n in sorted(art_nodes):
            doc_id, anchor = n.split("#", 1)
            nodes.append({"id": n, "label": _art_label(anchor), "type": "article", "doc_id": doc_id,
                          "status": by_id[doc_id].status if doc_id in by_id else None,
                          "cohorts": list(by_id[doc_id].applies_to_cohorts) if doc_id in by_id else []})
    return {"nodes": nodes, "edges": list(edges.values())}


def _art_node(doc_id: str, anchor: str | None) -> str:
    if not anchor:
        return doc_id
    art = anchor.split("-khoan-")[0]
    return f"{doc_id}#{art}"


def _art_label(anchor: str) -> str:
    return "Điều " + anchor.removeprefix("dieu-").split("-p")[0]


__all__ = ["build_graph", "EDGE_TYPES", "anchor_for"]
