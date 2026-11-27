"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TimetableEntry } from "./shareUrl";
import type { ModuleRef } from "./types";
import { completePlannerYears, moveModule, plannerEnrollmentYear, plannerSemesterId, type PlannerAcademicYears, type PlanState, type PlannedModule } from "./planner";

import { parseProgramCode } from "./programCode";
import { DEFAULT_PLANNER_TERM_COLOR, DEFAULT_TODAY_ROOM_COLOR, normalizeHex } from "./appearance";
import { track } from "./analytics";

export { COHORTS } from "./cohort";
export type Theme = "system" | "light" | "dark";

export const PALETTE = [
  "#0b4f9c", "#0f766e", "#b45309", "#7c3aed", "#be185d", "#15803d", "#4338ca", "#a16207", "#0369a1", "#9f1239",
];

// ---------- Settings ----------
interface SettingsState {
  cohort: string;
  major: string;
  theme: Theme;
  brandGradient: [string, string] | null;
  timetableColors: Record<number, string>;
  plannerTermColor: string;
  /** Màu chữ phòng học ở khối lớp hiện tại/sắp tới trên trang Hôm nay */
  todayRoomColor: string;
  setTodayRoomColor: (color: string) => void;
  holidayAppearance: boolean;
  tetFlower: "mai" | "dao";
  winterMascot: "snowman" | "reindeer" | "custom";
  winterImage: string;
  /** Bản đồ ở trang Hôm nay: mặc định hiện hay ẩn (lưu bền, nhớ lựa chọn gần nhất) */
  defaultShowMap: boolean;
  setDefaultShowMap: (show: boolean) => void;
  /** Dạng xem thời khóa biểu: lưới theo tiết (mặc định) hoặc bảng lớp theo cột/thứ theo hàng */
  timetableViewMode: "grid" | "table";
  setTimetableViewMode: (mode: "grid" | "table") => void;
  setBrandGradient: (gradient: [string, string] | null) => void;
  setTimetableColor: (slot: number, color: string) => void;
  resetTimetableColors: () => void;
  setPlannerTermColor: (color: string) => void;
  setHolidayAppearance: (enabled: boolean) => void;
  setTetFlower: (flower: SettingsState["tetFlower"]) => void;
  setWinterMascot: (mascot: SettingsState["winterMascot"]) => void;
  setWinterImage: (image: string) => void;
  /** Bậc đào tạo: 'dai_hoc' | 'thac_si' | 'tien_si' (mặc định 'dai_hoc') */
  degree: "dai_hoc" | "thac_si" | "tien_si";
  /** mã CTĐT của sinh viên, vd "K23406E" (xem lib/programCode.ts); "" = chưa nhập */
  programCode: string;
  /** mã CTĐT ngành 2 (tuỳ chọn, vd "K24406A"); "" = chưa nhập */
  secondaryProgramCode: string;
  /** đã hiện hộp thoại nhập mã CTĐT lần đầu (đóng hoặc lưu đều tính) */
  programPrompted: boolean;
  setCohort: (c: string) => void;
  setMajor: (m: string) => void;
  setTheme: (t: Theme) => void;
  setDegree: (d: "dai_hoc" | "thac_si" | "tien_si") => void;
  setProgramCode: (c: string) => void;
  setSecondaryProgramCode: (c: string) => void;
  setProgramProfile: (primary: string, secondary?: string) => void;
  setProgramPrompted: (v: boolean) => void;
  /** đã có chứng chỉ đầu ra tiếng Anh → miễn Tiếng Anh 1–4 (tính là hoàn thành, không tính GPA) */
  englishCertExempt: boolean;
  setEnglishCertExempt: (v: boolean) => void;
  /** SV trao đổi tự khai: chỉ có tác dụng khi cửa sổ tiếng Anh + CTĐT tiếng Anh (xem lib/exchangeStats.ts) */
  exchangeStudent: boolean;
  setExchangeStudent: (v: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      cohort: "",
      major: "",
      theme: "system",
      brandGradient: null,
      timetableColors: {},
      plannerTermColor: DEFAULT_PLANNER_TERM_COLOR,
      todayRoomColor: DEFAULT_TODAY_ROOM_COLOR,
      setTodayRoomColor: (color) => {
        const normalized = normalizeHex(color);
        if (normalized) set({ todayRoomColor: normalized });
      },
      holidayAppearance: false,
      tetFlower: "mai",
      winterMascot: "snowman",
      winterImage: "",
      defaultShowMap: false,
      setDefaultShowMap: (defaultShowMap) => set({ defaultShowMap }),
      timetableViewMode: "grid",
      setTimetableViewMode: (timetableViewMode) => set({ timetableViewMode }),
      degree: "dai_hoc",
      programCode: "",
      secondaryProgramCode: "",
      programPrompted: false,
      englishCertExempt: false,
      exchangeStudent: false,
      setCohort: (cohort) => set({ cohort }),
      setMajor: (major) => set({ major }),
      setTheme: (theme) => set({ theme }),
      setBrandGradient: (gradient) => {
        if (!gradient) {
          set({ brandGradient: null });
          return;
        }
        const start = normalizeHex(gradient[0]);
        const end = normalizeHex(gradient[1]);
        if (start && end) set({ brandGradient: [start, end] });
      },
      setTimetableColor: (slot, color) => {
        const normalized = normalizeHex(color);
        if (normalized && Number.isInteger(slot) && slot >= 0 && slot < PALETTE.length) {
          set((state) => ({ timetableColors: { ...state.timetableColors, [slot]: normalized } }));
        }
      },
      resetTimetableColors: () => set({ timetableColors: {} }),
      setPlannerTermColor: (color) => {
        const normalized = normalizeHex(color);
        if (normalized) set({ plannerTermColor: normalized });
      },
      setHolidayAppearance: (holidayAppearance) => set({ holidayAppearance }),
      setTetFlower: (tetFlower) => set({ tetFlower }),
      setWinterMascot: (winterMascot) => set({ winterMascot }),
      setWinterImage: (winterImage) => set({ winterImage, winterMascot: winterImage ? "custom" : "snowman" }),
      setDegree: (degree) => set({ degree }),
      setProgramCode: (programCode) => {
        const code = programCode.includes("+") ? programCode.split("+")[0].trim() : programCode;
        const parsed = parseProgramCode(code);
        set({
          programCode,
          ...(parsed?.degree === "dai_hoc" ? { cohort: parsed.cohort } : {}),
          ...(parsed?.degree ? { degree: parsed.degree } : {}),
        });
      },
      setSecondaryProgramCode: (secondaryProgramCode) => set({ secondaryProgramCode }),
      setProgramProfile: (programCode, secondaryProgramCode = "") => {
        const parsed = parseProgramCode(programCode);
        set({
          programCode,
          secondaryProgramCode,
          ...(parsed?.degree === "dai_hoc" ? { cohort: parsed.cohort } : {}),
          ...(parsed?.degree ? { degree: parsed.degree } : {}),
        });
      },
      setProgramPrompted: (programPrompted) => set({ programPrompted }),
      setEnglishCertExempt: (englishCertExempt) => set({ englishCertExempt }),
      setExchangeStudent: (exchangeStudent) => set({ exchangeStudent }),
    }),
    { name: "uelcourses-settings" },
  ),
);

