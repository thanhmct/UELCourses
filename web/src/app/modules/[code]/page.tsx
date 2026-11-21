"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSemesters } from "@/lib/semesters";
import { formatDateVi } from "@/lib/dates";
import { CntnBadge, EnBadge, Empty, ErrorBox, Loading, TypeChip } from "@/components/ui";
import { capacityText, seatsAvailable } from "@/lib/modules";
import { ModuleActions } from "@/components/ModuleActions";
import { PrerequisiteTree } from "@/components/PrerequisiteTree";
import { WorkloadBreakdownView } from "@/components/WorkloadBreakdown";
import { ModuleReviews } from "@/components/ModuleReviews";
import { OutlineBlock } from "@/components/OutlineBlock";
import { useT, weekdayName } from "@/i18n";
import { departmentName, facultyName, moduleDescription, moduleName } from "@/i18n/names";

export default function ModuleDetailPage() {
  const { t, lang } = useT();
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code);
  const mod = useApi(() => api.module(code), [code]);
  const sems = useSemesters();
  const [semester, setSemester] = useState("");

  useEffect(() => {
    if (!semester && sems.data?.length) setSemester((sems.data.find((s) => s.is_current) ?? sems.data[0]).id);
  }, [sems.data, semester]);

  const classes = useApi(() => (semester ? api.classes(code, semester) : Promise.resolve({ data: [], mock: false })), [code, semester]);

  if (mod.loading) return <Loading />;
  if (mod.error) return <ErrorBox>{mod.error}</ErrorBox>;
  const m = mod.data;
  if (!m) return <Empty>{t("common.notFound", { code })} <Link className="text-brand-600 underline" href="/modules">{t("common.back")}</Link></Empty>;

  const openCount = new Map((m.open_semesters ?? []).map((o) => [o.semester, o.classes]));
  const isEn = m.language_track === "en" || (!m.language_track && m.is_english);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link href="/modules" className="text-xs text-brand-600 hover:underline">{t("det.back")}</Link>
          <h1 className="text-xl font-bold">
            <span className="font-mono text-brand-700 dark:text-brand-300">{m.code}</span> {moduleName(m, lang)}
          </h1>
          {lang === "en" && m.name_en && m.name_en !== m.name && <p className="text-sm text-slate-500">{m.name}</p>}
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <span>{t("common.credits", { n: m.credits })} · {facultyName(m.faculty, lang) || t("common.unknownFaculty")}{m.department ? ` · ${departmentName(m.department, lang)}` : ""}</span>
            <TypeChip type={m.type} />
            {isEn && <EnBadge />}
            {m.is_talent_program && <CntnBadge />}
          </div>
          {m.counterpart_code && (
            <p className="text-xs text-slate-500">
              {t("det.counterpart")}:{" "}
              <Link href={`/modules/${encodeURIComponent(m.counterpart_code)}`} className="font-mono font-semibold text-brand-700 hover:underline dark:text-brand-300">{m.counterpart_code}</Link>
            </p>
          )}
        </div>
        <ModuleActions module={m} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-4 lg:col-span-2">
          <div>
            <h2 className="mb-1 font-semibold">{t("det.description")}</h2>
            {(() => {
              const d = moduleDescription(m, lang); // VI → description, EN → description_en; thiếu thì dùng bản còn lại và báo rõ
              return (
                <>
                  <p lang={d.fallback ? (lang === "en" ? "vi" : "en") : lang} className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{d.text || t("det.noDescription")}</p>
                  {d.fallback && <p className="mt-1 text-xs italic text-slate-400">{t("det.descFallback")}</p>}
                </>
              );
            })()}
          </div>
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <WorkloadBreakdownView credits={m.credits} type={m.type} showDetails />
          </div>
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <PrerequisiteTree code={m.code} currentName={moduleName(m, lang)} />
          </div>
        </section>
        <section className="card self-start">
          <h2 className="mb-2 font-semibold">{t("det.equivalents")}</h2>
          {m.equivalents?.length ? (
            <ul className="space-y-1 text-sm">
              {m.equivalents.map((e) => (
                <li key={e.code} className="flex justify-between gap-2">
                  <Link href={`/modules/${encodeURIComponent(e.code)}`} className="text-brand-600 hover:underline">{e.code} · {moduleName(e, lang)}</Link>
                  <span className="shrink-0 text-slate-500">{t("common.credits", { n: e.credits })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t("det.none")}</p>
          )}
        </section>
      </div>

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t("det.classes")}</h2>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label={t("det.semester")} title={t("det.semesterTabs")}>
            {sems.data?.map((s) => {
              const on = s.id === semester;
              const n = openCount.get(s.id) ?? 0;
              const label = `${String(s.year).replace("–", "-")} · HK${s.term}`;
              return (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setSemester(s.id)}
                  title={s.name}
                  className={`rounded px-2.5 py-1 text-xs font-semibold ${
                    on ? "bg-brand-600 text-white" : n > 0 ? "border border-brand-600 text-brand-700 dark:text-brand-300" : "border border-slate-200 text-slate-500 dark:border-slate-700"
                  }`}
                >
                  {label}
                  {n > 0 && <span className="ml-1 font-normal">· {t("mod.termClassCount", { n })}</span>}
                </button>
              );
            })}
          </div>
        </div>
        {classes.loading ? (
          <Loading />
        ) : !classes.data?.length ? (
          <Empty>{t("det.noClasses")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">{t("det.colClass")}</th>
                  <th className="py-2 pr-3">{t("det.colSchedule")}</th>
                  <th className="py-2 pr-3">{t("det.colLecturer")}</th>
                  <th className="py-2 pr-3">{t("det.colGroups")}</th>
                  <th className="py-2 pr-3">{t("det.colSeats")}</th>
                  <th className="py-2">{t("det.colDates")}</th>
                </tr>
              </thead>
              <tbody>
                {classes.data.map((c) => (
                  <tr key={c.class_code} className="border-t border-slate-200 align-top dark:border-slate-800">
                    <td className="py-2 pr-3 font-mono text-xs">{c.class_code}</td>
                    <td className="py-2 pr-3">
                      {c.lessons.length ? (
                        c.lessons.map((l, i) => (
                          <div key={i}>
                            {weekdayName(t, l.weekday)}, {t("det.periods", { s: l.start_period, e: l.end_period })} ({l.start_time}–{l.end_time}){l.room ? ` · ${l.room}` : ""}
                            {l.weeks ? ` · ${t("det.week", { w: l.weeks })}` : ""}
                          </div>
                        ))
                      ) : (
                        <span className="text-slate-500">{t("det.notScheduled")}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{c.lecturer ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs">{c.student_groups?.join(", ") || "—"}</td>
                    <td className={`py-2 pr-3 ${seatsAvailable(c) === 0 ? "text-red-600" : ""}`}>{capacityText(c)}</td>
                    <td className="py-2">{c.start_date ? `${formatDateVi(c.start_date)} – ${formatDateVi(c.end_date)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <OutlineBlock code={m.code} />

      <section className="card">
        <ModuleReviews moduleCode={m.code} moduleName={m.name} />
      </section>
    </div>
  );
}
