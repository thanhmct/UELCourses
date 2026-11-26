"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIconOnlyWhenCramped } from "@/lib/useIconOnlyWhenCramped";
import { applyMaxVisibleItems } from "@/lib/useMaxVisibleItems";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Download, Eye, EyeOff, RefreshCw, RotateCcw, Share2, SlidersHorizontal, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { emptySemester, latestEnrollmentCohort, scopeSemesters, useSemesters } from "@/lib/semesters";
import { useMounted } from "@/lib/useMounted";
import { useApi } from "@/lib/useApi";
import { isConnectionError } from "@/lib/dataSource";
import { PALETTE, useSettings, useTimetable } from "@/lib/store";
import { buildShareUrl, decodeTimetable, type SharedTimetable } from "@/lib/shareUrl";
import { conflictWeek, timetableConflicts } from "@/lib/conflicts";
import { appConfirm } from "@/lib/dialog";
import { SemesterPicker } from "@/components/SemesterPicker";
import { useProgramProfile } from "@/lib/myProgram";
import { hasVerifiedUndergraduateTrack } from "@/lib/programLookup";
import { allModules } from "@/lib/programs";
import { totalCredits } from "@/lib/credits";
import { buildIcs } from "@/lib/ics";
import { buildExportRows, buildTimetableCsv, buildTimetableXlsx } from "@/lib/timetableExport";
import type { ClassSection } from "@/lib/types";
import { parseSemesterId, seatsAvailable } from "@/lib/modules";
import { Empty, EnBadge, Loading, RequiredBadge } from "@/components/ui";
import { TimetableModuleSearch } from "@/components/TimetableModuleSearch";
import { TimetableGrid, type BlockViolation, type GridBlock, type GridClosure } from "@/components/TimetableGrid";
import { ProgramFilterBar } from "@/components/ProgramFilterBar";
import { formatDateVi } from "@/lib/dates";
import {
  getLessonTimes,
  expandLessonOccurrences,
  getUelWeekday,
  getModuleTotalHours,
  getTimetableOccurrences,
} from "@/lib/occurrences";
import {
  getDefaultSelectedWeek,
  getSemesterWeeks,
  resolveSelectedWeekOnSemesterChange,
} from "@/lib/semesterWeeks";
import { WebcalSyncModal } from "@/components/WebcalSyncModal";
import { useT, weekdayName } from "@/i18n";
import { creditsLine, moduleName } from "@/i18n/names";
import { finalAssessmentKind, getCachedFinalAssessmentKind, setCachedFinalAssessmentKind } from "./finalAssessment";
import { TimetableOptimizer } from "./TimetableOptimizer";
import { useTimetableView } from "./TimetableView";
import { track } from "@/lib/analytics";
import { formatHolidayTitle, holidayAppearanceFor, noClassDates } from "@/lib/holidays";
import { useAcademicHolidays } from "@/lib/useAcademicHolidays";
import { useTimetableHolidayAppearance } from "@/components/HolidayAppearance";

const weekButtonClass = `grid size-9 sm:size-10 place-items-center rounded-md border border-slate-200 bg-white text-center font-semibold text-slate-700
  transition-colors hover:border-brand-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600
  aria-pressed:border-brand-700 aria-pressed:bg-brand-700 aria-pressed:text-white dark:border-slate-700 dark:bg-slate-800
  dark:text-slate-200 dark:hover:border-brand-400 dark:aria-pressed:border-brand-400 dark:aria-pressed:bg-brand-700 dark:aria-pressed:text-white`;

function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function formatSectionSchedule(section: ClassSection, t: (key: string, vars?: Record<string, string | number>) => string): string {
  return (
    section.lessons
      .map((l) => {
        const { start, end } = getLessonTimes(l);
        const from = formatDateVi(l.date_start);
        const to = formatDateVi(l.date_end);
        const dates = from && to && from !== to ? `, ${from}–${to}` : "";
        return `${weekdayName(t, l.weekday)}, ${t("tt.scheduleTime", { s: l.start_period, e: l.end_period, start, end })}${dates}`;
      })
      .join("; ") || t("tt.noSchedule")
  );
}

type TimetableWorkspaceProps =
  | { view: "schedule" }
  | { view: "optimize"; onSaved: (message: string) => void };

/** Nút trong hàng tiện ích: lấp đầy ô lưới 1fr để 5 nút rộng bằng nhau. */
const ACTION_BTN = "btn-outline w-full justify-center whitespace-nowrap sm:w-auto";

