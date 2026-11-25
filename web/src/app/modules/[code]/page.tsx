"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSemesters } from "@/lib/semesters";
import { useProgramProfile } from "@/lib/myProgram";
import { formatDateVi } from "@/lib/dates";
import { BackButton, CntnBadge, EnBadge, Empty, ErrorBox, Loading, RequiredBadge, TypeChip } from "@/components/ui";
import { capacityText, seatsAvailable } from "@/lib/modules";
import { allModules } from "@/lib/programs";
import { ModuleActions } from "@/components/ModuleActions";
import { ReportErrorsButton } from "@/components/FeedbackWidget";
import { SectionJumpMenu } from "@/components/SectionJumpMenu";
import { PrerequisiteTree } from "@/components/PrerequisiteTree";
import { WorkloadBreakdownView } from "@/components/WorkloadBreakdown";
import { ModuleReviews } from "@/components/ModuleReviews";
import { LecturerReviewPanel } from "@/components/LecturerReviewPanel";
import { ModuleDescriptionText } from "@/components/ModuleDescriptionText";
import { OutlineBlock } from "@/components/OutlineBlock";
import { useT, weekdayName } from "@/i18n";
import { creditsLine, departmentName, facultyName, isEnglishCode, moduleDescription, moduleName } from "@/i18n/names";
import { finalAssessmentKind, getCachedFinalAssessmentKind, setCachedFinalAssessmentKind } from "@/lib/finalAssessment";
import { track } from "@/lib/analytics";
import { useExchangeStats, useExchangeViewActive } from "@/lib/useExchangeStats";
import { ExchangeStatBadge } from "@/components/ExchangeStatBadge";


