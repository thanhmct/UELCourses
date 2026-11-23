"use client";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePlanner, useSettings } from "@/lib/store";
import { useMounted } from "@/lib/useMounted";
import {
  completePlannerYears,
  plannerEnrollmentYear,
  plannerSemesterId,
  prerequisiteWarnings,
  sortPlannerTermsChronologically,
  suggestReplacements,
  termCredits,
  type PlanTerm,
  type PlannerAcademicYears,
  type PlannedModule,
} from "@/lib/planner";
import { creditLoad, totalCredits } from "@/lib/credits";
import { cohortStartYear, latestEnrollmentCohort } from "@/lib/semesters";
import { plannerTermColorVariables } from "@/lib/appearance";
import { calculateGpa, isExcludedFromGpa } from "@/lib/gpa";
import { api } from "@/lib/api";
import { Loading, PageHeader, RequiredBadge } from "@/components/ui";
import { ModuleSearch } from "@/components/ModuleSearch";
import { addModuleToPlanner, COMPLETED_WITHOUT_TERM, placeModuleInPlanner } from "@/components/ModuleActions";
import { track } from "@/lib/analytics";
import { BatchModuleAdd } from "./BatchModuleAdd";
import { formatGpa, ModuleGrade, PlannerGpaSummary, usePlannerScores } from "./PlannerGrades";
import { useT } from "@/i18n";
import { creditsLine, formatPlannerTerm, formatPlannerTermStats, moduleName } from "@/i18n/names";
import { getCachedFinalAssessmentKind } from "@/lib/finalAssessment";
import { ReportErrorsButton } from "@/components/FeedbackWidget";
import { SelectMenu } from "@/components/SelectMenu";
import { appConfirm } from "@/lib/dialog";
import { plannerCollisionDetection } from "./plannerDnd";
import { PlannerYearDialog } from "./PlannerYearDialog";


