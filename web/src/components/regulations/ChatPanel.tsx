"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { effectiveBadge } from "@/lib/regulations";
import { articleClauseAnchor, wikilinkHref } from "@/lib/vault";
import type { Citation } from "@/lib/types";
import { Loading, EffectiveBadgeChip } from "@/components/ui";
import { useT } from "@/i18n";
import { activeConversation, useRegChat, type ChatMsg } from "@/lib/regChatStore";
import { findRegulationChatTargets, regulationQuery, type RegulationChatTarget } from "@/lib/chatLookup";
import { useMounted } from "@/lib/useMounted";
import { COHORTS, useSettings } from "@/lib/store";

export function CitationChip({ c, i }: { c: Citation; i: number }) {
  const { t } = useT();

  const anchor = c.anchor ?? (c.article ? articleClauseAnchor(c.article, c.clause) : undefined);
  const badge = c.status
    ? effectiveBadge({
        status: c.status,
        effective_from: c.effective_from ?? "",
        effective_to: c.effective_to,
      })
    : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-900">
      {c.source_url ? (
        <a
          href={c.source_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => useRegChat.getState().closeChat()}
          className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 font-mono font-medium text-violet-800 hover:bg-violet-200 dark:bg-violet-900/50 dark:text-violet-200"
          title={t("cit.openSource")}
        >
          {c.label ?? <>[[{c.decision_no} · {c.article}{c.clause ? ` K${c.clause}` : ""}]]</>}
        </a>
      ) : (
        <Link
          href={wikilinkHref(c.doc_id, anchor)}
          onNavigate={() => {
            useRegChat.getState().closeChat();
            useWorkspace.getState().open(c.doc_id, anchor);
          }}
          className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 font-mono font-medium text-violet-800 hover:bg-violet-200 dark:bg-violet-900/50 dark:text-violet-200"
          title={t("cit.open")}
        >
          {c.label ?? <>[[{c.decision_no} · {c.article}{c.clause ? ` K${c.clause}` : ""}]]</>}
        </Link>
      )}
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

const EMPTY_MESSAGES: ChatMsg[] = [];

/** Cohort line: taken from the program profile; otherwise the assistant asks when it matters. */
export function ChatCohortHint() {
  const { t } = useT();
  const mounted = useMounted();
  const profileCohort = useSettings((s) => s.cohort);
  const sessionCohort = useRegChat((s) => activeConversation(s)?.cohort);
  const cohort = mounted ? profileCohort || sessionCohort : "";
  return (
    <p className="mb-2 text-[11px] text-slate-500">
      {cohort
        ? t(profileCohort ? "chat.cohortProfile" : "chat.cohortSession", { c: cohort })
        : t("chat.cohortAsk")}
      {t("chat.rule")}
    </p>
  );
}

export function ChatPanel() {
  const { t } = useT();
  const mounted = useMounted();
  const [q, setQ] = useState("");
  const [lookupHidden, setLookupHidden] = useState(false);
  const [lookup, setLookup] = useState<{ key: string; targets?: RegulationChatTarget[] }>();
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const suggestionsId = useId();

  const msgs = useRegChat((s) => activeConversation(s)?.messages ?? EMPTY_MESSAGES);
  const busy = useRegChat((s) => s.activeId !== null && s.pendingIds.includes(s.activeId));
  const ask = useRegChat((s) => s.ask);

  const query = regulationQuery(q);
  const showLookup = query !== null && !lookupHidden && !busy;
  const result = lookup?.key === query ? lookup : undefined;

  useEffect(() => {
    if (query === null || !showLookup) return;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const targets = await findRegulationChatTargets(query);
        if (current) setLookup({ key: query, targets });
      } catch {
        if (current) setLookup({ key: query });
      }
    }, query ? 250 : 0);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, showLookup]);

  const pending = useWorkspace((s) => s.pendingQuestion);

  // Question handed over from the command palette
  useEffect(() => {
    if (!pending || busy) return;
    const qq = useWorkspace.getState().takeQuestion();
    if (qq) {
      ask(qq);
    }
  }, [pending, ask, busy]);

  useEffect(() => {
    const messages = messagesRef.current;
    if (messages) messages.scrollTop = messages.scrollHeight;
  }, [msgs, busy, mounted]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim() || query === "" || busy) return;
    const question = q;
    setQ("");
    void ask(question);
  };

  const selectTarget = (target: RegulationChatTarget) => {
    setQ("");
    inputRef.current?.focus();
    void ask(`/${target.title}`, undefined, target);
  };

  const openLookup = () => {
    setQ("/");
    setLookupHidden(false);
    inputRef.current?.focus();
  };

  const lastIndex = msgs.length - 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatCohortHint />

      {/* Vùng tin nhắn cuộn */}
      <div
        ref={messagesRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1"
        role="log"
        aria-label={t("chat.messages")}
        aria-live="polite"
      >
        {(!mounted || msgs.length === 0) && (
          <div className="space-y-1.5 py-2">
            <p className="mb-2 text-xs text-slate-500">
              {t("chat.emptyPlaceholder")}
            </p>
            {[t("chat.s1"), t("chat.s2"), t("chat.s3")].map((x) => (
              <button
                key={x}
                type="button"
                className="block w-full rounded-lg bg-slate-100 px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={() => ask(x)}
              >
                ✦ {x}
              </button>
            ))}
          </div>
        )}

        {mounted && msgs.map((m, i) =>
          m.role === "user" ? (
            <div
              key={i}
              className="ml-6 break-words rounded-lg bg-brand-600 px-3 py-2 text-sm text-white shadow-xs"
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
              {(m.res ?? m.moduleRes)?.warnings.map((w, k) => (
                <p key={k} className="text-xs text-amber-700 dark:text-amber-300">
                  ⚠ {w}
                </p>
              ))}
              {m.res?.mode === "context" && <p className="text-xs font-medium text-slate-500">{t("chat.workspaceContext")}</p>}
              <p className="whitespace-pre-line break-words leading-relaxed">{m.text}</p>
              {m.res?.workspace_summary && (
                <div className="border-t border-slate-200 pt-2 text-xs dark:border-slate-700">
                  <p className="font-medium">{t("chat.workspaceContext")}</p>
                  <p className="whitespace-pre-line">{m.res.workspace_summary}</p>
                </div>
              )}
              {m.targets?.map((source) => (
                <Link key={source.id}
                  href={source.scope === "modules" ? `/modules/${encodeURIComponent(source.id)}` : wikilinkHref(source.id)}
                  onNavigate={() => useRegChat.getState().closeChat()}
                  className="block break-words rounded-lg border border-slate-200 bg-white p-2 text-brand-ink hover:underline dark:border-slate-700 dark:bg-slate-900">
                  {[source.number, source.title].filter(Boolean).join(" · ")}
                </Link>
              ))}
              {m.moduleRes?.citations.map((citation, k) => (
                <div key={k} className="rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-900">
                  <Link href={`/modules/${encodeURIComponent(citation.code)}`} className="font-medium text-brand-ink underline"
                    onNavigate={() => useRegChat.getState().closeChat()}>
                    {citation.code} · {t(`ask.${citation.kind}`)}
                  </Link>
                  {citation.ctdt_year && <span className="ml-1 text-slate-500">· {t("ask.curriculum", { year: citation.ctdt_year })}</span>}
                  {citation.quote && <blockquote className="mt-1 whitespace-pre-line break-words">{citation.quote}</blockquote>}
                </div>
              ))}
              {m.res?.clarify && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("chat.clarifyOptions")}>
                  {(m.res.clarify.kind === "cohort" ? COHORTS : m.res.clarify.options).map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={busy || i !== lastIndex}
                      onClick={() => ask(option)}
                      className="rounded-full border border-brand-300 bg-white px-3 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-50 disabled:cursor-default disabled:opacity-50 dark:border-brand-700 dark:bg-slate-900 dark:text-brand-300"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
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
      </div>

      {/* Ô nhập câu hỏi */}
      <form className="mt-2.5 flex gap-2 border-t border-slate-100 pt-2 dark:border-slate-800" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="input min-w-0 flex-1"
          value={q}
          maxLength={500}
          onChange={(e) => { setQ(e.target.value); setLookupHidden(false); }}
          onKeyDown={(e) => {
            if (!showLookup || e.nativeEvent.isComposing) return;
            if (e.key === "Escape") {
              e.preventDefault();
              setLookupHidden(true);
            } else if (e.key === "ArrowDown" && result?.targets?.length) {
              e.preventDefault();
              suggestionsRef.current?.querySelector("button")?.focus();
            }
          }}
          placeholder={t("chat.placeholder")}
          aria-label={t("chat.question")}
          aria-controls={showLookup ? suggestionsId : undefined}
        />
        <button
          type="submit"
          className="btn-primary shrink-0"
          disabled={busy || !q.trim() || query === ""}
        >
          {t("chat.send")}
        </button>
      </form>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <button type="button" disabled={busy} className="btn-ghost px-2 py-1 text-xs" onClick={openLookup}>
          {t("chat.commandRegulations")}
        </button>
      </div>
      {showLookup && (
        <div id={suggestionsId} ref={suggestionsRef} role="group" aria-label={t("chat.suggestions")}
          className="mt-1 max-h-[min(10rem,25dvh)] shrink-0 space-y-1 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 p-1 dark:border-slate-700"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            setLookupHidden(true);
            inputRef.current?.focus();
          }}>
          {!result?.targets?.length && (
            <p role="status" className="px-2 py-1 text-xs text-slate-500">
              {t(!result ? "common.loading" : result.targets ? "chat.noSuggestions" : "chat.lookupFailed")}
            </p>
          )}
          {result?.targets?.map((target) => (
            <button key={target.id} type="button" onClick={() => selectTarget(target)}
              className="block w-full break-words rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
              {target.number && <span className="mr-1.5 font-mono font-medium">{target.number}</span>}
              {target.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