export default function ModuleDetailPage() {
  const { t, lang } = useT();
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code);
  const sems = useSemesters();
  const { primaryProgramId, secondaryProgramId, primaryParsed } = useProgramProfile();
  const userCohort = primaryParsed?.cohort;
  const [semester, setSemester] = useState("");
  const mod = useApi(
    () => api.module(code, { program_id: primaryProgramId || undefined, cohort: userCohort }),
    [code, primaryProgramId, userCohort],
  );
  const exchangeActive = useExchangeViewActive();
  const exchangeStats = useExchangeStats([code], exchangeActive);

  useEffect(() => {
    if (code) {
      track("module_view", {
        module_code: code,
        semester_id: semester || sems.current?.id || undefined,
      });
    }
  }, [code, semester, sems.current?.id]);
  const progPrimary = useApi(() => primaryProgramId ? api.program(primaryProgramId) : Promise.resolve({ data: null, mock: false }), [primaryProgramId]);
  const progSecondary = useApi(() => secondaryProgramId ? api.program(secondaryProgramId) : Promise.resolve({ data: null, mock: false }), [secondaryProgramId]);
  const electivesPrimary = useApi(() => primaryProgramId ? api.electiveGroups(primaryProgramId) : Promise.resolve({ data: [], mock: false }), [primaryProgramId]);
  const electivesSecondary = useApi(() => secondaryProgramId ? api.electiveGroups(secondaryProgramId) : Promise.resolve({ data: [], mock: false }), [secondaryProgramId]);

  const programModuleInfo = useMemo(() => {
    const p1 = progPrimary.data;
    const p2 = progSecondary.data;
    let pm = p1 ? allModules(p1).find((x) => x.code === code) : null;
    let inSecondary = false;
    if (!pm && p2) {
      pm = allModules(p2).find((x) => x.code === code) ?? null;
      inSecondary = true;
    }
    if (!pm) return null;

    const allGroups = [...(electivesPrimary.data ?? []), ...(electivesSecondary.data ?? [])];
    const electiveGroup = allGroups.find((g) => g.modules.some((x) => x.code === code));

    return {
      required: pm.required,
      inSecondary,
      electiveGroup: electiveGroup && electiveGroup.required_credits > 0 ? electiveGroup : null,
    };
  }, [code, progPrimary.data, progSecondary.data, electivesPrimary.data, electivesSecondary.data]);

  const treeProgramId = useMemo(() => {
    if (!secondaryProgramId) return primaryProgramId || undefined;
    if (!primaryProgramId) return secondaryProgramId || undefined;
    const inPrimary = progPrimary.data?.blocks.some((b) => b.modules.some((x) => x.code === code));
    const inSecondary = progSecondary.data?.blocks.some((b) => b.modules.some((x) => x.code === code));
    if (inSecondary && !inPrimary) return secondaryProgramId;
    return primaryProgramId || undefined;
  }, [code, primaryProgramId, secondaryProgramId, progPrimary.data, progSecondary.data]);

  useEffect(() => {
    // Học kỳ đang chọn không còn trong danh sách (đổi khóa): chọn lại học kỳ hiện tại.
    if (sems.data?.length && !sems.data.some((s) => s.id === semester)) setSemester((sems.data.find((s) => s.is_current) ?? sems.data[0]).id);
  }, [sems.data, semester]);

  const classes = useApi(() => (semester ? api.classes(code, semester) : Promise.resolve({ data: [], mock: false })), [code, semester]);

  const [finalKind, setFinalKind] = useState<string | null>(() => getCachedFinalAssessmentKind(code) ?? null);

  useEffect(() => {
    if (mod.data?.final_assessment) {
      setFinalKind(mod.data.final_assessment);
      return;
    }
    const cached = getCachedFinalAssessmentKind(code);
    if (cached !== undefined) {
      setFinalKind(cached);
      return;
    }
    let alive = true;
    api.outline(code, { cohort: userCohort }).then((outline) => {
      if (!alive) return;
      const kind = finalAssessmentKind(outline?.assessments);
      setCachedFinalAssessmentKind(code, kind);
      setFinalKind(kind);
    }).catch(() => {
      if (!alive) return;
      setCachedFinalAssessmentKind(code, null);
      setFinalKind(null);
    });
    return () => {
      alive = false;
    };
  }, [code, mod.data?.final_assessment, userCohort]);

  if (mod.loading) return <Loading page />;
  if (mod.error) return <ErrorBox>{mod.error}</ErrorBox>;
  const m = mod.data;
  if (!m) return <Empty>{t("common.notFound", { code })} <Link className="text-brand-ink underline" href="/modules">{t("common.back")}</Link></Empty>;

  const openCount = new Map((m.open_semesters ?? []).map((o) => [o.semester, o.classes]));
  const isEn = m.language_track === "en" || (!m.language_track && m.is_english);
  const { outline_url: outlineVi, outline_url_en: outlineEn } = m;
  const outlineUrl = outlineVi || outlineEn;
  const outlineLinks = outlineVi && outlineEn && outlineVi !== outlineEn
    ? [{ url: outlineVi, language: t("common.languageVietnamese") }, { url: outlineEn, language: t("common.languageEnglish") }]
    : outlineUrl ? [{ url: outlineUrl, language: null }] : [];
  const hasBothOutlines = outlineLinks.length > 1;
  const hasRequiredBadge = programModuleInfo?.required != null;
  const syllabusLabel = t("det.syllabusPdf");

  const cohortNum = userCohort ? parseInt(userCohort.replace(/\D/g, ""), 10) : NaN;
  const requestedYear = !isNaN(cohortNum)
    ? (cohortNum % 2 !== 0 ? 2000 + cohortNum : 2000 + cohortNum - 1)
    : (m.outline_year === 2025 ? 2023 : 2025);

  return (
    <div className="space-y-4">
      <header className="card space-y-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Điện thoại: không cần nút quay lại riêng — nhấn quay lại của hệ thống đã về đúng chỗ cũ (xem BackButton/navHistory). */}
          <BackButton href="/modules" label={t("det.backLabel")} className="hidden sm:inline-flex" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">
                <span className="font-mono text-brand-700 dark:text-brand-300">{m.code}</span> {moduleName(m, lang)}
              </h1>
              <ExchangeStatBadge stat={exchangeStats[code]} />
              {(hasRequiredBadge || outlineLinks.length > 0 || m.outline_year) && (
                <div className="flex flex-wrap items-center gap-2">
                  <RequiredBadge required={programModuleInfo?.required} lang={lang} />
                  {m.outline_year && (
                    <span className="chip border border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {t("det.outlineCtdtYear", { year: m.outline_year })}
                    </span>
                  )}
                  {outlineLinks.length > 0 && (
                    <div
                      className="flex flex-wrap items-center gap-2"
                      role={hasBothOutlines ? "group" : undefined}
                      aria-label={hasBothOutlines ? syllabusLabel : undefined}
                    >
                      {outlineLinks.map(({ url, language }) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="chip border border-emerald-300 font-semibold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                          aria-label={language ? `${syllabusLabel} — ${language}` : syllabusLabel}
                        >
                          {syllabusLabel}{language && ` · ${language}`} <span aria-hidden="true" className="ml-1">↗</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {m.outline_year_fallback && m.outline_year && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                {t("det.outlineFallbackNotice", { requestedYear, actualYear: m.outline_year })}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <span>
                {creditsLine({
                  credits: m.credits,
                  finalAssessment: m.final_assessment || finalKind,
                  faculty: facultyName(m, lang) || t("common.unknownFaculty"),
                  department: m.department ? departmentName(m, lang) : undefined,
                }, lang)}
              </span>
              <TypeChip type={m.type} />
              {isEn && !isEnglishCode(m.code) && <EnBadge />}
              {m.is_talent_program && <CntnBadge />}
            </div>

            {programModuleInfo?.electiveGroup && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <strong>{t("det.electiveGroupRequirement")}</strong>
                {t("mod.electiveReq", {
                  n: programModuleInfo.electiveGroup.required_credits,
                  block: programModuleInfo.electiveGroup.block,
                })}
              </div>
            )}
          </div>
          {/* Điện thoại: chỉ icon, đặt ngay cạnh thông tin học phần. Máy tính: đủ chữ, vừa nội dung, ở góc phải khối tiêu đề. */}
          <ReportErrorsButton course={m} iconOnlyOnPhone className="shrink-0" />
        </div>
        <ModuleActions module={m} timetableSemester={sems.currentYearSecondTerm} responsiveStack />
      </header>

      <div id="mod-overview" className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-4 lg:col-span-2">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h2 className="font-semibold">{t("det.description")}</h2>
              {(() => {
                const d = moduleDescription(m, lang);
                if (lang === "en" && d.fallback && d.text) {
                  return (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      Vietnamese description
                    </span>
                  );
                }
                return null;
              })()}
            </div>
            {(() => {
              const d = moduleDescription(m, lang); // VI → description, EN → description_en; thiếu thì dùng bản còn lại và báo rõ
              return (
                <>
                  <ModuleDescriptionText
                    lang={d.fallback ? (lang === "en" ? "vi" : "en") : lang}
                    text={d.text || t("det.noDescription")}
                  />
                  {d.fallback && <p className="mt-1 text-xs italic text-slate-400">{t("det.descFallback")}</p>}
                </>
              );
            })()}
          </div>
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <WorkloadBreakdownView credits={m.credits} type={m.type} showDetails />
          </div>
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <PrerequisiteTree code={m.code} programId={treeProgramId} />
          </div>
        </section>
        <section id="mod-equivalents" className="card self-start">
          <h2 className="mb-2 font-semibold">{t("det.equivalents")}</h2>
          {m.equivalents?.length ? (
            <ul className="space-y-1 text-sm">
              {m.equivalents.map((e) => (
                <li key={e.code} className="flex justify-between gap-2">
                  <Link href={`/modules/${encodeURIComponent(e.code)}`} className="text-brand-ink hover:underline">
                    {e.code} · {lang === "en" && !e.name_en ? t("common.englishNameUnavailable") : moduleName(e, lang)}
                  </Link>
                  <span className="shrink-0 text-slate-500">{t("common.credits", { n: e.credits })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t("det.none")}</p>
          )}
        </section>
      </div>

      <section id="mod-classes" className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t("det.classes")}</h2>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label={t("det.semester")} title={t("det.semesterTabs")}>
            {sems.data?.map((s) => {
              const on = s.id === semester;
              const n = openCount.get(s.id) ?? 0;
              const label = lang === "en"
                ? `${String(s.year).replace("–", "-")} · Term ${s.term}`
                : `${String(s.year).replace("–", "-")} · HK${s.term}`;
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
                    <td className={`py-2 pr-3 ${seatsAvailable(c) === 0 ? "text-red-600" : ""}`}>{capacityText(c, lang)}</td>
                    <td className="py-2">
                      {c.start_date
                        ? c.end_date && c.start_date === c.end_date
                          ? `${t("tt.oneTime")} · ${formatDateVi(c.start_date)}`
                          : `${formatDateVi(c.start_date)} – ${formatDateVi(c.end_date)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div id="mod-outline">
        <OutlineBlock code={m.code} cohort={userCohort} assessment={m.assessment} textbooks={m.textbooks} />
      </div>

      <section id="mod-reviews" className="card">
        <ModuleReviews moduleCode={m.code} moduleName={m.name} />
        <LecturerReviewPanel moduleCode={m.code} />
      </section>

      <SectionJumpMenu
        items={[
          { id: "mod-overview", label: t("det.description") },
          { id: "mod-equivalents", label: t("det.equivalents") },
          { id: "mod-classes", label: t("det.classes") },
          { id: "mod-outline", label: t("outline.title") },
          { id: "mod-reviews", label: t("comments.title") },
        ]}
      />
    </div>
  );
}
