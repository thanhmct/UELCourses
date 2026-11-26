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
import { CalendarDays, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { usePlanner, useSettings } from "@/lib/store";
import { useMounted } from "@/lib/useMounted";
import { PHONE_QUERY } from "@/lib/useMaxVisibleItems";
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
import { translate, useT } from "@/i18n";
import { creditsLine, formatPlannerTerm, formatPlannerTermShort, formatPlannerTermStats, moduleName } from "@/i18n/names";
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
  contentClassName = "flex flex-1 flex-col gap-2",
}: {
  id: string;
  title: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  dropDisabled?: boolean;
  contentClassName?: string;
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
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

/** Khu vực kéo-thả để xoá môn khỏi kế hoạch; kéo vào rồi thì xoá luôn, không hỏi lại. */
function TrashZone() {
  const { t } = useT();
  const { setNodeRef, isOver } = useDroppable({ id: "trash" });
  return (
    <div
      ref={setNodeRef}
      aria-hidden="true"
      className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-sm font-medium transition ${
        isOver
          ? "border-red-500 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300"
          : "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
      }`}
    >
      <Trash2 className="size-4 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">{t("pl.trashZone")}</span>
    </div>
  );
}

/** Một ô học kỳ trong study map (lưới tóm tắt phía trên); là điểm thả để xếp/chuyển môn vào kỳ này. */
function TermCell({
  term,
  active,
  heavy,
  blocked,
  label,
  credits,
  unitCr,
  title,
  cssVars,
  onSelect,
}: {
  term: PlanTerm;
  active: boolean;
  heavy: boolean;
  blocked: boolean;
  label: string;
  credits: number;
  unitCr: string;
  title: string;
  cssVars?: CSSProperties;
  onSelect: () => void;
}) {
  const { t } = useT();
  const { setNodeRef, isOver } = useDroppable({ id: term.id, disabled: active });
  const cellBase = "flex h-14 w-full flex-col items-center justify-center rounded-lg border text-xs sm:h-[4.5rem] sm:text-sm";
  const tone = heavy
    ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
    : active
      ? "planner-term-summary ring-2 ring-brand-600"
      : "border-slate-200 bg-slate-100 text-slate-900 hover:bg-slate-200/70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700";
  return (
    <div data-term-chip={term.id} className="relative" style={cssVars}>
      <button
        ref={setNodeRef}
        type="button"
        aria-pressed={active}
        onClick={onSelect}
        title={title}
        className={`${cellBase} ${tone} transition focus-visible:outline-2 focus-visible:outline-brand-focus ${
          isOver ? "ring-2 ring-brand-500" : ""
        }`}
      >
        <span className="font-semibold">{label}</span>
        <span className={`tabular-nums ${active || heavy ? "" : "text-slate-500 dark:text-slate-400"}`}>{credits} {unitCr}</span>
      </button>
      {blocked && (
        <span
          role="img"
          aria-label={t("pl.legendBlocked")}
          title={t("pl.legendBlocked")}
          className="absolute -right-1 -top-1 size-3 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900"
        />
      )}
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
  activeId,
  onSelect,
  header,
  blockedTermIds,
}: {
  terms: PlanTerm[];
  catalog: Record<string, PlannedModule>;
  lang: import("@/i18n").Lang;
  activeId: string | null;
  onSelect: (term: PlanTerm) => void;
  header: ReactNode;
  blockedTermIds: Set<string>;
}) {
  const { t } = useT();
  const plannerTermColor = useSettings((s) => s.plannerTermColor);
  const enrollmentYear = useSettings((s) => plannerEnrollmentYear(s.programCode, s.cohort));
  const hasUnresolvedSemester = terms.some(({ name, modules }) => modules.length && !plannerSemesterId(name, enrollmentYear));
  const groups = groupTermsByYear(terms, lang);
  const termNumber = (term: PlanTerm) => Number(/(?:Học kỳ|Semester)\s+(\d+)/.exec(formatPlannerTerm(term.name, lang))?.[1] ?? 0) || null;
  const rows = Math.max(3, ...groups.flatMap((group) => [group.terms.length, ...group.terms.map((term) => termNumber(term) ?? 0)]));
  /** Đặt mỗi kỳ vào đúng hàng theo số kỳ; kỳ không rõ số lấp vào hàng trống đầu tiên. */
  const slotsOf = (groupTerms: PlanTerm[]) => {
    const slots: (PlanTerm | undefined)[] = Array.from({ length: rows }, () => undefined);
    const loose: PlanTerm[] = [];
    for (const term of groupTerms) {
      const n = termNumber(term);
      if (n && !slots[n - 1]) slots[n - 1] = term;
      else loose.push(term);
    }
    for (const term of loose) {
      const free = slots.findIndex((slot) => !slot);
      if (free >= 0) slots[free] = term;
    }
    return slots;
  };
  const activeIndex = Math.max(0, groups.findIndex((group) => group.terms.some((term) => term.id === activeId)));
  const creditsOf = (term: PlanTerm) => term.modules.reduce((sum, code) => sum + (catalog[code]?.credits ?? 0), 0);
  const termUnit = lang === "en" ? "Sem" : "Kỳ";

  return (
    <div className="card space-y-4 p-4 sm:p-6">
      {header}
      {hasUnresolvedSemester && (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {t(enrollmentYear === null ? "pl.syncNeedCohort" : "pl.syncNeedSemester")}
        </p>
      )}
      {groups.length > 0 && (
        <div className="grid gap-x-2 sm:gap-x-3" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
          {groups.map((group, index) => {
            const yearCredits = group.terms.reduce((sum, term) => sum + creditsOf(term), 0);
            const first = index === 0;
            const last = index === groups.length - 1;
            const yearTitle = group.academic ? group.key.replace("-", "–")
              : group.studyYear !== null ? t("pl.planStudyYear", { n: group.studyYear }) : "—";
            return (
              <div key={group.key || `year-${index}`} data-year-column={group.key || undefined} className="flex min-w-0 flex-col gap-1.5 sm:gap-2">
                <div className="relative flex h-6 items-center justify-center" aria-hidden="true">
                  {!first && (
                    <span
                      className={`absolute top-1/2 h-1 -translate-y-1/2 rounded-full ${index <= activeIndex ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-600"}`}
                      style={{ left: "-0.375rem", right: "50%" }}
                    />
                  )}
                  {!last && (
                    <span
                      className={`absolute top-1/2 h-1 -translate-y-1/2 rounded-full ${index < activeIndex ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-600"}`}
                      style={{ left: "50%", right: "-0.375rem" }}
                    />
                  )}
                  <span className={`relative size-5 rounded-full sm:size-6 ${index <= activeIndex ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-600"}`} />
                </div>
                <p className="mt-1 truncate text-center text-[11px] font-semibold sm:text-sm" title={yearTitle}>{yearTitle}</p>
                <p className="mb-1 min-h-4 truncate text-center text-[11px] text-slate-500 sm:min-h-5 sm:text-sm dark:text-slate-400">
                  {group.academic ? t("pl.planStudyYear", { n: index + 1 }) : ""}
                </p>
                {slotsOf(group.terms).map((term, row) => {
                  const cellBase = "flex h-14 w-full flex-col items-center justify-center rounded-lg border text-xs sm:h-[4.5rem] sm:text-sm";
                  if (!term) {
                    return (
                      <div key={`empty-${row}`} aria-hidden="true"
                        className={`${cellBase} border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500`}>
                        <span className="font-medium">{termUnit} {row + 1}</span>
                        <span className="tabular-nums">0 {t("common.unitCr")}</span>
                      </div>
                    );
                  }
                  const cr = creditsOf(term);
                  const active = term.id === activeId;
                  const heavy = creditLoad(cr) === "high";
                  const termTitle = formatPlannerTerm(term.name, lang);
                  const termNo = /(?:Học kỳ|Semester)\s+(\d+)/.exec(termTitle)?.[1];
                  const termLabel = termNo ? `${termUnit} ${termNo}` : formatPlannerTermShort(term.name, lang).split(" · ")[0];
                  return (
                    <TermCell
                      key={term.id}
                      term={term}
                      active={active}
                      heavy={heavy}
                      blocked={blockedTermIds.has(term.id)}
                      label={termLabel}
                      credits={cr}
                      unitCr={t("common.unitCr")}
                      title={termTitle}
                      cssVars={heavy || !active ? undefined : plannerTermColorVariables(plannerTermColor) as CSSProperties}
                      onSelect={() => onSelect(term)}
                    />
                  );
                })}
                <p className="mt-0.5 text-center text-[11px] font-semibold tabular-nums sm:text-sm">
                  {t("pl.yearTotal", { n: yearCredits })}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Gom các học kỳ theo năm học (vd "2026-2027"); học kỳ không rõ năm vào một nhóm không nhãn. */
function groupTermsByYear(terms: PlanTerm[], lang: import("@/i18n").Lang) {
  const groups: { key: string; label: string; academic: boolean; studyYear: number | null; terms: PlanTerm[] }[] = [];
  for (const term of terms) {
    const m = /(\d{4})\s*-\s*(\d{4})/.exec(formatPlannerTerm(term.name, lang));
    // Tên tương đối kiểu "Năm 2 – HK1" (chưa gắn năm học) gom theo năm thứ mấy.
    const study = m ? null : /(?:năm|year)\s*(\d+)/i.exec(term.name);
    const key = m ? `${m[1]}-${m[2]}` : study ? `year-${study[1]}` : "";
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = {
        key,
        label: m ? translate(lang, "mod.card.yearOf", { year: key }) : "",
        academic: Boolean(m),
        studyYear: study ? Number(study[1]) : null,
        terms: [],
      };
      groups.push(group);
    }
    group.terms.push(term);
  }
  return groups;
}

const BOTTOM_NAV_HEIGHT = 56;
const BATCH_DIALOG_GAP = 8;
const VIEWPORT_MARGIN = 8;

interface BatchDialogPlacement {
  upward: boolean;
  maxHeight: number;
}

function measureBatchDialogPlacement(anchorEl: HTMLElement, dialogEl: HTMLElement): BatchDialogPlacement {
  const rect = anchorEl.getBoundingClientRect();
  const isPhone = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia(PHONE_QUERY).matches;
  const bottomInset = isPhone ? BOTTOM_NAV_HEIGHT : 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const spaceBelow = Math.max(0, Math.floor(viewportHeight - bottomInset - rect.bottom - BATCH_DIALOG_GAP - VIEWPORT_MARGIN));
  const spaceAbove = Math.max(0, Math.floor(rect.top - BATCH_DIALOG_GAP - VIEWPORT_MARGIN));
  const style = getComputedStyle(dialogEl);
  const borderY = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  const dialogHeight = dialogEl.scrollHeight + borderY;
  const upward = spaceBelow < dialogHeight && spaceAbove > spaceBelow;
  return { upward, maxHeight: upward ? spaceAbove : spaceBelow };
}

function useBatchDialogPlacement(
  anchorRef: RefObject<HTMLElement | null>,
  dialogRef: RefObject<HTMLElement | null>,
  open: boolean,
): BatchDialogPlacement | null {
  const [placement, setPlacement] = useState<BatchDialogPlacement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const anchorEl = anchorRef.current;
      const dialogEl = dialogRef.current;
      if (!anchorEl || !dialogEl) return;
      const next = measureBatchDialogPlacement(anchorEl, dialogEl);
      setPlacement((prev) => (prev && prev.upward === next.upward && prev.maxHeight === next.maxHeight ? prev : next));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef, dialogRef, open]);

  return open ? placement : null;
}