// ---------- Timetable ----------
export interface TimetableModuleInfo extends ModuleRef {
  faculty?: string;
  faculty_en?: string | null;
  lecturer_email?: string | null;
}

interface TimetableState {
  semester: string;
  bySemester: Record<string, TimetableEntry[]>;
  drafts: Record<string, Record<string, TimetableEntry[]>>;
  activeDrafts: Record<string, string>;
  info: Record<string, TimetableModuleInfo>;
  plannerAssignments: Record<string, string[]>;
  /** Môn của TKB đã được đối chiếu sang Kế hoạch học tập, theo học kỳ; chỉ môn mới thêm vào TKB mới được đẩy sang. */
  plannerMirrored: Record<string, string[]>;
  setSemester: (s: string) => void;
  addModule: (m: ModuleRef, classCode?: string | null, semester?: string) => void;
  removeModule: (code: string, semester?: string) => void;
  setClass: (code: string, classCode: string | null) => void;
  toggleHidden: (code: string) => void;
  setColor: (code: string, color: number) => void;
  replaceSemester: (semester: string, entries: TimetableEntry[]) => void;
  rememberInfo: (m: ModuleRef | TimetableModuleInfo) => void;
  // Multiple drafts management
  switchDraft: (semester: string, draftName: string) => void;
  createDraft: (semester: string, draftName: string, source?: boolean | TimetableEntry[]) => void;
  deleteDraft: (semester: string, draftName: string) => void;
  renameDraft: (semester: string, oldName: string, newName: string) => void;
  resetAll: () => void;
}