export function TimetableWorkspace(props: TimetableWorkspaceProps) {
  const { view } = props;
  const { t, lang } = useT();
  const profile = useProgramProfile();
  const mounted = useMounted();
  const tt = useTimetable();
  const paletteOverrides = useSettings((s) => s.timetableColors);
  const settingsCohort = useSettings((s) => s.cohort);
  const holidayThemesEnabled = useSettings((s) => s.holidayAppearance);
  const actionsRef = useRef<HTMLDivElement>(null);
  const { iconOnly: actionsIconOnly, measured: actionsMeasured } = useIconOnlyWhenCramped(actionsRef);
  // Chưa đo xong (HTML từ server): ẩn chữ nút ở màn hình điện thoại bằng CSS để không chớp chữ đầy đủ.
  const actionLabelCls = actionsMeasured ? undefined : "max-sm:hidden";
  const palette = useMemo(() => PALETTE.map((color, index) => paletteOverrides[index] ?? color), [paletteOverrides]);
  const { data: scopedSemesters, availableSemesters, globalCurrent, currentYearSecondTerm, loading: semestersLoading } = useSemesters();
  const defaultCohort = latestEnrollmentCohort(globalCurrent);
  const hasSavedSecondTerm = !!currentYearSecondTerm &&
    (tt.semester === currentYearSecondTerm.id || !!tt.bySemester[currentYearSecondTerm.id]?.length);
  const activeSavedSemester = Object.hasOwn(tt.bySemester, tt.semester)
    ? availableSemesters?.find(({ id }) => id === tt.semester)
    : undefined;
  const semesters = useMemo(() => {
    const plannedIds = Object.keys(tt.plannerAssignments);
    if (!scopedSemesters && (semestersLoading || !plannedIds.length)) return scopedSemesters;
    const terms = scopedSemesters && !profile.primaryParsed ? scopeSemesters(scopedSemesters, defaultCohort) : scopedSemesters ?? [];
    const retained = [hasSavedSecondTerm ? currentYearSecondTerm : undefined, activeSavedSemester];
    const byId = new Map(terms.map((term) => [term.id, term]));
    for (const term of retained) if (term) byId.set(term.id, term);
    for (const id of plannedIds) {
      if (byId.has(id)) continue;
      const slot = parseSemesterId(id);
      if (slot) byId.set(id, availableSemesters?.find((term) => term.id === id) ?? emptySemester({ id, ...slot }));
    }
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [tt.plannerAssignments, scopedSemesters, semestersLoading, availableSemesters, currentYearSecondTerm, hasSavedSecondTerm, activeSavedSemester, profile.primaryParsed, defaultCohort]);

  const {
    trackMode, setTrackMode, showVietnameseModules, setShowVietnameseModules,
    showNames, setShowNames, selectedWeek, setSelectedWeek, userSelectedRef,
  } = useTimetableView();

  // Đồng bộ chế độ hiển thị khi hồ sơ CTĐT thay đổi
  const prevCodesRef = useRef({
    primary: profile.primaryCode,
    secondary: profile.secondaryCode,
  });

  useEffect(() => {
    const pChanged = prevCodesRef.current.primary !== profile.primaryCode;
    const sChanged = prevCodesRef.current.secondary !== profile.secondaryCode;
    if (pChanged || sChanged) {
      prevCodesRef.current = {
        primary: profile.primaryCode,
        secondary: profile.secondaryCode,
      };
      // Nếu bỏ ngành 2 hoặc không có ngành 2, đưa về Ngành 1
      if (!profile.hasSecondary && trackMode !== "primary") {
        setTrackMode("primary");
      }
      setShowVietnameseModules(false);
    }
  }, [profile.primaryCode, profile.secondaryCode, profile.hasSecondary, trackMode, setTrackMode, setShowVietnameseModules]);

  // Đảm bảo nếu không có ngành 2 thì luôn ở chế độ "primary"
  useEffect(() => {
    if (!profile.hasSecondary && trackMode !== "primary") {
      setTrackMode("primary");
    }
  }, [profile.hasSecondary, trackMode, setTrackMode]);

  const [loaded, setLoaded] = useState<{ sem: string; data: Record<string, ClassSection[]>; failed: Record<string, "offline" | "other"> }>({ sem: "", data: {}, failed: {} });
  const [classLoadAttempt, setClassLoadAttempt] = useState(0);
  const [pendingImport, setPendingImport] = useState<SharedTimetable | null>(null);
  const [toast, setToast] = useState("");
  const [showWebcal, setShowWebcal] = useState(false);
  // Danh sách lớp của từng môn thu gọn thành dropdown nổi (mặc định đóng trên cả điện thoại và desktop).
  const [classMenuOpen, setClassMenuOpen] = useState<Record<string, boolean>>({});
  const classMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [downOpen, setDownOpen] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [showViolationPopover, setShowViolationPopover] = useState(false);
  const prevSemesterRef = useRef<string>(tt.semester);
  const gridRef = useRef<HTMLDivElement>(null);

  const openClassCode = Object.keys(classMenuOpen).find((code) => classMenuOpen[code]);
  useEffect(() => {
    if (!openClassCode) return;
    const onDown = (event: MouseEvent) => {
      if (!classMenuRefs.current[openClassCode]?.contains(event.target as Node)) {
        setClassMenuOpen({});
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setClassMenuOpen({});
    };
    const onResize = () => {
      const fieldset = classMenuRefs.current[openClassCode]?.querySelector("fieldset");
      if (fieldset instanceof HTMLElement) applyMaxVisibleItems(fieldset, true);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [openClassCode]);

  // Cache/state for final assessment kind
  const [finalKinds, setFinalKinds] = useState<Record<string, string | null>>({});

  const primaryProgramme = useApi(
    () => profile.primaryProgramId ? api.program(profile.primaryProgramId) : Promise.resolve({ data: null, mock: false }),
    [profile.primaryProgramId],
  );
  const secondaryProgramme = useApi(
    () => profile.secondaryProgramId ? api.program(profile.secondaryProgramId) : Promise.resolve({ data: null, mock: false }),
    [profile.secondaryProgramId],
  );
  const primaryDetails = primaryProgramme.data?.program.program_id === profile.primaryProgramId ? primaryProgramme.data : null;
  const secondaryDetails = secondaryProgramme.data?.program.program_id === profile.secondaryProgramId ? secondaryProgramme.data : null;
  const primaryModules = useMemo(() => primaryDetails ? allModules(primaryDetails) : [], [primaryDetails]);
  const secondaryModules = useMemo(() => secondaryDetails ? allModules(secondaryDetails) : [], [secondaryDetails]);
  const requiredMap = useMemo(() => new Map(
    [...secondaryModules, ...primaryModules].map((module) => [module.code, module.required]),
  ), [primaryModules, secondaryModules]);


  const programLabels = useMemo(() => {
    const primaryCodes = new Set(primaryModules.map((module) => module.code));
    const secondaryCodes = new Set(secondaryModules.map((module) => module.code));
    const labels: Record<string, string> = {};
    const allCodes = new Set([...primaryCodes, ...secondaryCodes]);
    for (const code of allCodes) {
      const inP1 = primaryCodes.has(code);
      const inP2 = secondaryCodes.has(code);
      if (inP1 && inP2) {
        labels[code] = t("tt.labelBoth");
      } else if (inP1) {
        labels[code] = t("tt.labelPrimary");
      } else if (inP2) {
        labels[code] = t("tt.labelSecondary");
      }
    }
    return labels;
  }, [primaryModules, secondaryModules, t]);

  const semester = tt.semester;
  const entries = useMemo(() => tt.bySemester[semester] ?? [], [tt.bySemester, semester]);
  // Danh sách hiển thị trong hộp "Môn đã thêm": môn thêm gần nhất lên đầu, đẩy các môn cũ xuống dưới
  // (thay cho dòng báo "✓ đã thêm" riêng — xem TimetableModuleSearch.tsx).
  const entriesMostRecentFirst = useMemo(() => [...entries].reverse(), [entries]);
  const sections = useMemo(() => (loaded.sem === semester ? loaded.data : {}), [loaded, semester]);
  const classFailures = loaded.sem === semester ? loaded.failed : {};
  // Mã đã có ở các học kỳ KHÁC (tt.bySemester đồng bộ 2 chiều với Kế hoạch, xem reconcilePlannerTimetable trong lib/store.ts)
  const addedElsewhereMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [sem, list] of Object.entries(tt.bySemester)) {
      if (sem === semester) continue;
      for (const e of list) if (!map[e.code]) map[e.code] = sem;
    }
    return map;
  }, [tt.bySemester, semester]);
  const addedElsewhereCodes = useMemo(() => Object.keys(addedElsewhereMap), [addedElsewhereMap]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  // Determine active English track
  const searchPrimaryGraduate = trackMode !== "secondary" && profile.primaryParsed && profile.primaryParsed.degree !== "dai_hoc";
  const searchSecondaryGraduate = trackMode !== "primary" && profile.secondaryParsed && profile.secondaryParsed.degree !== "dai_hoc";
  const codeSearch = (searchPrimaryGraduate && !primaryModules.length) || (searchSecondaryGraduate && !secondaryModules.length)
    || (trackMode !== "secondary" && !primaryProgramme.loading && !primaryDetails && hasVerifiedUndergraduateTrack(profile.primaryProgramId))
    || (trackMode !== "primary" && !secondaryProgramme.loading && !secondaryDetails && hasVerifiedUndergraduateTrack(profile.secondaryProgramId));
  const isEnglishTrackActive = useMemo(() => {
    if (trackMode === "primary") return profile.isEnglishPrimary;
    if (trackMode === "secondary") return profile.isEnglishSecondary;
    return profile.isEnglishPrimary || profile.isEnglishSecondary;
  }, [trackMode, profile.isEnglishPrimary, profile.isEnglishSecondary]);

  // Determine active program IDs for search
  const activeProgramId = useMemo(() => {
    if (trackMode === "primary") return profile.primaryProgramId || undefined;
    if (trackMode === "secondary") return profile.secondaryProgramId || undefined;
    return undefined;
  }, [trackMode, profile.primaryProgramId, profile.secondaryProgramId]);

  const activeProgramIds = useMemo(() => {
    if (trackMode === "both") return profile.programIds;
    return undefined;
  }, [trackMode, profile.programIds]);

  // Default semester
  useEffect(() => {
    if (!mounted || !semesters?.length) return;
    if (!semester || !semesters.some((s) => s.id === semester)) {
      tt.setSemester((semesters.find((s) => s.is_current) ?? semesters[0]).id);
    }
  }, [mounted, semesters, semester, tt]);

  // Go to current semester helper
  const goToCurrentSemester = useCallback(() => {
    if (!semesters?.length) return;
    const nowIso = new Date().toISOString().slice(0, 10);
    const target =
      semesters.find((s) => s.is_current) ??
      semesters.find((s) => {
        const start = s.teaching_start || s.start_date;
        const end = s.teaching_end || s.end_date;
        return start && end && start <= nowIso && nowIso <= end;
      }) ??
      semesters[0];
    if (target) {
      tt.setSemester(target.id);
      gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [semesters, tt]);

  // Import from shared link
  useEffect(() => {
    if (!mounted || view !== "schedule") return;
    const shared = decodeTimetable(window.location.search);
    if (shared) setPendingImport(shared);
  }, [mounted, view]);

  // Load sections (and missing module info) for each entry
  const codesKey = entries.map((e) => e.code).join(",");
  useEffect(() => {
    if (!semester || !codesKey) return;
    let alive = true;
    const codes = codesKey.split(",");
    Promise.allSettled(codes.map(async (code) => [code, (await api.classes(code, semester)).data] as const)).then((results) => {
      if (!alive) return;
      setLoaded((prev) => ({
        sem: semester,
        data: {
          ...(prev.sem === semester ? prev.data : {}),
          ...Object.fromEntries(results.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])),
        },
        failed: Object.fromEntries(results.flatMap((result, index) => result.status === "rejected"
          ? [[codes[index], isConnectionError(result.reason) ? "offline" : "other"] as const]
          : [])),
      }));
    });
    codes
      .filter((c) => !useTimetable.getState().info[c])
      .forEach(async (c) => {
        try {
          const d = (await api.module(c)).data;
          if (d) useTimetable.getState().rememberInfo(d);
        } catch {
          // The timetable can use the course code while catalog details are unavailable.
        }
      });
    return () => {
      alive = false;
    };
  }, [semester, codesKey, classLoadAttempt]);

  // Load final assessment kind for entries from syllabus outline
  useEffect(() => {
    if (view !== "schedule" || !entries.length) return;
    let alive = true;
    entries.forEach(async (e) => {
      const cached = getCachedFinalAssessmentKind(e.code);
      if (cached !== undefined) {
        setFinalKinds((prev) => (prev[e.code] === cached ? prev : { ...prev, [e.code]: cached }));
        return;
      }
      try {
        const outline = await api.outline(e.code);
        if (!alive) return;
        const kind = finalAssessmentKind(outline?.assessments);
        setCachedFinalAssessmentKind(e.code, kind);
        setFinalKinds((prev) => ({ ...prev, [e.code]: kind }));
      } catch {
        if (!alive) return;
        setCachedFinalAssessmentKind(e.code, null);
        setFinalKinds((prev) => ({ ...prev, [e.code]: null }));
      }
    });
    return () => {
      alive = false;
    };
  }, [entries, view]);

  // Auto-select first class for entries that have none (or an invalid one),
  // and re-evaluate class selection if student's profile/track changed
  useEffect(() => {
    for (const e of entries) {
      const list = sections[e.code];
      if (!list?.length) continue;

      const currentSec = list.find((s) => s.class_code === e.class_code);
      const isCurrentValid = !!currentSec;

      // Re-evaluate if current class is invalid OR if student is in an English track
      // but current class is not English while an English class exists
      let needsReassign = !isCurrentValid;
      if (isCurrentValid && isEnglishTrackActive) {
        const matchesGroup = profile.primaryCode && currentSec.student_groups?.includes(profile.primaryCode);
        const hasE = currentSec.class_code.includes("E");
        if (!matchesGroup && !hasE) {
          const betterMatch = list.find(
            (s) =>
              (s.student_groups && profile.primaryCode && s.student_groups.includes(profile.primaryCode)) ||
              s.class_code.includes("E"),
          );
          if (betterMatch) needsReassign = true;
        }
      }

      if (needsReassign) {
        let chosen = list[0].class_code;
        if (isEnglishTrackActive) {
          const matchStudentClass = list.find(
            (s) =>
              (s.student_groups && profile.primaryCode && s.student_groups.includes(profile.primaryCode)) ||
              s.class_code.includes("E"),
          );
          if (matchStudentClass) chosen = matchStudentClass.class_code;
        } else if (profile.primaryCode) {
          const matchStudentClass = list.find(
            (s) => s.student_groups && s.student_groups.includes(profile.primaryCode),
          );
          if (matchStudentClass) chosen = matchStudentClass.class_code;
        }
        tt.setClass(e.code, chosen);
        track(e.class_code ? "timetable_swap_class" : "timetable_add", {
          module_code: e.code,
          class_code: chosen,
          semester_id: semester,
        });
      }
    }
  }, [entries, sections, tt, isEnglishTrackActive, profile.primaryCode, semester]);

  const selected = useMemo(
    () =>
      entries
        .filter((e) => !e.hidden && e.class_code)
        .map((e) => sections[e.code]?.find((s) => s.class_code === e.class_code))
        .filter((s): s is ClassSection => !!s),
    [entries, sections],
  );
  const colorOf = useCallback((code: string) => palette[(entries.find((e) => e.code === code)?.color ?? 0) % palette.length], [entries, palette]);
  const colors = useMemo(() => Object.fromEntries(entries.map((e) => [e.code, colorOf(e.code)])), [entries, colorOf]);

  const semName = semesters?.find((s) => s.id === semester);
  const semText = semName ? t("sem.display", { term: semName.term, year: semName.year }) : semester;

  const effectiveStart = semName?.teaching_start ?? semName?.start_date ?? undefined;
  const effectiveEnd = semName?.teaching_end ?? semName?.end_date ?? undefined;
  const academicYear = /^\d{4}-\d{4}/.exec(semester)?.[0];
  const primaryCohort = profile.degree === "dai_hoc" ? profile.primaryParsed?.cohort || settingsCohort || defaultCohort : undefined;
  const secondaryCohort = profile.secondaryParsed?.degree === "dai_hoc" ? profile.secondaryParsed.cohort : undefined;
  const calendarCohort = trackMode === "secondary" ? secondaryCohort : primaryCohort;
  const holidays = useAcademicHolidays(academicYear, calendarCohort, trackMode === "both" ? secondaryCohort : undefined);
  const closedDates = useMemo(
    () => academicYear ? noClassDates(holidays, `${academicYear.slice(0, 4)}-08-01`, `${academicYear.slice(5)}-07-31`) : new Set<string>(),
    [academicYear, holidays],
  );
  const occurrenceOptions = useMemo(() => ({
    fallbackStart: effectiveStart, fallbackEnd: effectiveEnd, noClassDates: closedDates,
  }), [closedDates, effectiveEnd, effectiveStart]);

  const allOccurrences = useMemo(
    () => getTimetableOccurrences(selected, occurrenceOptions),
    [selected, occurrenceOptions],
  );

  const weekWorkloads = useMemo(
    () => getSemesterWeeks(semName, allOccurrences),
    [semName, allOccurrences],
  );
  const warnings = useMemo(
    () => timetableConflicts(selected, weekWorkloads, effectiveStart, effectiveEnd),
    [selected, weekWorkloads, effectiveStart, effectiveEnd],
  );
  const conflicts = warnings.filter(({ kind }) => kind === "conflict");
  const adjViolations = warnings.filter(({ kind }) => kind === "adjacency");
  const conflictingCodes = new Set(conflicts
    .filter(({ weeks }) => selectedWeek === "all" || weeks?.includes(selectedWeek))
    .flatMap(({ a, b }) => [a.module_code, b.module_code]));
  const blockViolationsMap = useMemo(() => {
    const map = new Map<string, BlockViolation[]>();
    for (const warning of warnings) {
      const { a, b, kind, weeks } = warning;
      for (const [own, other] of [[a, b], [b, a]]) {
        const lesson = selected.find((section) => section.module_code === other.module_code &&
          section.class_code === other.class_code)?.lessons[other.lessonIndex];
        const key = own.module_code + "#" + own.lessonIndex;
        const list = map.get(key) ?? [];
        list.push({
          type: kind,
          title: t(kind === "conflict" ? "tt.clashWarning" : "tt.adjacencyWarning"),
          otherModuleCode: other.module_code,
          otherClassCode: other.class_code,
          weekday: lesson?.weekday ?? 2,
          periods: lesson ? t("tt.schedulePeriods", { s: lesson.start_period, e: lesson.end_period }) : "",
          weeks,
        });
        map.set(key, list);
      }
    }
    return map;
  }, [warnings, selected, t]);
  const maxWeekHours = Math.max(1, ...weekWorkloads.map((week) => week.totalHours));
  // Tổng giờ cả học kỳ cho ô "Tất cả" (làm tròn 1 chữ số thập phân để tránh sai số cộng số thực).
  const allWeeksHours = Math.round(weekWorkloads.reduce((sum, week) => sum + week.totalHours, 0) * 10) / 10;
  const activeWeek = weekWorkloads.find((week) => week.weekNumber === selectedWeek);
  const weekAppearance = holidayThemesEnabled && activeWeek && view === "schedule"
    ? holidayAppearanceFor(activeWeek.startIso, activeWeek.endIso, holidays)
    : undefined;
  useTimetableHolidayAppearance(weekAppearance);
  const closures = useMemo(() => {
    const byDay = new Map<number, GridClosure>();
    if (!activeWeek) return byDay;
    for (const holiday of holidays) {
      for (const date of noClassDates([holiday], activeWeek.startIso, activeWeek.endIso)) {
        const weekday = getUelWeekday(new Date(`${date}T00:00:00Z`));
        const closure = byDay.get(weekday);
        byDay.set(weekday, { date, titles: new Set(closure?.titles).add(formatHolidayTitle(holiday.title, lang)) });
      }
    }
    return byDay;
  }, [activeWeek, holidays, lang]);

  // Tự động cập nhật lựa chọn tuần khi đổi học kỳ hoặc chọn tuần mặc định
  useEffect(() => {
    if (!weekWorkloads.length) return;

    if (prevSemesterRef.current !== semester) {
      prevSemesterRef.current = semester;
      setSelectedWeek((prev) => resolveSelectedWeekOnSemesterChange(prev, weekWorkloads));
    } else if (!userSelectedRef.current) {
      const def = getDefaultSelectedWeek(weekWorkloads);
      setSelectedWeek(def);
    }
  }, [semester, weekWorkloads, setSelectedWeek, userSelectedRef]);

  // Thêm môn mới → cho người dùng thấy TOÀN BỘ lịch cả kỳ trước, rồi mới bấm vào tuần để xem chi tiết.
  // Đang xem một tuần mà môn vừa thêm không có buổi nào trong tuần đó → về "Tất cả các tuần"
  // (để không tưởng là thêm hỏng); có buổi trong tuần đang xem thì giữ nguyên.
  const prevEntryCodesRef = useRef<string[] | null>(null);
  useEffect(() => {
    const codes = entries.map((e) => e.code);
    const prev = prevEntryCodesRef.current;
    prevEntryCodesRef.current = codes;
    if (prev === null) return; // lần render đầu: không coi là "vừa thêm"
    const added = codes.filter((c) => !prev.includes(c));
    if (added.length === 0) return;
    if (prev.length === 0) {
      userSelectedRef.current = true; // đừng để mặc định "tuần hiện tại" ghi đè lại
      setSelectedWeek("all");
      return;
    }
    setSelectedWeek((cur) => {
      if (cur === "all") return cur;
      const wk = weekWorkloads.find((w) => w.weekNumber === cur);
      const hasInWeek = !!wk && wk.occurrences.some((o) => added.includes(o.module_code));
      return hasInWeek ? cur : "all";
    });
  }, [entries, weekWorkloads, setSelectedWeek, userSelectedRef]);

  const blocks: GridBlock[] = useMemo(() => {
    return selected.flatMap((s) => {
      const repeats = new Map<string, number>();
      return s.lessons.map((l, i) => {
        const conflictKey = `${s.module_code}#${i}`;
        const violations = blockViolationsMap.get(conflictKey) ?? [];
        // The API has no lesson ID. Use the lesson's own fields and disambiguate identical records.
        const identity = JSON.stringify([s.module_code, s.class_code, l.weekday, l.start_period, l.end_period,
          l.start_time, l.end_time, l.date_start, l.date_end, l.room, l.weeks]);
        const copy = repeats.get(identity) ?? 0;
        repeats.set(identity, copy + 1);
        return {
          key: `${identity}#${copy}`,
          code: s.module_code,
          name: tt.info[s.module_code] ? moduleName(tt.info[s.module_code], lang) : s.module_code,
          class_code: s.class_code,
          section: s,
          lesson: l,
          color: colorOf(s.module_code),
          conflict: violations.length > 0,
          violations,
        };
      }).filter(({ lesson }) => {
        if (!closedDates.size) return true;
        const sessions = expandLessonOccurrences(s, lesson, occurrenceOptions);
        return !sessions.length || sessions.some(({ date }) => !closedDates.has(date));
      });
    });
  }, [selected, tt.info, lang, colorOf, blockViolationsMap, closedDates, occurrenceOptions]);

  const activeBlocks: GridBlock[] = useMemo(() => {
    if (selectedWeek === "all") return blocks;
    // Dùng các buổi thực tế đã tính theo quy tắc lịch ngoại lệ.
    const out: GridBlock[] = [];
    for (const o of activeWeek?.occurrences ?? []) {
      const base = blocks.find((b) => b.lesson === o.lesson && b.class_code === o.class_code);
      if (!base) continue;
      const violations = base.violations?.filter(({ weeks }) => weeks?.includes(selectedWeek)) ?? [];
      out.push({ ...base, violations, conflict: violations.length > 0, key: `${base.key}@${o.date}`, occDate: o.date });
    }
    return out;
  }, [blocks, selectedWeek, activeWeek]);

  const creditItems = entries.map((e) => ({ credits: tt.info[e.code]?.credits ?? 0, hidden: e.hidden }));

  async function share() {
    track("share_link", { semester_id: semester });
    const url = buildShareUrl(window.location.origin, "/timetable", { semester, entries });
    try {
      await navigator.clipboard.writeText(url);
      flash(t("tt.copied"));
    } catch {
      flash(t("tt.copyFailed"));
    }
  }

  async function exportPng() {
    if (!gridRef.current) return;
    const { toPng } = await import("html-to-image");
    const dark = document.documentElement.classList.contains("dark");
    const url = await toPng(gridRef.current, { pixelRatio: 2, backgroundColor: dark ? "#0f172a" : "#ffffff" });
    download(`UELPATH-tkb-${semester}.png`, url);
  }

  function exportIcs() {
    if (!selected.length) return flash(t("tt.noClassesExport"));
    track("ics_export", { semester_id: semester });
    const names = Object.fromEntries(Object.values(tt.info).map((m) => [m.code, moduleName(m, lang)]));
    const ics = buildIcs(selected, {
      moduleNames: names,
      calendarName: `UELPATH ${semText}`,
      ...occurrenceOptions,
      semesterStart: effectiveStart,
      semesterEnd: effectiveEnd,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    download(`UELPATH-tkb-${semester}.ics`, url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function prepareExportRows() {
    const missingCodes = selected
      .map((s) => s.module_code)
      .filter((code) => !useTimetable.getState().info[code]?.faculty);
    if (missingCodes.length > 0) {
      await Promise.all(
        missingCodes.map(async (code) => {
          try {
            const res = await api.module(code);
            if (res.data) tt.rememberInfo(res.data);
          } catch {
            // ignore
          }
        }),
      );
    }
    return buildExportRows(selected, useTimetable.getState().info, lang, t);
  }

  async function exportCsv() {
    if (!selected.length) return flash(t("tt.noClassesExport"));
    track("timetable_export_csv", { semester_id: semester });
    const rows = await prepareExportRows();
    const csv = buildTimetableCsv(rows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    download(`UELPATH-tkb-${semester}.csv`, url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportXlsx() {
    if (!selected.length) return flash(t("tt.noClassesExport"));
    track("timetable_export_xlsx", { semester_id: semester });
    const rows = await prepareExportRows();
    const xlsx = buildTimetableXlsx(rows);
    const url = URL.createObjectURL(
      new Blob([xlsx as unknown as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    );
    download(`UELPATH-tkb-${semester}.xlsx`, url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function acceptImport() {
    if (!pendingImport) return;
    tt.replaceSemester(pendingImport.semester, pendingImport.entries);
    pendingImport.entries.forEach((e) => {
      if (e.class_code) {
        track("timetable_add", {
          module_code: e.code,
          class_code: e.class_code,
          semester_id: pendingImport.semester,
        });
      }
    });
    setPendingImport(null);
    window.history.replaceState(null, "", "/timetable");
    flash(t("tt.imported"));
  }

  const semIdx = semesters?.findIndex((s) => s.id === semester) ?? -1;
  const stepSem = (d: number) => {
    const n = semesters?.[semIdx + d];
    if (n) tt.setSemester(n.id);
  };

  const totalViolations = conflicts.length + adjViolations.length;
  const activeDraft = tt.activeDrafts[semester] || "Phương án 1";
  const drafts = tt.drafts[semester] ?? { [activeDraft]: entries };
  const draftLabel = (name: string) => name === "Phương án 1" ? t("tt.draftName", { n: 1 }) : name;
  const optimizerEntries = entries.filter((entry) => !entry.hidden);
  const optimizerFailures = optimizerEntries.map(({ code }) => classFailures[code]);
  const optimizerLoadError = optimizerFailures.includes("offline")
    ? t("api.connectionError")
    : optimizerFailures.includes("other") ? t("tt.optimize.loadError") : null;

  function saveOptimizedDraft(classes: Record<string, string>, asynchronous: string[]) {
    if (props.view !== "optimize") return;
    const baseName = t("tt.optimize.draftName");
    let name = baseName;
    for (let n = 2; Object.hasOwn(drafts, name); n++) name = `${baseName} ${n}`;
    tt.createDraft(semester, name, entries.map((entry) => {
      if (asynchronous.includes(entry.code)) return { ...entry, hidden: true };
      if (Object.hasOwn(classes, entry.code)) return { ...entry, class_code: classes[entry.code] };
      return entry;
    }));
    Object.entries(classes).forEach(([modCode, clsCode]) => {
      track("timetable_add", {
        module_code: modCode,
        class_code: clsCode,
        semester_id: semester,
      });
    });
    userSelectedRef.current = true;
    setSelectedWeek("all");
    props.onSaved(t("tt.optimize.saved", { name }));
  }

  if (!mounted) return <Loading page />;

  return (
    <div className="space-y-3">
      {/* semester switcher */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 transition hover:bg-brand-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-brand-900/50 dark:text-brand-200 dark:hover:bg-brand-800"
          onClick={() => stepSem(-1)}
          disabled={semIdx <= 0}
          aria-label={t("tt.prevSem")}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <SemesterPicker
          semesters={semesters ?? []}
          value={semester}
          onChange={(v) => tt.setSemester(v)}
          ariaLabel={t("tt.selectSem")}
        />
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 transition hover:bg-brand-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-brand-900/50 dark:text-brand-200 dark:hover:bg-brand-800"
          onClick={() => stepSem(1)}
          disabled={semIdx < 0 || semIdx >= (semesters?.length ?? 0) - 1}
          aria-label={t("tt.nextSem")}
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
        {view !== "optimize" && (
          <button
            type="button"
            className="btn-outline h-9 px-3 text-xs whitespace-nowrap"
            onClick={goToCurrentSemester}
            title={t("sem.goToCurrentTitle")}
          >
            {t("sem.goToCurrent")}
          </button>
        )}
      </div>

      {pendingImport && (
        <div className="card flex flex-wrap items-center justify-between gap-2 border-brand-300 bg-brand-50 dark:bg-brand-900/30">
          <p className="text-sm">{t("tt.importText", { n: pendingImport.entries.length, sem: pendingImport.semester })}</p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={acceptImport}>{t("tt.import")}</button>
            <button className="btn-ghost" onClick={() => { setPendingImport(null); window.history.replaceState(null, "", "/timetable"); }}>{t("tt.skip")}</button>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white shadow-lg md:bottom-6" role="status">{toast}</div>}

      {view === "optimize" && semester && (
        <div
          role="group"
          aria-label={t("tt.optimize.drafts")}
          className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 dark:border-brand-800 dark:bg-brand-950/30"
        >
          <SlidersHorizontal className="size-4 shrink-0 text-brand-ink" aria-hidden />
          {Object.keys(drafts).map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={name === activeDraft}
              onClick={() => { if (name !== activeDraft) tt.switchDraft(semester, name); }}
              className={`${name === activeDraft ? "btn-primary border border-transparent" : "btn-outline"} min-h-9 min-w-0 max-w-full px-3 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus`}
            >
              {name === activeDraft && <Check className="size-4 shrink-0" aria-hidden />}
              <span className="min-w-0 wrap-anywhere">{draftLabel(name)}</span>
            </button>
          ))}
          <span className="sr-only" role="status">{t("tt.optimize.activeDraft", { name: draftLabel(activeDraft) })}</span>
        </div>
      )}

      {view === "optimize" ? (
          <TimetableOptimizer
            key={JSON.stringify([
              semester, activeDraft, isEnglishTrackActive, profile.primaryCode, [...closedDates],
              optimizerEntries.map(({ code, class_code }) => [code, class_code]),
            ])}
            courses={optimizerEntries.map(({ code, class_code }) => {
              const list = sections[code] ?? [];
              const englishChoices = isEnglishTrackActive ? list.filter((section) =>
                section.class_code.includes("E") || (profile.primaryCode && section.student_groups?.includes(profile.primaryCode))) : [];
              return {
                code,
                name: tt.info[code] ? moduleName(tt.info[code], lang) : code,
                currentClass: class_code,
                sections: englishChoices.length ? englishChoices : list,
              };
            })}
            loading={semestersLoading || optimizerEntries.some(({ code }) => !Object.hasOwn(sections, code))}
            loadError={optimizerLoadError}
            onRetry={() => {
              setLoaded((prev) => ({ ...prev, failed: {} }));
              setClassLoadAttempt((attempt) => attempt + 1);
            }}
            semesterStart={effectiveStart}
            semesterEnd={effectiveEnd}
            noClassDates={closedDates}
            onSave={saveOptimizedDraft}
          />
      ) : (
      <div className="space-y-3">
      {/* grid + toolbar */}
      <section className="min-w-0 space-y-2" aria-label={t("tt.title")}>
        <TimetableGrid
          ref={gridRef}
          blocks={activeBlocks}
          semesterBlocks={blocks}
          alternatives={sections}
          colors={colors}
          closures={closures}
          showNames={showNames}
          onChangeClass={(code, cls) => {
            tt.setClass(code, cls);
            track("timetable_swap_class", { module_code: code, class_code: cls, semester_id: semester });
            flash(t("tt.changed", { code, cls }));
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="contents">
            {totalViolations > 0 && (
              <div className="relative inline-flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    userSelectedRef.current = true;
                    setSelectedWeek(conflictWeek(conflicts.length ? conflicts : adjViolations, weekWorkloads));
                    setShowViolationPopover(false);
                    gridRef.current?.scrollIntoView?.({ block: "nearest" });
                  }}
                  onMouseEnter={() => setShowViolationPopover(true)}
                  onMouseLeave={() => setShowViolationPopover(false)}
                  onFocus={() => setShowViolationPopover(true)}
                  onBlur={() => setShowViolationPopover(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setShowViolationPopover(false);
                  }}
                  className="chip flex items-center gap-1 border border-rose-300 bg-rose-100 font-bold text-rose-800 transition hover:bg-rose-200 dark:border-rose-700 dark:bg-rose-950/70 dark:text-rose-200 cursor-pointer"
                  aria-label={t("tt.violationChipAria", { n: totalViolations })}
                  aria-expanded={showViolationPopover}
                >
                  <span aria-hidden="true">⚠</span>
                  <span>{totalViolations}</span>
                </button>
                {showViolationPopover && (
                  <div
                    role="tooltip"
                    className="absolute left-0 top-full mt-1.5 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-slate-700 bg-slate-900/95 p-3 text-xs text-white shadow-2xl backdrop-blur ring-1 ring-white/10 dark:bg-slate-800/95"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-2 flex items-center justify-between border-b border-slate-700 pb-1 font-bold text-rose-400">
                      <span>{t("tt.violationsPopoverTitle", { n: totalViolations })}</span>
                      <span className="text-[10px] text-slate-400 font-normal">{t("common.escClose")}</span>
                    </div>
                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {conflicts.map((c, i) => {
                        const secA = selected.find((s) => s.module_code === c.a.module_code && s.class_code === c.a.class_code);
                        const lA = secA?.lessons[c.a.lessonIndex];
                        return (
                          <div key={`c-${i}`} className="border-b border-slate-800 pb-1.5 last:border-b-0">
                            <div className="font-semibold text-rose-300">⚠ {t("tt.clashWarning")}</div>
                            <div className="text-slate-200">
                              {c.a.module_code} ({c.a.class_code}) ↔ {c.b.module_code} ({c.b.class_code})
                            </div>
                            {lA && (
                              <div className="text-[11px] text-slate-400">
                                {weekdayName(t, lA.weekday)}, {t("tt.schedulePeriods", { s: lA.start_period, e: lA.end_period })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {adjViolations.map((c, i) => {
                        const secA = selected.find((s) => s.module_code === c.a.module_code && s.class_code === c.a.class_code);
                        const secB = selected.find((s) => s.module_code === c.b.module_code && s.class_code === c.b.class_code);
                        const lA = secA?.lessons[c.a.lessonIndex];
                        const lB = secB?.lessons[c.b.lessonIndex];
                        const boundary =
                          lA && lB && ((lA.end_period === 6 && lB.start_period === 7) || (lB.end_period === 6 && lA.start_period === 7))
                            ? "6 | 7"
                            : "12 | 13";
                        return (
                          <div key={`adj-${i}`} className="border-b border-slate-800 pb-1.5 last:border-b-0">
                            <div className="font-semibold text-amber-300">
                              ⚠ {t("tt.adjacencyTitle", { boundary })}
                            </div>
                            <div className="text-slate-200">
                              {c.a.module_code} ({c.a.class_code}) ↔ {c.b.module_code} ({c.b.class_code})
                            </div>
                            {lA && (
                              <div className="text-[11px] text-slate-400">
                                {weekdayName(t, lA.weekday)}
                              </div>
                            )}
                            <div className="mt-0.5 text-[11px] text-amber-200/80">
                              {t("tt.adjacencyRule")}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Một hàng, 5 nút rộng bằng nhau (cột 1fr). Thứ tự: Ẩn/hiện tên môn → Đặt lại → Chia sẻ → Tải xuống → Đồng bộ.
              Không đủ một dòng thì chỉ hiện icon và giãn kín dòng. */}
          <div ref={actionsRef}
            className={`grid grid-flow-col auto-cols-fr gap-2 sm:contents ${actionsIconOnly ? "grow" : actionsMeasured ? "ml-auto" : "ml-auto max-sm:ml-0 max-sm:grow"}`}>
            {/* Máy tính (sm trở lên): hàng nút "tan" vào hàng cha; "Ẩn tên môn" luôn ở ngoài cùng bên trái, bốn nút còn lại dồn sang phải. */}
            <button className={`${ACTION_BTN} sm:order-first`} onClick={() => setShowNames((v) => !v)} aria-pressed={showNames}
              aria-label={actionsIconOnly ? (showNames ? t("tt.hideNames") : t("tt.showNames")) : undefined}
              title={actionsIconOnly ? (showNames ? t("tt.hideNames") : t("tt.showNames")) : undefined}>
              {showNames ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              {!actionsIconOnly && <span className={actionLabelCls}>{showNames ? t("tt.hideNames") : t("tt.showNames")}</span>}
            </button>
            <button
              className={`${ACTION_BTN} text-red-600 sm:ml-auto`}
              onClick={async () => {
                if (entries.length && (await appConfirm(t("tt.confirmReset"), { danger: true, okLabel: t("tt.reset") }))) tt.replaceSemester(semester, []);
              }}
              disabled={!entries.length}
              aria-label={actionsIconOnly ? t("tt.reset") : undefined} title={actionsIconOnly ? t("tt.reset") : undefined}
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> {!actionsIconOnly && <span className={actionLabelCls}>{t("tt.reset")}</span>}
            </button>
            <button className={ACTION_BTN} onClick={share}
              aria-label={actionsIconOnly ? t("tt.share") : undefined} title={actionsIconOnly ? t("tt.share") : undefined}>
              <Share2 className="h-4 w-4" aria-hidden /> {!actionsIconOnly && <span className={actionLabelCls}>{t("tt.share")}</span>}
            </button>
            <div className="relative">
              <button className={ACTION_BTN} onClick={() => setDownOpen((v) => !v)} aria-haspopup="menu" aria-expanded={downOpen}
                aria-label={actionsIconOnly ? t("tt.download") : undefined} title={actionsIconOnly ? t("tt.download") : undefined}>
                <Download className="h-4 w-4" aria-hidden />
                {!actionsIconOnly && <span className={`inline-flex items-center gap-1 ${actionLabelCls ?? ""}`}>{t("tt.download")} <ChevronDown className="h-3.5 w-3.5" aria-hidden /></span>}
              </button>
              {downOpen && (
                <div ref={(el) => { if (el) applyMaxVisibleItems(el, true); }}
                  className="absolute right-0 z-20 mt-1 w-44 overflow-y-auto whitespace-nowrap rounded-md border border-slate-200 bg-white py-1 text-sm shadow-md dark:border-slate-700 dark:bg-slate-900" role="menu">
                  <button role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setDownOpen(false); exportPng(); }}>{t("tt.png")}</button>
                  <button role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setDownOpen(false); exportIcs(); }}>{t("tt.ics")}</button>
                  <button role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setDownOpen(false); exportXlsx(); }}>{t("tt.xlsx")}</button>
                  <button role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setDownOpen(false); exportCsv(); }}>{t("tt.csv")}</button>
                </div>
              )}
            </div>
            <button className={ACTION_BTN} onClick={() => setShowWebcal(true)}
              aria-label={actionsIconOnly ? t("tt.sync") : undefined} title={actionsIconOnly ? t("tt.sync") : undefined}>
              <RefreshCw className="h-4 w-4" aria-hidden /> {!actionsIconOnly && <span className={actionLabelCls}>{t("tt.sync")}</span>}
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,23%)]">
        {/* module list */}
        <div className="card min-w-0 space-y-3">
          <div className="space-y-2">
            <ProgramFilterBar
              showCard={false}
              trackControl={
                profile.hasSecondary && profile.secondaryProgramId
                  ? {
                      current: trackMode,
                      onChange: (mode) => {
                        if (mode === "primary" || mode === "secondary" || mode === "both") setTrackMode(mode);
                      },
                      options: [
                        { value: "primary", label: t("tt.trackPrimary") },
                        { value: "secondary", label: t("tt.trackSecondary") },
                        { value: "both", label: t("tt.trackBoth") },
                      ],
                    }
                  : undefined
              }
            />

            <p className="text-sm">
              {t("tt.total")} <strong>{t("tt.totalCredits", { n: totalCredits(creditItems, false) })}</strong>
              {entries.some((e) => e.hidden) && <span className="text-slate-500"> / {totalCredits(creditItems)} {t("tt.hiddenIncluded")}</span>}
            </p>
            <div className="space-y-2 rounded-md bg-slate-50 p-2 dark:bg-slate-900/60" role="group" aria-label={t("tt.filterByWeek")}>
              <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <p className="text-xs font-bold text-brand-700 dark:text-brand-300">{t("tt.weeklyHours")}</p>
                <div
                  className={`${activeWeek ? "" : "invisible"} ml-auto flex min-h-7 w-40 items-center justify-center whitespace-nowrap rounded-md border border-brand-200 bg-white px-2 text-xs font-medium tabular-nums text-brand-800 dark:border-brand-800 dark:bg-slate-900 dark:text-brand-200`}
                >
                  {activeWeek && (
                    <span>
                      <time dateTime={activeWeek.startIso}>{formatDateVi(activeWeek.startIso)}</time>
                      {" – "}
                      <time dateTime={activeWeek.endIso}>{formatDateVi(activeWeek.endIso)}</time>
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] justify-items-center gap-x-1 gap-y-2 sm:flex sm:flex-wrap sm:justify-center sm:items-end">
                {/* "Tất cả" cùng cấu trúc với ô tuần (số giờ ở trên, nút ở dưới) để thẳng hàng; số giờ = tổng mọi tuần. */}
                <div className="grid justify-items-center gap-0.5">
                  <span className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200" aria-hidden="true">{allWeeksHours}</span>
                  <button
                    type="button"
                    aria-pressed={selectedWeek === "all"}
                    title={`${t("tt.allWeeks")} · ${allWeeksHours}`}
                    className={`${weekButtonClass} px-0.5 text-[10px] leading-tight`}
                    onClick={() => {
                      userSelectedRef.current = true;
                      setSelectedWeek("all");
                    }}
                  >
                    {t("tt.allWeeks")}
                  </button>
                </div>
                {weekWorkloads.map((week) => {
                  const isSelected = selectedWeek === week.weekNumber;
                  const label = t("tt.weekButtonLabel", {
                    week: week.weekNumber,
                    start: formatDateVi(week.startIso),
                    end: formatDateVi(week.endIso),
                    hours: week.totalHours,
                  });

                  return (
                    <div key={week.weekNumber} className="grid justify-items-center gap-0.5">
                      <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300" aria-hidden="true">{week.totalHours}</span>
                      <button
                        type="button"
                        aria-label={label}
                        title={label}
                        aria-current={week.isCurrent ? "date" : undefined}
                        aria-pressed={isSelected}
                        className={`${weekButtonClass} group relative overflow-hidden text-sm aria-[current=date]:border-brand-500`}
                        onClick={() => {
                          userSelectedRef.current = true;
                          setSelectedWeek(isSelected ? "all" : week.weekNumber);
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 bottom-0 bg-brand-100 group-aria-pressed:bg-brand-600 dark:bg-brand-900/70 dark:group-aria-pressed:bg-brand-600"
                          style={{ height: `${(week.totalHours / maxWeekHours) * 100}%` }}
                        />
                        <span className="relative">{week.weekNumber}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <TimetableModuleSearch
              onPick={(m) => {
                tt.addModule(m);
                track("timetable_add", { module_code: m.code, semester_id: semester || undefined });
              }}
              exclude={entries.map((e) => e.code)}
              addedCodes={addedElsewhereCodes}
              addedInSemester={addedElsewhereMap}
              programId={codeSearch ? undefined : activeProgramId}
              programIds={codeSearch ? undefined : activeProgramIds}
              degree={searchPrimaryGraduate || searchSecondaryGraduate ? "all" : undefined}
              semester={semester}
              isEnglishTrack={!codeSearch && isEnglishTrackActive}
              showVietnamese={showVietnameseModules}
              programLabels={trackMode === "both" ? programLabels : {}}
              programRequiredMap={requiredMap}
            />
            {codeSearch && !primaryProgramme.loading && !secondaryProgramme.loading && (
              <p className="text-xs text-slate-600 dark:text-slate-400">{t("profile.lookupByModuleHelp")}</p>
            )}


            {/* Toggle: Hiện cả học phần hệ tiếng Việt khi mã lớp có đuôi E */}
            {isEnglishTrackActive && !codeSearch && (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 select-none cursor-pointer dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={showVietnameseModules}
                    onChange={(e) => setShowVietnameseModules(e.target.checked)}
                    className="rounded border-slate-300 text-brand-ink focus:ring-brand-focus"
                  />
                  <span>{t("tt.showVietnamese")}</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  {showVietnameseModules ? t("tt.showingVietnamese") : t("tt.prioritisingEnglish")}
                </span>
              </div>
            )}
          </div>

          {entries.length === 0 ? (
            <Empty>{t("tt.emptyList")}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {entriesMostRecentFirst.map((e) => {
                const info = tt.info[e.code];
                const list = sections[e.code];
                const finalKind = finalKinds[e.code];
                const progLabel = programLabels[e.code];
                const currentSec = list?.find((s) => s.class_code === e.class_code);
                const modTotalHours = currentSec ? getModuleTotalHours(currentSec, occurrenceOptions) : 0;
                const menuOpen = !!classMenuOpen[e.code];
                const pickerOpen = pickerFor === e.code;

                return (
                  <li
                    key={e.code}
                    className={`space-y-1.5 px-2 py-2 ${menuOpen ? "relative z-30" : pickerOpen ? "relative z-20" : ""} ${conflictingCodes.has(e.code) ? "rounded-md bg-rose-50 ring-1 ring-inset ring-rose-400 dark:bg-rose-950/60 dark:ring-rose-600" : ""} ${e.hidden && !menuOpen && !pickerOpen ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="relative">
                        <button
                          className="mt-0.5 h-5 w-5 shrink-0 rounded"
                          style={{ backgroundColor: colorOf(e.code) }}
                          onClick={() => setPickerFor(pickerFor === e.code ? null : e.code)}
                          aria-label={t("tt.colorOf", { code: e.code })}
                          aria-expanded={pickerFor === e.code}
                        />
                        {pickerFor === e.code && (
                          <div className="absolute left-0 top-7 z-20 flex w-40 flex-wrap gap-1.5 rounded-md border border-slate-200 bg-white p-2 shadow-md dark:border-slate-700 dark:bg-slate-900" role="radiogroup" aria-label={t("tt.colorLabel")}>
                            {palette.map((c, i) => (
                              <button
                                key={c}
                                role="radio"
                                aria-checked={e.color === i}
                                aria-label={t("tt.colorN", { n: i + 1 })}
                                onClick={() => { tt.setColor(e.code, i); setPickerFor(null); }}
                                className={`h-5 w-5 rounded ${e.color === i ? "ring-2 ring-slate-900 ring-offset-1 dark:ring-white" : ""}`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className={`min-w-0 flex-1 ${e.hidden && (menuOpen || pickerOpen) ? "opacity-60" : ""}`}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link href={`/modules/${encodeURIComponent(e.code)}`} className="truncate text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                            <span className="font-mono">{e.code}</span> {info ? moduleName(info, lang) : "…"}
                          </Link>
                          <RequiredBadge required={requiredMap.get(e.code)} lang={lang} />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span>
                            {creditsLine({ credits: info?.credits, finalAssessment: finalKind }, lang)}
                          </span>
                          {modTotalHours > 0 && (
                            <span
                              className="font-medium text-slate-600 dark:text-slate-300"
                              title={t("tt.moduleTotalHoursTooltip", { cls: e.class_code ?? "" })}
                            >
                              · {t("tt.moduleTotalHours", { n: modTotalHours })}
                            </span>
                          )}
                          {(info as { is_english?: boolean } | undefined)?.is_english ? <EnBadge /> : null}
                          {trackMode === "both" && progLabel && (
                            <span className="chip bg-sky-100 font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                              {progLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        className="btn-ghost px-2 py-1"
                        onClick={() => tt.toggleHidden(e.code)}
                        aria-pressed={e.hidden}
                        aria-label={e.hidden ? t("tt.show", { code: e.code }) : t("tt.hide", { code: e.code })}
                        title={e.hidden ? t("tt.showTitle") : t("tt.hideTitle")}
                      >
                        {e.hidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                      </button>
                      <button
                        className="btn-ghost px-2 py-1 text-red-600"
                        onClick={() => {
                          tt.removeModule(e.code);
                          track("timetable_remove", { module_code: e.code, semester_id: semester || undefined });
                        }}
                        aria-label={t("tt.remove", { code: e.code })}
                        title={t("tt.removeTitle")}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    {classFailures[e.code] && list === undefined ? (
                      <p className="text-xs text-rose-700 dark:text-rose-300">
                        {t(classFailures[e.code] === "offline" ? "api.connectionError" : "tt.optimize.loadError")}
                      </p>
                    ) : list === undefined ? (
                      <Loading compact />
                    ) : list.length === 0 ? (
                      <p className="text-xs text-amber-600">{t("tt.noOpenClasses")}</p>
                    ) : (
                      <div
                        ref={(el) => { classMenuRefs.current[e.code] = el; }}
                        className="relative min-w-0"
                      >
                        {(() => {
                          const current = list.find((s) => s.class_code === (e.class_code ?? ""));
                          const currentText = current
                            ? `${current.class_code}${current.lecturer ? ` · ${t("tt.scheduleLecturer", { name: current.lecturer })}` : ""}`
                            : "—";
                          return (
                            <button
                              type="button"
                              aria-expanded={menuOpen}
                              aria-label={t("tt.chooseClass", { code: e.code })}
                              onClick={() => setClassMenuOpen(menuOpen ? {} : { [e.code]: true })}
                              className={`flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-2 text-left text-xs font-semibold text-slate-900 transition hover:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${e.hidden && (menuOpen || pickerOpen) ? "opacity-60" : ""}`}
                            >
                              <span className="min-w-0 break-words">{currentText}</span>
                              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${menuOpen ? "rotate-180" : ""}`} aria-hidden />
                            </button>
                          );
                        })()}
                        <fieldset
                          ref={(el) => { if (el) applyMaxVisibleItems(el, menuOpen); }}
                          className={`min-w-0 gap-1.5 ${menuOpen
                            ? "absolute inset-x-0 top-full z-30 mt-1 grid max-h-[60vh] md:max-h-80 overflow-y-auto overscroll-contain rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                            : "hidden"}`}
                          aria-label={t("tt.chooseClass", { code: e.code })}
                        >
                          {list.map((s) => {
                            const seats = seatsAvailable(s);
                            const checked = (e.class_code ?? "") === s.class_code;
                            // Mỗi buổi học (phân cách bằng "; ") nằm trong một box riêng để nội dung xuống dòng đầy đủ.
                            const sessions = formatSectionSchedule(s, t).split("; ").map((x) => x.trim()).filter(Boolean);
                            return (
                              <label
                                key={s.class_code}
                                className={`block min-w-0 cursor-pointer rounded-md border px-2.5 py-2 text-xs leading-relaxed transition focus-within:outline-2 focus-within:outline-brand-focus ${
                                  checked
                                    ? "border-brand-600 bg-brand-50 text-slate-900 dark:bg-slate-800 dark:text-white"
                                    : "border-slate-300 bg-white text-slate-700 hover:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`class-${e.code}`}
                                  value={s.class_code}
                                  checked={checked}
                                  onChange={() => {
                                    tt.setClass(e.code, s.class_code);
                                    setClassMenuOpen({});
                                    track("timetable_swap_class", { module_code: e.code, class_code: s.class_code, semester_id: semester || undefined });
                                  }}
                                  className="sr-only"
                                />
                                <span className="block break-words font-semibold">
                                  {s.class_code}
                                  {s.lecturer && ` · ${t("tt.scheduleLecturer", { name: s.lecturer })}`}
                                  {seats !== null ? ` (${seats === 0 ? t("tt.full") : t("tt.seatsLeft", { n: seats ?? 0 })})` : ""}
                                </span>
                                {sessions.map((session, i) => (
                                  <span key={i} className="mt-1 block break-words rounded bg-white/70 px-1.5 py-0.5 dark:bg-slate-950/40">
                                    {session}
                                  </span>
                                ))}
                              </label>
                            );
                          })}
                        </fieldset>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <TimetableDrafts key={semester} semester={semester} flash={flash} />
      </div>
      </div>
      )}

      <WebcalSyncModal
        open={showWebcal}
        onClose={() => setShowWebcal(false)}
        sharedData={{ semester, entries }}
        semName={semText}
      />
    </div>
  );
}

function TimetableDrafts({ semester, flash }: {
  semester: string;
  flash: (message: string) => void;
}) {
  const { t } = useT();
  const tt = useTimetable();
  const activeDraft = tt.activeDrafts[semester] || "Phương án 1";
  const draftNames = Object.keys(tt.drafts[semester] ?? { [activeDraft]: [] });
  const draftLabel = (name: string) => name === "Phương án 1" ? t("tt.draftName", { n: 1 }) : name;
  let suggestedDraftNumber = draftNames.length + 1;
  while (draftNames.some((name) => draftLabel(name) === t("tt.draftName", { n: suggestedDraftNumber }))) {
    suggestedDraftNumber += 1;
  }
  const suggestedDraftName = t("tt.draftName", { n: suggestedDraftNumber });
  const [editing, setEditing] = useState<{ original: string | null; value: string } | null>(null);
  const [nameTaken, setNameTaken] = useState(false);
  const startEditing = (original: string | null) => {
    setNameTaken(false);
    setEditing({ original, value: original ? draftLabel(original) : "" });
  };
  const duplicate = () => {
    setEditing(null);
    const base = t("tt.draftCopy", { name: draftLabel(activeDraft) });
    let name = base;
    for (let n = 2; draftNames.some((draft) => draftLabel(draft) === name); n += 1) {
      name = `${base} ${n}`;
    }
    tt.createDraft(semester, name, true);
    flash(t("tt.duplicated", { name }));
  };
  const saveDraftName = (nameInput: string) => {
    if (!editing) return;
    const { original } = editing;
    const name = nameInput.trim();
    if (name && (!original || name !== draftLabel(original))) {
      if (draftNames.some((draft) => draft === name || draftLabel(draft) === name)) {
        setNameTaken(true);
        return;
      }
      if (original) tt.renameDraft(semester, original, name);
      else tt.createDraft(semester, name);
    }
    setEditing(null);
  };

  const editor = editing && (
    <form
      className="flex min-w-0 max-w-full items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        saveDraftName(editing.value);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !editing.value.trim()) setEditing(null);
      }}
    >
      <div className="min-w-0">
        <div className="relative">
          <input
          className="input w-44 max-w-full py-2 pl-3 pr-9"
          aria-label={t("tt.editDraftName")}
          aria-invalid={nameTaken}
          placeholder={suggestedDraftName}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          value={editing.value}
          onChange={(event) => {
            setEditing({ ...editing, value: event.target.value });
            setNameTaken(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setEditing(null);
            if (event.key === "Tab" && editing.original === null && !editing.value.trim()) {
              event.preventDefault();
              saveDraftName(suggestedDraftName);
            }
          }}
        />
          <button type="submit"
            className="absolute inset-y-0 right-0 grid w-9 cursor-pointer place-items-center text-emerald-700 hover:text-emerald-900 disabled:cursor-default disabled:opacity-40 dark:text-emerald-400"
            aria-label={t("tt.saveDraftName")}
            disabled={!editing.value.trim()}
          >
            <Check className="size-4" aria-hidden />
          </button>
        </div>
        {nameTaken && <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-300">{t("tt.draftNameTaken")}</p>}
      </div>
    </form>
  );

  return (
    <div className="card min-w-0 space-y-2 self-start">
      <div className="flex flex-wrap items-center gap-2">
        {draftNames.map((name) => (
          <div key={name} className="min-w-0 max-w-full">
            {editing?.original === name ? editor : (
              <button
                type="button"
                onClick={() => tt.switchDraft(semester, name)}
                onDoubleClick={() => startEditing(name)}
                onKeyDown={(event) => {
                  if (event.key === "F2") {
                    event.preventDefault();
                    startEditing(name);
                  }
                }}
                title={t("tt.renameDraftTitle")}
                aria-pressed={name === activeDraft}
                className={`max-w-full rounded px-4 py-2 text-[13.8px] font-semibold wrap-anywhere ${
                  name === activeDraft
                    ? "bg-brand-600 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {draftLabel(name)}
              </button>
            )}
          </div>
        ))}
        {editing?.original === null ? editor : (
          <button
            type="button"
            onClick={() => startEditing(null)}
            className="rounded border border-dashed border-slate-300 px-4 py-2 text-[13.8px] font-semibold text-slate-600 hover:border-brand-500 hover:text-brand-ink dark:border-slate-700 dark:text-slate-400"
            title={t("tt.newDraftTitle")}
          >
            {t("tt.newDraft")}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={duplicate}
          className="rounded-md border border-brand-300 bg-brand-50 px-4 py-2 text-[13.8px] font-semibold text-brand-700 transition hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-200 dark:hover:bg-brand-900/70"
          title={t("tt.duplicateTitle")}
        >
          {t("tt.duplicate")}
        </button>
        {draftNames.length > 1 && (
          <button
            type="button"
            onClick={async () => {
              const confirmed = await appConfirm(t("tt.confirmDeleteDraft", { name: draftLabel(activeDraft) }), {
                title: t("tt.confirmDeleteDraftTitle"),
                compact: true,
                danger: true,
                okLabel: t("tt.confirmDeleteDraftAction"),
                cancelLabel: t("common.cancel"),
              });
              if (confirmed) {
                setEditing(null);
                tt.deleteDraft(semester, activeDraft);
                flash(t("tt.draftDeleted"));
              }
            }}
            className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-[13.8px] font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
          >
            {t("tt.deleteDraft")}
          </button>
        )}
      </div>
      <Link
        href="/timetable/optimize"
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-[13.8px] font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus dark:bg-brand-500 dark:hover:bg-brand-400"
        aria-label={t("tt.optimize.openDraftFor", { name: draftLabel(activeDraft) })}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {t("tt.optimize.openDraft")}
      </Link>
    </div>
  );
}
