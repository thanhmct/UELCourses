"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useMounted } from "@/lib/useMounted";
import { useSemesters } from "@/lib/semesters";
import { usePlanner } from "@/lib/store";
import { Empty, ErrorBox, Loading, PageHeader, RequiredBadge } from "@/components/ui";
import { ProgramFlowchart } from "@/components/ProgramFlowchart";
import { ModuleActions } from "@/components/ModuleActions";
import { allModules, requiredByTerm } from "@/lib/programs";
import { useT } from "@/i18n";
import { creditsLine, facultyName, formatPlannerTerm, moduleName } from "@/i18n/names";
import { getCachedFinalAssessmentKind } from "@/lib/finalAssessment";
import { cleanMajorName, MAJOR_EN } from "@/lib/programCode";


export default function ProgramDetailPage() {
  const { t, lang } = useT();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const mounted = useMounted();
  const planner = usePlanner();
  const { currentYearSecondTerm } = useSemesters();

  const [activeTab, setActiveTab] = useState<"flowchart" | "blocks" | "terms" | "electives" | "check">("flowchart");
  const [selectedCode, setSelectedCode] = useState<string>("");

  const progReq = useApi(() => api.program(id), [id]);
  const graphReq = useApi(() => api.programGraph(id), [id]);
  const electivesReq = useApi(() => api.electiveGroups(id), [id]);

  const p = progReq.data;
  const graph = graphReq.data;
  const electiveGroups = useMemo(() => electivesReq.data ?? [], [electivesReq.data]);

  // List of all modules in program
  const modulesList = useMemo(() => {
    if (!p) return [];
    return allModules(p);
  }, [p]);

  const termGroups = useMemo(() => (p ? requiredByTerm(p) : []), [p]);
  const byCode = useMemo(() => new Map(modulesList.map((m) => [m.code, m])), [modulesList]);
  /** Tên theo ngôn ngữ giao diện; môn không có trong CTĐT thì hiện mã. */
  const nameOf = (code: string) => {
    const m = byCode.get(code);
    return m ? moduleName(m, lang) : code;
  };

  const isEnglishTrack = useMemo(() => {
    if (!p) return false;
    const pid = p.program.program_id.toUpperCase();
    return (
      pid.endsWith("E") ||
      pid.includes("E") ||
      p.program.track_source === "official" ||
      p.track_source === "official" ||
      (Boolean(p.program.name) && p.program.name.includes("tiếng Anh"))
    );
  }, [p]);

  const isVietnameseInEnglishTrack = (code: string, mod?: { is_vietnamese_track?: boolean }) => {
    if (!isEnglishTrack) return false;
    if (mod?.is_vietnamese_track) return true;
    const clean = code.trim().toUpperCase();
    return clean.startsWith("B");
  };

  // Check plan against student's planner state
  const checkReq = useApi(() => {
    if (!p) return Promise.resolve({ data: null, mock: true });
    const plannedTerms: Record<string, string[]> = {};
    planner.terms.forEach((term) => {
      plannedTerms[term.id] = term.modules;
    });
    return api.checkProgram(id, {
      completed: planner.completed.map((code) => ({ code })),
      planned: plannedTerms,
    });
  }, [id, planner.completed, planner.terms, p]);

  const selectedModule = useMemo(() => (selectedCode ? byCode.get(selectedCode) ?? null : null), [selectedCode, byCode]);

  // What modules require the selected module (unlocks)?
  const unlocksModules = useMemo(() => {
    if (!selectedCode || !graph) return [];
    return graph.edges
      .filter((e) => e.source === selectedCode)
      .map((e) => {
        const m = byCode.get(e.target);
        return { code: e.target, type: e.type, name: m ? moduleName(m, lang) : e.target };
      });
  }, [selectedCode, graph, byCode, lang]);

  if (!mounted || progReq.loading) return <Loading page />;
  if (progReq.offline) return <ErrorBox>{t("api.connectionError")}</ErrorBox>;
  if (!p) {
    return (
      <Empty>
        {t("pd.notFound", { id })}{" "}
        <Link href="/programs" className="text-brand-ink underline">{t("pd.backList")}</Link>
      </Empty>
    );
  }

  const prog = p.program;
  const cleanedProgramName = cleanMajorName(prog.name);
  const programDisplayName = lang === "en" ? (MAJOR_EN[cleanedProgramName.toLowerCase()] ?? cleanedProgramName) : prog.name;
  const tabBtn = (on: boolean) => `btn text-xs ${on ? "btn-primary" : "btn-outline"}`;

  return (
    <div className="space-y-4">
      <PageHeader
        backHref="/programs"
        backLabel={t("pd.backLabel")}
        title={`${programDisplayName} (${prog.program_id})`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="chip bg-brand-100 font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-300">{t("pd.cohort", { c: prog.cohort })}</span>
            <span>{prog.faculty ? facultyName(prog.faculty, lang) : t("prog.defaultFaculty")}</span>
            <span>·</span>
            <span>{t("pd.requiredCr", { n: prog.total_credits })}</span>
            <span>·</span>
            <span>{t("pd.modules", { n: modulesList.length })}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2" role="tablist">
            <button role="tab" aria-selected={activeTab === "flowchart"} className={tabBtn(activeTab === "flowchart")} onClick={() => setActiveTab("flowchart")}>
              {t("pd.tabFlow")}
            </button>
            <button role="tab" aria-selected={activeTab === "blocks"} className={tabBtn(activeTab === "blocks")} onClick={() => setActiveTab("blocks")}>
              {t("pd.tabBlocks")}
            </button>
            <button role="tab" aria-selected={activeTab === "terms"} className={tabBtn(activeTab === "terms")} onClick={() => setActiveTab("terms")}>
              {t("pd.tabTerms")}
            </button>
            <button role="tab" aria-selected={activeTab === "electives"} className={tabBtn(activeTab === "electives")} onClick={() => setActiveTab("electives")}>
              {t("pd.tabElectives")}
              {electiveGroups.length > 0 && <span className="ml-1 opacity-80">({electiveGroups.length})</span>}
            </button>
            <button role="tab" aria-selected={activeTab === "check"} className={tabBtn(activeTab === "check")} onClick={() => setActiveTab("check")}>
              {t("pd.tabCheck")}
            </button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main content */}
        <div className="min-w-0 space-y-4 min-h-[450px]">
          {activeTab === "flowchart" &&
            (graph ? (
              <ProgramFlowchart graph={graph} selectedCode={selectedCode} onSelectModule={(code) => setSelectedCode(code)} />
            ) : (
              graphReq.error ? <ErrorBox>{graphReq.error}</ErrorBox> : <Loading />
            ))}

          {activeTab === "terms" && (
            <div className="space-y-3">
              {termGroups.length === 0 && <Empty>{t("pd.noRequired")}</Empty>}
              {termGroups.map((g) => (
                <div key={g.order ?? "none"} className="card space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                    <h3 className="font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {g.order === null ? t("pd.unassignedTerm") : t("pd.termOrder", { n: g.order })}
                      {g.semester ? <span className="ml-2 text-xs font-normal text-slate-500 whitespace-nowrap">({formatPlannerTerm(g.semester, lang)})</span> : null}
                    </h3>
                    <span className="text-xs text-slate-500 whitespace-nowrap">{t("pd.termSummary", { m: g.modules.length, c: g.credits })}</span>
                  </div>
                  <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                    {g.modules.map((m) => (
                      <li key={m.code} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <Link href={`/modules/${encodeURIComponent(m.code)}`} className="hover:underline">
                            <span className="font-semibold text-brand-700 dark:text-brand-300">{m.code}</span> {moduleName(m, lang)}
                          </Link>
                          <RequiredBadge required={m.required} lang={lang} />
                          {isVietnameseInEnglishTrack(m.code, m) && (
                            <span className="chip bg-slate-100 text-slate-700 text-[10px] dark:bg-slate-800 dark:text-slate-300">
                              Học bằng tiếng Việt
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500">
                          {creditsLine({ credits: m.credits, finalAssessment: (m as { final_assessment?: string }).final_assessment || getCachedFinalAssessmentKind(m.code) }, lang)} · {m.block}
                        </span>
                      </li>
                    ))}
                  </ul>

                </div>
              ))}
            </div>
          )}

          {activeTab === "blocks" && (
            <div className="space-y-3">
              {p.blocks.map((block, idx) => (
                <div key={`${block.name}-${idx}`} className="card space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white">{block.name}</h3>
                      {block.parent ? <p className="text-xs text-slate-500">{t("pd.partOf", { p: block.parent })}</p> : null}
                    </div>
                    <div className="text-xs">
                      {block.required_credits ? (
                        <span className="font-semibold text-brand-700 dark:text-brand-300">{t("pd.requiredBlock", { n: block.required_credits })}</span>
                      ) : (() => {
                        const eg = electiveGroups.find((g) => g.block === block.name);
                        if (eg && eg.required_credits > 0) {
                          return (
                            <span className="font-semibold text-amber-700 dark:text-amber-300">
                              {t("pd.electiveRequirementShort", { n: eg.required_credits })}
                            </span>
                          );
                        }
                        return <span className="text-slate-500">{t("pd.electiveBlock")}</span>;
                      })()}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {block.modules.map((m) => (
                      <button
                        key={m.code}
                        onClick={() => setSelectedCode(m.code)}
                        className={`rounded border p-3 text-left transition ${
                          selectedCode === m.code
                            ? "brand-selected border-brand-focus bg-brand-50 ring-1 ring-brand-focus dark:bg-brand-900"
                            : "border-slate-200 hover:border-brand-300 dark:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 text-xs">
                          <span className="font-mono font-bold text-brand-700 dark:text-brand-300">{m.code}</span>
                          <span className="text-slate-600 dark:text-slate-300">
                            {m.suggested_term ? `${t("pd.termN", { n: m.suggested_term })} · ` : ""}
                            {creditsLine({ credits: m.credits, finalAssessment: (m as { final_assessment?: string }).final_assessment || getCachedFinalAssessmentKind(m.code) }, lang)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                          <span className="line-clamp-1">{moduleName(m, lang)}</span>
                          <RequiredBadge required={m.required} lang={lang} />
                          {isVietnameseInEnglishTrack(m.code, m) && (
                            <span className="chip bg-slate-100 text-slate-700 text-[10px] dark:bg-slate-800 dark:text-slate-300">
                              Học bằng tiếng Việt
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                          {(m.prereq?.length ?? 0) > 0 && (
                            <span className="chip bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">{t("pd.prereqCount", { n: m.prereq?.length ?? 0 })}</span>
                          )}
                          {(m.previous?.length ?? 0) > 0 && (
                            <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{t("pd.previousCount", { n: m.previous?.length ?? 0 })}</span>
                          )}
                        </div>

                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "check" && (
            <div className="space-y-4">
              <div className="card space-y-2">
                <h3 className="font-bold text-slate-900 dark:text-white">{t("pd.checkTitle", { id: prog.program_id })}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {t("pd.checkDesc1")}{" "}
                  <Link href="/planner" className="text-brand-ink underline">{t("pd.plannerLink")}</Link>
                  {t("pd.checkDesc2")}
                </p>
              </div>

              {checkReq.loading ? (
                <Loading />
              ) : checkReq.error ? (
                <ErrorBox>{checkReq.error}</ErrorBox>
              ) : checkReq.data ? (
                <div className="space-y-4">
                  {checkReq.data.warnings?.length > 0 && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      <strong>{t("pd.regNote")}</strong>
                      <ul className="mt-1 list-disc space-y-1 pl-5">
                        {checkReq.data.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {checkReq.data.blocked.length > 0 && (
                    <div className="card space-y-3 border-red-200 dark:border-red-900/50">
                      <h4 className="font-bold text-red-700 dark:text-red-300">{t("pd.blockedTitle", { n: checkReq.data.blocked.length })}</h4>
                      <p className="text-xs text-slate-500">{t("pd.blockedDesc")}</p>
                      <div className="space-y-2">
                        {checkReq.data.blocked.map((b) => (
                          <div key={b.code} className="rounded border border-red-200 bg-red-50/50 p-3 text-xs dark:border-red-950 dark:bg-red-950/30">
                            <span className="font-mono font-bold text-red-800 dark:text-red-200">
                              {b.code} ({nameOf(b.code)})
                            </span>
                            <div className="mt-1 text-slate-600 dark:text-slate-400">
                              {t("pd.missing", { list: b.missing.map((m) => `${m.code} (${m.type})`).join(", ") })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="card space-y-3">
                    <h4 className="font-bold text-emerald-700 dark:text-emerald-300">{t("pd.eligibleTitle", { n: checkReq.data.eligible_now.length })}</h4>
                    <p className="text-xs text-slate-500">{t("pd.eligibleDesc")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {checkReq.data.eligible_now.slice(0, 30).map((code) => (
                        <button
                          key={code}
                          onClick={() => setSelectedCode(code)}
                          className="chip bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200"
                        >
                          <span className="font-mono">{code}</span> · {byCode.get(code) ? nameOf(code) : ""}
                        </button>
                      ))}
                      {checkReq.data.eligible_now.length > 30 && (
                        <span className="py-1 text-xs text-slate-400">{t("pd.more", { n: checkReq.data.eligible_now.length - 30 })}</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Inspector for the selected module */}
        <aside className="space-y-4">
          <div className="card sticky top-16 space-y-4">
            <h3 className="border-b border-slate-100 pb-2 font-bold text-slate-900 dark:border-slate-800 dark:text-white">{t("pd.inspector")}</h3>

            {selectedModule ? (
              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-sm font-bold text-brand-700 dark:text-brand-300">{selectedModule.code}</span>
                    <span className="font-semibold text-slate-500">
                      {creditsLine({ credits: selectedModule.credits, finalAssessment: (selectedModule as { final_assessment?: string }).final_assessment || getCachedFinalAssessmentKind(selectedModule.code) }, lang)}
                    </span>
                  </div>
                  <h4 className="mt-1 flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                    <span>{moduleName(selectedModule, lang)}</span>
                    <RequiredBadge required={selectedModule.required} lang={lang} />
                    {isVietnameseInEnglishTrack(selectedModule.code, selectedModule) && (
                      <span className="chip bg-slate-100 text-slate-700 text-[10px] dark:bg-slate-800 dark:text-slate-300">
                        Học bằng tiếng Việt
                      </span>
                    )}
                  </h4>
                  <p className="mt-1 text-slate-500">
                    {t("pd.block", { b: selectedModule.block || t("pd.noBlock") })}
                    {selectedModule.suggested_term ? ` · ${t("pd.suggested", { n: selectedModule.suggested_term })}` : ""}
                  </p>
                </div>


                <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
                  <ModuleActions module={selectedModule} timetableSemester={currentYearSecondTerm} compact />
                  <div className="mt-2">
                    <Link href={`/modules/${encodeURIComponent(selectedModule.code)}`} className="inline-block font-medium text-brand-ink hover:underline">
                      {t("pd.viewDetail")}
                    </Link>
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {t("pd.needPre", { n: (selectedModule.prereq?.length ?? 0) + (selectedModule.previous?.length ?? 0) })}
                  </span>
                  {!(selectedModule.prereq?.length || selectedModule.previous?.length) ? (
                    <p className="text-slate-400">{t("pd.noPre")}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedModule.prereq?.map((c) => (
                        <button key={c} onClick={() => setSelectedCode(c)} className="w-full rounded border border-slate-200 p-2 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-brand-600 dark:text-brand-400">{c}</span>
                            <span className="rounded bg-emerald-50 px-1 text-[10px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{t("pd.tagPre")}</span>
                          </div>
                          <div className="truncate text-slate-600 dark:text-slate-400">{nameOf(c)}</div>
                        </button>
                      ))}
                      {selectedModule.previous?.map((c) => (
                        <button key={c} onClick={() => setSelectedCode(c)} className="w-full rounded border border-slate-200 p-2 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-brand-600 dark:text-brand-400">{c}</span>
                            <span className="rounded bg-amber-50 px-1 text-[10px] text-amber-700 dark:bg-amber-950 dark:text-amber-300">{t("pd.tagPrev")}</span>
                          </div>
                          <div className="truncate text-slate-600 dark:text-slate-400">{nameOf(c)}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                  <span className="font-bold text-slate-800 dark:text-slate-200">{t("pd.unlocks", { n: unlocksModules.length })}</span>
                  {unlocksModules.length === 0 ? (
                    <p className="text-slate-400">{t("pd.noUnlocks")}</p>
                  ) : (
                    <div className="max-h-48 space-y-1.5 overflow-y-auto">
                      {unlocksModules.map((u) => (
                        <button key={u.code} onClick={() => setSelectedCode(u.code)} className="w-full rounded border border-slate-200 p-2 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
                          <span className="font-mono font-bold text-brand-600 dark:text-brand-400">{u.code}</span>
                          <div className="truncate text-slate-600 dark:text-slate-400">{u.name}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">{t("pd.pickHint")}</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
