"use client";

import { Loading } from "@/components/ui";
import { Clock3, Pin, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useT, weekdayName } from "@/i18n";
import { WEEKDAYS } from "@/lib/periods";
import {
  clockMinutes,
  optimizeTimetable,
  type OptimizationInput,
  type OptimizationResult,
} from "@/lib/timetableOptimizer";

type Course = Omit<OptimizationInput["courses"][number], "pinned"> & { name: string };

interface Props {
  courses: Course[];
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  semesterStart?: string;
  semesterEnd?: string;
  noClassDates?: ReadonlySet<string>;
  onSave: (classes: Record<string, string>, asynchronous: string[]) => void;
}

const timeFields = [
  { key: "earliest", translation: "earliest" },
  { key: "latest", translation: "latest" },
  { key: "lunchStart", translation: "lunchStart" },
  { key: "lunchEnd", translation: "lunchEnd" },
] as const;

export function TimetableOptimizer({ courses, loading, loadError, onRetry, semesterStart, semesterEnd, noClassDates, onSave }: Props) {
  const { t } = useT();
  const failed = !!loadError;
  const [freeDays, setFreeDays] = useState<number[]>([]);
  const [asynchronous, setAsynchronous] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [times, setTimes] = useState({ earliest: "00:00", latest: "23:59", lunchStart: "12:00", lunchEnd: "14:00" });
  const [maxHours, setMaxHours] = useState("4");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const liveCourses = courses.filter(({ code }) => !asynchronous.includes(code));
  const changes = result?.status === "success"
    ? liveCourses.filter(({ code, currentClass }) => result.classes[code] !== currentClass)
    : [];

  function clearResult() {
    setResult(null);
    setError("");
  }

  function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working || loading || failed || !liveCourses.length) return;
    clearResult();
    const earliest = clockMinutes(times.earliest);
    const latest = clockMinutes(times.latest);
    const lunchStart = clockMinutes(times.lunchStart);
    const lunchEnd = clockMinutes(times.lunchEnd);
    if (!(earliest < latest)) {
      setError(t("tt.optimize.invalidWindow"));
      return;
    }
    if (!(lunchEnd - lunchStart >= 60)) {
      setError(t("tt.optimize.invalidLunch"));
      return;
    }
    const input: OptimizationInput = {
      courses: liveCourses.map(({ code, currentClass, sections }) => ({
        code, currentClass, sections, pinned: pinned.includes(code),
      })),
      preferences: { freeDays, earliest, latest, lunchStart, lunchEnd, maxConsecutive: Number(maxHours) * 60 },
      semesterStart,
      semesterEnd,
      noClassDates,
    };

    if (typeof Worker === "undefined") {
      setResult(optimizeTimetable(input));
      return;
    }
    setWorking(true);
    try {
      const search = new Worker(new URL("./optimizer.worker.ts", import.meta.url));
      worker.current = search;
      const finish = () => {
        search.terminate();
        worker.current = null;
        setWorking(false);
      };
      search.onmessage = ({ data }: MessageEvent<OptimizationResult>) => {
        finish();
        setResult(data);
      };
      search.onerror = () => {
        finish();
        setError(t("tt.optimize.failed"));
      };
      search.postMessage(input);
    } catch {
      worker.current?.terminate();
      worker.current = null;
      setWorking(false);
      setError(t("tt.optimize.failed"));
    }
  }

  if (courses.length === 0) {
    return <p className="card text-sm text-slate-600 dark:text-slate-300">{t("tt.optimize.empty")}</p>;
  }

  const checkboxClass = "size-4 shrink-0 accent-brand-600 dark:accent-brand-300";
  const fieldLabel = "grid gap-1 text-sm font-medium";
  const timeInput = ({ key, translation }: typeof timeFields[number]) => (
    <label className={fieldLabel} key={key}>
      {t(`tt.optimize.${translation}`)}
      <input className="input min-w-0 px-2" type="time" required value={times[key]} onChange={(event) => {
        setTimes({ ...times, [key]: event.target.value });
        clearResult();
      }} />
    </label>
  );

  return (
    <form className="space-y-3" onSubmit={run}>
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <fieldset className="card min-w-0" disabled={working} aria-labelledby="optimizer-courses">
          <h2 className="mb-1 font-semibold text-brand-ink" id="optimizer-courses">{t("tt.optimize.courses")}</h2>
          <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{t("tt.optimize.attendanceHint")}</p>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {courses.map(({ code, name, currentClass }) => {
              const selfStudy = asynchronous.includes(code);
              return (
                <li key={code} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 first:pt-1 last:pb-0">
                  <div className="min-w-0 break-words text-sm">
                    <strong className="text-brand-ink">{code}</strong>{name !== code && ` · ${name}`}
                    {currentClass && <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{currentClass}</p>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-2 text-xs">
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input className={checkboxClass} type="checkbox" checked={selfStudy}
                        aria-label={t("tt.optimize.selfStudyFor", { code })}
                        onChange={() => {
                          setAsynchronous((list) => selfStudy ? list.filter((item) => item !== code) : [...list, code]);
                          clearResult();
                        }} />
                      {t("tt.optimize.selfStudy")}
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 has-disabled:cursor-default has-disabled:opacity-50">
                      <input className={checkboxClass} type="checkbox" checked={!selfStudy && pinned.includes(code)}
                        disabled={selfStudy || !currentClass} aria-label={t("tt.optimize.pinFor", { code })}
                        onChange={(event) => {
                          setPinned(event.target.checked ? [...pinned, code] : pinned.filter((item) => item !== code));
                          clearResult();
                        }} />
                      <Pin className="size-3" aria-hidden /> {t("tt.optimize.pin")}
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <fieldset className="card min-w-0 space-y-3" disabled={working} aria-labelledby="optimizer-constraints">
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-brand-ink" id="optimizer-constraints">
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="size-4" aria-hidden /> {t("tt.optimize.constraints")}
            </span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{t("tt.optimize.constraintsNote")}</span>
          </h2>
          <div role="group" aria-labelledby="optimizer-free-days">
            <p id="optimizer-free-days" className="mb-1 text-sm font-medium">{t("tt.optimize.freeDays")}</p>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => (
                <label key={day} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-2 py-1 text-sm has-checked:border-brand-500 has-checked:bg-brand-50 dark:border-slate-700 dark:has-checked:bg-brand-900/60">
                  <input className={checkboxClass} type="checkbox" checked={freeDays.includes(day)} onChange={(event) => {
                    setFreeDays(event.target.checked ? [...freeDays, day] : freeDays.filter((item) => item !== day));
                    clearResult();
                  }} />
                  {weekdayName(t, day, true)}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">{timeFields.slice(0, 2).map(timeInput)}</div>
          <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-brand-ink">{t("tt.optimize.preferences")}</h3>
            <div className="grid grid-cols-2 gap-2">{timeFields.slice(2).map(timeInput)}</div>
            <label className={fieldLabel}>
              {t("tt.optimize.maxHours")}
              <input className="input w-24" type="number" min="1" max="24" step="0.5" required value={maxHours}
                onChange={(event) => {
                  setMaxHours(event.target.value);
                  clearResult();
                }} />
            </label>
          </div>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={working || loading || failed || !liveCourses.length}>
          <Clock3 className="size-4" aria-hidden /> {t("tt.optimize.run")}
        </button>
        {(working || (loading && !failed)) && <Loading compact />}
        {failed && (
          <>
            <p className="text-sm text-rose-700 dark:text-rose-300" role="alert">{loadError}</p>
            <button type="button" className="btn-outline" onClick={() => { clearResult(); onRetry(); }}>{t("tt.optimize.retry")}</button>
          </>
        )}
        {!liveCourses.length && <p className="text-sm">{t("tt.optimize.noLiveCourses")}</p>}
      </div>
      {error && <p className="text-sm text-rose-700 dark:text-rose-300" role="alert">{error}</p>}
      {result && result.status !== "success" && (
        <p className="card text-sm" role="status">
          {result.status === "no-match" ? t("tt.optimize.noMatch") : t(`tt.optimize.${result.status}`, { code: result.code })}
        </p>
      )}
      {result?.status === "success" && (
        <section className="card space-y-3" aria-labelledby="optimizer-result">
          <h2 className="font-semibold text-brand-ink" id="optimizer-result">{t("tt.optimize.result")}</h2>
          <p className="text-sm" role="status">
            {t(result.meetsPreferences ? "tt.optimize.meetsPreferences" : "tt.optimize.partialPreferences")}
            {!result.meetsPreferences && <>{" "}{t(`tt.optimize.relaxed.${result.relaxed.kind}`, {
              n: result.relaxed.minutes,
              ...(result.relaxed.kind === "freeDay" && { day: weekdayName(t, result.relaxed.weekday) }),
            })}</>}
            {" "}{t(changes.length ? "tt.optimize.changed" : "tt.optimize.unchanged", { n: changes.length })}
          </p>
          {changes.length > 0 && (
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {changes.map(({ code, currentClass }) => (
                <li key={code} className="rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-800">
                  <strong>{code}</strong>{" "}
                  <span className="break-all font-mono text-xs">{currentClass && `${currentClass} → `}{result.classes[code]}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn-primary" disabled={loading || failed}
            onClick={() => onSave(result.classes, asynchronous)}>
            {t("tt.optimize.save")}
          </button>
        </section>
      )}
    </form>
  );
}