export function currentTimetableDraft(s: TimetableState, sem: string) {
  const draftName = s.activeDrafts?.[sem] || "Phương án 1";
  const semDrafts = s.drafts?.[sem] || { [draftName]: s.bySemester[sem] ?? [] };
  const currentEntries = semDrafts[draftName] ?? s.bySemester[sem] ?? [];
  return { draftName, semDrafts, currentEntries };
}

function appendTimetableModule(entries: TimetableEntry[], code: string, classCode: string | null, fromPlanner?: true) {
  if (entries.some((entry) => entry.code === code)) return entries;
  const used = new Set(entries.map((entry) => entry.color));
  const color = PALETTE.findIndex((_, i) => !used.has(i));
  return [...entries, {
    code,
    class_code: classCode,
    color: color === -1 ? entries.length % PALETTE.length : color,
    hidden: false,
    ...(fromPlanner && { fromPlanner }),
  }];
}

function timetableModuleInfo(m: ModuleRef & { faculty?: string; faculty_en?: string | null; lecturer_email?: string | null }): TimetableModuleInfo {
  return {
    code: m.code,
    name: m.name,
    name_en: m.name_en ?? null,
    credits: m.credits,
    ...(m.faculty ? { faculty: m.faculty } : {}),
    ...(m.faculty_en ? { faculty_en: m.faculty_en } : {}),
    ...(m.lecturer_email ? { lecturer_email: m.lecturer_email } : {}),
  };
}

function updateEntries(s: TimetableState, fn: (e: TimetableEntry[]) => TimetableEntry[], sem = s.semester) {
  const { draftName, semDrafts, currentEntries } = currentTimetableDraft(s, sem);
  const nextEntries = fn(currentEntries);

  const nextSemDrafts = { ...semDrafts, [draftName]: nextEntries };
  return {
    bySemester: { ...s.bySemester, [sem]: nextEntries },
    drafts: { ...(s.drafts || {}), [sem]: nextSemDrafts },
    activeDrafts: { ...(s.activeDrafts || {}), [sem]: draftName },
  };
}

