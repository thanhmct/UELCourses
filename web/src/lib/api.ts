// API client following the REST contract in ARCHITECTURE.md.
// Real data only by default: when the API is unreachable the call fails (pages show an error and the
// header shows an "offline" badge). Mock data from src/mocks/ is used ONLY when NEXT_PUBLIC_USE_MOCKS=true
// (dev/demo/tests); then results carry `mock: true` so pages show the "Dữ liệu mẫu" label.
import type {
  AskResponse,
  Backlink,
  CheckResult,
  ClassSection,
  RegulationGraph,
  RegulationMarkdown,
  CompareResponse,
  EquivalentItem,
  FeedbackPayload,
  ModuleDetail,
  ModuleSummary,
  ModuleFacets,
  FacetCount,
  ModuleTreeNode,
  Paged,
  ProgramDetail,
  ProgramGraph,
  ProgramSummary,
  RegulationDoc,
  RegulationDocDetail,
  Semester,
  Venue,
} from "./types";
import { mockEquivalents, mockModules, mockSections, mockSemesters } from "@/mocks/modules";
import {
  mockAsk,
  mockBacklinks,
  mockCompare,
  mockGraph,
  mockMarkdown,
  mockRegulationDocs,
  mockResolve,
  stripArticles,
} from "@/mocks/regulations";
import {
  mockCheckProgram,
  mockModuleTree,
  mockProgram,
  mockProgramGraph,
  mockPrograms,
} from "@/mocks/programs";
import { stripFrontmatter } from "./vault";
import { appliesToCohort, effectiveBadge, normalizeArticles } from "./regulations";
import { matches } from "./text";
import { venuesFromSections, filterVenues } from "./venues";
import { parseSchedules } from "./schedule";
import { useDataSource } from "./dataSource";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";

export interface ApiResult<T> {
  data: T;
  mock: boolean;
}

const TIMEOUT_MS = 4000;
const RETRY_AFTER_MS = 30_000;
let downSince = 0;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Mock fallback is opt-in (NEXT_PUBLIC_USE_MOCKS=true). Read at call time so tests can toggle it. */
export function mocksEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCKS === "true";
}

function markMock(mock: boolean) {
  if (typeof window !== "undefined") useDataSource.getState().setMock(mock);
}

function markOffline(offline: boolean) {
  if (typeof window !== "undefined") useDataSource.getState().setOffline(offline);
}

async function raw<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { Accept: "application/json", ...(init?.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    });
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call the API; on network failure / timeout / 5xx / 404 for whole endpoint
 * fall back to mock. 4xx other than 404 propagate (real validation errors).
 */
async function withFallback<T>(path: string, fallback: () => T, init?: RequestInit, map?: (x: unknown) => T): Promise<ApiResult<T>> {
  if (!mocksEnabled()) {
    // Real data only: never substitute mock data; surface the failure to the page.
    try {
      const data = await raw<unknown>(path, init);
      markOffline(false);
      markMock(false);
      return { data: map ? map(data) : (data as T), mock: false };
    } catch (e) {
      if (!(e instanceof ApiError) || e.status >= 500) markOffline(true);
      if (e instanceof ApiError) throw e;
      throw new ApiError(0, "Không kết nối được máy chủ dữ liệu. Vui lòng thử lại sau.");
    }
  }
  if (typeof window === "undefined" || Date.now() - downSince < RETRY_AFTER_MS) {
    markMock(true);
    return { data: fallback(), mock: true };
  }
  try {
    const data = await raw<unknown>(path, init);
    markMock(false);
    return { data: map ? map(data) : (data as T), mock: false };
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 404) throw e;
    if (!(e instanceof ApiError)) downSince = Date.now();
    markMock(true);
    return { data: fallback(), mock: true };
  }
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

function normalizeSection(x: unknown): ClassSection {
  const o = (x ?? {}) as Record<string, unknown>;
  const lessons = Array.isArray(o.lessons) && o.lessons.length ? (o.lessons as ClassSection["lessons"]) : parseSchedules(o.schedules ?? o.Schedules);
  const n = (v: unknown) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const strs = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : undefined);
  return {
    class_code: String(o.class_code ?? ""),
    module_code: String(o.module_code ?? ""),
    lecturer: (o.lecturer as string) ?? undefined,
    quota: n(o.quota),
    quota_min: n(o.quota_min),
    quota_max: n(o.quota_max),
    registered: n(o.registered),
    available: n(o.available),
    student_groups: strs(o.student_groups),
    rooms: strs(o.rooms),
    start_date: (o.start_date as string) ?? undefined,
    end_date: (o.end_date as string) ?? undefined,
    lessons,
  };
}

// ---------- Endpoints ----------

