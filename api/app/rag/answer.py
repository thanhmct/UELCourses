"""Question answering: extractive (default, no LLM) and LLM mode with citation post-check."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from .index import Hit, RagIndex
from .models import Chunk, RegulationDoc, parse_date
from .providers import LLMProvider, ProviderError, get_provider
from .textnorm import content_terms
from .validity import (ACTIVE, applicable_docs, doc_label, is_cohort_specific, normalize_cohort,
                       validity_warnings)
from .verify import QUOTE_MIN_RATIO, best_match

REFUSAL = "Không tìm thấy quy định phù hợp trong các văn bản hiện có. Bạn hãy diễn đạt lại câu hỏi hoặc liên hệ Phòng Đào tạo."
MIN_COVERAGE = 0.5  # share (IDF-weighted) of the question's content words found in the best chunk
MIN_SCORE = 2.0  # absolute BM25 floor
RELATIVE_KEEP = 0.6  # keep extra citations scoring >= 60% of the best one


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


def cohort_scope(docs: list[RegulationDoc], cohort: str | None, today: date) -> tuple[list[RegulationDoc], list[str]]:
    """Documents to search for a cohort (in force first, the cohort's old regulation as flagged fallback)."""
    warnings: list[str] = []
    cohort = normalize_cohort(cohort)
    if cohort:
        scope = applicable_docs(docs, cohort, today)
        if not any(is_cohort_specific(d) for d in scope):
            # only general ("all") docs are in force for this cohort -> also look at the cohort's own
            # documents that are no longer in force (e.g. an old regulation still governing old cohorts)
            old = [d for d in applicable_docs(docs, cohort, today, include_inactive=True)
                   if d.status != ACTIVE and is_cohort_specific(d)]
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
    cohort = normalize_cohort(cohort)
    docs = index.docs
    scope, warnings = cohort_scope(docs, cohort, today)
    ids = [d.doc_id for d in scope]
    hits = index.search(question, top_k=max(10, top_k * 4), doc_ids=ids) if ids else []
    hits.sort(key=lambda h: -_final(h))
    confident = [h for h in hits if _is_confident(h)]

    if not confident and not cohort:
        # fall back to inactive documents, clearly flagged
        inactive = [d.doc_id for d in docs if d.status != ACTIVE]
        if inactive:
            extra = index.search(question, top_k=max(10, top_k * 4), doc_ids=inactive)
            extra.sort(key=lambda h: -_final(h))
            extra_conf = [h for h in extra if _is_confident(h)]
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
    idf = index.bm25.term_idf
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
    return {
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
    out: list[str] = []
    for doc_id in dict.fromkeys(c["doc_id"] for c in citations):
        doc = index.docs_by_id.get(doc_id)
        if doc:
            for w in validity_warnings(doc, today, docs_by_id=index.docs_by_id):
                if w not in out:
                    out.append(w)
    return out


def answer_extractive(index: RagIndex, question: str, cohort: str | None = None, today: date | None = None,
                      top_k: int = 3) -> dict[str, Any]:
    today = today or date.today()
    question = (question or "").strip()
    if not question:
        return {"answer": REFUSAL, "citations": [], "warnings": ["Câu hỏi trống."], "mode": "extractive", "found": False}
    rr = retrieve(index, question, cohort, today, top_k)
    warnings = list(rr.warnings)
    if not rr.confident:
        return {"answer": REFUSAL, "citations": [], "warnings": warnings, "mode": "extractive", "found": False}

    best = _final(rr.confident[0])
    chosen: list[Hit] = []
    seen = set()
    for h in rr.confident:
        key = (h.chunk.doc_id, h.chunk.article, h.chunk.clause)
        if key in seen or _final(h) < RELATIVE_KEEP * best:
            continue
        seen.add(key)
        chosen.append(h)
        if len(chosen) >= top_k:
            break

    citations = []
    for h in chosen:
        pt = _select_point(index, question, h.chunk)
        quote = pt["text"] if pt else h.chunk.text
        citations.append(make_citation(index, h.chunk, quote, pt["point"] if pt else None, _final(h)))

    top = citations[0]
    top_chunk = chosen[0].chunk
    doc = index.docs_by_id.get(top_chunk.doc_id)
    loc = locator(top["article"], top["clause"], top["point"])
    answer = f"Theo {loc} {_source_phrase(doc, top_chunk)}: «{top['quote']}»"
    if len(citations) > 1:
        others = "; ".join(
            f"{locator(c['article'], c['clause'], c['point'])} ({doc_label(index.docs_by_id[c['doc_id']])})"
            for c in citations[1:] if c["doc_id"] in index.docs_by_id
        )
        answer += f"\n\nQuy định liên quan: {others}."

    warnings += _citation_warnings(index, citations, today)
    if not normalize_cohort(cohort):
        cohort_sets = {tuple(index.docs_by_id[c["doc_id"]].applies_to_cohorts) for c in citations
                       if c["doc_id"] in index.docs_by_id}
        if any(s != ("all",) for s in cohort_sets):
            warnings.append("Bạn chưa chọn khóa tuyển sinh — quy định có thể khác nhau giữa các khóa.")
    return {"answer": answer, "citations": citations, "warnings": warnings, "mode": "extractive", "found": True}


# ------------------------------------------------------------------ LLM ---
SYSTEM_PROMPT = (
    "Bạn là trợ lý tra cứu quy chế học vụ của Trường Đại học Kinh tế - Luật. "
    "CHỈ được dùng các đoạn quy định trong NGỮ CẢNH. Không dùng kiến thức bên ngoài, không suy đoán. "
    "Mọi ý trong câu trả lời phải có trích dẫn nguyên văn từ một đoạn ngữ cảnh, kèm chunk_id của đoạn đó. "
    "Nếu ngữ cảnh không chứa câu trả lời, trả về answer = \"KHONG_TIM_THAY\" và citations rỗng. "
    "Trả lời bằng tiếng Việt, ngắn gọn. Chỉ xuất JSON đúng dạng: "
    "{\"answer\": \"...\", \"citations\": [{\"chunk_id\": \"...\", \"quote\": \"trích nguyên văn\"}]}"
)


def build_prompt(question: str, hits: list[Hit], index: RagIndex) -> str:
    blocks = []
    for h in hits:
        c = h.chunk
        doc = index.docs_by_id.get(c.doc_id)
        src = f"{doc_label(doc)} — {c.heading}" if doc else c.heading
        loc = locator(c.article, c.clause, None)
        blocks.append(f"[chunk_id: {c.chunk_id}] ({loc}; {src})\n{c.text}")
    ctx = "\n\n".join(blocks)
    return f"NGỮ CẢNH:\n{ctx}\n\nCÂU HỎI: {question}\n\nTrả lời theo đúng định dạng JSON đã yêu cầu."


def _parse_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group())
            except json.JSONDecodeError:
                return None
    return None


_INLINE_QUOTE_RE = re.compile(r"[«“\"]([^«»“”\"]{12,})[»”\"]")


def verify_llm_output(raw: str, hits: list[Hit]) -> tuple[bool, str, list[tuple[Chunk, str, float]], str | None]:
    """Return (ok, answer, [(chunk, verbatim_span, ratio)], failure_reason)."""
    data = _parse_json(raw)
    if not isinstance(data, dict) or "answer" not in data:
        return False, "", [], "LLM không trả về JSON hợp lệ."
    answer = str(data.get("answer") or "").strip()
    if answer.upper().startswith("KHONG_TIM_THAY"):
        return False, "", [], "LLM báo không tìm thấy."
    cits = data.get("citations") or []
    if not isinstance(cits, list) or not cits:
        return False, answer, [], "Câu trả lời LLM không có trích dẫn."
    by_id = {h.chunk.chunk_id: h.chunk for h in hits}
    verified: list[tuple[Chunk, str, float]] = []
    for c in cits:
        if not isinstance(c, dict):
            return False, answer, [], "Trích dẫn sai định dạng."
        chunk = by_id.get(str(c.get("chunk_id", "")))
        if chunk is None:
            return False, answer, [], f"Trích dẫn chunk_id không có trong ngữ cảnh: {c.get('chunk_id')}"
        ratio, span = best_match(str(c.get("quote", "")), chunk.text)
        if ratio < QUOTE_MIN_RATIO:
            return False, answer, [], f"Trích dẫn không khớp nguyên văn (độ khớp {ratio:.2f} < {QUOTE_MIN_RATIO})."
        verified.append((chunk, span, ratio))
    # quotes embedded in the answer text must also be verbatim
    for q in _INLINE_QUOTE_RE.findall(answer):
        if max(best_match(q, ch.text)[0] for ch, _, _ in verified) < QUOTE_MIN_RATIO:
            return False, answer, [], "Câu trả lời chứa đoạn trích không khớp nguyên văn."
    return True, answer, verified, None


def answer_llm(index: RagIndex, question: str, cohort: str | None = None, today: date | None = None,
               provider: LLMProvider | None = None, top_k: int = 3, context_k: int = 6) -> dict[str, Any]:
    today = today or date.today()
    provider = provider or get_provider()
    base = answer_extractive(index, question, cohort, today, top_k)
    if not base["found"]:
        return base  # nothing relevant retrieved -> never ask the LLM to guess
    if not provider.available():
        base["warnings"].append("Chế độ LLM chưa được cấu hình — đã trả lời bằng trích dẫn nguyên văn.")
        base["llm_fallback"] = True
        base["fallback_reason"] = "provider_unavailable"
        return base
    rr = retrieve(index, question, cohort, today, top_k)
    ctx_hits = rr.confident[:context_k]
    try:
        raw = provider.generate(SYSTEM_PROMPT, build_prompt(question, ctx_hits, index))
    except ProviderError as exc:
        base["warnings"].append(f"Không gọi được LLM ({exc}) — đã trả lời bằng trích dẫn nguyên văn.")
        base["llm_fallback"] = True
        base["fallback_reason"] = "provider_error"
        return base
    ok, answer, verified, reason = verify_llm_output(raw, ctx_hits)
    if not ok:
        base["warnings"].append(f"Đã bỏ câu trả lời của LLM vì hậu kiểm trích dẫn thất bại: {reason}")
        base["llm_fallback"] = True
        base["fallback_reason"] = reason
        return base
    citations = [make_citation(index, ch, span) | {"match_ratio": round(r, 3)} for ch, span, r in verified]
    warnings = list(rr.warnings) + _citation_warnings(index, citations, today)
    return {"answer": answer, "citations": citations, "warnings": warnings, "mode": "llm", "found": True,
            "provider": provider.name}


def ask(index: RagIndex, question: str, cohort: str | None = None, mode: str | None = None,
        today: date | None = None, provider: LLMProvider | None = None, top_k: int = 3) -> dict[str, Any]:
    if (mode or "extractive").lower() == "llm":
        return answer_llm(index, question, cohort, today, provider, top_k)
    return answer_extractive(index, question, cohort, today, top_k)