export const useTimetable = create<TimetableState>()(
  persist(
    (set) => ({
      semester: "",
      bySemester: {},
      drafts: {},
      activeDrafts: {},
      info: {},
      plannerAssignments: {},
      plannerMirrored: {},
      setSemester: (semester) => set({ semester }),
      addModule: (m, classCode = null, semester) =>
        set((s) => {
          const sem = semester ?? s.semester;
          const { currentEntries } = currentTimetableDraft(s, sem);
          const entries = appendTimetableModule(currentEntries, m.code, classCode);
          if (entries === currentEntries) return s;
          if (classCode) {
            track("timetable_add", { module_code: m.code, class_code: classCode, semester_id: sem || undefined });
          }
          return {
            semester: s.semester || sem,
            info: { ...s.info, [m.code]: timetableModuleInfo(m) },
            ...updateEntries(s, () => entries, sem),
          };
        }),
      removeModule: (code, semester) => set((s) => updateEntries(s, (e) => e.filter((x) => x.code !== code), semester)),
      setClass: (code, classCode) => set((s) => updateEntries(s, (e) => e.map((x) => (x.code === code ? { ...x, class_code: classCode } : x)))),
      toggleHidden: (code) => set((s) => updateEntries(s, (e) => e.map((x) => (x.code === code ? { ...x, hidden: !x.hidden } : x)))),
      setColor: (code, color) => set((s) => updateEntries(s, (e) => e.map((x) => (x.code === code ? { ...x, color } : x)))),
      replaceSemester: (semester, entries) =>
        set((s) => {
          const draftName = s.activeDrafts?.[semester] || "Phương án 1";
          const semDrafts = { ...(s.drafts?.[semester] || {}), [draftName]: entries };
          return {
            semester,
            bySemester: { ...s.bySemester, [semester]: entries },
            drafts: { ...(s.drafts || {}), [semester]: semDrafts },
            activeDrafts: { ...(s.activeDrafts || {}), [semester]: draftName },
          };
        }),
      rememberInfo: (m) =>
        set((s) => ({
          info: {
            ...s.info,
            [m.code]: timetableModuleInfo({ ...(s.info[m.code] || {}), ...m }),
          },
        })),
      switchDraft: (semester, draftName) =>
        set((s) => {
          const semDrafts = s.drafts?.[semester] || { "Phương án 1": s.bySemester[semester] ?? [] };
          const entries = semDrafts[draftName] ?? [];
          return {
            activeDrafts: { ...(s.activeDrafts || {}), [semester]: draftName },
            bySemester: { ...s.bySemester, [semester]: entries },
            drafts: { ...(s.drafts || {}), [semester]: { ...semDrafts, [draftName]: entries } },
          };
        }),
      createDraft: (semester, draftName, source = false) =>
        set((s) => {
          const curDraftName = s.activeDrafts?.[semester] || "Phương án 1";
          const semDrafts = s.drafts?.[semester] || { [curDraftName]: s.bySemester[semester] ?? [] };
          if (!draftName.trim() || Object.hasOwn(semDrafts, draftName)) return s;
          const baseEntries = Array.isArray(source) ? source
            : source ? (semDrafts[curDraftName] ?? s.bySemester[semester] ?? []) : [];
          const entries = baseEntries.map((entry) => {
            const copy = { ...entry };
            delete copy.fromPlanner;
            return copy;
          });
          const nextSemDrafts = { ...semDrafts, [draftName]: entries };
          return {
            activeDrafts: { ...(s.activeDrafts || {}), [semester]: draftName },
            bySemester: { ...s.bySemester, [semester]: entries },
            drafts: { ...(s.drafts || {}), [semester]: nextSemDrafts },
          };
        }),
      deleteDraft: (semester, draftName) =>
        set((s) => {
          const semDrafts = { ...(s.drafts?.[semester] || { "Phương án 1": s.bySemester[semester] ?? [] }) };
          delete semDrafts[draftName];
          const remaining = Object.keys(semDrafts);
          if (remaining.length === 0) {
            semDrafts["Phương án 1"] = [];
            remaining.push("Phương án 1");
          }
          const nextActive = remaining[0];
          const entries = semDrafts[nextActive] ?? [];
          return {
            activeDrafts: { ...(s.activeDrafts || {}), [semester]: nextActive },
            bySemester: { ...s.bySemester, [semester]: entries },
            drafts: { ...(s.drafts || {}), [semester]: semDrafts },
          };
        }),
      renameDraft: (semester, oldName, newName) =>
        set((s) => {
          if (!newName.trim() || oldName === newName) return s;
          const curActive = s.activeDrafts?.[semester] || "Phương án 1";
          const semDrafts = s.drafts?.[semester] || { [curActive]: s.bySemester[semester] ?? [] };
          if (!Object.hasOwn(semDrafts, oldName) || Object.hasOwn(semDrafts, newName)) return s;
          const renamed = Object.fromEntries(
            Object.entries(semDrafts).map(([name, entries]) => [name === oldName ? newName : name, entries]),
          );
          return {
            activeDrafts: { ...(s.activeDrafts || {}), [semester]: curActive === oldName ? newName : curActive },
            drafts: { ...(s.drafts || {}), [semester]: renamed },
          };
        }),
      resetAll: () => set({ bySemester: {}, drafts: {}, activeDrafts: {}, info: {}, plannerAssignments: {}, plannerMirrored: {} }),
    }),
    { name: "uelcourses-timetable" },
  ),
);

// ---------- Planner ----------
interface PlannerStore extends PlanState {
  academicYears: PlannerAcademicYears | null;
  addAcademicYears: (years: PlannerAcademicYears) => void;
  addTerm: (name: string) => void;
  removeTerm: (id: string) => void;
  renameTerm: (id: string, name: string) => void;
  addToBacklog: (m: PlannedModule) => void;
  addCompletedModule: (m: PlannedModule) => void;
  removeModule: (code: string) => void;
  move: (code: string, target: string) => void;
  toggleCompleted: (code: string) => void;
  replaceModule: (oldCode: string, m: PlannedModule) => void;
  syncProgram: (modules: PlannedModule[], exemptCodes?: string[]) => void;
  resetPlan: () => void;
  /** Làm mới dữ liệu học phần (tiên quyết, tín chỉ, tên...) từ nguồn thật, không đụng vào backlog/terms/completed. */
  refreshCatalog: (modules: PlannedModule[]) => void;
}

