"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useT } from "@/i18n";
import { gradeToPoints, parseScore10Input, scoreToLetter, type GpaResult } from "@/lib/gpa";

const SCORES_STORAGE_KEY = "uelcourses-user-scores";
export type GpaScale = "10" | "4";

export function usePlannerScores() {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [savedScores, setSavedScores] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SCORES_STORAGE_KEY) ?? "{}") as Record<string, number>;
      const entries = Object.entries(saved).filter(([, value]) => scoreToLetter(value) !== null);
      setSavedScores(Object.fromEntries(entries));
      setInputs(Object.fromEntries(entries.map(([code, value]) => [code, String(value)])));
    } catch {
      // The planner is still usable when browser storage is unavailable.
    }
  }, []);

  function updateScore(code: string, raw: string) {
    setInputs({ ...inputs, [code]: raw });
    const score = parseScore10Input(raw);
    if (score === null && raw.trim()) return;
    const nextScores = { ...savedScores };
    if (score !== null) nextScores[code] = score;
    else delete nextScores[code];
    setSavedScores(nextScores);
    try {
      localStorage.setItem(SCORES_STORAGE_KEY, JSON.stringify(nextScores));
    } catch {
      // In-memory scores still work when browser storage is unavailable.
    }
  }

  const scores = useMemo(() => {
    const valid: Partial<Record<string, number>> = {};
    for (const [code, raw] of Object.entries(inputs)) {
      const score = parseScore10Input(raw);
      if (score !== null) valid[code] = score;
    }
    return valid;
  }, [inputs]);

  return { inputs, scores, updateScore };
}

export function formatGpa(result: GpaResult, scale: GpaScale) {
  return result.gradedCredits > 0 ? (scale === "10" ? result.gpa10 : result.gpa4).toFixed(2) : "—";
}

export function PlannerGpaSummary({
  result, total, completed,
}: {
  result: GpaResult;
  total: number;
  completed: number;
}) {
  const { t } = useT();
  const progress = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <section className="grid grid-cols-2 gap-3">
      <div className="card min-w-0 border-brand-200 bg-brand-50/70 p-4 dark:border-brand-800 dark:bg-brand-950/40">
        <h2 className="text-sm font-semibold text-brand-ink">{t("gpa.cumulative10")}</h2>
        <div aria-live="polite" className="mt-2 flex flex-wrap items-baseline gap-2">
          <span className="text-3xl font-bold leading-none text-brand-ink">{formatGpa(result, "10")}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">/ 10</span>
          {result.gradedCredits > 0 && (
            <span className={`rounded-full border px-2 text-xs font-semibold ${result.classification.color}`}>
              {t(`gpa.cls.${result.classification.label}`)}
            </span>
          )}
        </div>
      </div>

      <div className="card min-w-0 border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("gpa.estimated4")}</h2>
        <div aria-live="polite" className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl font-bold leading-none text-slate-800 dark:text-slate-100">{formatGpa(result, "4")}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">/ 4</span>
        </div>
      </div>

      <div className="card col-span-2 grid items-center gap-4 p-4 lg:grid-cols-[minmax(16rem,1fr)_auto_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t("pl.creditProgressTitle")}</h2>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {t("pl.creditProgressSummary", { completed, total })}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={t("pl.creditProgressTitle")}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completed}
            className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
          >
            <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 lg:contents">
          <div className="min-w-0 rounded-lg bg-slate-100 px-4 py-3 lg:min-w-40 dark:bg-slate-800">
            <dt className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("pl.totalCreditsLabel")}</dt>
            <dd className="mt-1 whitespace-nowrap text-2xl font-bold text-slate-900 dark:text-white">
              {total} {t("common.unitCr")}
            </dd>
          </div>
          <div className="min-w-0 rounded-lg bg-emerald-50 px-4 py-3 lg:min-w-40 dark:bg-emerald-950/40">
            <dt className="text-xs font-medium text-emerald-800 dark:text-emerald-300">{t("pl.completedCreditsLabel")}</dt>
            <dd className="mt-1 whitespace-nowrap text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {completed} {t("common.unitCr")}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

export function ModuleGrade({
  code, value, onScoreChange, excluded,
}: {
  code: string;
  value: string;
  onScoreChange: (code: string, raw: string) => void;
  excluded: boolean;
}) {
  const { t } = useT();
  const errorId = useId();
  const score = parseScore10Input(value);
  const letter = score === null ? null : scoreToLetter(score);
  const points = letter === null ? null : gradeToPoints(letter);
  const invalid = Boolean(value.trim()) && score === null;

  return (
    <div className="mt-2 border-t border-slate-200/75 pt-2 text-xs dark:border-slate-700">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="grid gap-1 text-slate-600 dark:text-slate-300">
          {t("gpa.thScore10")}
          <input
            type="text"
            inputMode="decimal"
            aria-label={t("gpa.score10Aria", { code })}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            placeholder="—"
            className="input w-20 py-1 text-center text-sm aria-invalid:border-red-500"
            value={value}
            onChange={(event) => onScoreChange(code, event.target.value)}
          />
        </label>
        <dl className="flex gap-4 leading-5">
          <div>
            <dt className="text-slate-600 dark:text-slate-300">{t("gpa.thPoints")}</dt>
            <dd className="font-mono font-semibold">{points?.toFixed(1) ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-600 dark:text-slate-300">{t("gpa.thGrade")}</dt>
            <dd className="font-semibold">{letter ?? "—"}</dd>
          </div>
        </dl>
      </div>
      {invalid && <p id={errorId} className="mt-1 text-red-700 dark:text-red-300">{t("pl.scoreInvalid")}</p>}
      {score !== null && score < 4 && <p className="mt-1 font-semibold text-red-700 dark:text-red-300">{t("pl.needRetake")}</p>}
      {excluded && <p className="mt-1 text-slate-600 dark:text-slate-400">{t("pl.scoreExcluded")}</p>}
    </div>
  );
}
