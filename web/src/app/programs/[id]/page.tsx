"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useMounted } from "@/lib/useMounted";
import { usePlanner } from "@/lib/store";
import { Empty, Loading, PageHeader } from "@/components/ui";
import { ProgramFlowchart } from "@/components/ProgramFlowchart";
import { ModuleActions } from "@/components/ModuleActions";
import { allModules } from "@/lib/programs";
import { useT } from "@/i18n";
import { moduleName } from "@/i18n/names";

export default function ProgramDetailPage() {
  const { t, lang } = useT();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const mounted = useMounted();
  const planner = usePlanner();

  const [activeTab, setActiveTab] = useState<"flowchart" | "blocks" | "check">("flowchart");
  const [selectedCode, setSelectedCode] = useState<string>("");

  const progReq = useApi(() => api.program(id), [id]);
  const graphReq = useApi(() => api.programGraph(id), [id]);

  const p = progReq.data;
  const graph = graphReq.data;

  // List of all modules in program
  const modulesList = useMemo(() => {
    if (!p) return [];
    return allModules(p);
  }, [p]);

  const byCode = useMemo(() => new Map(modulesList.map((m) => [m.code, m])), [modulesList]);
  /** Tên theo ngôn ngữ giao diện; môn không có trong CTĐT thì hiện mã. */
  const nameOf = (code: string) => {
    const m = byCode.get(code);
    return m ? moduleName(m, lang) : code;
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

  if (!mounted || progReq.loading) return <Loading text={t("pd.loading")} />;
  if (!p) {
    return (
      <Empty>
        {t("pd.notFound", { id })}{" "}
        <Link href="/programs" className="text-brand-600 underline">{t("pd.backList")}</Link>
      </Empty>
    );
  }

  const prog = p.program;
  const tabBtn = (on: boolean) => `btn text-xs ${on ? "btn-primary" : "btn-outline"}`;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/programs" className="text-xs text-brand-600 hover:underline">{t("pd.listLink")}</Link>
        <PageHeader
          title={`${prog.name} (${prog.program_id})`}
          subtitle={
            <span className="flex flex-wrap items-center gap-2">
              <span className="chip bg-brand-100 font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-300">{t("pd.cohort", { c: prog.cohort })}</span>
              <span>{prog.faculty || t("prog.defaultFaculty")}</span>
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
              <button role="tab" aria-selected={activeTab === "check"} className={tabBtn(activeTab === "check")} onClick={() => setActiveTab("check")}>
                {t("pd.tabCheck")}
              </button>
            </div>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main content */}
        <div className="min-w-0 space-y-4">
          {activeTab === "flowchart" &&
            (graph ? (
              <ProgramFlowchart graph={graph} selectedCode={selectedCode} onSelectModule={(code) => setSelectedCode(code)} />
            ) : (
              <Loading text={t("pd.preparing")} />
            ))}

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
                      ) : (
                        <span className="text-slate-500">{t("pd.electiveBlock")}</span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {block.modules.map((m) => (
                      <button
                        key={m.code}
                        onClick={() => setSelectedCode(m.code)}
                        className={`rounded border p-3 text-left transition ${
                          selectedCode === m.code
                            ? "border-brand-500 bg-brand-50 ring-1 ring-brand-400 dark:bg-brand-900/30"
                            : "border-slate-200 hover:border-brand-300 dark:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 text-xs">
                          <span className="font-mono font-bold text-brand-700 dark:text-brand-300">{m.code}</span>
                          <span className="text-slate-500">
                            {m.suggested_term ? `${t("pd.termN", { n: m.suggested_term })} · ` : ""}
                            {t("common.credits", { n: m.credits })}
                          </span>
                        </div>
                        <div className="mt-1 line-clamp-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{moduleName(m, lang)}</div>
                        <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                          {m.required ? (
                            <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{t("pd.required")}</span>
                          ) : (
                            <span className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t("pd.elective")}</span>
                          )}
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
                  <Link href="/planner" className="text-brand-600 underline">{t("pd.plannerLink")}</Link>
                  {t("pd.checkDesc2")}
                </p>
              </div>

              {checkReq.loading ? (
                <Loading text={t("pd.checking")} />
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
                    <span className="font-semibold text-slate-500">{t("common.credits", { n: selectedModule.credits })}</span>
                  </div>
                  <h4 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{moduleName(selectedModule, lang)}</h4>
                  <p className="mt-1 text-slate-500">
                    {t("pd.block", { b: selectedModule.block || t("pd.noBlock") })}
                    {selectedModule.suggested_term ? ` · ${t("pd.suggested", { n: selectedModule.suggested_term })}` : ""}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
                  <ModuleActions module={{ code: selectedModule.code, name: selectedModule.name, name_en: selectedModule.name_en, credits: selectedModule.credits }} compact />
                  <div className="mt-2">
                    <Link href={`/modules/${encodeURIComponent(selectedModule.code)}`} className="inline-block font-medium text-brand-600 hover:underline">
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
