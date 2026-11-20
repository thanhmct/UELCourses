"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { COHORTS } from "@/lib/cohort";
import { diffWords } from "@/lib/vault";
import type { CompareResponse } from "@/lib/types";
import { Loading } from "@/components/ui";

/** Side-by-side comparison of one topic between two cohorts, with word-level differences marked. */
export function ComparePanel({ defaultCohort }: { defaultCohort: string }) {
  const [topic, setTopic] = useState("tín chỉ tối đa học kỳ");
  const [a, setA] = useState(defaultCohort || "K22");
  const [b, setB] = useState(defaultCohort === "K25" ? "K22" : "K25");
  const [res, setRes] = useState<CompareResponse | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!topic.trim()) return;
    setBusy(true);
    try {
      setRes((await api.compare(topic.trim(), [a, b])).data);
    } finally {
      setBusy(false);
    }
  }
  const rowA = res?.rows.find((r) => r.cohort === a);
  const rowB = res?.rows.find((r) => r.cohort === b);
  const diff = rowA && rowB ? diffWords(rowA.quote, rowB.quote) : [];

  return (
    <div className="space-y-3">
      <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Chủ đề, VD: cảnh báo học tập" aria-label="Chủ đề so sánh" />
        <select className="input" value={a} onChange={(e) => setA(e.target.value)} aria-label="Khóa A">{COHORTS.map((c) => <option key={c}>{c}</option>)}</select>
        <select className="input" value={b} onChange={(e) => setB(e.target.value)} aria-label="Khóa B">{COHORTS.map((c) => <option key={c}>{c}</option>)}</select>
        <button className="btn-primary" disabled={busy || a === b}>So sánh</button>
      </form>
      {a === b && <p className="text-xs text-amber-600">Chọn hai khóa khác nhau.</p>}
      {busy && <Loading />}
      {res && rowA && rowB && (
        <>
          {res.differences.length > 0 ? (
            <ul className="rounded-lg bg-brand-50 p-2 text-sm dark:bg-brand-900/30">{res.differences.map((d, i) => <li key={i}>• {d}</li>)}</ul>
          ) : (
            <p className="text-sm text-slate-500">Không phát hiện khác biệt.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {[{ row: rowA, side: "del" as const }, { row: rowB, side: "add" as const }].map(({ row, side }) => (
              <div key={row.cohort} className="card p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-lg font-bold">{row.cohort}</span>
                  <span className="text-xs text-slate-500">{row.doc} · {row.article}</span>
                </div>
                <p className="text-sm leading-relaxed">
                  {diff.map((p, i) =>
                    p.type === "same" ? (
                      <span key={i}>{p.text}</span>
                    ) : p.type === side ? (
                      <mark key={i} className={side === "del" ? "rounded bg-red-200 px-0.5 dark:bg-red-900/70 dark:text-red-100" : "rounded bg-emerald-200 px-0.5 dark:bg-emerald-900/70 dark:text-emerald-100"}>{p.text}</mark>
                    ) : null,
                  )}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">Phần tô đỏ chỉ có ở {a}, phần tô xanh chỉ có ở {b}.</p>
        </>
      )}
    </div>
  );
}
