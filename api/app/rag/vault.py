"""Obsidian-style Markdown vault generated from segmented regulations.

Each document -> ``REGULATIONS_DIR/vault/<doc_id>.md``:
  * YAML frontmatter = catalog metadata (values are JSON-encoded, which is valid YAML)
  * ``## Điều N. Tiêu đề ^dieu-N``                       (heading + Obsidian block id)
  * ``**M.** nội dung khoản ^dieu-N-khoan-M``            (one paragraph per Khoản)
  * ``a) nội dung điểm ^dieu-N-khoan-M-diem-a``          (one paragraph per Điểm)
  * cross references -> ``[[doc_id#^dieu-10-khoan-2|khoản 2 Điều 10]]``
Open the folder as a vault in Obsidian: links, backlinks and graph view work natively.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .links import Backlink, LinkContext, Ref, Resolver, build_backlinks, linkify, snippet
from .handbook import SUMMARY_WARNING
from .models import Chunk, RegulationDoc, anchor_for

_LABEL_RE = re.compile(r"^(\d{1,2})\.\s*")


@dataclass
class VaultDoc:
    doc_id: str
    frontmatter: dict[str, Any]
    markdown: str
    refs: list[tuple[str | None, Ref]] = field(default_factory=list)  # (from_anchor, ref)


def frontmatter_for(doc: RegulationDoc) -> dict[str, Any]:
    fm = doc.to_api()
    fm["aliases"] = [x for x in {doc.decision_no, doc.title} if x]
    fm["tags"] = ["quy-che", f"trang-thai/{doc.status}"] + [f"khoa/{c}" for c in doc.applies_to_cohorts]
    return fm


def _yaml(fm: dict[str, Any]) -> str:
    lines = ["---"]
    for k, v in fm.items():
        lines.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
    lines.append("---")
    return "\n".join(lines)


def _clean(s: str) -> str:
    # avoid accidental Markdown structure from verbatim text (headings / list markers at line start)
    return re.sub(r"^([#>*+\-])", r"\\\1", s.strip())


def render_doc(doc: RegulationDoc, articles: list[dict[str, Any]], resolver: Resolver,
               handbook_chunks: list[Chunk] | None = None) -> VaultDoc:
    fm = frontmatter_for(doc)
    out: list[str] = [_yaml(fm), "", f"# {doc.title}", ""]
    meta = []
    if doc.decision_no:
        meta.append(f"Số hiệu: **{doc.decision_no}**")
    if doc.issued_date:
        meta.append(f"ban hành {doc.issued_date}")
    meta.append(f"hiệu lực: `{doc.status}`")
    if doc.superseded_by:
        meta.append(f"bị thay thế bởi [[{doc.superseded_by}]]")
    for old in doc.supersedes or []:
        meta.append(f"thay thế [[{old}]]")
    out += ["> " + " · ".join(meta), ""]
    if doc.source_type == "handbook":
        out += [f"> [!warning] {SUMMARY_WARNING}", ""]
    elif doc.metadata_unverified:
        out += ["> [!warning] Metadata chưa được xác minh — đối chiếu văn bản gốc.", ""]
    if not articles and not handbook_chunks:
        out += ["_Chưa có toàn văn (file chưa thu thập hoặc là bản scan cần OCR)._", ""]
        if doc.source_url:
            out += [f"Nguồn: {doc.source_url}", ""]
    refs: list[tuple[str | None, Ref]] = []
    page = heading = None
    for chunk in handbook_chunks or []:
        if chunk.page != page:
            page, heading = chunk.page, None
            out += [f"## Trang {page}", ""]
        if chunk.heading != heading:
            heading = chunk.heading
            out += [f"### {heading}", ""]
        body = _clean(" ".join(chunk.text.splitlines()))
        body = re.sub(r"^(\d+)([.)])(?=\s)", r"\1\\\2", body)
        out += [body + f" ^{chunk.anchor()}", ""]
    chapter = section = None
    for a in articles:
        art, part = str(a["article"]), int(a.get("part", 0) or 0)
        ctx = LinkContext(doc_id=doc.doc_id, article=art, part=part)
        if a.get("chapter") and a["chapter"] != chapter:
            chapter = a["chapter"]
            out += [f"# {chapter}", ""]
            section = None
        if a.get("section") and a["section"] != section:
            section = a["section"]
            out += [f"### {section}", ""]
        art_anchor = anchor_for(art, part=part)
        out += [f"## Điều {art}. {a.get('title', '')}".rstrip() + f" ^{art_anchor}", ""]

        def emit(text: str, anchor: str | None, bold_label: bool = False) -> None:
            linked, rs = linkify(text, ctx, resolver)
            refs.extend((anchor, r) for r in rs)
            linked = _clean(linked)
            if bold_label:
                linked = _LABEL_RE.sub(lambda m: f"**{m.group(1)}.** ", linked, count=1)
            out.extend([linked + (f" ^{anchor}" if anchor else ""), ""])

        if a.get("intro"):
            emit(a["intro"], None)
        for c in a.get("clauses", []):
            c_anchor = anchor_for(art, c.get("clause") or None, part=part)
            if c.get("text"):
                emit(c["text"], c_anchor if c.get("clause") else None, bold_label=True)
            for p in c.get("points", []):
                emit(p["text"], anchor_for(art, c.get("clause") or None, p["point"], part))
    return VaultDoc(doc.doc_id, fm, "\n".join(out).rstrip() + "\n", refs)


@dataclass
class Vault:
    docs: dict[str, VaultDoc]
    backlinks: dict[str, list[dict[str, Any]]]
    unresolved: list[dict[str, str]]

    def write(self, out_dir: str | Path) -> Path:
        d = Path(out_dir)
        d.mkdir(parents=True, exist_ok=True)
        for doc_id, vd in self.docs.items():
            (d / f"{_safe(doc_id)}.md").write_text(vd.markdown, encoding="utf-8")
        (d / "_unresolved_links.json").write_text(json.dumps(self.unresolved, ensure_ascii=False, indent=1),
                                                  encoding="utf-8")
        return d


def _safe(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', "_", name)


def build_vault(docs: list[RegulationDoc], articles: dict[str, list[dict[str, Any]]],
                chunks: Iterable[Chunk] = ()) -> Vault:
    resolver = Resolver(docs, articles)
    rendered: dict[str, VaultDoc] = {}
    back: list[Backlink] = []
    handbooks: dict[str, list[Chunk]] = defaultdict(list)
    for chunk in chunks:
        if chunk.source_type == "handbook":
            handbooks[chunk.doc_id].append(chunk)
    for doc in docs:
        vd = render_doc(doc, articles.get(doc.doc_id, []), resolver, handbooks.get(doc.doc_id))
        rendered[doc.doc_id] = vd
        texts = _texts_by_anchor(articles.get(doc.doc_id, []))
        for from_anchor, r in vd.refs:
            if not r.resolved or not r.target_doc:
                continue
            if r.target_doc == doc.doc_id and from_anchor and r.anchor == from_anchor:
                continue  # self-reference
            src = texts.get(from_anchor, "") if from_anchor else ""
            ctx_snip = snippet(src, r.start, r.end) if src else r.text
            back.append(Backlink(doc.doc_id, from_anchor, r.target_doc, r.anchor, ctx_snip, r.edge))
    return Vault(rendered, build_backlinks(back), resolver.unresolved)


def _texts_by_anchor(articles: list[dict[str, Any]]) -> dict[str, str]:
    out = {}
    for a in articles:
        art, part = str(a["article"]), int(a.get("part", 0) or 0)
        for c in a.get("clauses", []):
            out[anchor_for(art, c.get("clause") or None, part=part) or ""] = c.get("text", "")
            for p in c.get("points", []):
                out[anchor_for(art, c.get("clause") or None, p["point"], part) or ""] = p["text"]
    return out
