// API client following the REST contract in ARCHITECTURE.md.
// Real data only by default: when the API is unreachable the call fails (pages show an error and the
// app shell shows a connection notice). Mock data from src/mocks/ is used ONLY when NEXT_PUBLIC_USE_MOCKS=true
// (dev/demo/tests); then results carry `mock: true` so pages show the "Dữ liệu mẫu" label.
import type { ExchangeStatList } from "./exchangeStats";
import type {
  AskResponse,
  AskScope,
  AuthMeResponse,
  AuthProvidersResponse,
  Backlink,
  CheckResult,
  ClassSection,
  CommentLikeResponse,
  CommentReportResponse,
  ElectiveGroup,
  LecturerReviewList,
  PostLecturerReviewPayload,
  RegulationGraph,
  RegulationMarkdown,
  CompareResponse,
  EquivalentItem,
  FeedbackPayload,
  FreeDayDisplay,
  ModuleDetail,
  ModuleAskResponse,
  ModuleSummary,
  ModuleFacets,
  FacetCount,
  ModuleComment,
  ModuleCommentListResponse,
  ModuleTreeNode,
  Paged,
  ProgramDetail,
  ProgramGraph,
  ProgramSummary,
  RegulationDoc,
  RegulationDocDetail,
  SatisfactionStatus,
  Semester,
  ValidProgramGroup,
  Venue,
} from "./types";
import { LANG_STORAGE_KEY, translate, type Lang } from "@/i18n";
import { stripFrontmatter } from "./vault";
import { appliesToCohort, effectiveBadge, normalizeArticles } from "./regulations";
import { matches } from "./text";
import { venuesFromSections, filterVenues } from "./venues";
import { parseSchedules } from "./schedule";
import { connectionErrorMessage, isConnectionError, useDataSource } from "./dataSource";
import { enqueueRequest } from "./offlineQueue";
import type { AcademicHoliday } from "./holidays";
import type { ChatContext } from "./chatContext";

const loadModuleMocks = () => {
  if (process.env.NODE_ENV === "test" || process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    return import("@/mocks/modules");
  }
  throw new Error("Mock data is disabled in this build");
};

const loadRegulationMocks = () => {
  if (process.env.NODE_ENV === "test" || process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    return import("@/mocks/regulations");
  }
  throw new Error("Mock data is disabled in this build");
};

const loadProgramMocks = () => {
  if (process.env.NODE_ENV === "test" || process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    return import("@/mocks/programs");
  }
  throw new Error("Mock data is disabled in this build");
};

const loadAdminMocks = () => {
  if (process.env.NODE_ENV === "test" || process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
    return import("@/mocks/admin");
  }
  throw new Error("Mock data is disabled in this build");
};

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

function interfaceLang(): Lang {
  if (typeof window === "undefined") return "vi";
  try {
    const saved = JSON.parse(localStorage.getItem(LANG_STORAGE_KEY) || "null") as { state?: { lang?: Lang } } | null;
    return saved?.state?.lang === "en" ? "en" : "vi";
  } catch {
    return "vi";
  }
}
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";

/** Tạm tắt nút đăng nhập Facebook (app Facebook đang không hoạt động). Đặt true để bật lại. */
export const FACEBOOK_LOGIN_ENABLED = false;

/** Link đăng nhập OAuth kèm đường dẫn quay về (vd trang + vị trí cuộn), để không mất chỗ sau khi đăng nhập. */
export function authLoginUrl(provider: "google" | "facebook", nextPath?: string): string {
  const params = new URLSearchParams();
  if (nextPath) params.set("next", nextPath);
  // Gửi gốc của trang hiện tại để API quay về đúng domain (vd uelpath.uelcourses.id.vn thay vì vercel).
  // API chỉ chấp nhận gốc nằm trong CORS_ORIGINS; gốc lạ bị bỏ qua và dùng cấu hình mặc định.
  if (typeof window !== "undefined") params.set("origin", window.location.origin);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return `${API_URL}/api/auth/${provider}/login${qs}`;
}

export interface ApiResult<T> {
  data: T;
  mock: boolean;
}

const TIMEOUT_MS = 4000;
const ASK_TIMEOUT_MS = 65_000;
const RETRY_AFTER_MS = 30_000;
let downSince = 0;
const API_CACHE_PREFIX = "uelcourses-api-cache-v1:";
const API_CACHE_INDEX_KEY = `${API_CACHE_PREFIX}index`;
const API_CACHE_MAX_CHARS = 1_400_000;
const API_CACHE_MAX_ENTRIES = 24;

function cachedGetKey(url: string) {
  return `${API_CACHE_PREFIX}${encodeURIComponent(url)}`;
}