/** 4 năm × 3 học kỳ chính thức (HK1, HK2, HK3) = 12 học kỳ, từ "Năm 1 – HK1" đến "Năm 4 – HK3". HK3 không phải học kỳ hè. */
export const PROGRAM_TERMS = Array.from({ length: 12 }, (_, i) => {
  const year = Math.floor(i / 3) + 1;
  const term = (i % 3) + 1;
  return { id: `t${i + 1}`, name: `Năm ${year} – HK${term}`, modules: [] as string[] };
});

/** Bản lưu cũ (version 0) đặt tên học kỳ thứ 3 là "HKhè": đổi lại thành "HK3". */
export function migratePlannerState(persisted: unknown, version: number): unknown {
  if (version >= 3 || !persisted || typeof persisted !== "object") return persisted;
  const state = persisted as Partial<PlanState>;
  if (!Array.isArray(state.terms)) return persisted;
  return {
    ...state,
    ...(version === 0
      ? { terms: state.terms.map((t) => ({ ...t, name: typeof t.name === "string" ? t.name.replace(/HK\s*hè/gi, "HK3") : t.name })) }
      : {}),
    // Giữ nguyên danh sách Dự định học của các bản lưu cũ.
    backlog: Array.isArray(state.backlog) ? state.backlog : [],
  };
}

const defaultTerms = PROGRAM_TERMS.slice(0, 4);

export const usePlanner = create<PlannerStore>()(
  persist(
    (set) => ({
      terms: defaultTerms,
      academicYears: null,
      backlog: [],
      completed: [],
      catalog: {},
      addAcademicYears: (years) => set((s) => {
        const { programCode, cohort } = useSettings.getState();
        const previousAdmission = s.academicYears?.admission ?? plannerEnrollmentYear(programCode, cohort) ?? years.admission;
        const { terms, movedToBacklog } = completePlannerYears(s.terms, years, previousAdmission);
        const additions = movedToBacklog.filter((code) => !s.completed.includes(code) && !s.backlog.includes(code));
        return { academicYears: years, terms, backlog: additions.length ? [...s.backlog, ...additions] : s.backlog };
      }),
      addTerm: (name) => set((s) => ({ terms: [...s.terms, { id: `t${Date.now().toString(36)}`, name, modules: [] }] })),
      removeTerm: (id) =>
        set((s) => {
          const t = s.terms.find((x) => x.id === id);
          const removed = new Set(t?.modules ?? []);
          return {
            terms: s.terms.filter((x) => x.id !== id),
            backlog: s.backlog.filter((code) => !removed.has(code)),
            completed: s.completed.filter((code) => !removed.has(code)),
          };
        }),
      renameTerm: (id, name) => set((s) => ({ terms: s.terms.map((t) => (t.id === id ? { ...t, name } : t)) })),
      addToBacklog: (m) =>
        set((s) => {
          const inPlan = s.backlog.includes(m.code) || s.terms.some((t) => t.modules.includes(m.code));
          return { catalog: { ...s.catalog, [m.code]: m }, backlog: inPlan ? s.backlog : [...s.backlog, m.code] };
        }),
      addCompletedModule: (m) =>
        set((s) => ({
          catalog: { ...s.catalog, [m.code]: m },
          completed: s.completed.includes(m.code) ? s.completed : [...s.completed, m.code],
          backlog: s.backlog.filter((code) => code !== m.code),
        })),
      removeModule: (code) =>
        set((s) => ({
          backlog: s.backlog.filter((c) => c !== code),
          terms: s.terms.map((t) => ({ ...t, modules: t.modules.filter((c) => c !== code) })),
          completed: s.completed.filter((c) => c !== code),
        })),
      move: (code, target) => set((s) => moveModule(s, code, target)),
      toggleCompleted: (code) =>
        set((s) => ({ completed: s.completed.includes(code) ? s.completed.filter((c) => c !== code) : [...s.completed, code] })),
      replaceModule: (oldCode, m) =>
        set((s) => ({
          catalog: { ...s.catalog, [m.code]: m },
          backlog: s.backlog.map((c) => (c === oldCode ? m.code : c)),
          terms: s.terms.map((t) => ({ ...t, modules: t.modules.map((c) => (c === oldCode ? m.code : c)) })),
        })),
      syncProgram: (modules, exemptCodes = []) =>
        set((s) => {
          const catalog = { ...s.catalog };
          for (const m of modules) catalog[m.code] = { ...catalog[m.code], ...m };
          // Môn được miễn (chứng chỉ tiếng Anh) coi như đã hoàn thành.
          const completed = Array.from(new Set([...s.completed, ...exemptCodes]));
          const placed = new Set(s.terms.flatMap((t) => t.modules));
          const backlog = s.backlog.filter((code) => !placed.has(code) && !completed.includes(code));

          // Chưa có học kỳ nào được xếp: dùng đủ 12 học kỳ của CTĐT thay cho 4 học kỳ mặc định.
          const untouched = s.terms.length <= defaultTerms.length && placed.size === 0;
          const terms = untouched ? PROGRAM_TERMS.map((t) => ({ ...t, modules: [] as string[] })) : s.terms;
          return { catalog, backlog, terms, completed };
        }),
      resetPlan: () => {
        useTimetable.getState().resetAll();
        set({ terms: defaultTerms, academicYears: null, backlog: [], completed: [], catalog: {} });
      },
      refreshCatalog: (modules) =>
        set((s) => {
          let changed = false;
          const catalog = { ...s.catalog };
          for (const m of modules) {
            const prev = catalog[m.code];
            const next = { ...prev, ...m };
            if (!prev
              || prev.name !== next.name
              || prev.name_en !== next.name_en
              || prev.credits !== next.credits
              || JSON.stringify(prev.prerequisites ?? []) !== JSON.stringify(next.prerequisites ?? [])
              || JSON.stringify(prev.equivalents ?? []) !== JSON.stringify(next.equivalents ?? [])
            ) {
              catalog[m.code] = next;
              changed = true;
            }
          }
          return changed ? { catalog } : s;
        }),
    }),
    { name: "uelcourses-planner", version: 3, migrate: migratePlannerState as never },
  ),
);

