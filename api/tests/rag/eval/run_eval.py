"""Evaluate the regulations RAG pipeline.

Metrics (for the thesis evaluation chapter):
  * Recall@k / MRR          - retrieval: is an expected (doc_id, Điều, Khoản) among the top-k chunks
                              (within the cohort's applicable documents)?
  * Citation accuracy       - extractive answer: first citation == expected (doc, Điều, Khoản);
                              any-citation accuracy; verbatim rate (quote is an exact substring of the source).
  * Refusal                 - correct refusal rate on out-of-scope questions, false refusal rate on in-scope ones.

Usage (from api/):
  python tests/rag/eval/run_eval.py                       # real regulations (default)
  python tests/rag/eval/run_eval.py --fixture              # sample fixture
  python tests/rag/eval/run_eval.py --regulations-dir ../regulations --questions my_questions.jsonl
  python tests/rag/eval/run_eval.py --index-dir data/rag_index --json eval_result.json
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
API_DIR = HERE.parents[2]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.rag.answer import answer_extractive, retrieve  # noqa: E402
from app.rag.index import RagIndex  # noqa: E402
from app.rag.pipeline import build_index  # noqa: E402
from app.rag.textnorm import collapse_ws  # noqa: E402
from app.rag.validity import refresh_statuses  # noqa: E402

FIXTURE_DIR = HERE.parent / "fixtures" / "regulations"
FIXTURE_TODAY = date(2026, 11, 20)  # fixed date so fixture statuses are reproducible
DEFAULT_QUESTIONS = HERE / "questions.jsonl"
REAL_REGULATIONS = API_DIR.parent / "regulations"


def load_questions(path: Path) -> list[dict]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            out.append(json.loads(line))
    return out


def _key(doc_id, article=None, clause=None, page=None) -> tuple[str, ...]:
    if page is not None:
        return (str(doc_id), "trang", str(page))
    return (str(doc_id), str(article or ""), str(clause or ""))


def _contains(haystack: str | None, needle: str | None) -> bool:
    return bool(needle) and collapse_ws(str(needle)).casefold() in collapse_ws(str(haystack or "")).casefold()


def _matches(expected: dict, candidate: dict) -> bool:
    """Match a retrieved window/citation to a labelled legal location without over-broadening it."""
    if str(candidate.get("doc_id")) != str(expected.get("doc_id")):
        return False
    evidence = expected.get("evidence")
    if expected.get("page") is not None:
        return candidate.get("page") == expected.get("page") or _contains(candidate.get("text"), evidence)
    if expected.get("article") is not None and str(candidate.get("article") or "") != str(expected["article"]):
        return False
    if expected.get("clause") is not None and str(candidate.get("clause") or "") != str(expected["clause"]):
        return False
    point = expected.get("point")
    if point is None:
        # A point-level chunk/citation is contained by its labelled clause, and vice versa.
        return True
    if str(candidate.get("point") or "").casefold() == str(point).casefold():
        return True
    if any(str(item.get("point") or "").casefold() == str(point).casefold()
           for item in candidate.get("points") or []):
        return True
    # Windowed clause chunks may carry only the point text present in that window.
    return _contains(candidate.get("text"), evidence)


def _hit_candidate(chunk) -> dict:
    return {
        "doc_id": chunk.doc_id, "article": chunk.article, "clause": chunk.clause,
        "point": chunk.point, "page": chunk.page, "text": chunk.text, "points": chunk.points,
    }


def _citation_candidate(citation: dict) -> dict:
    return {
        "doc_id": citation.get("doc_id"), "article": citation.get("article"),
        "clause": citation.get("clause"), "point": citation.get("point"),
        "page": citation.get("page"), "text": citation.get("quote", ""), "points": [],
    }


def evaluate(index: RagIndex, questions: list[dict], today: date, ks=(1, 3, 5), answer_fn=None) -> dict:
    answer_fn = answer_fn or answer_extractive
    llm_fallbacks = 0
    refresh_statuses(index.docs, today)
    max_k = max(ks)
    hits_at = {k: 0 for k in ks}
    legacy_hits_at = {k: 0 for k in ks}
    rr_sum = 0.0
    legacy_rr_sum = 0.0
    n_ans = n_unans = 0
    n_attacks = refused_attacks = 0
    answered = first_ok = any_ok = 0
    legacy_first_ok = legacy_any_ok = 0
    verbatim_total = verbatim_ok = 0
    correct_refusals = false_refusals = 0
    warn_expected = warn_ok = 0
    evidence_expected = evidence_first = evidence_any = 0
    false_accepts = cit_total = cit_ok = strict_ok = strict_ok_verified = 0
    failures = []
    for q in questions:
        expected = q.get("expected", [])
        legacy_expected = {
            _key(e["doc_id"], e.get("article"), e.get("clause"), e.get("page")): e.get("evidence")
            for e in expected
        }
        answerable = q.get("answerable", bool(expected))
        res = answer_fn(index, q["question"], q.get("cohort"), today)
        if res.get("llm_fallback"):
            llm_fallbacks += 1
            failures.append({"id": q["id"], "problem": "LLM quay về extractive",
                             "reason": res.get("fallback_reason")})
        for c in res["citations"]:
            verbatim_total += 1
            src = index.chunk_by_id.get(c["chunk_id"])
            if src is not None and c["quote"] in src.text:
                verbatim_ok += 1
        if not answerable:
            n_unans += 1
            if q.get("attack"):
                n_attacks += 1
                refused_attacks += not res["found"]
            if not res["found"]:
                correct_refusals += 1
            else:
                false_accepts += 1
                failures.append({"id": q["id"], "problem": "không từ chối", "got": res["citations"][0]["chunk_id"]})
            continue
        n_ans += 1
        expects_evidence = any(e.get("evidence") for e in expected)
        evidence_expected += expects_evidence
        rr = retrieve(index, q["question"], q.get("cohort"), today, top_k=max_k)
        ranked, seen = [], set()
        grouped: list[list[dict]] = []
        for h in rr.hits:
            k_ = _key(h.chunk.doc_id, h.chunk.article, h.chunk.clause,
                      h.chunk.page if h.chunk.source_type == "handbook" else None)
            candidate = _hit_candidate(h.chunk)
            if k_ not in seen:
                seen.add(k_)
                ranked.append(k_)
                grouped.append([candidate])
            else:
                grouped[ranked.index(k_)].append(candidate)
        legacy_rank = next((i + 1 for i, k_ in enumerate(ranked[:max_k]) if k_ in legacy_expected), None)
        rank = next((i + 1 for i, candidates in enumerate(grouped[:max_k])
                     if any(_matches(e, candidate) for e in expected for candidate in candidates)), None)
        for k in ks:
            if rank is not None and rank <= k:
                hits_at[k] += 1
            if legacy_rank is not None and legacy_rank <= k:
                legacy_hits_at[k] += 1
        rr_sum += 1.0 / rank if rank else 0.0
        legacy_rr_sum += 1.0 / legacy_rank if legacy_rank else 0.0
        if q.get("expect_warning"):
            warn_expected += 1
            warn_ok += 1 if res["warnings"] else 0
        if not res["found"]:
            false_refusals += 1
            failures.append({"id": q["id"], "problem": "từ chối sai", "rank": rank})
            continue
        answered += 1
        citations = [_citation_candidate(c) for c in res["citations"]]
        cits = [_key(c["doc_id"], c["article"], c["clause"], c["page"] if c.get("source_type") == "handbook" else None)
                for c in res["citations"]]
        matches = [any(_matches(e, candidate) for e in expected) for candidate in citations]
        legacy_matches = [key in legacy_expected for key in cits]
        if matches and matches[0]:
            first_ok += 1
        else:
            failures.append({"id": q["id"], "problem": "trích dẫn đầu sai", "got": cits[:3],
                             "expected": [_key(e["doc_id"], e.get("article"), e.get("clause"), e.get("page"))
                                          + ((str(e.get("point")),) if e.get("point") else ()) for e in expected],
                             "rank": rank})
        if any(matches):
            any_ok += 1
        cit_total += len(matches)
        cit_ok += sum(matches)
        first_evidence_ok = not expects_evidence or bool(res["citations"]) and any(
            str(e.get("doc_id")) == str(res["citations"][0].get("doc_id"))
            and _contains(res["citations"][0].get("quote"), e.get("evidence")) for e in expected)
        strict_ok += bool(matches and matches[0] and first_evidence_ok)
        strict_ok_verified += bool(matches and matches[0] and expects_evidence and first_evidence_ok)
        legacy_first_ok += bool(legacy_matches and legacy_matches[0])
        legacy_any_ok += any(legacy_matches)
        if expects_evidence:
            evidence_matches = [
                any(str(e.get("doc_id")) == str(citation.get("doc_id"))
                    and _contains(citation.get("quote"), e.get("evidence")) for e in expected)
                for citation in res["citations"]
            ]
            evidence_first += bool(evidence_matches and evidence_matches[0])
            evidence_any += any(evidence_matches)
            if not any(evidence_matches):
                failures.append({"id": q["id"], "problem": "thiếu đoạn chứa đáp án", "got": cits})

    def ratio(a, b):
        return round(a / b, 4) if b else None

    def wilson(a, b, z=1.96):
        if not b:
            return None
        p = a / b
        centre = (p + z * z / (2 * b)) / (1 + z * z / b)
        half = z * ((p * (1 - p) / b + z * z / (4 * b * b)) ** 0.5) / (1 + z * z / b)
        return [round(centre - half, 4), round(centre + half, 4)]

    shown = answered + false_accepts
    return {
        # Precision: of all answers shown (incl. wrongly answered out-of-scope questions), the share whose
        # first citation is a valid locator and, when the question has evidence, whose quote contains it.
        "llm_fallbacks": llm_fallbacks,
        "precision_strict": ratio(strict_ok, shown),
        "precision_strict_ci95": wilson(strict_ok, shown),
        "precision_answers_shown": shown,
        "precision_evidence_verified": strict_ok_verified,
        "citation_precision_all": ratio(cit_ok, cit_total),
        "n_questions": len(questions),
        "n_answerable": n_ans,
        "n_unanswerable": n_unans,
        "n_attacks": n_attacks,
        "refused_attacks": refused_attacks,
        "recall_at_k": {str(k): ratio(hits_at[k], n_ans) for k in ks},
        "legacy_recall_at_k": {str(k): ratio(legacy_hits_at[k], n_ans) for k in ks},
        "mrr": ratio(rr_sum, n_ans),
        "legacy_mrr": ratio(legacy_rr_sum, n_ans),
        "answered_rate": ratio(answered, n_ans),
        "citation_accuracy_first": ratio(first_ok, n_ans),
        "citation_accuracy_any": ratio(any_ok, n_ans),
        "legacy_citation_accuracy_first": ratio(legacy_first_ok, n_ans),
        "legacy_citation_accuracy_any": ratio(legacy_any_ok, n_ans),
        "citation_precision_first_when_answered": ratio(first_ok, answered),
        "verbatim_quote_rate": ratio(verbatim_ok, verbatim_total),
        "correct_refusal_rate": ratio(correct_refusals, n_unans),
        "false_refusal_rate": ratio(false_refusals, n_ans),
        "validity_warning_rate": ratio(warn_ok, warn_expected),
        "evidence_accuracy_first": ratio(evidence_first, evidence_expected),
        "evidence_accuracy_any": ratio(evidence_any, evidence_expected),
        "failures": failures,
    }


def format_report(r: dict) -> str:
    lines = [
        f"Số câu hỏi: {r['n_questions']} (trả lời được: {r['n_answerable']}, ngoài phạm vi: {r['n_unanswerable']})",
        "Truy xuất:   " + "  ".join(f"Recall@{k}={v}" for k, v in r["recall_at_k"].items()) + f"  MRR={r['mrr']}",
        "Metric cũ:   " + "  ".join(f"Recall@{k}={v}" for k, v in r["legacy_recall_at_k"].items())
        + f"  MRR={r['legacy_mrr']}",
        f"Trích dẫn:   đúng (trích dẫn đầu)={r['citation_accuracy_first']}  đúng (bất kỳ)={r['citation_accuracy_any']}  "
        f"nguyên văn={r['verbatim_quote_rate']}",
        f"Trích dẫn cũ: đầu={r['legacy_citation_accuracy_first']}  bất kỳ={r['legacy_citation_accuracy_any']}",
        f"Từ chối:     đúng (ngoài phạm vi)={r['correct_refusal_rate']}  sai (trong phạm vi)={r['false_refusal_rate']}",
        f"Cảnh báo hiệu lực khi cần: {r['validity_warning_rate']}",
    ]
    if r["evidence_accuracy_any"] is not None:
        lines.append(f"Đoạn chứa đáp án: trích dẫn đầu={r['evidence_accuracy_first']}  "
                     f"bất kỳ={r['evidence_accuracy_any']}")
    lines.append(f"Precision chặt: {r['precision_strict']} (KTC95% {r['precision_strict_ci95']}, "
                 f"{r['precision_answers_shown']} câu được trả lời, {r['precision_evidence_verified']} câu kiểm "
                 f"được đoạn đáp án)  Precision mọi trích dẫn={r['citation_precision_all']}  "
                 f"Tỷ lệ được trả lời={r['answered_rate']}  LLM quay về extractive={r['llm_fallbacks']}")
    if r["failures"]:
        lines.append("Lỗi:")
        lines += [f"  - {json.dumps(f, ensure_ascii=False)}" for f in r["failures"]]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> dict:
    ap = argparse.ArgumentParser(description="Đánh giá RAG quy chế (Recall@k, trích dẫn, từ chối)")
    ap.add_argument("--regulations-dir", type=Path, default=REAL_REGULATIONS)
    ap.add_argument("--fixture", action="store_true", help="dùng văn bản và câu hỏi mẫu")
    storage = ap.add_mutually_exclusive_group()
    storage.add_argument("--index-dir", type=Path, help="dùng chỉ mục đã build thay vì build mới")
    storage.add_argument("--database", action="store_true", help="đọc chỉ mục đã nạp vào PostgreSQL")
    storage.add_argument("--db-roundtrip", action="store_true", help="kiểm tra lưu/đọc SQL bằng SQLite trong bộ nhớ")
    ap.add_argument("--questions", type=Path)
    ap.add_argument("--subset", choices=("all", "regulations", "handbook"), default="all")
    ap.add_argument("--today", type=str, default=None, help="YYYY-MM-DD (mặc định: 2026-11-20 cho fixture, hôm nay cho dữ liệu thật)")
    ap.add_argument("--k", type=str, default="1,3,5")
    ap.add_argument("--json", type=Path, default=None, help="ghi kết quả JSON")
    ap.add_argument("--mode", choices=("extractive", "llm"), default="extractive",
                    help="llm: gọi LLM thật theo LLM_PROVIDER (tốn phí, không dùng trong pytest)")
    args = ap.parse_args(argv)

    if args.today:
        today = date.fromisoformat(args.today)
    elif args.fixture:
        today = FIXTURE_TODAY
    else:
        today = date.today()
    if args.database:
        from app.db import engine
        from app.rag.storage import load_db_index

        index = load_db_index(engine)
        if index is None:
            ap.error("Chưa nạp chỉ mục quy chế vào DB")
    elif args.index_dir:
        index = RagIndex.load(args.index_dir)
    else:
        index, _ = build_index(FIXTURE_DIR if args.fixture else args.regulations_dir, today=today)
    if args.db_roundtrip:
        from sqlalchemy import create_engine

        from app.db import Base
        from app.rag.storage import load_db_index, publish_index

        scratch = create_engine("sqlite://")
        Base.metadata.create_all(scratch)
        publish_index(scratch, index)
        index = load_db_index(scratch)
    ks = tuple(int(x) for x in args.k.split(","))
    questions = args.questions or (HERE / "fixture_questions.jsonl" if args.fixture else DEFAULT_QUESTIONS)
    dataset = load_questions(questions)
    if args.subset != "all":
        dataset = [q for q in dataset if (q.get("source_type") == "handbook") == (args.subset == "handbook")]
    answer_fn = None
    if args.mode == "llm":
        from app.rag.answer import answer_llm
        from app.rag.providers import get_provider

        provider = get_provider()
        if not provider.available():
            ap.error("Chưa cấu hình LLM_PROVIDER / khóa API")

        def answer_fn(idx, question, cohort, day):
            return answer_llm(idx, question, cohort, day, provider)
    result = evaluate(index, dataset, today, ks, answer_fn)
    result["mode"] = args.mode
    result["today"] = today.isoformat()
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass
    print(format_report(result))
    if args.json:
        args.json.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


if __name__ == "__main__":
    main()