function readCacheIndex(): { url: string; size: number }[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(API_CACHE_INDEX_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is { url: string; size: number } =>
      entry && typeof entry.url === "string" && typeof entry.size === "number",
    );
  } catch {
    return [];
  }
}

function readCachedGet<T>(url: string): { found: boolean; data?: T } {
  if (typeof window === "undefined") return { found: false };
  try {
    const stored = localStorage.getItem(cachedGetKey(url));
    if (stored === null) return { found: false };
    return { found: true, data: JSON.parse(stored) as T };
  } catch (error) {
    console.warn("Could not read cached API response", error);
    return { found: false };
  }
}

function writeCachedGet(url: string, data: unknown) {
  if (typeof window === "undefined") return;
  const key = cachedGetKey(url);
  const serialized = JSON.stringify(data);
  if (serialized.length > API_CACHE_MAX_CHARS) return;
  try {
    const entries = readCacheIndex().filter((entry) => entry.url !== url);
    let totalChars = entries.reduce((sum, entry) => sum + entry.size, serialized.length);
    while (
      entries.length >= API_CACHE_MAX_ENTRIES ||
      totalChars > API_CACHE_MAX_CHARS
    ) {
      const oldest = entries.shift();
      if (!oldest) break;
      totalChars -= oldest.size;
      localStorage.removeItem(cachedGetKey(oldest.url));
    }
    localStorage.setItem(key, serialized);
    entries.push({ url, size: serialized.length });
    localStorage.setItem(API_CACHE_INDEX_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn("Could not cache API response for offline use", error);
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class AuthApiError extends ApiError {
  constructor(
    status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(status, message);
    this.name = "AuthApiError";
  }
}

async function authFetch<T>(path: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<T> {
  if (typeof window !== "undefined" && !navigator.onLine) {
    markOffline(true);
    throw new AuthApiError(0, connectionErrorMessage());
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        ...(init?.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      let detail: unknown = null;
      try {
        const errJson = await res.json();
        detail = errJson?.detail;
        if (typeof detail === "string") {
          msg = detail;
        } else if (Array.isArray(detail) && detail[0]?.msg) {
          msg = detail.map((d: any) => d.msg).join(", ");
        }
      } catch {
        // Fallback to default message
      }
      throw new AuthApiError(res.status, msg, detail);
    }
    const data = (res.status === 204 ? undefined : await res.json()) as T;
    markOffline(false);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    markOffline(true);
    throw new AuthApiError(0, connectionErrorMessage());
  } finally {
    clearTimeout(timer);
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

async function raw<T>(path: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const url = `${API_URL}${path}`;
  const cacheable = (init?.method ?? "GET").toUpperCase() === "GET";
  if (typeof window !== "undefined" && !navigator.onLine) {
    clearTimeout(timer);
    markOffline(true);
    if (cacheable) {
      const cached = readCachedGet<T>(url);
      if (cached.found) return cached.data as T;
    }
    throw new ApiError(0, connectionErrorMessage());
  }
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { Accept: "application/json", ...(init?.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    });
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
    const data = (res.status === 204 ? undefined : await res.json()) as T;
    if (cacheable) writeCachedGet(url, data);
    markOffline(false);
    return data;
  } catch (error) {
    if (mocksEnabled() || (error instanceof ApiError && !isConnectionError(error))) throw error;
    markOffline(true);
    if (cacheable && (!(error instanceof ApiError) || isConnectionError(error))) {
      const cached = readCachedGet<T>(url);
      if (cached.found) return cached.data as T;
    }
    throw new ApiError(error instanceof ApiError ? error.status : 0, connectionErrorMessage());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call the API; on network failure / timeout / 5xx / 404 for whole endpoint
 * fall back to mock. 4xx other than 404 propagate (real validation errors).
 */
async function withFallback<T>(path: string, fallback: () => T | Promise<T>, init?: RequestInit, map?: (x: unknown) => T, timeoutMs?: number): Promise<ApiResult<T>> {
  if (process.env.NODE_ENV === "test" && mocksEnabled()) {
    markMock(true);
    return { data: await fallback(), mock: true };
  }
  if (!mocksEnabled()) {
    // Real data only: never substitute mock data; surface the failure to the page.
    const data = await raw<unknown>(path, init, timeoutMs);
    markMock(false);
    return { data: map ? map(data) : (data as T), mock: false };
  }
  if (typeof window === "undefined" || (process.env.NODE_ENV === "test" && mocksEnabled()) || Date.now() - downSince < RETRY_AFTER_MS) {
    markMock(true);
    return { data: await fallback(), mock: true };
  }
  try {
    const data = await raw<unknown>(path, init, timeoutMs);
    markMock(false);
    return { data: map ? map(data) : (data as T), mock: false };
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 404) throw e;
    if (!(e instanceof ApiError)) downSince = Date.now();
    markMock(true);
    return { data: await fallback(), mock: true };
  }
}

function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      if (k === "credits_in" || k === "type_in" || k === "final_assessment_in") {
        const joined = v.filter((x) => x !== "" && x != null).join(",");
        if (joined) p.set(k, joined);
      } else {
        for (const item of v) {
          if (item !== undefined && item !== null && item !== "") {
            p.append(k, String(item));
          }
        }
      }
    } else {
      p.set(k, String(v));
    }
  }
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
  faculty_in?: string[];
  department?: string;
  department_in?: string[];
  credits?: number | string;
  credits_in?: (number | string)[] | string;
  type?: string;
  type_in?: string[] | string;
  final_assessment_in?: string[] | string;
  /** "en" | "vi" */
  language?: string;
  is_english?: boolean;
  /** "true" | "false" */
  talent?: string;
  has_outline?: string;
  /** Học phần đã chọn/đã học (phân cách bằng dấu phẩy): xếp lên đầu danh sách */
  priority_codes?: string;
  /** Sau nhóm ưu tiên, xếp theo số SV trao đổi đã học (nhiều → ít) */
  exchange_rank?: boolean;
  degree?: string;
  /** CTĐT, vd "K23406" (khóa 23, ngành 406) */
  program_id?: string;
  /** Danh sách CTĐT, lặp tham số ?program_ids=... */
  program_ids?: string[];
  /** semester id, e.g. "2026-2027-1" */
  semester?: string;
  page?: number;
  size?: number;
};

/** Syllabus payload from GET /api/modules/{code}/outline (loosely typed: fields may be missing). */
export type OutlineData = {
  module_code?: string;
  outline_year?: number | null;
  outline_year_fallback?: boolean;
  document?: Record<string, unknown>;
  course?: Record<string, unknown>;
  objectives?: { code?: string; description?: string; clo_codes?: string[] }[];
  clos?: { code?: string; description?: string; teaching_levels?: string }[];
  assessments?: { component?: string; item_code?: string | null; item_name?: string | null; clo_codes?: string[]; criteria?: string; weight_pct?: number | null }[];
  schedule?: { week_label?: string; content?: string; clo_codes?: string[]; activities?: string; assessment?: string }[];
  materials?: { kind?: string; citation?: string }[];
  alternatives?: unknown[];
};

async function getMockProgramAllowedCodes(f: ModuleFilter): Promise<Set<string> | null> {
  const pids: string[] = [];
  if (f.program_id && f.program_id.trim()) pids.push(f.program_id.trim());
  if (f.program_ids) {
    for (const item of f.program_ids) {
      if (item && item.trim()) pids.push(item.trim());
    }
  }
  if (pids.length === 0) return null;
  const { mockProgram } = await loadProgramMocks();
  const codes = new Set<string>();
  for (const pid of pids) {
    const p = mockProgram(pid);
    if (p && p.blocks) {
      for (const b of p.blocks) {
        for (const m of b.modules) {
          codes.add(m.code);
        }
      }
    }
  }
  return codes;
}

function matchesModuleQuery(module: ModuleSummary, query: string | undefined): boolean {
  const text = `${module.code} ${module.name} ${module.name_en ?? ""} ${module.faculty ?? ""} ${module.department ?? ""}`;
  return (query ?? "").trim().split(/\s+/).every((token) => matches(text, token));
}

export const api = {
  async freeDayDisplay(from: string, to: string, cohort?: string): Promise<ApiResult<FreeDayDisplay>> {
    const query = new URLSearchParams({ from, to });
    if (cohort) query.set("cohort", cohort);
    return { data: await raw<FreeDayDisplay>(`/api/calendar/free-day-display?${query}`), mock: false };
  },
  async academicHolidays(academicYear: string, cohort?: string): Promise<ApiResult<AcademicHoliday[]>> {
    const query = new URLSearchParams({ academic_year: academicYear, kind: "holiday" });
    if (cohort) query.set("cohort", cohort);
    if (process.env.NODE_ENV === "test" && mocksEnabled()) return { data: [], mock: true };
    return { data: await raw<AcademicHoliday[]>(`/api/calendar?${query}`), mock: false };
  },
  moduleFacets: (f: ModuleFilter = {}) =>
    withFallback<ModuleFacets>(`/api/module-facets${qs(f as Record<string, unknown>)}`, async () => {
      const [{ mockModules }, allowedCodes] = await Promise.all([
        loadModuleMocks(),
        getMockProgramAllowedCodes(f),
      ]);

      const creditsSet = new Set<number>();
      if (f.credits !== undefined && f.credits !== "") creditsSet.add(Number(f.credits));
      if (f.credits_in) {
        const parts = Array.isArray(f.credits_in) ? f.credits_in : String(f.credits_in).split(",");
        for (const p of parts) {
          const s = String(p).trim();
          if (s) creditsSet.add(Number(s));
        }
      }

      const typeSet = new Set<string>();
      if (f.type) typeSet.add(f.type.trim().toLowerCase());
      if (f.type_in) {
        const parts = Array.isArray(f.type_in) ? f.type_in : String(f.type_in).split(",");
        for (const p of parts) {
          const s = String(p).trim().toLowerCase();
          if (s) typeSet.add(s);
        }
      }

      const facultySet = new Set<string>();
      if (f.faculty) facultySet.add(f.faculty.trim().toLowerCase());
      if (f.faculty_in) {
        for (const fac of f.faculty_in) {
          const s = fac.trim().toLowerCase();
          if (s) facultySet.add(s);
        }
      }

      const departmentSet = new Set<string>();
      if (f.department) departmentSet.add(f.department.trim().toLowerCase());
      if (f.department_in) {
        for (const dept of f.department_in) {
          const s = dept.trim().toLowerCase();
          if (s) departmentSet.add(s);
        }
      }

      const degree = f.degree || "dai_hoc";
      const matchBase = (m: ModuleSummary) =>
        (degree === "all" || (m.degree || "dai_hoc") === degree) &&
        matchesModuleQuery(m, f.q) &&
        (!allowedCodes || allowedCodes.has(m.code)) &&
        (m.credits !== 0);

      const matchGroup = (m: ModuleSummary, group: string) => {
        if (group === "language") {
          return (!f.is_english || !!m.is_english) && (!f.language || (f.language === "en") === !!m.is_english);
        }
        if (group === "credits") {
          return creditsSet.size === 0 || creditsSet.has(m.credits);
        }
        if (group === "faculty") {
          return (
            facultySet.size === 0 ||
            (m.faculty && facultySet.has(m.faculty.toLowerCase())) ||
            (!f.department_in && m.department && facultySet.has(m.department.toLowerCase()))
          );
        }
        if (group === "department") {
          return departmentSet.size === 0 || (m.department && departmentSet.has(m.department.toLowerCase()));
        }
        if (group === "type") {
          return typeSet.size === 0 || (m.type && typeSet.has(m.type.toLowerCase()));
        }
        if (group === "semester") {
          return (
            !f.semester ||
            (m.offering_plan ?? []).some((p) => p.terms.some((term) => `${p.academic_year}-${term}` === f.semester))
          );
        }
        if (group === "has_outline") {
          return !f.has_outline || (f.has_outline === "true" ? !!m.has_outline : !m.has_outline);
        }
        return true;
      };

      const filterExcept = (ignoreGroup: string) => {
        const groups = ["language", "credits", "faculty", "department", "type", "semester", "has_outline"];
        return mockModules.filter((m) => {
          if (!matchBase(m)) return false;
          for (const g of groups) {
            if (g !== ignoreGroup && !matchGroup(m, g)) return false;
          }
          return true;
        });
      };

      const counts = (list: ModuleSummary[], vals: (m: ModuleSummary) => string[]): FacetCount[] => {
        const map = new Map<string, number>();
        for (const m of list) {
          for (const v of vals(m)) {
            if (v && v.trim()) map.set(v, (map.get(v) ?? 0) + 1);
          }
        }
        return [...map.entries()]
          .map(([value, count]) => ({ value, count }))
          .filter((x) => x.count > 0);
      };

      const allFiltered = mockModules.filter((m) => {
        if (!matchBase(m)) return false;
        return (
          matchGroup(m, "language") &&
          matchGroup(m, "credits") &&
          matchGroup(m, "faculty") &&
          matchGroup(m, "department") &&
          matchGroup(m, "type") &&
          matchGroup(m, "semester") &&
          matchGroup(m, "has_outline")
        );
      });

      return {
        total: allFiltered.length,
        language: counts(filterExcept("language"), (m) => [m.is_english ? "en" : "vi"]),
        talent: [],
        credits: counts(filterExcept("credits"), (m) => [String(m.credits)]).sort(
          (a, b) => Number(a.value) - Number(b.value),
        ),
        faculty: counts(filterExcept("faculty"), (m) => [m.faculty ?? ""]).sort((a, b) => b.count - a.count),
        department: counts(filterExcept("department"), (m) => [m.department ?? ""]).sort((a, b) => b.count - a.count),
        type: counts(filterExcept("type"), (m) => [m.type ?? ""]).sort((a, b) => b.count - a.count),
        semester: counts(filterExcept("semester"), (m) =>
          (m.offering_plan ?? []).flatMap((p) => p.terms.map((t) => `${p.academic_year}-${t}`)),
        ),
        has_outline: counts(filterExcept("has_outline"), (m) => [m.has_outline ? "true" : "false"]),
        final_assessment: [],
      };
    }),  health: () => withFallback<{ status: string }>("/api/health", () => ({ status: "mock" })),

  semesters: () =>
    withFallback<Semester[]>("/api/semesters", async () => (await loadModuleMocks()).mockSemesters),

  modules: (f: ModuleFilter = {}) =>
    withFallback<Paged<ModuleSummary>>(`/api/modules${qs(f as Record<string, unknown>)}`, async () => {
      const [{ mockModules }, allowedCodes] = await Promise.all([
        loadModuleMocks(),
        getMockProgramAllowedCodes(f),
      ]);

      const creditsSet = new Set<number>();
      if (f.credits !== undefined && f.credits !== "") creditsSet.add(Number(f.credits));
      if (f.credits_in) {
        const parts = Array.isArray(f.credits_in) ? f.credits_in : String(f.credits_in).split(",");
        for (const p of parts) {
          const s = String(p).trim();
          if (s) creditsSet.add(Number(s));
        }
      }

      const typeSet = new Set<string>();
      if (f.type) typeSet.add(f.type.trim().toLowerCase());
      if (f.type_in) {
        const parts = Array.isArray(f.type_in) ? f.type_in : String(f.type_in).split(",");
        for (const p of parts) {
          const s = String(p).trim().toLowerCase();
          if (s) typeSet.add(s);
        }
      }

      const facultySet = new Set<string>();
      if (f.faculty) facultySet.add(f.faculty.trim().toLowerCase());
      if (f.faculty_in) {
        for (const fac of f.faculty_in) {
          const s = fac.trim().toLowerCase();
          if (s) facultySet.add(s);
        }
      }

      const departmentSet = new Set<string>();
      if (f.department) departmentSet.add(f.department.trim().toLowerCase());
      if (f.department_in) {
        for (const dept of f.department_in) {
          const s = dept.trim().toLowerCase();
          if (s) departmentSet.add(s);
        }
      }

      const targetDegree = f.degree || "dai_hoc";
      const items = mockModules.filter(
        (m) =>
          (targetDegree === "all" || (m.degree || "dai_hoc") === targetDegree) &&
          (!allowedCodes || allowedCodes.has(m.code)) &&
          matchesModuleQuery(m, f.q) &&
          (!f.is_english || !!m.is_english) &&
          (!f.language || (f.language === "en") === !!m.is_english) &&
          (!f.has_outline || (f.has_outline === "true" ? !!m.has_outline : !m.has_outline)) &&
          (!f.semester || (m.offering_plan ?? []).some((p) => p.terms.some((term) => `${p.academic_year}-${term}` === f.semester))) &&
          (departmentSet.size === 0 || (m.department && departmentSet.has(m.department.toLowerCase()))) &&
          (facultySet.size === 0 ||
            (m.faculty && facultySet.has(m.faculty.toLowerCase())) ||
            (!f.department_in && m.department && facultySet.has(m.department.toLowerCase()))) &&
          (creditsSet.size === 0 || creditsSet.has(m.credits)) &&
          (typeSet.size === 0 || (m.type && typeSet.has(m.type.toLowerCase()))),
      );
      const size = f.size ?? 50;
      const page = f.page ?? 1;
      return { items: items.slice((page - 1) * size, page * size), total: items.length };
    }),

  /** 404 (no syllabus yet) or any error -> null, never marks the app as sample data. */
  outline: async (code: string, options?: { program_id?: string; cohort?: string; ctdt_year?: number }): Promise<OutlineData | null> => {
    try {
      const q = options ? qs(options as Record<string, unknown>) : "";
      return await raw<OutlineData>(`/api/modules/${encodeURIComponent(code)}/outline${q}`);
    } catch {
      return null;
    }
  },

  module: (code: string, options?: { program_id?: string; cohort?: string; ctdt_year?: number }) => {
    const q = options ? qs(options as Record<string, unknown>) : "";
    return withFallback<ModuleDetail | null>(
      `/api/modules/${encodeURIComponent(code)}${q}`,
      async () => (await loadModuleMocks()).mockModules.find((m) => m.code === code) ?? null,
    );
  },

  classes: (code: string, semester?: string) =>
    withFallback<ClassSection[]>(
      `/api/modules/${encodeURIComponent(code)}/classes${qs({ semester })}`,
      async () => (await loadModuleMocks()).mockSections(semester ?? "").filter((s) => s.module_code === code),
      undefined,
      (x) => (Array.isArray(x) ? x.map(normalizeSection) : []),
    ),

  /** Số SV trao đổi đã học các học phần (công khai, tổng hợp). Mã không có dữ liệu thì không có trong items. */
  exchangeStats: (codes: string[]) =>
    withFallback<ExchangeStatList>(
      `/api/exchange-stats${qs({ codes: codes.join(",") })}`,
      async () => ({ items: [] }),
    ),

  equivalents: (q?: string) =>
    withFallback<EquivalentItem[]>(`/api/equivalents${qs({ q })}`, async () =>
      (await loadModuleMocks()).mockEquivalents.filter(
        (e) => !q || [e, ...e.equivalents].some((x) => matches(x.code, q) || matches(x.name, q)),
      ),
    ),

  equivalent: (code: string) =>
    withFallback<EquivalentItem | null>(`/api/equivalents/${encodeURIComponent(code)}`, async () =>
      (await loadModuleMocks()).mockEquivalents.find((e) => e.code === code) ?? null,
    ),

  venues: (q?: string, semester?: string) =>
    withFallback<Venue[]>(`/api/venues${qs({ q, semester })}`, async () =>
      filterVenues(venuesFromSections((await loadModuleMocks()).mockSections(semester ?? "")), q ?? ""),
    ),

  feedback: async (payload: FeedbackPayload): Promise<ApiResult<{ ok: boolean }>> => {
    try {
      await raw("/api/feedback", {
        method: "POST",
        body: JSON.stringify(payload),
        ...(payload.quick_rating ? { credentials: "include" as const } : {}),
      });
      return { data: { ok: true }, mock: false };
    } catch (e) {
      if (e instanceof ApiError && !isConnectionError(e)) throw e;
      enqueueRequest(`${API_URL}/api/feedback`, {
        method: "POST",
        body: JSON.stringify(payload),
        credentials: payload.quick_rating ? "include" : "same-origin",
      });
      return { data: { ok: true }, mock: true };
    }
  },

  feedbackSatisfactionStatus: () =>
    withFallback<SatisfactionStatus>(
      "/api/feedback/satisfaction-status",
      () => ({ already_rated: false }),
      { credentials: "include" },
    ),

  regulations: (f: { cohort?: string; status?: string; q?: string } = {}) =>
    withFallback<RegulationDoc[]>(`/api/regulations${qs(f)}`, async () => {
      const { mockRegulationDocs, stripArticles } = await loadRegulationMocks();
      return mockRegulationDocs()
        .filter((d) => appliesToCohort(d, f.cohort) && (!f.status || d.status === f.status) && (!f.q || matches(`${d.title} ${d.decision_no}`, f.q)))
        .map(stripArticles);
    }),

  regulation: (docId: string) =>
    withFallback<RegulationDocDetail | null>(
      `/api/regulations/${encodeURIComponent(docId)}`,
      async () => (await loadRegulationMocks()).mockRegulationDocs().find((d) => d.doc_id === docId) ?? null,
      undefined,
      (x) => (x ? { ...(x as RegulationDocDetail), articles: normalizeArticles((x as RegulationDocDetail).articles) } : null),
    ),

  // Single answer mode: the server answers with verbatim quotes (LLM-checked when available).
  // `docIds`: documents the student tagged with "/" (answer only from them, in more detail); `lang`: UI language.
  ask: (question: string, cohort?: string, context?: ChatContext,
    options?: { docIds?: string[]; lang?: Lang; previous?: string[] }) =>
    withFallback<AskResponse>(
      "/api/regulations/ask",
      async () => (await loadRegulationMocks()).mockAsk(question, cohort),
      { method: "POST", body: JSON.stringify({
        question, cohort, context,
        ...(options?.docIds?.length ? { doc_ids: options.docIds } : {}),
        ...(options?.lang ? { lang: options.lang } : {}),
        ...(options?.previous?.length ? { previous: options.previous } : {}),
      }) },
      undefined,
      ASK_TIMEOUT_MS,
    ),

  askSources: (scope: AskScope, question: string, cohort: string | undefined, language: Lang) =>
    raw<AskResponse | ModuleAskResponse>(`/api/${scope}/ask`, {
      method: "POST",
      body: JSON.stringify({ question, cohort, language }),
    }, ASK_TIMEOUT_MS),

  rateAnswer: async (scope: AskScope, answer_id: string, helpful: boolean) => {
    const path = "/api/ask/feedback";
    const request = { method: "POST", body: JSON.stringify({ scope, answer_id, helpful }) };
    try {
      await raw<void>(path, request);
    } catch (error) {
      if (error instanceof ApiError && !isConnectionError(error)) throw error;
      enqueueRequest(`${API_URL}${path}`, request);
    }
  },

  compare: (topic: string, cohorts: string[]) =>
    withFallback<CompareResponse>("/api/regulations/compare", async () =>
      (await loadRegulationMocks()).mockCompare(topic, cohorts), {
      method: "POST",
      body: JSON.stringify({ topic, cohorts }),
    }),

  markdown: (docId: string) =>
    withFallback<RegulationMarkdown | null>(`/api/regulations/${encodeURIComponent(docId)}/markdown`, async () =>
      (await loadRegulationMocks()).mockMarkdown(docId), undefined, (x) =>
      x ? { ...(x as RegulationMarkdown), markdown: stripFrontmatter(String((x as RegulationMarkdown).markdown ?? "")) } : null,
    ),

  backlinks: (docId: string) =>
    withFallback<Backlink[]>(`/api/regulations/${encodeURIComponent(docId)}/backlinks`, async () =>
      (await loadRegulationMocks()).mockBacklinks(docId),
    ),

  graph: (cohort?: string) =>
    withFallback<RegulationGraph>(`/api/regulations/graph${qs({ cohort })}`, async () =>
      (await loadRegulationMocks()).mockGraph(cohort),
    ),

  resolve: (ref: string) =>
    withFallback<{ doc_id: string; anchor: string } | null>(`/api/regulations/resolve${qs({ ref })}`, async () =>
      (await loadRegulationMocks()).mockResolve(ref),
    ),

  expiring: (withinDays = 90) =>
    withFallback<RegulationDoc[]>(`/api/regulations/expiring${qs({ within_days: withinDays })}`, async () => {
      const { mockRegulationDocs, stripArticles } = await loadRegulationMocks();
      return mockRegulationDocs()
        .filter((d) => ["expiring"].includes(effectiveBadge(d, new Date(), withinDays)))
        .map(stripArticles);
    }),

  programs: (f: { cohort?: string; q?: string; degree?: string } = {}) =>
    withFallback<ProgramSummary[]>(`/api/programs${qs(f)}`, async () =>
      (await loadProgramMocks()).mockPrograms(f),
    ),

  validGroups: () =>
    withFallback<ValidProgramGroup[]>("/api/programs/valid-groups", async () =>
      (await loadProgramMocks()).mockValidProgramGroups(),
    ),

  program: (id: string) =>
    withFallback<ProgramDetail | null>(`/api/programs/${encodeURIComponent(id)}`, async () => {
      const { mockProgram } = await loadProgramMocks();
      const direct = mockProgram(id);
      if (direct) return direct;
      if (id.endsWith("E")) {
        const base = mockProgram(id.slice(0, -1));
        if (base) {
          return {
            ...base,
            program: {
              ...base.program,
              program_id: id,
              name: translate(interfaceLang(), "api.mockEnglishTrack", { name: base.program.name }),
            },
          };
        }
      }
      return null;
    }),

  electiveGroups: (id: string, track?: string) =>
    withFallback<ElectiveGroup[]>(
      `/api/programs/${encodeURIComponent(id)}/elective-groups${qs({ track })}`,
      async () => (await loadProgramMocks()).mockElectiveGroups(id),
    ),

  programGraph: (id: string) =>
    withFallback<ProgramGraph | null>(`/api/programs/${encodeURIComponent(id)}/graph`, async () => {
      const { mockProgramGraph } = await loadProgramMocks();
      const direct = mockProgramGraph(id);
      if (direct) return direct;
      if (id.endsWith("E")) {
        return mockProgramGraph(id.slice(0, -1));
      }
      return null;
    }),

  moduleTree: (code: string, options?: { program_id?: string; direction?: "prereq" | "unlocks"; depth?: number }) =>
    withFallback<ModuleTreeNode | null>(
      `/api/modules/${encodeURIComponent(code)}/tree${qs(options ?? {})}`,
      async () => {
        const { mockModuleTree } = await loadProgramMocks();
        const pid = options?.program_id;
        const basePid = pid && pid.endsWith("E") ? pid.slice(0, -1) : pid;
        return mockModuleTree(code, basePid ? { ...options, program_id: basePid } : options);
      },
    ),

  checkProgram: (
    id: string,
    req: { completed: { code: string; grade?: string | number }[]; planned: Record<string, string[]> },
  ) =>
    withFallback<CheckResult>(`/api/programs/${encodeURIComponent(id)}/check`, async () => {
      const { mockCheckProgram, mockProgram } = await loadProgramMocks();
      const p = mockProgram(id) ?? (id.endsWith("E") ? mockProgram(id.slice(0, -1)) : null);
      if (!p) {
        return {
          eligible_now: [],
          blocked: [],
          warnings: [translate(interfaceLang(), "api.programCheckNotFound")],
          rule_refs: [],
        };
      }
      return mockCheckProgram(p.program.program_id, req);
    }, {
      method: "POST",
      body: JSON.stringify(req),
    }),

  moduleComments: (code: string, page = 1, size = 20) =>
    withFallback<ModuleCommentListResponse>(
      `/api/modules/${encodeURIComponent(code)}/comments${qs({ page, size })}`,
      async () => {
        const { mockModuleComments } = await loadAdminMocks();
        const list = mockModuleComments[code] || [];
        const approved = list.filter((c) => c.status === "approved");
        const total = approved.length;
        const avg =
          total > 0
            ? Number(
                (
                  approved.reduce((s, c) => s + (c.rating || 0), 0) /
                  (approved.filter((c) => c.rating).length || 1)
                ).toFixed(1)
              )
            : null;
        return {
          items: approved.slice((page - 1) * size, page * size),
          total,
          page,
          size,
          average_rating: avg,
        };
      }
    ),

  postModuleComment: async (
    code: string,
    payload: { body: string; rating?: number; anon_id?: string; semester?: string }
  ) => {
    const path = `/api/modules/${encodeURIComponent(code)}/comments`;
    const request: RequestInit = {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
    try {
      return await raw<ModuleComment>(path, request);
    } catch (error) {
      if (error instanceof ApiError && !isConnectionError(error)) throw error;
      enqueueRequest(`${API_URL}${path}`, request);
      return { queued: true as const };
    }
  },

  /** Thích / bỏ thích một bình luận (không cần đăng nhập, chống thích trùng bằng anon_id). */
  likeModuleComment: async (code: string, commentId: number, anonId: string, currentlyLiked: boolean) => {
    const path = `/api/modules/${encodeURIComponent(code)}/comments/${commentId}/like`;
    const request = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anon_id: anonId }),
    };
    try {
      return await raw<CommentLikeResponse>(path, request);
    } catch (error) {
      if (error instanceof ApiError && !isConnectionError(error)) throw error;
      enqueueRequest(`${API_URL}${path}`, request);
      return { liked: !currentlyLiked, queued: true as const };
    }
  },

  /** Báo cáo một bình luận vi phạm — không cần đăng nhập, chỉ cần nêu lý do. */
  reportModuleComment: async (code: string, commentId: number, reason: string) => {
    const path = `/api/modules/${encodeURIComponent(code)}/comments/${commentId}/report`;
    const request = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    };
    try {
      return await raw<CommentReportResponse>(path, request);
    } catch (error) {
      if (error instanceof ApiError && !isConnectionError(error)) throw error;
      enqueueRequest(`${API_URL}${path}`, request);
      return { ok: true, queued: true as const };
    }
  },

  authProviders: () => authFetch<AuthProvidersResponse>("/api/auth/providers"),

  authMe: () => authFetch<AuthMeResponse>("/api/auth/me"),

  authLogout: () => authFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  /** Đặt biệt danh công khai; chuỗi rỗng hoặc null = quay về ẩn danh. */
  authSetNickname: (nickname: string | null) =>
    authFetch<{ nickname: string | null; public_name: string }>("/api/auth/nickname", {
      method: "PUT",
      body: JSON.stringify({ nickname }),
    }),

  reviewGuidelines: () => authFetch<{ items: string[] }>("/api/reviews/guidelines"),

  moduleReviews: (code: string, page = 1, size = 20) =>
    authFetch<LecturerReviewList>(`/api/modules/${encodeURIComponent(code)}/reviews${qs({ page, size })}`),

  postModuleReview: async (code: string, payload: PostLecturerReviewPayload, expectedUserId?: number) => {
    const path = `/api/modules/${encodeURIComponent(code)}/reviews`;
    const request = { method: "POST", body: JSON.stringify(payload) };
    try {
      return await authFetch<{ id: number; status: string; message: string }>(path, request);
    } catch (error) {
      if (!(error instanceof ApiError) || !isConnectionError(error)) throw error;
      enqueueRequest(`${API_URL}${path}`, { ...request, credentials: "include" }, expectedUserId);
      return { queued: true as const };
    }
  },
};