function reconcilePlannerTimetable(timetable: TimetableState, plan: PlanState, enrollmentYear: number | null) {
  const bySemester = new Map<string, Set<string>>();
  for (const { name, modules } of plan.terms) {
    const semester = modules.length ? plannerSemesterId(name, enrollmentYear) : null;
    if (!semester) continue;
    const codes = bySemester.get(semester) ?? new Set<string>();
    modules.forEach((code) => codes.add(code));
    bySemester.set(semester, codes);
  }

  const previous = timetable.plannerAssignments;
  const semesters = new Set([...Object.keys(previous), ...bySemester.keys()]);
  let next: TimetableState | undefined;
  for (const semester of semesters) {
    const assigned = bySemester.get(semester) ?? new Set<string>();
    const prior = new Set(previous[semester] ?? []);
    const added = [...assigned].filter((code) => !prior.has(code));
    const removed = new Set([...prior].filter((code) => !assigned.has(code)));
    if (!added.length && !removed.size) continue;

    next ??= {
      ...timetable,
      bySemester: { ...timetable.bySemester },
      drafts: { ...timetable.drafts },
      activeDrafts: { ...timetable.activeDrafts },
      info: { ...timetable.info },
      plannerAssignments: Object.fromEntries([...bySemester].map(([id, codes]) => [id, [...codes]])),
    };
    const { draftName, semDrafts, currentEntries } = currentTimetableDraft(timetable, semester);
    const drafts = { ...semDrafts, [draftName]: currentEntries };
    if (removed.size) {
      for (const name of Object.keys(drafts)) {
        drafts[name] = drafts[name].filter((entry) => !(entry.fromPlanner && removed.has(entry.code)));
      }
    }
    for (const code of added) {
      drafts[draftName] = appendTimetableModule(drafts[draftName], code, null, true);
      if (!next.info[code] && plan.catalog[code]) next.info[code] = timetableModuleInfo(plan.catalog[code]);
    }
    next.drafts[semester] = drafts;
    next.activeDrafts[semester] = draftName;
    next.bySemester[semester] = drafts[draftName];
  }
  return next;
}