export default function PlannerPage() {
  const { t, lang } = useT();
  const mounted = useMounted();
  const p = usePlanner();
  const [target, setTarget] = useState("backlog");
  const [addError, setAddError] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const batchAnchorRef = useRef<HTMLDivElement | null>(null);
  const batchDialogRef = useRef<HTMLDivElement | null>(null);
  const batchPlacement = useBatchDialogPlacement(batchAnchorRef, batchDialogRef, batchOpen);
  /** Học kỳ đang mở bên trên ô "Dự định học"; chỉ một kỳ tại một thời điểm. */
  const [activeTermId, setActiveTermId] = useState<string | null>(null);
  const [draftYears, setDraftYears] = useState<PlannerAcademicYears | null>(null);
  const previewing = draftYears !== null;
  const yearPickerButton = useRef<HTMLButtonElement | null>(null);
  const cohortYear = useSettings((s) => plannerEnrollmentYear(s.programCode, s.cohort));
  const currentYear = cohortStartYear(latestEnrollmentCohort())!;
  const { inputs, scores, updateScore } = usePlannerScores();

  // Khi đã biết khóa (vd K23 nhập học 2023) mà chưa chọn năm học thủ công: tự đặt năm nhập học/tốt
  // nghiệp (chương trình 4 năm = nhập học + 3) để kế hoạch hiện đúng năm học hiện tại ngay từ đầu.
  useEffect(() => {
    if (p.academicYears === null && cohortYear !== null) {
      p.addAcademicYears({ admission: cohortYear, graduation: cohortYear + 3 });
    }
  }, [p.academicYears, cohortYear]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const sortedTerms = useMemo(() => sortPlannerTermsChronologically(p.terms), [p.terms]);
  const previousAdmission = p.academicYears?.admission ?? cohortYear;
  const roadmapTerms = useMemo(() => draftYears
    ? sortPlannerTermsChronologically(completePlannerYears(p.terms, draftYears, previousAdmission ?? draftYears.admission).terms)
    : sortedTerms, [draftYears, p.terms, previousAdmission, sortedTerms]);
  const targetTerm = sortedTerms.find((term) => term.id === target) ?? null;
  const destination = target === COMPLETED_WITHOUT_TERM ? target : targetTerm ? targetTerm.id : "backlog";
  const warnings = useMemo(() => prerequisiteWarnings({ ...p, terms: sortedTerms }), [p, sortedTerms]);
  const warnMap = useMemo(() => Object.fromEntries(warnings.map((w) => [w.code, w.missing])), [warnings]);
  const blockedTermIds = useMemo(() => new Set(warnings.map((w) => w.termId)), [warnings]);

  useEffect(() => {
    if (previewing) {
      document.getElementById("planner-roadmap")?.scrollIntoView?.({ block: "start" });
    } else if (yearPickerButton.current) {
      yearPickerButton.current.focus();
      yearPickerButton.current = null;
    }
  }, [previewing]);

  // Danh sách môn đang có trong kế hoạch (dự định học + các kỳ + đã học), dùng làm khóa để làm mới dữ liệu.
  const plannedCodesKey = useMemo(
    () => [...new Set([...p.backlog, ...p.terms.flatMap((term) => term.modules), ...p.completed])].sort().join(","),
    [p.backlog, p.terms, p.completed],
  );

  // Đồng bộ lại tín chỉ/tiên quyết/tên học phần từ nguồn thật (API) — tránh dữ liệu trong kế hoạch bị cũ
  // so với học phần thật (vd: tiên quyết mới được cập nhật sau khi môn đã được thêm vào kế hoạch).
  useEffect(() => {
    if (!plannedCodesKey) return;
    const codes = plannedCodesKey.split(",");
    let alive = true;
    (async () => {
      const results = await Promise.allSettled(codes.map((code) => api.module(code)));
      if (!alive) return;
      const fresh: PlannedModule[] = [];
      results.forEach((res, i) => {
        if (res.status !== "fulfilled" || !res.value.data) return;
        const d = res.value.data;
        fresh.push({
          code: codes[i],
          name: d.name,
          name_en: d.name_en ?? null,
          credits: d.credits ?? 0,
          prerequisites: d.prerequisites ?? [],
          equivalents: d.equivalents ?? [],
        });
      });
      if (fresh.length) usePlanner.getState().refreshCatalog(fresh);
    })();
    return () => {
      alive = false;
    };
  }, [plannedCodesKey]);

  if (!mounted) return <Loading page />;

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

  function currentContainerOf(code: string): string | null {
    if (p.backlog.includes(code)) return "backlog";
    const term = p.terms.find((t) => t.modules.includes(code));
    if (term) return term.id;
    return null;
  }

  /** Môn đã có trong kế hoạch: mở học kỳ chứa nó (nếu cần) rồi cuộn tới và nhấp nháy, thay vì thêm lại. */
  function focusExistingModule(code: string) {
    const term = p.terms.find((t) => t.modules.includes(code));
    if (term && term.id !== activeTermId) setActiveTermId(term.id);
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-planner-module="${code}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("flash-target");
      void el.offsetWidth;
      el.classList.add("flash-target");
      window.setTimeout(() => el.classList.remove("flash-target"), 2800);
    }, 60);
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const code = String(e.active.id);
    const overId = String(e.over.id);
    if (overId === "trash") {
      p.removeModule(code);
      track("planner_remove", { module_code: code });
      return;
    }
    // Thả lại đúng nơi đang chứa nó (không thay đổi vị trí): giữ nguyên thứ tự, không đẩy xuống cuối.
    if (currentContainerOf(code) === overId) return;
    p.move(code, overId);
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

  async function handleResetPlan() {
    const confirmed = await appConfirm(t("pl.confirmResetPlan"), {
      title: t("pl.confirmResetPlanTitle"),
      okLabel: t("pl.confirmResetPlanAction"),
      cancelLabel: t("common.cancel"),
      compact: true,
      danger: true,
    });
    if (confirmed) p.resetPlan();
  }

  const content = (
    <div className="space-y-4" inert={previewing}>
      <PageHeader title={t("pl.title")} actions={<ReportErrorsButton />} />

      <PlannerGpaSummary
        result={calculateGpa(gradeItems(allCodes))}
        total={total}
        completed={doneCredits}
      />

      <section className="space-y-3" aria-labelledby="planner-roadmap">
        <DndContext sensors={sensors} collisionDetection={plannerCollisionDetection} onDragEnd={onDragEnd}>
        <TermSummaryBar terms={roadmapTerms} catalog={p.catalog} lang={lang}
          activeId={activeTermId}
          blockedTermIds={blockedTermIds}
          onSelect={(term) => setActiveTermId((cur) => (cur === term.id ? null : term.id))}
          header={
            <div className="flex flex-nowrap items-center justify-between gap-2">
              <h2 id="planner-roadmap" className="min-w-0 flex-1 truncate scroll-mt-32 text-lg font-semibold md:scroll-mt-20">{t("pl.roadmapTitle")}</h2>
              <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
                {warnings.length > 0 && (
                  <span className="hidden shrink-0 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 sm:inline-block">
                    <span aria-hidden="true">⚠ </span>{t("pl.warnCount", { n: warnings.length })}
                  </span>
                )}
                <button type="button" className="grid size-9 place-items-center rounded-lg text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-focus dark:text-slate-200 dark:hover:bg-red-950/40 dark:hover:text-red-300 hover:text-red-600"
                  aria-label={t("pl.resetPlanAria")} title={t("pl.resetPlanAria")}
                  onClick={handleResetPlan}>
                  <RotateCcw className="size-5" aria-hidden="true" />
                </button>
                <button type="button" className="flex size-9 items-center justify-center gap-2 rounded-lg text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-focus dark:text-slate-200 dark:hover:bg-slate-800 desk:w-auto desk:px-3"
                  aria-haspopup="dialog" aria-label={t("pl.planYears")} title={t("pl.planYears")}
                  onClick={(event) => openYearPicker(event.currentTarget)}>
                  <CalendarDays className="size-5 shrink-0" aria-hidden="true" />
                  <span className="hidden desk:inline text-sm font-medium">{t("pl.planYears")}</span>
                </button>
              </div>
            </div>
          } />

        {allCodes.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1.5" title={t("pl.legendDone")}>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              {t("pl.legendDoneShort")}
            </span>
            <span className="flex items-center gap-1.5" title={t("pl.legendOk")}>
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              {t("pl.legendOkShort")}
            </span>
            <span className="flex items-center gap-1.5" title={t("pl.legendBlocked")}>
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              {t("pl.legendBlockedShort")}
            </span>
          </div>
        )}

        <TrashZone />
        <div className="flex flex-col gap-3">
            <div id="planner-backlog" className="order-2 min-w-0">
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
                contentClassName="grid flex-1 grid-cols-1 gap-2 md:grid-cols-3 desk:grid-cols-4"
              >
                <div className="space-y-2 md:col-span-3 desk:col-span-4">
                  {/* Thêm nhanh một môn: luôn rơi vào "Dự định học" (backlog). Muốn chọn học kỳ khác thì
                      dùng "Thêm nhiều mã học phần" bên dưới, nơi có ô chọn học kỳ đích. */}
                  <ModuleSearch
                    placeholder={t("pl.addModule")}
                    onPick={async (m) => {
                      setAddError(false);
                      try {
                        await addModuleToPlanner(m, destination);
                        const term = destination ? p.terms.find((item) => item.id === destination) : null;
                        const semId = term ? plannerSemesterId(term.name, cohortYear) : null;
                        track("planner_add", { module_code: m.code, semester_id: semId || undefined });
                      } catch {
                        setAddError(true);
                      }
                    }}
                    onPickAdded={(m) => focusExistingModule(m.code)}
                    addedCodes={allCodes}
                    inheritProgramProfile={false}
                  />
                  {addError && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{t("pl.addError")}</p>}
                  <div ref={batchAnchorRef} className="relative w-fit text-sm">
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
                          ref={batchDialogRef}
                          role="dialog"
                          aria-label={t("pl.batchAdd")}
                          style={batchPlacement ? { maxHeight: `${batchPlacement.maxHeight}px` } : undefined}
                          className={`absolute left-0 z-50 ${
                            batchPlacement?.upward ? "bottom-full mb-2" : "top-full mt-2"
                          } w-[min(48rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900`}
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
                          <SelectMenu
                            className="mt-2 w-full"
                            ariaLabel={t("pl.addToTerm")}
                            value={destination ?? ""}
                            onChange={setTarget}
                            options={[
                              { value: "backlog", label: t("pl.backlog") },
                              ...sortedTerms.map((term) => ({ value: term.id, label: formatPlannerTerm(term.name, lang) })),
                              { value: COMPLETED_WITHOUT_TERM, label: t("pl.completedWithoutTerm") },
                            ]}
                          />
                          <BatchModuleAdd
                            onAdd={(m) => {
                              placeModuleInPlanner(m, destination);
                              const term = destination ? p.terms.find((item) => item.id === destination) : null;
                              const semId = term ? plannerSemesterId(term.name, cohortYear) : null;
                              track("planner_add", { module_code: m.code, semester_id: semId || undefined });
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {p.backlog.length === 0 ? (
                  <p className="py-4 text-center text-xs italic text-slate-500 md:col-span-3 desk:col-span-4">{t("pl.backlogEmpty")}</p>
                ) : p.backlog.map((code) => (
                  <ModuleCard key={code} code={code} score={inputs[code] ?? ""} onScoreChange={updateScore} />
                ))}
              </Column>
            </div>
            {roadmapTerms.filter((term) => term.id === activeTermId).map((term) => {
              const cr = termCredits(p, term.id);
              const termTitle = formatPlannerTerm(term.name, lang);
              const termStats = formatPlannerTermStats(term.modules.length, cr, lang);
              const termGpa = calculateGpa(gradeItems(term.modules));

              return (
                <div key={term.id} id={`term-${term.id}`} className="order-1 min-w-0">
                  <Column
                    id={term.id}
                    title={
                      <div className="min-w-0">
                        <h3 className="truncate whitespace-nowrap text-sm font-semibold" title={termTitle}>
                          <span className="hidden whitespace-nowrap truncate sm:inline" title={termTitle}>{termTitle}</span>
                          <span className="sm:hidden" aria-hidden="true">{formatPlannerTermShort(term.name, lang)}</span>
                        </h3>
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
                    contentClassName="grid flex-1 grid-cols-1 gap-2 md:grid-cols-3 desk:grid-cols-4"
                  >
                    {term.modules.length === 0 ? (
                      <p className="py-6 text-center text-xs italic text-slate-500 md:col-span-3 desk:col-span-4">{t("pl.dropModule")}</p>
                    ) : term.modules.map((code) => (
                      <ModuleCard key={code} code={code} warn={warnMap[code]} score={inputs[code] ?? ""} onScoreChange={updateScore} />
                    ))}
                  </Column>
                </div>
              );
            })}
            {completedWithoutTerm.length > 0 && (
              <div className="order-3 min-w-0">
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
                contentClassName="grid flex-1 grid-cols-1 gap-2 md:grid-cols-3 desk:grid-cols-4"
              >
                {completedWithoutTerm.map((code) => (
                  <ModuleCard key={code} code={code} score={inputs[code] ?? ""} onScoreChange={updateScore} completedOnly />
                ))}
              </Column>
              </div>
            )}
          </div>
        </DndContext>
        {roadmapTerms.length === 0 && allCodes.length === 0 && (
          <p className="card p-5 text-center text-sm text-slate-500">{t("pl.emptyRoadmap")}</p>
        )}
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
