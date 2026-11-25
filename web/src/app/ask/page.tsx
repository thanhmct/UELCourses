"use client";

import Link from "next/link";
import { WarningText } from "@/components/regulations/WarningText";
import { useState, type FormEvent } from "react";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import { COHORTS, useSettings } from "@/lib/store";
import type { AskResponse, AskScope, ModuleAskResponse } from "@/lib/types";

type Answer = AskResponse | ModuleAskResponse;

export default function AskPage() {
  const { t, lang } = useT();
  const profileCohort = useSettings((state) => state.cohort);
  // Cohort given when the assistant asked back; the program profile always wins.
  const [chosenCohort, setChosenCohort] = useState("");
  const [scope, setScope] = useState<AskScope>("modules");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rating, setRating] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const activeCohort = profileCohort || chosenCohort;
  const formPending = busy || rating === "saving";

  async function run(text: string, cohort: string) {
    if (formPending || !text.trim()) return;
    setBusy(true);
    setFailed(false);
    setAnswer(undefined);
    setRating("idle");
    try {
      setAnswer(await api.askSources(scope, text.trim(), cohort || undefined, lang));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(question, activeCohort);
  }

  function pickClarify(kind: "cohort" | "question", option: string) {
    if (kind === "cohort") {
      setChosenCohort(option);
      void run(question, option);
    } else {
      setQuestion(option);
      void run(option, activeCohort);
    }
  }

  async function vote(helpful: boolean) {
    if (!answer?.answer_id || rating === "saving") return;
    setRating("saving");
    try {
      await api.rateAnswer(scope, answer.answer_id, helpful);
      setRating("saved");
    } catch {
      setRating("error");
    }
  }

  const reason = answer && "reason" in answer ? answer.reason : undefined;
  const clarify = answer && "clarify" in answer ? answer.clarify : undefined;
  const abstained = answer && "abstained" in answer && answer.abstained;
  const displayAnswer = answer?.found || clarify || abstained
    ? answer?.answer
    : reason === "missing" ? t("ask.missing")
    : scope === "modules" ? t("ask.refuseModule") : t("ask.refuseReg");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="page-title">{t("ask.title")}</h1>
      <form className="card space-y-4 p-4 sm:p-6" onSubmit={submit}>
        <label className="block space-y-1 text-sm sm:w-1/2">
          <span>{t("ask.scope")}</span>
          <select className="input w-full" value={scope} disabled={formPending} onChange={(event) => {
            setScope(event.target.value === "regulations" ? "regulations" : "modules");
            setAnswer(undefined);
            setFailed(false);
          }}>
            <option value="modules">{t("ask.modules")}</option>
            <option value="regulations">{t("ask.regulations")}</option>
          </select>
        </label>
        <p className="text-xs text-slate-500">
          {activeCohort
            ? t(profileCohort ? "chat.cohortProfile" : "chat.cohortSession", { c: activeCohort.replace(/^K/i, "") })
            : t("chat.cohortAsk")}
        </p>
        <label className="block space-y-1 text-sm">
          <span>{t("ask.question")}</span>
          <textarea className="input w-full" rows={3} value={question} maxLength={500} required
            placeholder={t(scope === "modules" ? "ask.exampleModule" : "ask.exampleReg")}
            onChange={(event) => setQuestion(event.target.value)} />
        </label>
        <button className="btn-primary" type="submit" disabled={formPending || !question.trim()}>{t("ask.submit")}</button>
      </form>
      <div aria-live="polite">
        {busy && <p role="status">{t("ask.loading")}</p>}
        {failed && <p role="alert">{t("ask.failure")}</p>}
        {answer && (
          <section className="card space-y-4 p-4 sm:p-6">
            {answer.mode === "llm" && <p className="text-sm font-medium">{t("ask.original")}</p>}
            {reason === "planner" ? (
              <Link className="text-brand-ink underline" href="/planner">{t("ask.planner")}</Link>
            ) : <p className="whitespace-pre-wrap break-words">{displayAnswer}</p>}
            {clarify && (
              <div className="flex flex-wrap gap-2" role="group" aria-label={t("chat.clarifyOptions")}>
                {(clarify.kind === "cohort" ? COHORTS : clarify.options).map((option) => (
                  <button key={option} type="button" className="btn-outline" disabled={formPending}
                    onClick={() => pickClarify(clarify.kind, option)}>{option}</button>
                ))}
              </div>
            )}
            {answer.warnings.length > 0 && (
              <ul className="space-y-1 rounded border border-amber-400/70 p-3 text-sm">
                {answer.warnings.map((warning, index) => <li key={index}><WarningText text={warning} /></li>)}
              </ul>
            )}
            {answer.citations.length > 0 && (
              <div className="space-y-2">
                <h2 className="font-semibold">{t("ask.citations")}</h2>
                <ul className="space-y-2 text-sm">
                  {answer.citations.map((citation, index) => {
                    const isModule = "code" in citation;
                    const externalSource = isModule ? null : citation.source_url;
                    const link = isModule ? `/modules/${encodeURIComponent(citation.code)}` : externalSource ||
                      `/regulations?doc=${encodeURIComponent(citation.doc_id)}#${encodeURIComponent(citation.anchor ?? "")}`;
                    const label = isModule ? `${citation.code} · ${t(`ask.${citation.kind}`)}` :
                      citation.label ?? [citation.title || citation.decision_no || citation.doc_id, citation.article && t("ask.article", { n: citation.article }),
                        citation.clause && t("ask.clause", { n: citation.clause })]
                        .filter(Boolean).join(" · ");
                    return (
                      <li className="border-l border-slate-300 pl-3 dark:border-slate-700" key={index}>
                        {externalSource ? (
                          <a className="font-medium text-brand-ink underline" href={link} target="_blank" rel="noopener noreferrer">{label}</a>
                        ) : (
                          <Link className="font-medium text-brand-ink underline" href={link}>{label}</Link>
                        )}
                        {!isModule && citation.source_label && <span className="ml-2 text-slate-500">{citation.source_label}</span>}
                        {isModule && citation.ctdt_year && <span> · {t("ask.curriculum", { year: citation.ctdt_year })}</span>}
                        {citation.quote && <blockquote className="mt-1 whitespace-pre-wrap break-words">{citation.quote}</blockquote>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {answer.answer_id && (rating === "saved" ? <p role="status">{t("ask.voted")}</p> : (
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-outline" onClick={() => vote(true)} disabled={rating === "saving"}>{t("ask.helpful")}</button>
                <button className="btn-outline" onClick={() => vote(false)} disabled={rating === "saving"}>{t("ask.notHelpful")}</button>
                {rating === "error" && <p role="alert">{t("ask.voteError")}</p>}
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