/** Filters accepted by GET /api/modules (all optional). */
export type ModuleFilter = {
  q?: string;
  faculty?: string;
  department?: string;
  credits?: number | string;
  type?: string;
  /** "en" | "vi" */
  language?: string;
  is_english?: boolean;
  /** "true" | "false" */
  talent?: string;
  has_outline?: string;
  /** CTĐT, vd "K23406" (khóa 23, ngành 406) */
  program_id?: string;
  /** semester id, e.g. "2026-2027-1" */
  semester?: string;
  page?: number;
  size?: number;
};

/** Syllabus payload from GET /api/modules/{code}/outline (loosely typed: fields may be missing). */
export type OutlineData = {
  module_code?: string;
  document?: Record<string, unknown>;
  course?: Record<string, unknown>;
  objectives?: { code?: string; description?: string; clo_codes?: string[] }[];
  clos?: { code?: string; description?: string; teaching_levels?: string }[];
  assessments?: { component?: string; item_code?: string | null; item_name?: string | null; clo_codes?: string[]; criteria?: string; weight_pct?: number | null }[];
  schedule?: { week_label?: string; content?: string; clo_codes?: string[]; activities?: string; assessment?: string }[];
  materials?: { kind?: string; citation?: string }[];
  alternatives?: unknown[];
};
export const api = {
  moduleFacets: () => withFallback<ModuleFacets>("/api/module-facets", () => {
    const counts = (vals: (m: ModuleSummary) => string[]): FacetCount[] => {
      const map = new Map<string, number>();
      for (const m of mockModules) for (const v of vals(m)) if (v) map.set(v, (map.get(v) ?? 0) + 1);
      return [...map].map(([value, count]) => ({ value, count }));
    };
    return {
      total: mockModules.length,
      language: counts((m) => [m.is_english ? "en" : "vi"]),
      talent: counts(() => []),
      credits: counts((m) => [String(m.credits)]),
      faculty: counts((m) => [m.faculty ?? ""]),
      department: counts((m) => [m.department ?? ""]),
      type: counts((m) => [m.type]),
      semester: counts((m) => (m.offering_plan ?? []).flatMap((p) => p.terms.map((t) => `${p.academic_year}-${t}`))),
      has_outline: counts(() => ["false"]),
    };
  }),  health: () => withFallback<{ status: string }>("/api/health", () => ({ status: "mock" })),

  semesters: () => withFallback<Semester[]>("/api/semesters", () => mockSemesters),

  modules: (f: ModuleFilter = {}) =>
    withFallback<Paged<ModuleSummary>>(`/api/modules${qs(f)}`, () => {
      const items = mockModules.filter(
        (m) =>
          (matches(m.code, f.q ?? "") || matches(m.name, f.q ?? "")) &&
          (!f.is_english || !!m.is_english) &&
          (!f.language || (f.language === "en") === !!m.is_english) &&
          (!f.has_outline || f.has_outline === "true" ? true : !m.has_outline) &&
          (!f.semester || (m.offering_plan ?? []).some((p) => p.terms.some((term) => `${p.academic_year}-${term}` === f.semester))) &&
          (!f.department || m.department === f.department) &&
          (!f.faculty || m.faculty === f.faculty) &&
          (!f.credits || m.credits === Number(f.credits)) &&
          (!f.type || m.type === f.type),
      );
      const size = f.size ?? 50;
      const page = f.page ?? 1;
      return { items: items.slice((page - 1) * size, page * size), total: items.length };
    }),

  /** 404 (no syllabus yet) or any error -> null, never marks the app as sample data. */
  outline: async (code: string): Promise<OutlineData | null> => {
    try {
      return await raw<OutlineData>(`/api/modules/${encodeURIComponent(code)}/outline`);
    } catch {
      return null;
    }
  },

  module: (code: string) =>
    withFallback<ModuleDetail | null>(`/api/modules/${encodeURIComponent(code)}`, () => mockModules.find((m) => m.code === code) ?? null),

  classes: (code: string, semester?: string) =>
    withFallback<ClassSection[]>(
      `/api/modules/${encodeURIComponent(code)}/classes${qs({ semester })}`,
      () => mockSections(semester ?? "").filter((s) => s.module_code === code),
      undefined,
      (x) => (Array.isArray(x) ? x.map(normalizeSection) : []),
    ),

  equivalents: (q?: string) =>
    withFallback<EquivalentItem[]>(`/api/equivalents${qs({ q })}`, () =>
      mockEquivalents.filter(
        (e) => !q || [e, ...e.equivalents].some((x) => matches(x.code, q) || matches(x.name, q)),
      ),
    ),

  equivalent: (code: string) =>
    withFallback<EquivalentItem | null>(`/api/equivalents/${encodeURIComponent(code)}`, () => mockEquivalents.find((e) => e.code === code) ?? null),

  venues: (q?: string, semester?: string) =>
    withFallback<Venue[]>(`/api/venues${qs({ q, semester })}`, () => filterVenues(venuesFromSections(mockSections(semester ?? "")), q ?? "")),

  feedback: async (payload: FeedbackPayload): Promise<ApiResult<{ ok: boolean }>> => {
    try {
      await raw("/api/feedback", { method: "POST", body: JSON.stringify(payload) });
      return { data: { ok: true }, mock: false };
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) throw e;
      // Keep locally so nothing is lost; can be re-sent later.
      try {
        const key = "uelcourses-feedback-queue";
        const q = JSON.parse(localStorage.getItem(key) ?? "[]");
        q.push({ ...payload, queued_at: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(q));
      } catch {
        /* ignore */
      }
      return { data: { ok: true }, mock: true };
    }
  },

  regulations: (f: { cohort?: string; status?: string; q?: string } = {}) =>
    withFallback<RegulationDoc[]>(`/api/regulations${qs(f)}`, () =>
      mockRegulationDocs()
        .filter((d) => appliesToCohort(d, f.cohort) && (!f.status || d.status === f.status) && (!f.q || matches(`${d.title} ${d.decision_no}`, f.q)))
        .map(stripArticles),
    ),

  regulation: (docId: string) =>
    withFallback<RegulationDocDetail | null>(
      `/api/regulations/${encodeURIComponent(docId)}`,
      () => mockRegulationDocs().find((d) => d.doc_id === docId) ?? null,
      undefined,
      (x) => (x ? { ...(x as RegulationDocDetail), articles: normalizeArticles((x as RegulationDocDetail).articles) } : null),
    ),

  ask: (question: string, cohort?: string, mode: "extractive" | "llm" = "extractive") =>
    withFallback<AskResponse>(
      "/api/regulations/ask",
      () => mockAsk(question, cohort),
      { method: "POST", body: JSON.stringify({ question, cohort, mode }) },
    ),

  compare: (topic: string, cohorts: string[]) =>
    withFallback<CompareResponse>("/api/regulations/compare", () => mockCompare(topic, cohorts), {
      method: "POST",
      body: JSON.stringify({ topic, cohorts }),
    }),

  markdown: (docId: string) =>
    withFallback<RegulationMarkdown | null>(`/api/regulations/${encodeURIComponent(docId)}/markdown`, () => mockMarkdown(docId), undefined, (x) =>
      x ? { ...(x as RegulationMarkdown), markdown: stripFrontmatter(String((x as RegulationMarkdown).markdown ?? "")) } : null,
    ),

  backlinks: (docId: string) =>
    withFallback<Backlink[]>(`/api/regulations/${encodeURIComponent(docId)}/backlinks`, () => mockBacklinks(docId)),

  graph: (cohort?: string) => withFallback<RegulationGraph>(`/api/regulations/graph${qs({ cohort })}`, () => mockGraph(cohort)),

  resolve: (ref: string) =>
    withFallback<{ doc_id: string; anchor: string } | null>(`/api/regulations/resolve${qs({ ref })}`, () => mockResolve(ref)),

  expiring: (withinDays = 90) =>
    withFallback<RegulationDoc[]>(`/api/regulations/expiring${qs({ within_days: withinDays })}`, () =>
      mockRegulationDocs()
        .filter((d) => ["expiring"].includes(effectiveBadge(d, new Date(), withinDays)))
        .map(stripArticles),
    ),

  programs: (f: { cohort?: string; q?: string } = {}) =>
    withFallback<ProgramSummary[]>(`/api/programs${qs(f)}`, () => mockPrograms(f)),

  program: (id: string) =>
    withFallback<ProgramDetail | null>(`/api/programs/${encodeURIComponent(id)}`, () => mockProgram(id)),

  programGraph: (id: string) =>
    withFallback<ProgramGraph | null>(`/api/programs/${encodeURIComponent(id)}/graph`, () => mockProgramGraph(id)),

  moduleTree: (code: string, options?: { program_id?: string; direction?: "prereq" | "unlocks"; depth?: number }) =>
    withFallback<ModuleTreeNode | null>(
      `/api/modules/${encodeURIComponent(code)}/tree${qs(options ?? {})}`,
      () => mockModuleTree(code, options),
    ),

  checkProgram: (
    id: string,
    req: { completed: { code: string; grade?: string | number }[]; planned: Record<string, string[]> },
  ) =>
    withFallback<CheckResult>(`/api/programs/${encodeURIComponent(id)}/check`, () => mockCheckProgram(id, req), {
      method: "POST",
      body: JSON.stringify(req),
    }),
};