function Column({
  id,
  title,
  children,
  header,
  dropDisabled = false,
}: {
  id: string;
  title: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  dropDisabled?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: dropDisabled });
  return (
    <div
      ref={setNodeRef}
      className={`card flex h-full min-w-0 flex-col gap-2 p-3 transition ${
        isOver ? "border-brand-500 ring-2 ring-brand-200 dark:ring-brand-800" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 min-h-[48px] dark:border-slate-800">
        <div className="min-w-0 flex-1">{title}</div>
        {header}
      </div>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

function ModuleCard({ code, warn, score, onScoreChange, completedOnly = false }: {
  code: string;
  warn?: string[];
  score: string;
  onScoreChange: (code: string, raw: string) => void;
  completedOnly?: boolean;
}) {
  const { t, lang } = useT();
  const p = usePlanner();
  const m = p.catalog[code];
  const done = p.completed.includes(code);
  const isBlocked = !!(warn && warn.length > 0);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: code });
  const repl = completedOnly ? [] : suggestReplacements(p, code);
  const [showRepl, setShowRepl] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}
      data-planner-module={code}
      className={`rounded-lg border p-2.5 text-sm transition-colors ${
        isDragging ? "z-30 will-change-transform opacity-90 shadow-lg ring-2 ring-brand-400" : ""
      } ${
        done
          ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20"
          : isBlocked
          ? "border-red-300 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/20"
          : "border-slate-200 bg-white hover:border-brand-300 dark:border-slate-700 dark:bg-slate-800"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          {...listeners}
          {...attributes}
          className={`touch-none px-1 text-slate-400 hover:text-slate-600 ${isDragging ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing"}`}
          aria-label={t("pl.dragAria", { code })}
        >
          ⋮⋮
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`/modules/${encodeURIComponent(code)}`}
              className={`font-mono font-bold hover:underline ${
                done ? "text-emerald-700 line-through dark:text-emerald-300" : "text-brand-700 dark:text-brand-300"
              }`}
            >
              {code}
            </Link>
            <span className="text-xs text-slate-500">
              · {creditsLine({ credits: m?.credits, finalAssessment: (m as { final_assessment?: string } | undefined)?.final_assessment || getCachedFinalAssessmentKind(code) }, lang)}
            </span>
            <RequiredBadge required={(m as { required?: boolean } | undefined)?.required} lang={lang} />
            {done ? (
              <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {t("pl.doneBadge")}
              </span>
            ) : isBlocked ? (
              <span className="rounded bg-red-100 px-1.5 text-[10px] font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">
                {t("pl.blockedBadge")}
              </span>
            ) : (
              <span className="rounded bg-blue-50 px-1.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                {t("pl.eligible")}
              </span>
            )}
          </div>

          <div className="mt-0.5 break-words text-xs text-slate-600 dark:text-slate-300">{m ? moduleName(m, lang) : ""}</div>
        </div>
        <button
          className="text-xs text-slate-400 hover:text-red-500"
          onClick={() => {
            p.removeModule(code);
            track("planner_remove", { module_code: code });
          }}
          aria-label={t("pl.remove", { code })}
          title={t("pl.remove", { code })}
        >
          ✕
        </button>
      </div>

      {!completedOnly && <div className="mt-2 flex flex-wrap items-center gap-2 pl-6 text-xs">
        <label className="flex cursor-pointer items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={done} onChange={() => p.toggleCompleted(code)} className="accent-brand-600" />
          {t("pl.completedCheck")}
        </label>
        {repl.length > 0 && (
          <button className="text-violet-700 hover:underline dark:text-violet-300" onClick={() => setShowRepl((v) => !v)}>
            {t("pl.replCount", { n: repl.length })}
          </button>
        )}
      </div>}

      {warn?.length ? (
        <div className="mt-1.5 rounded bg-red-100/70 p-1.5 pl-3 text-xs text-red-800 dark:bg-red-950/60 dark:text-red-200">
          {t("pl.missingPrereq")} <strong>{warn.join(", ")}</strong>
        </div>
      ) : null}

      {showRepl && (
        <ul className="mt-1.5 space-y-1 rounded border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-900">
          {repl.map((e) => (
            <li key={e.code} className="flex items-center justify-between gap-2">
              <span>
                <span className="font-mono">{e.code}</span> · {moduleName(e, lang)} ({t("common.credits", { n: e.credits })})
              </span>
              <button
                className="font-semibold text-brand-ink hover:underline"
                onClick={async () => {
                  const d = (await api.module(e.code)).data;
                  p.replaceModule(code, {
                    code: e.code,
                    name: d?.name ?? e.name,
                    name_en: d?.name_en ?? e.name_en ?? null,
                    credits: d?.credits ?? e.credits,
                    prerequisites: d?.prerequisites ?? [],
                    equivalents: d?.equivalents ?? [{ code, name: m?.name ?? code, credits: m?.credits ?? 0 }],
                  });
                }}
              >
                {t("pl.swap")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <ModuleGrade code={code} value={score} onScoreChange={onScoreChange} excluded={isExcludedFromGpa(m?.name)} />
    </div>
  );
}

function TermSummaryBar({
  terms,
  catalog,
  lang,
  onRemove,
  onChooseYears,
}: {
  terms: PlanTerm[];
  catalog: Record<string, PlannedModule>;
  lang: import("@/i18n").Lang;
  onRemove: (term: PlanTerm) => void;
  onChooseYears: (button: HTMLButtonElement) => void;
}) {
  const { t } = useT();
  const plannerTermColor = useSettings((s) => s.plannerTermColor);
  const enrollmentYear = useSettings((s) => plannerEnrollmentYear(s.programCode, s.cohort));
  const hasUnresolvedSemester = terms.some(({ name, modules }) => modules.length && !plannerSemesterId(name, enrollmentYear));
  return (
    <div className="card space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <h3 className="font-semibold text-slate-700 dark:text-slate-300">{t("pl.termSummaryBar")}</h3>
        <button type="button" className="btn-outline" aria-haspopup="dialog" onClick={(event) => onChooseYears(event.currentTarget)}>
          <CalendarDays className="size-4" aria-hidden="true" />
          {t("pl.planYears")}
        </button>
      </div>
      {hasUnresolvedSemester && (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {t(enrollmentYear === null ? "pl.syncNeedCohort" : "pl.syncNeedSemester")}
        </p>
      )}
      {terms.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t("pl.loadNormal")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              {t("pl.loadLow")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {t("pl.loadHigh")}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5">
            {terms.map((term) => {
              const cr = term.modules.reduce((s, c) => s + (catalog[c]?.credits ?? 0), 0);
              const load = creditLoad(cr);
              const badgeColor = load === "high"
                ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                : "planner-term-summary";
              const statusColor = load === "high" ? "bg-red-500" : load === "low" ? "bg-amber-500" : cr === 0 ? "bg-slate-400" : "bg-emerald-500";

              const termTitle = formatPlannerTerm(term.name, lang);

              return (
                <div key={term.id} className={`relative flex shrink-0 rounded-lg border text-xs transition hover:shadow-xs ${badgeColor}`}
                  style={load === "high" ? undefined : plannerTermColorVariables(plannerTermColor) as CSSProperties}>
                  <span className={`absolute bottom-1.5 left-1.5 size-1.5 rounded-full ${statusColor}`} aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById(`term-${term.id}`);
                      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }}
                    title={t("pl.scrollToTerm", { name: termTitle })}
                    className="flex min-w-28 flex-col items-center justify-center py-1.5 pl-3 pr-8"
                  >
                    <span className="max-w-32 truncate font-medium whitespace-nowrap">{termTitle}</span>
                    <span className="font-mono font-bold whitespace-nowrap">{cr} {t("common.unitCr")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(term)}
                    className="absolute right-1 top-1 grid size-6 place-items-center rounded text-sm opacity-70 transition hover:bg-black/10 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-brand-focus dark:hover:bg-white/10"
                    aria-label={t("pl.removeTerm", { name: termTitle })}
                    title={t("pl.removeTerm", { name: termTitle })}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function PlannerPage() {
  const { t, lang } = useT();
  const mounted = useMounted();
  const p = usePlanner();
  const [target, setTarget] = useState("");
  const [addError, setAddError] = useState(false);
  const [backlogAddError, setBacklogAddError] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [draftYears, setDraftYears] = useState<PlannerAcademicYears | null>(null);
  const previewing = draftYears !== null;
  const yearPickerButton = useRef<HTMLButtonElement | null>(null);
  const cohortYear = useSettings((s) => plannerEnrollmentYear(s.programCode, s.cohort));
  const currentYear = cohortStartYear(latestEnrollmentCohort())!;
  const { inputs, scores, updateScore } = usePlannerScores();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const sortedTerms = useMemo(() => sortPlannerTermsChronologically(p.terms), [p.terms]);
  const previousAdmission = p.academicYears?.admission ?? cohortYear;
  const roadmapTerms = useMemo(() => draftYears
    ? sortPlannerTermsChronologically(completePlannerYears(p.terms, draftYears, previousAdmission ?? draftYears.admission))
    : sortedTerms, [draftYears, p.terms, previousAdmission, sortedTerms]);
  const targetTerm = sortedTerms.find((term) => term.id === target) ?? sortedTerms[0];
  const destination = target === COMPLETED_WITHOUT_TERM ? target : targetTerm?.id;
  const warnings = useMemo(() => prerequisiteWarnings({ ...p, terms: sortedTerms }), [p, sortedTerms]);
  const warnMap = useMemo(() => Object.fromEntries(warnings.map((w) => [w.code, w.missing])), [warnings]);

  useEffect(() => {
    if (previewing) {
      document.getElementById("planner-roadmap")?.scrollIntoView?.({ block: "start" });
    } else if (yearPickerButton.current) {
      yearPickerButton.current.focus();
      yearPickerButton.current = null;
    }
  }, [previewing]);

  if (!mounted) return <Loading />;

  const planned = new Set([...p.backlog, ...sortedTerms.flatMap((term) => term.modules)]);
  const completed = [...new Set(p.completed)];
  const completedWithoutTerm = completed.filter((code) => !planned.has(code));
  const allCodes = [...new Set([...planned, ...completed])];
  const gradeItems = (codes: string[]) => codes.map((code) => ({
    credits: p.catalog[code]?.credits ?? 0,
    name: p.catalog[code]?.name,
    score10: scores[code],
  }));
  const total = totalCredits(gradeItems(allCodes));
  const doneCredits = totalCredits(gradeItems(completed));
  const addDestinationLabel = destination === COMPLETED_WITHOUT_TERM
    ? t("pl.completedWithoutTerm")
    : targetTerm ? formatPlannerTerm(targetTerm.name, lang) : t("pl.firstTerm");

  function onDragEnd(e: DragEndEvent) {
    if (e.over) p.move(String(e.active.id), String(e.over.id));
  }

  function openYearPicker(button: HTMLButtonElement) {
    yearPickerButton.current = button;
    const explicitYears = p.terms.flatMap(({ name }) => {
      const semester = plannerSemesterId(name, null);
      return semester ? [Number(semester.slice(0, 4))] : [];
    });
    const admission = cohortYear ?? (explicitYears.length ? Math.min(...explicitYears) : currentYear);
    setDraftYears(p.academicYears ?? { admission, graduation: Math.max(admission + 3, currentYear, ...explicitYears) });
  }

  async function removeTerm(term: PlanTerm) {
    const termTitle = formatPlannerTerm(term.name, lang);
    const confirmed = await appConfirm(t("pl.confirmRemoveTerm", { name: termTitle, n: term.modules.length }), {
      title: t("pl.confirmRemoveTermTitle"),
      okLabel: t("pl.confirmRemoveTermAction"),
      cancelLabel: t("common.cancel"),
      compact: true,
      danger: true,
    });
    if (confirmed) p.removeTerm(term.id);
  }

  const content = (
    <div className="space-y-4" inert={previewing}>
      <PageHeader title={t("pl.title")} actions={<ReportErrorsButton />} />

      <PlannerGpaSummary
        result={calculateGpa(gradeItems(allCodes))}
        total={total}
        completed={doneCredits}
      />

      <div className="card space-y-3 p-3">
        <div className="min-w-0">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,auto)]">
            <ModuleSearch
              placeholder={t("pl.addModule")}
              onPick={async (m) => {
                setAddError(false);
                try {
                  await addModuleToPlanner(m, destination);
                  track("planner_add", { module_code: m.code });
                } catch {
                  setAddError(true);
                }
              }}
              exclude={allCodes}
              inheritProgramProfile={false}
            />
            <SelectMenu
              className="w-full sm:min-w-44"
              ariaLabel={t("pl.addToTerm")}
              value={destination ?? ""}
              onChange={setTarget}
              options={[
                ...(sortedTerms.length === 0 ? [{ value: "", label: t("pl.firstTerm") }] : []),
                ...sortedTerms.map((term) => ({ value: term.id, label: formatPlannerTerm(term.name, lang) })),
                { value: COMPLETED_WITHOUT_TERM, label: t("pl.completedWithoutTerm") },
              ]}
            />
          </div>
          {addError && <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{t("pl.addError")}</p>}
        </div>

        <div className="relative w-fit text-sm">
          <button
            type="button"
            aria-expanded={batchOpen}
            aria-haspopup="dialog"
            className="font-medium text-brand-ink hover:underline"
            onClick={() => setBatchOpen((open) => !open)}
          >
            <span aria-hidden="true">{batchOpen ? "▼" : "▶"}</span> {t("pl.batchAdd")}
          </button>
          {batchOpen && (
            <>
              <button
                type="button"
                aria-label={t("pl.closeBatchAdd")}
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setBatchOpen(false)}
              />
              <div
                role="dialog"
                aria-label={t("pl.batchAdd")}
                className="absolute left-0 top-full z-40 mt-2 max-h-[min(70vh,36rem)] w-[min(48rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                onKeyDown={(event) => {
                  if (event.key === "Escape") setBatchOpen(false);
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-slate-900 dark:text-white">{t("pl.batchAdd")}</h3>
                  <button
                    type="button"
                    aria-label={t("pl.closeBatchAdd")}
                    className="grid size-7 place-items-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                    onClick={() => setBatchOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                <BatchModuleAdd
                  destination={addDestinationLabel}
                  onAdd={(m) => {
                    placeModuleInPlanner(m, destination);
                    track("planner_add", { module_code: m.code });
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="planner-roadmap">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="planner-roadmap" className="scroll-mt-32 text-base font-semibold md:scroll-mt-20">{t("pl.tabBoard")}</h2>
          {warnings.length > 0 && (
            <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <span aria-hidden="true">⚠ </span>{t("pl.warnCount", { n: warnings.length })}
            </span>
          )}
        </div>
        <TermSummaryBar terms={roadmapTerms} catalog={p.catalog} lang={lang} onRemove={removeTerm}
          onChooseYears={openYearPicker} />

        {allCodes.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              {t("pl.legendDone")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              {t("pl.legendOk")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              {t("pl.legendBlocked")}
            </span>
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={plannerCollisionDetection} onDragEnd={onDragEnd}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div id="planner-backlog" className="min-w-0">
              <Column
                id="backlog"
                title={
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{t("pl.backlog")}</h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {t("pl.backlogCount", { n: p.backlog.length })}
                    </p>
                  </div>
                }
              >
                <ModuleSearch
                  placeholder={t("pl.backlogInput")}
                  onPick={async (m) => {
                    setBacklogAddError(false);
                    try {
                      await addModuleToPlanner(m);
                      track("planner_add", { module_code: m.code });
                    } catch {
                      setBacklogAddError(true);
                    }
                  }}
                  exclude={allCodes}
                  inheritProgramProfile={false}
                />
                {backlogAddError && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{t("pl.addError")}</p>}
                {p.backlog.length === 0 ? (
                  <p className="py-4 text-center text-xs italic text-slate-500">{t("pl.backlogEmpty")}</p>
                ) : p.backlog.map((code) => (
                  <ModuleCard key={code} code={code} score={inputs[code] ?? ""} onScoreChange={updateScore} />
                ))}
              </Column>
            </div>
            {roadmapTerms.map((term) => {
              const cr = termCredits(p, term.id);
              const termTitle = formatPlannerTerm(term.name, lang);
              const termStats = formatPlannerTermStats(term.modules.length, cr, lang);
              const termGpa = calculateGpa(gradeItems(term.modules));

              return (
                <div key={term.id} id={`term-${term.id}`} className="min-w-0">
                  <Column
                    id={term.id}
                    title={
                      <div className="min-w-0">
                        <h3 className="truncate whitespace-nowrap text-sm font-semibold" title={termTitle}>{termTitle}</h3>
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          <span className="whitespace-nowrap">{termStats}</span>
                          <span className="whitespace-nowrap">
                            {t("gpa.scale10")} <strong className="text-brand-ink">{formatGpa(termGpa, "10")}</strong>
                          </span>
                          <span className="whitespace-nowrap">
                            {t("gpa.scale4")} <strong className="text-brand-ink">{formatGpa(termGpa, "4")}</strong>
                          </span>
                        </p>
                      </div>
                    }
                    header={
                      <button
                        type="button"
                        className="p-1 text-xs text-slate-400 hover:text-red-500"
                        onClick={() => removeTerm(term)}
                        aria-label={t("pl.removeTerm", { name: termTitle })}
                      >
                        ✕
                      </button>
                    }
                  >
                    {term.modules.length === 0 ? (
                      <p className="py-6 text-center text-xs italic text-slate-500">{t("pl.dropModule")}</p>
                    ) : term.modules.map((code) => (
                      <ModuleCard key={code} code={code} warn={warnMap[code]} score={inputs[code] ?? ""} onScoreChange={updateScore} />
                    ))}
                  </Column>
                </div>
              );
            })}
            {completedWithoutTerm.length > 0 && (
              <Column
                id={COMPLETED_WITHOUT_TERM}
                dropDisabled
                title={
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{t("pl.completedWithoutTerm")}</h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {formatPlannerTermStats(completedWithoutTerm.length, totalCredits(gradeItems(completedWithoutTerm)), lang)}
                    </p>
                  </div>
                }
              >
                {completedWithoutTerm.map((code) => (
                  <ModuleCard key={code} code={code} score={inputs[code] ?? ""} onScoreChange={updateScore} completedOnly />
                ))}
              </Column>
            )}
          </div>
        </DndContext>
        {roadmapTerms.length === 0 && allCodes.length === 0 && (
          <p className="card p-5 text-center text-sm text-slate-500">{t("pl.emptyRoadmap")}</p>
        )}
        {sortedTerms.length > 0 && <p className="text-xs text-slate-500">{t("pl.thresholdNote")}</p>}
      </section>
    </div>
  );

  return (
    <>
      {content}
      {draftYears && (
        <PlannerYearDialog years={draftYears} currentYear={currentYear} onChange={setDraftYears}
          onClose={() => setDraftYears(null)}
          onApply={() => {
            p.addAcademicYears(draftYears);
            setDraftYears(null);
          }} />
      )}
    </>
  );
}
