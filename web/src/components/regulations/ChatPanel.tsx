"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace";
import { effectiveBadge } from "@/lib/regulations";
import { articleClauseAnchor } from "@/lib/vault";
import type { Citation } from "@/lib/types";
import { Loading, EffectiveBadgeChip } from "@/components/ui";
import { useT } from "@/i18n";
import { useRegChat } from "@/lib/regChatStore";
import { useSettings } from "@/lib/store";

export function CitationChip({ c, i }: { c: Citation; i: number }) {
  const { t } = useT();
  const open = useWorkspace((s) => s.open);
  const router = useRouter();
  const path = usePathname();

  const anchor = c.label ? c.anchor ?? undefined : (c.article ? articleClauseAnchor(c.article, c.clause) : undefined);
  const badge = c.status
    ? effectiveBadge({
        status: c.status,
        effective_from: c.effective_from ?? "",
        effective_to: c.effective_to,
      })
    : null;

  const handleOpenDoc = () => {
    open(c.doc_id, anchor);
    if (path !== "/regulations") {
      router.push("/regulations");
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-900">
      <button
        onClick={handleOpenDoc}
        className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 font-mono font-medium text-violet-800 hover:bg-violet-200 dark:bg-violet-900/50 dark:text-violet-200"
        title={t("cit.open")}
      >
        {c.label ?? <>[[{c.decision_no} · {c.article}{c.clause ? ` K${c.clause}` : ""}]]</>}
      </button>
      <span className="ml-1 text-slate-400">[{i + 1}]</span>
      {c.source_label && <span className="ml-1 text-slate-500">{c.source_label}</span>}
      {badge && badge !== "active" && (
        <span className="ml-1">
          <EffectiveBadgeChip badge={badge} />
        </span>
      )}
      {c.metadata_verified !== true && (
        <span
          className="chip ml-1 bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200"
          title={t("cit.unverifiedTitle")}
        >
          {t("cit.unverified")}
        </span>
      )}
      <blockquote className="mt-1 border-l-2 border-violet-300 pl-2 italic text-slate-700 dark:text-slate-300">
        “{c.quote}”
      </blockquote>
    </div>
  );
}

export interface ChatPanelProps {
  cohort?: string;
  variant?: "page" | "popup" | "maximized";
  showHeader?: boolean;
}

export function ChatPanel({
  cohort: propCohort,
  variant = "page",
  showHeader = true,
}: ChatPanelProps) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const savedCohort = useSettings((s) => s.cohort);
  const storeCohort = useRegChat((s) => s.cohort);
  const activeCohort = propCohort ?? (storeCohort || savedCohort);

  const msgs = useRegChat((s) => s.messages);
  const mode = useRegChat((s) => s.mode);
  const setMode = useRegChat((s) => s.setMode);
  const busy = useRegChat((s) => s.busy);
  const ask = useRegChat((s) => s.ask);

  const pending = useWorkspace((s) => s.pendingQuestion);

  // Question handed over from the command palette
  useEffect(() => {
    if (!pending) return;
    const qq = useWorkspace.getState().takeQuestion();
    if (qq) {
      ask(qq, activeCohort);
    }
  }, [pending, ask, activeCohort]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim() || busy) return;
    const question = q;
    setQ("");
    ask(question, activeCohort);
  };

  return (
    <div className="flex h-full min-h-[360px] flex-col">
      {showHeader && (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">{t("chat.title")}</h2>
            <select
              className="input w-auto py-1 text-xs"
              value={mode}
              onChange={(e) => setMode(e.target.value as "extractive" | "llm")}
              aria-label={t("chat.mode")}
            >
              <option value="extractive">{t("chat.modeExt")}</option>
              <option value="llm">{t("chat.modeLlm")}</option>
            </select>
          </div>
          <p className="mb-2 text-[11px] text-slate-500">
            {activeCohort
              ? t("chat.cohortOn", { c: activeCohort })
              : t("chat.noCohort")}
            {t("chat.rule")}
          </p>
        </>
      )}

      {/* Vùng tin nhắn cuộn */}
      <div
        className="flex-1 space-y-3 overflow-y-auto pr-1"
        aria-live="polite"
      >
        {msgs.length === 0 && (
          <div className="space-y-1.5 py-2">
            <p className="mb-2 text-xs text-slate-500">
              {t("chat.emptyPlaceholder")}
            </p>
            {[t("chat.s1"), t("chat.s2"), t("chat.s3")].map((x) => (
              <button
                key={x}
                type="button"
                className="block w-full rounded-lg bg-slate-100 px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={() => ask(x, activeCohort)}
              >
                ✦ {x}
              </button>
            ))}
          </div>
        )}

        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div
              key={i}
              className="ml-6 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white shadow-xs"
            >
              {m.text}
            </div>
          ) : (
            <div
              key={i}
              className={`space-y-2 rounded-lg px-3 py-2 text-sm ${
                m.error
                  ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              }`}
            >
              {m.res && (
                <div className="flex flex-wrap gap-1 text-[11px]">
                  <span className="chip bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    {m.res.mode === "llm" ? t("chat.infoLlm") : t("chat.infoExt")}
                  </span>
                  {mode === "llm" && m.res.mode === "extractive" && (
                    <span className="chip bg-amber-100 text-amber-800">
                      {t("chat.downgraded")}
                    </span>
                  )}
                </div>
              )}
              {m.res?.warnings.map((w, k) => (
                <p key={k} className="text-xs text-amber-700 dark:text-amber-300">
                  ⚠ {w}
                </p>
              ))}
              <p className="whitespace-pre-line leading-relaxed">{m.text}</p>
              {m.res?.citations && m.res.citations.length > 0 && (
                <div className="mt-2 space-y-1.5 border-t border-slate-200/60 pt-2 dark:border-slate-700/60">
                  {m.res.citations.map((c, k) => (
                    <CitationChip key={k} c={c} i={k} />
                  ))}
                </div>
              )}
            </div>
          ),
        )}

        {busy && (
          <Loading compact />
        )}
        <div ref={endRef} />
      </div>

      {/* Ô nhập câu hỏi */}
      <form className="mt-2.5 flex gap-2 border-t border-slate-100 pt-2 dark:border-slate-800" onSubmit={handleSubmit}>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("chat.placeholder")}
          aria-label={t("chat.question")}
        />
        <button
          type="submit"
          className="btn-primary shrink-0"
          disabled={busy || !q.trim()}
        >
          {t("chat.send")}
        </button>
      </form>
    </div>
  );
}
