"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { effectiveBadge } from "@/lib/regulations";
import { articleClauseAnchor } from "@/lib/vault";
import type { AskResponse, Citation } from "@/lib/types";
import { EffectiveBadgeChip } from "@/components/ui";
import { useT } from "@/i18n";

interface Msg {
  role: "user" | "ai";
  text: string;
  res?: AskResponse;
  error?: boolean;
}

function CitationChip({ c, i }: { c: Citation; i: number }) {
  const { t } = useT();
  const open = useWorkspace((s) => s.open);
  const anchor = articleClauseAnchor(c.article, c.clause);
  const badge = c.status ? effectiveBadge({ status: c.status, effective_from: c.effective_from ?? "", effective_to: c.effective_to }) : null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-900">
      <button
        onClick={() => open(c.doc_id, anchor)}
        className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 font-mono font-medium text-violet-800 hover:bg-violet-200 dark:bg-violet-900/50 dark:text-violet-200"
        title={t("cit.open")}
      >
        [[{c.decision_no} · {c.article}{c.clause ? ` K${c.clause}` : ""}]]
      </button>
      <span className="ml-1 text-slate-400">[{i + 1}]</span>
      {badge && badge !== "active" && <span className="ml-1"><EffectiveBadgeChip badge={badge} /></span>}
      {c.metadata_verified !== true && (
        <span className="ml-1 chip bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200" title={t("cit.unverifiedTitle")}>{t("cit.unverified")}</span>
      )}
      <blockquote className="mt-1 border-l-2 border-violet-300 pl-2 italic text-slate-700 dark:text-slate-300">“{c.quote}”</blockquote>
    </div>
  );
}

export function ChatPanel({ cohort }: { cohort: string }) {
  const { t } = useT();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"extractive" | "llm">("extractive");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const pending = useWorkspace((s) => s.pendingQuestion);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setQ("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res = (await api.ask(text, cohort || undefined, mode)).data;
      setMsgs((m) => [...m, { role: "ai", text: res.answer, res }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "ai", text: t("chat.error", { m: e instanceof Error ? e.message : String(e) }), error: true }]);
    } finally {
      setBusy(false);
    }
  }

  // Question handed over from the command palette
  useEffect(() => {
    if (!pending) return;
    const qq = useWorkspace.getState().takeQuestion();
    if (qq) ask(qq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t("chat.title")}</h2>
        <select className="input w-auto py-1 text-xs" value={mode} onChange={(e) => setMode(e.target.value as "extractive" | "llm")} aria-label={t("chat.mode")}>
          <option value="extractive">{t("chat.modeExt")}</option>
          <option value="llm">{t("chat.modeLlm")}</option>
        </select>
      </div>
      <p className="mb-2 text-[11px] text-slate-500">
        {cohort ? t("chat.cohortOn", { c: cohort }) : t("chat.noCohort")}
        {t("chat.rule")}
      </p>
      <div className="flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {msgs.length === 0 && (
          <div className="space-y-1">
            {[t("chat.s1"), t("chat.s2"), t("chat.s3")].map((x) => (
              <button key={x} className="block w-full rounded-lg bg-slate-100 px-3 py-2 text-left text-xs hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700" onClick={() => ask(x)}>{x}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-6 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white">{m.text}</div>
          ) : (
            <div key={i} className={`space-y-2 rounded-lg px-3 py-2 text-sm ${m.error ? "bg-red-50 text-red-700 dark:bg-red-950/40" : "bg-slate-100 dark:bg-slate-800"}`}>
              {m.res && (
                <div className="flex flex-wrap gap-1 text-[11px]">
                  <span className="chip bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    {m.res.mode === "llm" ? t("chat.infoLlm") : t("chat.infoExt")}
                  </span>
                  {mode === "llm" && m.res.mode === "extractive" && <span className="chip bg-amber-100 text-amber-800">{t("chat.downgraded")}</span>}
                </div>
              )}
              {m.res?.warnings.map((w, k) => <p key={k} className="text-xs text-amber-700 dark:text-amber-300">⚠ {w}</p>)}
              <p className="whitespace-pre-line">{m.text}</p>
              {m.res?.citations.map((c, k) => <CitationChip key={k} c={c} i={k} />)}
            </div>
          ),
        )}
        {busy && <p className="text-xs text-slate-500" role="status">{t("chat.searching")}</p>}
        <div ref={endRef} />
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("chat.placeholder")} aria-label={t("chat.question")} />
        <button className="btn-primary shrink-0" disabled={busy || !q.trim()}>{t("chat.send")}</button>
      </form>
    </div>
  );
}
