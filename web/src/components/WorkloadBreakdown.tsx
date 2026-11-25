"use client";

import { calculateWorkload, formatWorkloadString } from "@/lib/workload";
import { useT } from "@/i18n";

interface Props {
  credits: number;
  type?: string;
  showDetails?: boolean;
}

interface Part {
  key: string;
  labelKey: string;
  hours: number;
  /** Tailwind colour classes of the block */
  block: string;
  text: string;
}

/** One row of blocks: each hour is a cell; a fractional hour is a half-filled cell. */
function Blocks({ hours, block }: { hours: number; block: string }) {
  const full = Math.floor(hours);
  const frac = hours - full;
  const cells = Array.from({ length: full }, (_, i) => <span key={i} className={`h-5 w-3 rounded-sm ${block}`} />);
  if (frac > 0) {
    cells.push(
      <span key="frac" className="relative h-5 w-3 overflow-hidden rounded-sm">
        <span className={`absolute inset-0 opacity-30 ${block}`} />
        <span className={`absolute inset-y-0 left-0 ${block}`} style={{ width: `${frac * 100}%` }} />
      </span>,
    );
  }
  return <div className="flex flex-wrap gap-1" aria-hidden>{cells}</div>;
}

export function WorkloadBreakdownView({ credits, type, showDetails = false }: Props) {
  const { t, lang } = useT();
  const w = calculateWorkload(credits, type);

  if (w.total_hours === 0) return null;

  const parts: Part[] = [
    { key: "lec", labelKey: "workload.lec", hours: w.lecture, block: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
    { key: "tut", labelKey: "workload.tut", hours: w.tutorial, block: "bg-indigo-500", text: "text-indigo-700 dark:text-indigo-300" },
    { key: "prac", labelKey: "workload.prac", hours: w.practical, block: "bg-amber-400", text: "text-amber-700 dark:text-amber-300" },
    { key: "proj", labelKey: "workload.proj", hours: w.project, block: "bg-yellow-300", text: "text-yellow-700 dark:text-yellow-300" },
    { key: "prep", labelKey: "workload.prep", hours: w.self_study, block: "bg-rose-400", text: "text-rose-700 dark:text-rose-300" },
  ].filter((p) => p.hours > 0);

  const summary = formatWorkloadString(w, lang);

  return (
    <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-800 dark:text-slate-100">{t("workload.title")}</span>
        <span className="font-mono rounded bg-slate-100 px-2 py-0.5 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {summary}
        </span>
      </div>

      {showDetails && (
        <div className="space-y-3 pt-1">
          <div className="space-y-2.5" role="img" aria-label={t("workload.aria", { v: summary })}>
            {parts.map((p) => (
              <div key={p.key} className="flex flex-row items-center gap-2 sm:gap-3">
                <span className="w-24 shrink-0 text-[11px] text-slate-500 dark:text-slate-400 sm:w-44">{t(p.labelKey)}</span>
                <Blocks hours={p.hours} block={p.block} />
                <span className={`shrink-0 text-xs font-semibold ${p.text}`}>{t("workload.hoursWeek", { n: p.hours })}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">{t("workload.note")}</p>
        </div>
      )}
    </div>
  );
}
