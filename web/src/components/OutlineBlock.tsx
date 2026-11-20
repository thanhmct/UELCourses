"use client";
import { useEffect, useState } from "react";
import { api, type OutlineData } from "@/lib/api";
import { useT } from "@/i18n";

const str = (v: unknown): string => (v === null || v === undefined || v === "" ? "" : String(v));

/** Đề cương: shown only when GET /api/modules/{code}/outline answers 200; otherwise renders nothing (no error). */
export function OutlineBlock({ code }: { code: string }) {
  const { t } = useT();
  const [data, setData] = useState<OutlineData | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    api.outline(code).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [code]);
  if (!data) return null;

  const course = (data.course ?? {}) as Record<string, unknown>;
  const info: [string, string][] = [
    [t("outline.faculty"), str(course.faculty)],
    [t("outline.department"), str(course.department)],
    [t("outline.credits"), str(course.credits)],
    [t("outline.hoursLec"), str(course.hours_lecture)],
    [t("outline.hoursPrac"), str(course.hours_practice)],
    [t("outline.hoursSelf"), str(course.hours_self_study)],
    [t("outline.prereq"), str(course.prerequisite_raw)],
    [t("outline.previous"), str(course.previous_raw)],
    [t("outline.coreq"), str(course.corequisite_raw)],
    [t("outline.next"), str(course.next_raw)],
    [t("outline.lecturers"), Array.isArray(course.lecturers) ? course.lecturers.map(String).join(", ") : ""],
  ].filter(([, v]) => v !== "") as [string, string][];

  const objectives = data.objectives ?? [];
  const clos = data.clos ?? [];
  const assessments = data.assessments ?? [];
  const weeks = data.schedule ?? [];
  const materials = data.materials ?? [];
  const totalWeight = assessments.reduce((s, a) => s + (typeof a.weight_pct === "number" ? a.weight_pct : 0), 0);

  return (
    <section className="card space-y-5" aria-label={t("outline.title")}>
      <h2 className="font-semibold">{t("outline.title")}</h2>

      {info.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">{t("outline.info")}</h3>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {info.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="shrink-0 text-slate-500">{k}:</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {objectives.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">{t("outline.co")}</h3>
          <ul className="space-y-1 text-sm">
            {objectives.map((o, i) => (
              <li key={o.code ?? i}>
                <strong className="font-mono">{o.code}</strong> {o.description}
                {o.clo_codes?.length ? <span className="ml-1 text-xs text-slate-500">({o.clo_codes.join(", ")})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {clos.length > 0 && (
        <div className="overflow-x-auto">
          <h3 className="mb-1 text-sm font-semibold">{t("outline.clo")}</h3>
          <table className="w-full text-left text-sm">
            <tbody>
              {clos.map((c, i) => (
                <tr key={c.code ?? i} className="border-t border-slate-100 align-top dark:border-slate-800">
                  <td className="w-20 py-1 pr-2 font-mono font-semibold">{c.code}</td>
                  <td className="py-1">{c.description}</td>
                  {c.teaching_levels ? <td className="w-28 py-1 text-xs text-slate-500">{c.teaching_levels}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assessments.length > 0 && (
        <div className="overflow-x-auto">
          <h3 className="mb-1 text-sm font-semibold">{t("outline.assess")}</h3>
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1">{t("outline.assessItem")}</th>
                <th className="py-1">{t("outline.assessClo")}</th>
                <th className="py-1 text-right">{t("outline.assessWeight")}</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((a, i) => (
                <tr key={i} className="border-t border-slate-100 align-top dark:border-slate-800">
                  <td className="py-1 pr-3">
                    <div>{a.component || a.item_name || "—"}</div>
                    {a.item_name && a.component && <div className="text-xs text-slate-500">{a.item_name}</div>}
                    {a.criteria && <div className="text-xs text-slate-500">{a.criteria}</div>}
                  </td>
                  <td className="py-1 pr-3 text-xs text-slate-600 dark:text-slate-300">{a.clo_codes?.join(", ") || "—"}</td>
                  <td className="py-1 text-right font-semibold tabular-nums">{typeof a.weight_pct === "number" ? `${a.weight_pct}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
            {totalWeight > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 dark:border-slate-700">
                  <td className="py-1" colSpan={2}>Σ</td>
                  <td className="py-1 text-right font-semibold tabular-nums">{Math.round(totalWeight * 10) / 10}%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {weeks.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">{t("outline.schedule")}</h3>
          <ol className="space-y-1.5 text-sm">
            {weeks.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-16 shrink-0 font-semibold text-slate-600 dark:text-slate-300">{t("outline.week")} {w.week_label || i + 1}</span>
                <span className="min-w-0">
                  {w.content}
                  {w.clo_codes?.length ? <span className="ml-1 text-xs text-slate-500">({w.clo_codes.join(", ")})</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {materials.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">{t("outline.materials")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {materials.map((m, i) => (
              <li key={i}>
                <span className="mr-1 text-xs text-slate-500">{m.kind === "textbook" ? t("outline.textbook") : t("outline.reference")}:</span>
                {m.citation}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
