"""Question answering: extractive (default, no LLM) and LLM mode with citation post-check."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Callable

from .completion import checked_quotes, complete
from .handbook import SOURCE_LABEL, SUMMARY_WARNING, citation_label
from .index import Hit, RagIndex
from .models import Chunk, RegulationDoc, parse_date
from .providers import LLMProvider, get_provider
from .safety import MAX_QUOTE, regulation_scope, source_blocked
from .textnorm import content_terms
from .validity import (ACTIVE, applicable_docs, doc_label, is_cohort_specific, normalize_cohort,
                       validity_warnings)

REFUSAL = "Không tìm thấy quy định phù hợp trong các văn bản hiện có. Bạn hãy diễn đạt lại câu hỏi hoặc liên hệ Phòng Đào tạo."
UNSURE = ("Chưa tìm được đoạn quy định trả lời trực tiếp câu hỏi này nên hệ thống không đưa ra đáp án. "
          "Bạn hãy diễn đạt lại câu hỏi hoặc liên hệ Phòng Đào tạo.")
# checked_quotes() reasons meaning the model judged the context and found no verifiable evidence.
_LLM_REJECTED = {"Câu trả lời AI không có trích dẫn phù hợp.", "Trích dẫn không khớp nguyên văn.",
                 "Trích dẫn trong câu trả lời không khớp nguyên văn.", "Nguồn trích dẫn không nằm trong ngữ cảnh."}
MIN_COVERAGE = 0.45  # calibrated on 110 questions; lower values did not recover more in-scope answers
MIN_SCORE = 2.0  # absolute BM25 floor
RELATIVE_KEEP = 0.6  # keep extra citations scoring >= 60% of the best one
TOPIC_MATCH = 0.6  # require comparable lexical evidence to treat a source as covering the same topic
_QUERY_FRAME = re.compile(
    r"\b(?:(?:theo\s+)?sổ tay(?: sinh viên)?|bao lâu|(?:ở|từ|đến) đâu|thứ mấy|năm nào|"
    r"Trường Đại học Kinh tế\s*[-–]\s*Luật)\b", re.IGNORECASE
)


@dataclass
class RetrievalResult:
    hits: list[Hit]
    confident: list[Hit]
    warnings: list[str] = field(default_factory=list)
    scope_doc_ids: list[str] = field(default_factory=list)


def _final(h: Hit) -> float:
    return h.score * (0.5 + h.coverage)


def _is_confident(h: Hit) -> bool:
    return h.coverage >= MIN_COVERAGE and h.score >= MIN_SCORE


def _question_cohort(question: str, cohort: str | None) -> str | None:
    inferred = {normalize_cohort(match) for match in re.findall(r"\bK\s*\d{2}\b", question, re.IGNORECASE)}
    return normalize_cohort(cohort) or (inferred.pop() if len(inferred) == 1 else None)


def _source_tier(doc: RegulationDoc, cohort: str | None, handbook_query: bool) -> int:
    """Metadata tie-breaker used without disturbing BM25 order inside a tier."""
    if handbook_query and doc.source_type == "handbook":
        return 3
    if cohort:
        listed = {normalize_cohort(spec) for spec in doc.applies_to_cohorts}
        if cohort in listed:
            return 2
        if is_cohort_specific(doc):
            return 1
    return 0


def cohort_scope(docs: list[RegulationDoc], cohort: str | None, today: date) -> tuple[list[RegulationDoc], list[str]]:
    """Documents to search for a cohort (in force first, the cohort's old regulation as flagged fallback)."""
    warnings: list[str] = []
    cohort = normalize_cohort(cohort)
    if cohort:
        scope = applicable_docs(docs, cohort, today)
        if not any(d.source_type != "handbook" and is_cohort_specific(d) for d in scope):
            # only general ("all") docs are in force for this cohort -> also look at the cohort's own
            # documents that are no longer in force (e.g. an old regulation still governing old cohorts)
            old = [d for d in applicable_docs(docs, cohort, today, include_inactive=True)
                   if d.status != ACTIVE and d.source_type != "handbook" and is_cohort_specific(d)]
            if old:
                scope = scope + old
                warnings.append(f"Không có quy chế riêng còn hiệu lực ghi nhận cho khóa {cohort}; "
                                "kết quả có thể lấy từ văn bản đã hết hiệu lực/bị thay thế.")
        if not scope:
            warnings.append(f"Không có văn bản nào được ghi nhận áp dụng cho khóa {cohort}.")
    else:
        scope = [d for d in docs if d.status == ACTIVE] or list(docs)
    return scope, warnings


def retrieve(index: RagIndex, question: str, cohort: str | None, today: date, top_k: int = 3) -> RetrievalResult:
    cohort = _question_cohort(question, cohort)
    handbook_query = bool(re.search(r"\bsổ\s+tay\b", question, re.IGNORECASE))
    docs = index.docs
    scope, warnings = cohort_scope(docs, cohort, today)
    ids = [d.doc_id for d in scope]
    query = re.sub(r"\bK\s*\d{2}\b", "", question, flags=re.IGNORECASE) if cohort else question
    query = _QUERY_FRAME.sub(" ", query)
    limit = max(10, top_k * 4)

    def search(source: list[RegulationDoc]) -> tuple[list[Hit], list[Hit]]:
        by_group: dict[str, tuple[list[Hit], list[Hit]]] = {}
        for group in ("regulation", "ocr", "handbook"):
            subindex = index.evidence_indexes.get(group)
            group_ids = [d.doc_id for d in source if index.evidence_group(d.doc_id) == group]
            if subindex is None or not group_ids:
                continue
            hits = sorted(subindex.search(query, top_k=limit, doc_ids=group_ids), key=lambda h: -_final(h))
            matches = [h for h in hits if _is_confident(h)]
            by_group[group] = (hits, matches)
        # Separate BM25 statistics stabilize ranking within each kind of source. Compare
        # relevance on a shared scale before giving precedence to an original document.
        matches = [h for _, group_matches in by_group.values() for h in group_matches]
        scores = index.comparable_relevance(query, matches) if len(by_group) > 1 else {}
        best_official = max((scores.get(h.chunk.chunk_id, 0) for h in matches
                             if h.chunk.source_type != "handbook"), default=0)
        best_summary = max((scores.get(h.chunk.chunk_id, 0) for h in matches
                            if h.chunk.source_type == "handbook"), default=0)
        relevant_groups: list[tuple[int, float, list[Hit], list[Hit]]] = []
        remaining_groups: list[tuple[int, float, list[Hit], list[Hit]]] = []
        best_shared = max(
            (scores.get(group_matches[0].chunk.chunk_id, 0.0)
             for _, group_matches in by_group.values() if group_matches),
            default=0.0,
        )
        for group, (hits, group_matches) in by_group.items():
            threshold = TOPIC_MATCH * (best_official if group == "handbook" else best_summary)
            explicit_handbook = handbook_query and group == "handbook" and group_matches
            top_tier = _source_tier(index.docs_by_id[group_matches[0].chunk.doc_id], cohort, handbook_query) \
                if group_matches else 0
            top_shared = max((scores.get(h.chunk.chunk_id, 0.0) for h in group_matches), default=0.0)
            if not (handbook_query and group == "handbook") and top_shared < TOPIC_MATCH * best_shared:
                top_tier = 0
            metadata_near = top_tier > 0 and top_shared >= TOPIC_MATCH * best_shared
            if explicit_handbook or metadata_near or any(
                scores.get(h.chunk.chunk_id, 0) >= threshold or (group == "handbook" and h.coverage >= 0.9)
                for h in group_matches
            ):
                relevant_groups.append((top_tier, top_shared, hits, group_matches))
            else:
                remaining_groups.append((top_tier, top_shared, hits, group_matches))

        # Preserve the BM25 order inside each comparable corpus. Only move an entire
        # source group when its best match has more precise cohort/source metadata.
        relevant_groups.sort(key=lambda item: item[0], reverse=True)
        remaining_groups.sort(key=lambda item: item[0], reverse=True)
        relevant = [hit for _, _, hits, _ in relevant_groups for hit in hits]
        remaining = [hit for _, _, hits, _ in remaining_groups for hit in hits]
        confident = [hit for _, _, _, matches_ in relevant_groups for hit in matches_]
        return relevant + remaining, confident

    hits, confident = search(scope)
    if not confident and not cohort:
        # fall back to inactive documents, clearly flagged
        inactive = [d for d in docs if d.status != ACTIVE and d.source_type != "handbook"]
        if inactive:
            extra, extra_conf = search(inactive)
            if extra_conf:
                hits, confident = extra, extra_conf
                warnings.append("Chỉ tìm thấy quy định trong văn bản không còn hiệu lực.")
    return RetrievalResult(hits=hits, confident=confident, warnings=warnings, scope_doc_ids=ids)


def _select_point(index: RagIndex, question: str, chunk: Chunk) -> dict[str, str] | None:
    """Pick the Điểm that clearly matches the question better than the clause lead-in."""
    if not chunk.points:
        return None
    terms = set(content_terms(question))
    if not terms:
        return None
    idf = index.evidence_indexes[index.evidence_group(chunk.doc_id)].bm25.term_idf
    total = sum(idf(t) for t in terms) or 1.0

    def cov(text: str) -> float:
        present = set(content_terms(text))
        return sum(idf(t) for t in terms if t in present) / total

    lead = chunk.text.split("\n", 1)[0] if chunk.points else chunk.text
    scored = sorted(((cov(p["text"]), p) for p in chunk.points), key=lambda x: -x[0])
    best_cov, best = scored[0]
    second = scored[1][0] if len(scored) > 1 else 0.0
    if best_cov >= 0.3 and best_cov >= second + 0.15 and best_cov > cov(lead):
        return best
    return None


def locator(article: str | None, clause: str | None, point: str | None) -> str:
    parts = []
    if point:
        parts.append(f"Điểm {point}")
    if clause:
        parts.append(f"Khoản {clause}")
    if article:
        parts.append(f"Điều {article}")
    return " ".join(parts)


def _fmt_date(s: str | None) -> str | None:
    d = parse_date(s)
    return d.strftime("%d/%m/%Y") if d else None


def make_citation(index: RagIndex, chunk: Chunk, quote: str, point: str | None = None,
                  score: float | None = None) -> dict[str, Any]:
    doc = index.docs_by_id.get(chunk.doc_id)
    citation = {
        "doc_id": chunk.doc_id,
        "decision_no": doc.decision_no if doc else chunk.decision_no,
        "title": doc.title if doc else chunk.title,
        "article": chunk.article,
        "article_title": chunk.article_title,
        "clause": chunk.clause,
        "point": point,
        "quote": quote,
        "heading": chunk.heading,
        "anchor": chunk.anchor(point),
        "wikilink": f"[[{chunk.doc_id}#^{chunk.anchor(point)}|{locator(chunk.article, chunk.clause, point)}"
                    f"{' ' + doc_label(doc) if doc else ''}]]" if chunk.article else f"[[{chunk.doc_id}]]",
        "chunk_id": chunk.chunk_id,
        "page": chunk.page,
        "effective_from": doc.effective_from if doc else chunk.effective_from,
        "effective_to": doc.effective_to if doc else chunk.effective_to,
        "status": doc.status if doc else chunk.status,
        "score": round(score, 4) if score is not None else None,
    }
    if doc and chunk.source_type == "handbook":
        label = citation_label(doc, chunk)
        citation.update(source_type="handbook", source_label=SOURCE_LABEL, label=label, chapter=chunk.chapter,
                        wikilink=f"[[{chunk.doc_id}#^{chunk.anchor()}|{label}]]")
    return citation


def _source_phrase(doc: RegulationDoc | None, chunk: Chunk) -> str:
    if doc is None:
        return chunk.title
    label = doc_label(doc)
    issued = _fmt_date(doc.issued_date)
    if doc.decision_no:
        phrase = f"{doc.title} (ban hành kèm theo {label}" + (f" ngày {issued})" if issued else ")")
    else:
        phrase = doc.title + (f" (ngày {issued})" if issued else "")
    return phrase


def _citation_warnings(index: RagIndex, citations: list[dict[str, Any]], today: date) -> list[str]:
    if all(c.get("source_type") == "handbook" for c in citations):
        return [SUMMARY_WARNING]
    out: list[str] = []
    for doc_id in dict.fromkeys(c["doc_id"] for c in citations):
        doc = index.docs_by_id.get(doc_id)
        if doc and doc.source_type != "handbook":
            for w in validity_warnings(doc, today, docs_by_id=index.docs_by_id):
                if w not in out:
                    out.append(w)
    return out


def _select_hits(index: RagIndex, hits: list[Hit], top_k: int) -> list[Hit]:
    chosen: list[Hit] = []
    seen: set[tuple] = set()
    best_by_type: dict[str, float] = {}
    for hit in hits:
        chunk = hit.chunk
        best = best_by_type.setdefault(index.evidence_group(chunk.doc_id), _final(hit))
        key = (chunk.doc_id, chunk.page, chunk.heading) if chunk.source_type == "handbook" else (
            chunk.doc_id, chunk.article, chunk.clause
        )
        if key in seen or _final(hit) < RELATIVE_KEEP * best:
            continue
        seen.add(key)
        chosen.append(hit)

    selected = chosen[:top_k]
    if top_k > 1 and len(selected) == top_k and all(
        hit.chunk.doc_id == selected[0].chunk.doc_id and hit.chunk.source_type != "handbook" for hit in selected
    ):
        # Leave room for a relevant summary when the original already has multiple citations.
        summary = next((hit for hit in chosen[top_k:] if hit.chunk.source_type == "handbook"), None)
        if summary:
            selected[-1] = summary
    return selected


_QUANTITATIVE_QUESTION = re.compile(
    r"\b(?:bao nhiêu|mấy|tối đa|tối thiểu|khi nào|thời hạn|bao lâu|thời gian|số điện thoại|hotline)\b",
    re.IGNORECASE,
)
_QUANTITATIVE_EVIDENCE = re.compile(
    r"\d|\b(?:ngày|tháng|năm|giờ|phút|tuần|lần|tín chỉ|điểm|phần trăm|%|đồng)\b",
    re.IGNORECASE,
)


def _quote_passages(text: str) -> list[str]:
    """Return bounded, verbatim sentence windows from one stored chunk."""
    if len(text) <= MAX_QUOTE:
        return [text] if text and not source_blocked(text) else []
    starts = [0, *(m.end() for m in re.finditer(r"\n|(?<=[.!?;])\s+", text))]
    passages: list[str] = []
    for i, start in enumerate(starts):
        for end in (*starts[i + 1:], len(text)):
            quote = text[start:min(end, start + MAX_QUOTE)].rstrip()
            if quote and not source_blocked(quote):
                passages.append(quote)
            if end - start >= MAX_QUOTE:
                break
    return passages


def _handbook_window(chunk: Chunk, query: str, index: RagIndex) -> tuple[Chunk, str]:
    """Choose the best verbatim window anywhere in the same cited handbook page."""
    def expand_aliases(text: str) -> str:
        text = re.sub(r"\bKTX\b", "ký túc xá", text, flags=re.IGNORECASE)
        text = re.sub(r"\bBGH\b", "Ban Giám hiệu", text, flags=re.IGNORECASE)
        return text

    expanded_query = expand_aliases(query)
    query_terms = content_terms(expanded_query)
    terms = set(query_terms)
    phrases = set(zip(query_terms, query_terms[1:]))
    idf = index.evidence_indexes["handbook"].bm25.term_idf
    quantitative = bool(_QUANTITATIVE_QUESTION.search(query))

    def score(candidate: Chunk, quote: str) -> float:
        words = content_terms(expand_aliases(quote))
        heading_words = content_terms(candidate.heading)
        matched = terms.intersection(words)
        heading_matched = terms.intersection(heading_words)
        matched_phrases = phrases.intersection(zip(words, words[1:]))
        lexical = sum(idf(t) for t in sorted(matched))
        heading_score = 0.2 * sum(idf(t) for t in sorted(heading_matched - matched))
        phrase_score = sum(idf(a) + idf(b) for a, b in sorted(matched_phrases)) / 2
        positions = [i for i, word in enumerate(words) if word in matched]
        proximity = (len(matched) ** 2 / (1 + max(positions) - min(positions))) if positions else 0.0
        answer_type = 2.0 if quantitative and _QUANTITATIVE_EVIDENCE.search(quote) else 0.0
        question_only = 5.0 if quote.rstrip().endswith("?") else 0.0
        return lexical + heading_score + phrase_score + proximity + answer_type - question_only

    candidates = [candidate for candidate in index.chunks
                  if candidate.source_type == "handbook" and candidate.doc_id == chunk.doc_id
                  and candidate.page == chunk.page]
    if not candidates:
        candidates = [chunk]
    windows = [(score(candidate, quote), candidate.chunk_id, candidate, quote)
               for candidate in candidates for quote in _quote_passages(candidate.text)]
    if not windows:
        return chunk, ""
    best = max(windows, key=lambda item: (item[0], len(item[3]), item[1]))
    current = max((item for item in windows if item[2].chunk_id == chunk.chunk_id),
                  key=lambda item: (item[0], len(item[3]), item[1]), default=None)
    # Avoid replacing an already-good retrieved window for a marginal lexical gain.
    # Moving within the page is reserved for a clearly stronger evidence window.
    preserve_ratio = 0.75
    chosen = current if current is not None and current[0] >= preserve_ratio * best[0] else best
    _, _, selected, quote = chosen
    return selected, quote


def answer_extractive(index: RagIndex, question: str, cohort: str | None = None, today: date | None = None,
                      top_k: int = 3, *, retrieval: RetrievalResult | None = None) -> dict[str, Any]:
    today = today or date.today()
    question = (question or "").strip()
    if not question:
        return {"answer": REFUSAL, "citations": [], "warnings": ["Câu hỏi trống."], "mode": "extractive", "found": False}
    if not regulation_scope(question):
        return {"answer": REFUSAL, "citations": [], "warnings": [], "mode": "extractive", "found": False}
    rr = retrieval or retrieve(index, question, cohort, today, top_k)
    warnings = list(rr.warnings)
    if not rr.confident:
        return {"answer": REFUSAL, "citations": [], "warnings": warnings, "mode": "extractive", "found": False}

    citations = []
    for h in _select_hits(index, rr.confident, top_k):
        pt = _select_point(index, question, h.chunk)
        citation_chunk = h.chunk
        if h.chunk.source_type == "handbook":
            citation_chunk, quote = _handbook_window(h.chunk, question, index)
        else:
            quote = (pt["text"] if pt else h.chunk.text)[:MAX_QUOTE].rstrip()
        if not quote or source_blocked(quote):
            continue
        citations.append(make_citation(index, citation_chunk, quote, pt["point"] if pt else None, _final(h)))

    if not citations:
        return {"answer": REFUSAL, "citations": [], "warnings": warnings, "mode": "extractive", "found": False}
    # Only the best match is shown as quoted evidence: lower-ranked hits were rarely the labelled answer
    # (13/127 on the eval set), so they are listed as related provisions without a quote.
    related = [{k: c.get(k) for k in ("doc_id", "decision_no", "title", "article", "clause", "point", "page",
                                      "label", "source_type", "anchor", "chunk_id")} for c in citations[1:]]
    top = citations[0]
    top_chunk = index.chunk_by_id[top["chunk_id"]]
    doc = index.docs_by_id.get(top_chunk.doc_id)
    loc = locator(top["article"], top["clause"], top["point"])
    answer = f"Theo {top.get('label') or f'{loc} {_source_phrase(doc, top_chunk)}'.strip()}: «{top['quote']}»"
    others = "; ".join(
        f"{locator(c['article'], c['clause'], c['point'])} ({doc_label(index.docs_by_id[c['doc_id']])})"
        for c in citations[1:] if c["doc_id"] in index.docs_by_id and not c.get("source_label")
    )
    if others:
        answer += f"\n\nQuy định liên quan: {others}."
    summaries = [c["label"] for c in citations if c.get("source_label")]
    if summaries and not top.get("source_label"):
        answer += f"\n\n{SOURCE_LABEL} — " + "; ".join(summaries) + "."

    citations = citations[:1]
    warnings += _citation_warnings(index, citations, today)
    if not _question_cohort(question, cohort):
        cohort_sets = {tuple(index.docs_by_id[c["doc_id"]].applies_to_cohorts) for c in citations
                       if c["doc_id"] in index.docs_by_id}
        if any(s != ("all",) for s in cohort_sets):
            warnings.append("Bạn chưa chọn khóa tuyển sinh — quy định có thể khác nhau giữa các khóa.")
    return {"answer": answer, "citations": citations, "related": related, "warnings": warnings,
            "mode": "extractive", "found": True}


def verify_llm_output(raw: str, hits: list[Hit]) -> tuple[bool, str, list[tuple[Chunk, str, float]], str | None]:
    chunks = {hit.chunk.chunk_id: hit.chunk for hit in hits}
    quotes, reason = checked_quotes(raw, {key: chunk.text for key, chunk in chunks.items()})
    if quotes is None:
        return False, "", [], reason
    return True, "\n".join(quote for _, quote in quotes), [(chunks[key], quote, 1.0) for key, quote in quotes], None


def answer_llm(index: RagIndex, question: str, cohort: str | None = None, today: date | None = None,
               provider: LLMProvider | None = None, top_k: int = 3, context_k: int = 6, *,
               reserve: Callable[[], bool] | None = None) -> dict[str, Any]:
    today = today or date.today()
    if not regulation_scope(question):
        return answer_extractive(index, question, cohort, today, top_k)
    rr = retrieve(index, question, cohort, today, top_k)
    base = answer_extractive(index, question, cohort, today, top_k, retrieval=rr)
    if not base["found"]:
        return base
    provider = provider or get_provider()
    chunks: dict[str, Chunk] = {}
    sources: dict[str, str] = {}
    for h in _select_hits(index, rr.confident, context_k):
        chunk, text = (_handbook_window(h.chunk, question, index) if h.chunk.source_type == "handbook"
                       else (h.chunk, h.chunk.text))
        # Cite the chunk the window actually comes from, so the quote stays a substring of it.
        if text and chunk.chunk_id not in chunks:
            chunks[chunk.chunk_id], sources[chunk.chunk_id] = chunk, text
    quotes, reason = complete(question, sources,
                              f"regulations:{index.version}:{_question_cohort(question, cohort)}", provider, reserve)
    if quotes is None:
        if reason in _LLM_REJECTED:
            # The model read the retrieved passages and found no verifiable answer. On the eval set the
            # extractive top hit was wrong in every such case, so abstain instead of showing it as evidence.
            related = [{k: c.get(k) for k in ("doc_id", "decision_no", "title", "article", "clause", "point",
                                              "page", "label", "source_type", "anchor", "chunk_id")}
                       for c in base["citations"]] + base.get("related", [])
            names = "; ".join(dict.fromkeys(
                c.get("label") or f"{locator(c['article'], c['clause'], c['point'])} "
                f"({doc_label(index.docs_by_id[c['doc_id']])})".strip()
                for c in related if c.get("label") or c["doc_id"] in index.docs_by_id))
            answer = UNSURE + (f"\n\nCó thể liên quan: {names}." if names else "")
            return {"answer": answer, "citations": [], "related": related, "warnings": base["warnings"],
                    "mode": "llm", "found": False, "abstained": True, "abstain_reason": reason,
                    "provider": provider.name}
        return base | {"llm_fallback": True, "fallback_reason": reason}
    quotes = sorted(quotes, key=lambda pair: chunks[pair[0]].source_type == "handbook")
    if all(chunks[key].source_type == "handbook" for key, _ in quotes) and not base["citations"][0].get("source_label"):
        return base | {"llm_fallback": True, "fallback_reason": "regulation_priority"}
    citations = [make_citation(index, chunks[key], quote) | {"match_ratio": 1.0}
                 for key, quote in quotes[:top_k]]
    warnings = list(dict.fromkeys([w for w in base["warnings"] if w != SUMMARY_WARNING]
                                  + _citation_warnings(index, citations, today)))
    answer = "\n\n".join(f"{c['source_label']} — {c['label']}\n{c['quote']}" if c.get("source_label")
                         else c["quote"] for c in citations)
    return {"answer": answer, "citations": citations,
            "warnings": warnings, "mode": "llm", "found": True, "provider": provider.name}


def ask(index: RagIndex, question: str, cohort: str | None = None, mode: str | None = None,
        today: date | None = None, provider: LLMProvider | None = None, top_k: int = 3, *,
        reserve: Callable[[], bool] | None = None) -> dict[str, Any]:
    provider = provider or get_provider()
    if mode == "llm" or (mode is None and provider.available()):
        return answer_llm(index, question, cohort, today, provider, top_k, reserve=reserve)
    return answer_extractive(index, question, cohort, today, top_k)
