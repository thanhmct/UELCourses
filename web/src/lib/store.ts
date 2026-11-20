"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TimetableEntry } from "./shareUrl";
import type { ModuleRef } from "./types";
import { moveModule, type PlanState, type PlannedModule } from "./planner";

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
  setCohort: (c: string) => void;
  setMajor: (m: string) => void;
  setTheme: (t: Theme) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      cohort: "",
      major: "",
      theme: "system",
      setCohort: (cohort) => set({ cohort }),
      setMajor: (major) => set({ major }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: "uelcourses-settings" },
  ),
);

// ---------- Timetable ----------
interface TimetableState {
  semester: string;
  bySemester: Record<string, TimetableEntry[]>;
  drafts: Record<string, Record<string, TimetableEntry[]>>;
  activeDrafts: Record<string, string>;
  info: Record<string, ModuleRef>;
  setSemester: (s: string) => void;
  addModule: (m: ModuleRef, classCode?: string | null) => void;
  removeModule: (code: string) => void;
  setClass: (code: string, classCode: string | null) => void;
  toggleHidden: (code: string) => void;
  setColor: (code: string, color: number) => void;
  replaceSemester: (semester: string, entries: TimetableEntry[]) => void;
  rememberInfo: (m: ModuleRef) => void;
  // Multiple drafts management
  switchDraft: (semester: string, draftName: string) => void;
  createDraft: (semester: string, draftName: string, copyFromCurrent?: boolean) => void;
  deleteDraft: (semester: string, draftName: string) => void;
  renameDraft: (semester: string, oldName: string, newName: string) => void;
}

function updateEntries(s: TimetableState, fn: (e: TimetableEntry[]) => TimetableEntry[]) {
  const sem = s.semester;
  const draftName = s.activeDrafts?.[sem] || "Phương án 1";
  const semDrafts = s.drafts?.[sem] || { [draftName]: s.bySemester[sem] ?? [] };
  const currentEntries = semDrafts[draftName] ?? s.bySemester[sem] ?? [];
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
      setSemester: (semester) => set({ semester }),
      addModule: (m, classCode = null) =>
        set((s) => {
          const sem = s.semester;
          const draftName = s.activeDrafts?.[sem] || "Phương án 1";
          const semDrafts = s.drafts?.[sem] || { [draftName]: s.bySemester[sem] ?? [] };
          const list = semDrafts[draftName] ?? s.bySemester[sem] ?? [];
          if (list.some((e) => e.code === m.code)) return s;
          const used = new Set(list.map((e) => e.color));
          const color = PALETTE.findIndex((_, i) => !used.has(i));
          return {
            info: { ...s.info, [m.code]: { code: m.code, name: m.name, name_en: m.name_en ?? null, credits: m.credits } },
            ...updateEntries(s, (e) => [...e, { code: m.code, class_code: classCode, color: color === -1 ? list.length % PALETTE.length : color, hidden: false }]),
          };
        }),
      removeModule: (code) => set((s) => updateEntries(s, (e) => e.filter((x) => x.code !== code))),
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
      rememberInfo: (m) => set((s) => ({ info: { ...s.info, [m.code]: { code: m.code, name: m.name, name_en: m.name_en ?? null, credits: m.credits } } })),
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
      createDraft: (semester, draftName, copyFromCurrent = false) =>
        set((s) => {
          const semDrafts = s.drafts?.[semester] || { "Phương án 1": s.bySemester[semester] ?? [] };
          const curDraftName = s.activeDrafts?.[semester] || "Phương án 1";
          const baseEntries = copyFromCurrent ? (semDrafts[curDraftName] ?? s.bySemester[semester] ?? []) : [];
          const nextSemDrafts = { ...semDrafts, [draftName]: [...baseEntries] };
          return {
            activeDrafts: { ...(s.activeDrafts || {}), [semester]: draftName },
            bySemester: { ...s.bySemester, [semester]: baseEntries },
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
          const semDrafts = { ...(s.drafts?.[semester] || { "Phương án 1": s.bySemester[semester] ?? [] }) };
          const entries = semDrafts[oldName] ?? [];
          delete semDrafts[oldName];
          semDrafts[newName] = entries;
          const curActive = s.activeDrafts?.[semester] || "Phương án 1";
          return {
            activeDrafts: { ...(s.activeDrafts || {}), [semester]: curActive === oldName ? newName : curActive },
            drafts: { ...(s.drafts || {}), [semester]: semDrafts },
          };
        }),
    }),
    { name: "uelcourses-timetable" },
  ),
);

// ---------- Planner ----------
interface PlannerStore extends PlanState {
  addTerm: (name: string) => void;
  removeTerm: (id: string) => void;
  renameTerm: (id: string, name: string) => void;
  addToBacklog: (m: PlannedModule) => void;
  removeModule: (code: string) => void;
  move: (code: string, target: string) => void;
  toggleCompleted: (code: string) => void;
  replaceModule: (oldCode: string, m: PlannedModule) => void;
}

const defaultTerms = [
  { id: "t1", name: "Năm 1 – HK1", modules: [] },
  { id: "t2", name: "Năm 1 – HK2", modules: [] },
  { id: "t3", name: "Năm 2 – HK1", modules: [] },
  { id: "t4", name: "Năm 2 – HK2", modules: [] },
];

export const usePlanner = create<PlannerStore>()(
  persist(
    (set) => ({
      terms: defaultTerms,
      backlog: [],
      completed: [],
      catalog: {},
      addTerm: (name) => set((s) => ({ terms: [...s.terms, { id: `t${Date.now().toString(36)}`, name, modules: [] }] })),
      removeTerm: (id) =>
        set((s) => {
          const t = s.terms.find((x) => x.id === id);
          return { terms: s.terms.filter((x) => x.id !== id), backlog: [...s.backlog, ...(t?.modules ?? [])] };
        }),
      renameTerm: (id, name) => set((s) => ({ terms: s.terms.map((t) => (t.id === id ? { ...t, name } : t)) })),
      addToBacklog: (m) =>
        set((s) => {
          const inPlan = s.backlog.includes(m.code) || s.terms.some((t) => t.modules.includes(m.code));
          return { catalog: { ...s.catalog, [m.code]: m }, backlog: inPlan ? s.backlog : [...s.backlog, m.code] };
        }),
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
    }),
    { name: "uelcourses-planner" },
  ),
);

export const LOCAL_KEYS = [
  "uelcourses-settings",
  "uelcourses-timetable",
  "uelcourses-planner",
  "uelcourses-feedback-queue",
  "uelcourses-reg-workspace",
  "uelcourses-reg-notes",
];
