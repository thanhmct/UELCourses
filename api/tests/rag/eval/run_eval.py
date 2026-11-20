"""Evaluate the regulations RAG pipeline.

Metrics (for the thesis evaluation chapter):
  * Recall@k / MRR          - retrieval: is an expected (doc_id, Điều, Khoản) among the top-k chunks
                              (within the cohort's applicable documents)?
  * Citation accuracy       - extractive answer: first citation == expected (doc, Điều, Khoản);
                              any-citation accuracy; verbatim rate (quote is an exact substring of the source).
  * Refusal                 - correct refusal rate on out-of-scope questions, false refusal rate on in-scope ones.

Usage (from api/):
  python tests/rag/eval/run_eval.py                       # sample fixture (default)
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
from app.rag.validity import refresh_statuses  # noqa: E402

FIXTURE_DIR = HERE.parent / "fixtures" / "regulations"
FIXTURE_TODAY = date(2026, 11, 20)  # fixed date so fixture statuses are reproducible
DEFAULT_QUESTIONS = HERE / "questions.jsonl"


def load_questions(path: Path) -> list[dict]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            out.append(json.loads(line))
    return out


def _key(doc_id, article, clause) -> tuple[str, str, str]:
    return (str(doc_id), str(article or ""), str(clause or ""))


def evaluate(index: RagIndex, questions: list[dict], today: date, ks=(1, 3, 5)) -> dict:
    refresh_statuses(index.docs, today)
    max_k = max(ks)
    hits_at = {k: 0 for k in ks}
    rr_sum = 0.0
    n_ans = n_unans = 0
    answered = first_ok = any_ok = 0
    verbatim_total = verbatim_ok = 0
    correct_refusals = false_refusals = 0
    warn_expected = warn_ok = 0
    failures = []
    for q in questions:
        expected = {_key(e["doc_id"], e.get("article"), e.get("clause")) for e in q.get("expected", [])}
        answerable = q.get("answerable", bool(expected))
        res = answer_extractive(index, q["question"], q.get("cohort"), today)
        for c in res["citations"]:
            verbatim_total += 1
            src = index.chunk_by_id.get(c["chunk_id"])
            if src is not None and c["quote"] in src.text:
                verbatim_ok += 1
        if not answerable:
            n_unans += 1
            if not res["found"]:
                correct_refusals += 1
            else:
                failures.append({"id": q["id"], "problem": "không từ chối", "got": res["citations"][0]["chunk_id"]})
            continue
        n_ans += 1
        rr = retrieve(index, q["question"], q.get("cohort"), today, top_k=max_k)
        ranked, seen = [], set()
        for h in rr.hits:
            k_ = _key(h.chunk.doc_id, h.chunk.article, h.chunk.clause)
            if k_ not in seen:
                seen.add(k_)
                ranked.append(k_)
        rank = next((i + 1 for i, k_ in enumerate(ranked[:max_k]) if k_ in expected), None)
        for k in ks:
            if rank is not None and rank <= k:
                hits_at[k] += 1
        rr_sum += 1.0 / rank if rank else 0.0
        if q.get("expect_warning"):
            warn_expected += 1
            warn_ok += 1 if res["warnings"] else 0
        if not res["found"]:
            false_refusals += 1
            failures.append({"id": q["id"], "problem": "từ chối sai", "rank": rank})
            continue
        answered += 1
        cits = [_key(c["doc_id"], c["article"], c["clause"]) for c in res["citations"]]
        if cits and cits[0] in expected:
            first_ok += 1
        else:
            failures.append({"id": q["id"], "problem": "trích dẫn đầu sai", "got": cits[:3],
                             "expected": sorted(expected), "rank": rank})
        if any(c in expected for c in cits):
            any_ok += 1

    def ratio(a, b):
        return round(a / b, 4) if b else None

    return {
        "n_questions": len(questions),
        "n_answerable": n_ans,
        "n_unanswerable": n_unans,
        "recall_at_k": {str(k): ratio(hits_at[k], n_ans) for k in ks},
        "mrr": ratio(rr_sum, n_ans),
        "answered_rate": ratio(answered, n_ans),
        "citation_accuracy_first": ratio(first_ok, n_ans),
        "citation_accuracy_any": ratio(any_ok, n_ans),
        "citation_precision_first_when_answered": ratio(first_ok, answered),
        "verbatim_quote_rate": ratio(verbatim_ok, verbatim_total),
        "correct_refusal_rate": ratio(correct_refusals, n_unans),
        "false_refusal_rate": ratio(false_refusals, n_ans),
        "validity_warning_rate": ratio(warn_ok, warn_expected),
        "failures": failures,
    }


def format_report(r: dict) -> str:
    lines = [
        f"Số câu hỏi: {r['n_questions']} (trả lời được: {r['n_answerable']}, ngoài phạm vi: {r['n_unanswerable']})",
        "Truy xuất:   " + "  ".join(f"Recall@{k}={v}" for k, v in r["recall_at_k"].items()) + f"  MRR={r['mrr']}",
        f"Trích dẫn:   đúng (trích dẫn đầu)={r['citation_accuracy_first']}  đúng (bất kỳ)={r['citation_accuracy_any']}  "
        f"nguyên văn={r['verbatim_quote_rate']}",
        f"Từ chối:     đúng (ngoài phạm vi)={r['correct_refusal_rate']}  sai (trong phạm vi)={r['false_refusal_rate']}",
        f"Cảnh báo hiệu lực khi cần: {r['validity_warning_rate']}",
    ]
    if r["failures"]:
        lines.append("Lỗi:")
        lines += [f"  - {json.dumps(f, ensure_ascii=False)}" for f in r["failures"]]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> dict:
    ap = argparse.ArgumentParser(description="Đánh giá RAG quy chế (Recall@k, trích dẫn, từ chối)")
    ap.add_argument("--regulations-dir", type=Path, default=None, help="thư mục có catalog.json (mặc định: fixture mẫu)")
    ap.add_argument("--index-dir", type=Path, default=None, help="dùng chỉ mục đã build thay vì build mới")
    ap.add_argument("--questions", type=Path, default=DEFAULT_QUESTIONS)
    ap.add_argument("--today", type=str, default=None, help="YYYY-MM-DD (mặc định: 2026-11-20 cho fixture, hôm nay cho dữ liệu thật)")
    ap.add_argument("--k", type=str, default="1,3,5")
    ap.add_argument("--json", type=Path, default=None, help="ghi kết quả JSON")
    args = ap.parse_args(argv)

    if args.today:
        today = date.fromisoformat(args.today)
    elif args.regulations_dir is None and args.index_dir is None:
        today = FIXTURE_TODAY
    else:
        today = date.today()
    if args.index_dir:
        index = RagIndex.load(args.index_dir)
    else:
        index, _ = build_index(args.regulations_dir or FIXTURE_DIR, today=today)
    ks = tuple(int(x) for x in args.k.split(","))
    result = evaluate(index, load_questions(args.questions), today, ks)
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