/**
 * Chiều ngược lại: môn mới thêm vào TKB của một học kỳ được xếp vào học kỳ tương ứng trong Kế hoạch học tập.
 * Chỉ thêm, không gỡ; môn đã nằm ở học kỳ khác hoặc đã hoàn thành thì giữ nguyên.
 * `plannerMirrored` ghi nhớ môn đã đối chiếu để môn người dùng cố ý gỡ khỏi kế hoạch không tự quay lại.
 */
function reconcileTimetablePlanner(timetable: TimetableState, plan: PlanState, enrollmentYear: number | null) {
  const mirrored = timetable.plannerMirrored ?? {};
  const placed = new Set(plan.terms.flatMap((term) => term.modules));
  const completed = new Set(plan.completed);
  let terms = plan.terms;
  let catalog = plan.catalog;
  let backlog = plan.backlog;
  let planChanged = false;
  const nextMirrored: Record<string, string[]> = {};

  for (const [semester, entries] of Object.entries(timetable.bySemester)) {
    const codes = [...new Set(entries.map((entry) => entry.code))];
    if (codes.length) nextMirrored[semester] = codes;
    const match = /^(\d{4}-\d{4})-([1-3])$/.exec(semester);
    if (!match) continue;
    const seen = new Set(mirrored[semester] ?? []);
    for (const code of codes) {
      if (seen.has(code) || placed.has(code) || completed.has(code)) continue;
      let index = terms.findIndex((term) => plannerSemesterId(term.name, enrollmentYear) === semester);
      if (index < 0) {
        const id = `academic-${semester}`;
        const taken = new Set(terms.map((term) => term.id));
        let unique = id;
        for (let suffix = 2; taken.has(unique); suffix++) unique = `${id}-${suffix}`;
        terms = [...terms, { id: unique, name: `HK${match[2]} ${match[1]}`, modules: [] }];
        index = terms.length - 1;
      }
      terms = terms.map((term, i) => (i === index ? { ...term, modules: [...term.modules, code] } : term));
      placed.add(code);
      planChanged = true;
      const info = timetable.info[code];
      if (!catalog[code] && info) catalog = { ...catalog, [code]: info };
      if (backlog.includes(code)) backlog = backlog.filter((item) => item !== code);
    }
  }

  const mirroredChanged = JSON.stringify(nextMirrored) !== JSON.stringify(mirrored);
  if (!planChanged && !mirroredChanged) return undefined;
  return { plannerMirrored: mirroredChanged ? nextMirrored : undefined, plan: planChanged ? { terms, catalog, backlog } : undefined };
}

/** Reconcile saved plans at startup and apply subsequent planner and timetable changes on this device. */
export function startPlannerTimetableSync() {
  const enrollmentYear = () => {
    const settings = useSettings.getState();
    return plannerEnrollmentYear(settings.programCode, settings.cohort);
  };
  const sync = () => {
    const next = reconcilePlannerTimetable(useTimetable.getState(), usePlanner.getState(), enrollmentYear());
    if (next) useTimetable.setState(next);
  };
  const syncBack = () => {
    const next = reconcileTimetablePlanner(useTimetable.getState(), usePlanner.getState(), enrollmentYear());
    if (!next) return;
    if (next.plannerMirrored) useTimetable.setState({ plannerMirrored: next.plannerMirrored });
    if (next.plan) usePlanner.setState(next.plan);
  };
  const stopPlanner = usePlanner.subscribe((state, previous) => {
    if (state.terms !== previous.terms) sync();
  });
  const stopTimetable = useTimetable.subscribe((state, previous) => {
    if (state.bySemester !== previous.bySemester) syncBack();
  });
  const stopSettings = useSettings.subscribe((state, previous) => {
    if (state.programCode !== previous.programCode || state.cohort !== previous.cohort) {
      sync();
      syncBack();
    }
  });
  sync();
  syncBack();
  return () => {
    stopPlanner();
    stopTimetable();
    stopSettings();
  };
}

export const LOCAL_KEYS = [
  "uelcourses-settings",
  "uelcourses-timetable",
  "uelcourses-planner",
  "uelcourses-feedback-queue",
  "uelcourses-offline-queue-v1",
  "uelcourses-reg-workspace",
  "uelcourses-reg-notes",
];
