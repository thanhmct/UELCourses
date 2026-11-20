"""Compare one topic across cohorts: retrieve the applicable article per cohort, align, diff sentences."""
from __future__ import annotations

import re
from datetime import date
from difflib import SequenceMatcher
from typing import Any

from .answer import _final, cohort_scope, locator
from .index import RagIndex
from .models import Chunk
from .textnorm import collapse_ws, content_terms, strip_accents
from .validity import doc_label, normalize_cohort, validity_warnings

TITLE_ALIGN_MIN = 0.55


def _title_sim(a: str, b: str) -> float:
    ta, tb = set(content_terms(a)), set(content_terms(b))
    jac = len(ta & tb) / len(ta | tb) if ta | tb else 0.0
    seq = SequenceMatcher(None, strip_accents(a.lower()), strip_accents(b.lower())).ratio()
    return max(jac, seq)


def _article_chunks(index: RagIndex, doc_id: str, article: str | None) -> list[Chunk]:
    return [c for c in index.chunks if c.doc_id == doc_id and c.article == article]


def _article_text(chunks: list[Chunk]) -> str:
    return "\n".join(c.text for c in chunks)


def split_sentences(text: str) -> list[str]:
    units: list[str] = []
    for line in text.split("\n"):
        line = collapse_ws(line)
        if not line:
            continue
        for s in re.split(r"(?<=[.;:])\s+(?=[A-ZĐÀ-Ỹa-zđ0-9])", line):
            s = s.strip()
            if s:
                units.append(s)
    return units


def _strip_label(s: str) -> str:
    return re.sub(r"^(\d{1,2}\.|[a-zđ]\))\s*", "", s)


def _label(s: str) -> str | None:
    m = re.match(r"^(\d{1,2}\.|[a-zđ]\))", s)
    return m.group(1) if m else None


def sentence_diff(a_text: str, b_text: str) -> list[dict[str, str | float | None]]:
    """Sentence-level diff; pairs similar sentences as 'changed'."""
    a, b = split_sentences(a_text), split_sentences(b_text)
    a_key, b_key = [_strip_label(x).lower() for x in a], [_strip_label(x).lower() for x in b]
    sm = SequenceMatcher(None, a_key, b_key, autojunk=False)
    out: list[dict[str, Any]] = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        left, right = a[i1:i2], b[j1:j2]
        used_right: set[int] = set()
        for x in left:
            best, bj = 0.0, None
            for j, y in enumerate(right):
                if j in used_right:
                    continue
                r = SequenceMatcher(None, _strip_label(x).lower(), _strip_label(y).lower()).ratio()
                if r > best:
                    best, bj = r, j
            same_label = bj is not None and _label(x) and _label(x) == _label(right[bj])
            if bj is not None and (best >= 0.5 or (same_label and best >= 0.3)):
                used_right.add(bj)
                out.append({"type": "changed", "a": x, "b": right[bj], "similarity": round(best, 3)})
            else:
                out.append({"type": "removed", "a": x, "b": None, "similarity": None})
        for j, y in enumerate(right):
            if j not in used_right:
                out.append({"type": "added", "a": None, "b": y, "similarity": None})
    return out


def compare(index: RagIndex, topic: str, cohorts: list[str], today: date | None = None) -> dict[str, Any]:
    today = today or date.today()
    cohorts_n = [c for c in dict.fromkeys(normalize_cohort(c) for c in cohorts) if c]
    rows: list[dict[str, Any]] = []
    warnings: list[str] = []
    picks: dict[str, tuple[Chunk, float] | None] = {}

    for c in cohorts_n:
        scope, scope_warn = cohort_scope(index.docs, c, today)
        warnings += [f"Khóa {c}: {w}" for w in scope_warn]
        hits = index.search(topic, top_k=10, doc_ids=[d.doc_id for d in scope]) if scope else []
        hits = [h for h in hits if h.coverage >= 0.4]
        hits.sort(key=lambda h: -_final(h))
        picks[c] = (hits[0].chunk, _final(hits[0])) if hits else None

    # anchor = strongest match overall; align other cohorts to the article with the most similar title
    found = [(c, p) for c, p in picks.items() if p]
    anchor = max(found, key=lambda x: x[1][1])[1][0] if found else None
    for c in cohorts_n:
        p = picks[c]
        if p is None:
            rows.append({"cohort": c, "doc": None, "article": None, "clause": None, "quote": None,
                         "article_title": None, "article_text": None})
            warnings.append(f"Khóa {c}: không tìm thấy quy định phù hợp với chủ đề.")
            continue
        chunk = p[0]
        if anchor is not None and chunk.doc_id != anchor.doc_id:
            cand = {}
            for ch in index.chunks:
                if ch.doc_id == chunk.doc_id and ch.article not in cand:
                    cand[ch.article] = ch
            best_art, best_sim = None, 0.0
            for art, ch in cand.items():
                s = _title_sim(ch.article_title, anchor.article_title)
                if s > best_sim:
                    best_art, best_sim = ch, s
            if best_art is not None and best_sim >= TITLE_ALIGN_MIN and best_art.article != chunk.article:
                same_art = [h for h in index.search(topic, top_k=50, doc_ids=[chunk.doc_id])
                            if h.chunk.article == best_art.article]
                chunk = same_art[0].chunk if same_art else best_art
        elif anchor is not None and chunk.doc_id == anchor.doc_id:
            chunk = anchor
        doc = index.docs_by_id[chunk.doc_id]
        art_chunks = _article_chunks(index, chunk.doc_id, chunk.article)
        rows.append({
            "cohort": c,
            "doc": doc.to_api(),
            "article": chunk.article,
            "article_title": chunk.article_title,
            "clause": chunk.clause,
            "locator": locator(chunk.article, chunk.clause, None),
            "quote": chunk.text,
            "chunk_id": chunk.chunk_id,
            "article_text": _article_text(art_chunks),
        })
        for w in validity_warnings(doc, today, docs_by_id=index.docs_by_id):
            if w not in warnings:
                warnings.append(w)

    differences: list[dict[str, Any]] = []
    valid = [r for r in rows if r["doc"]]
    if len(valid) >= 2:
        base = valid[0]
        for other in valid[1:]:
            pair = [base["cohort"], other["cohort"]]
            if base["doc"]["doc_id"] == other["doc"]["doc_id"] and base["article"] == other["article"]:
                differences.append({"cohorts": pair, "type": "same",
                                    "summary": f"Khóa {pair[0]} và {pair[1]} áp dụng cùng văn bản "
                                               f"{doc_label(index.docs_by_id[base['doc']['doc_id']])}, "
                                               f"Điều {base['article']}."})
                continue
            diffs = sentence_diff(base["article_text"], other["article_text"])
            if not diffs:
                differences.append({"cohorts": pair, "type": "same",
                                    "summary": "Nội dung hai điều tương ứng giống nhau."})
            for d in diffs:
                differences.append({"cohorts": pair,
                                    "a_ref": f"Điều {base['article']} {doc_label(index.docs_by_id[base['doc']['doc_id']])}",
                                    "b_ref": f"Điều {other['article']} {doc_label(index.docs_by_id[other['doc']['doc_id']])}",
                                    **d})
    return {"topic": topic, "rows": rows, "differences": differences, "warnings": warnings}
