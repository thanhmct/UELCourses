import { API_URL } from "./api";
import { connectionErrorMessage, useDataSource } from "./dataSource";
import type {
  AdminAcademicEvent,
  AdminFeedbackDetail,
  AdminFeedbackSummaryResponse,
  AdminOverview,
  AdminPasswordResetResponse,
  AdminRole,
  AdminSettingsData,
  AdminSystemInfo,
  AdminUser,
  AdminUserItem,
  AuditLogItem,
  AuditLogResponse,
  BanListResponse,
  BannedTerm,
  BulkModerationRequest,
  CalendarEventsResponse,
  CalendarImportDryRunResult,
  CreateAdminUserResponse,
  FacultiesResponse,
  FacultyReviewResponse,
  ModerationQueueItem,
  ModerationQueueResponse,
  OutlineCoverageResponse,
  OutlineDriveLinkResponse,
  OutlineMissingResponse,
  OutlineOcrPendingResponse,
  SemesterAdminItem,
  TrendClassItem,
  TrendConflictData,
  TrendModuleItem,
  TrendPairItem,
  TrendSearchItem,
  TrendChatTopic,
  TrendSlotItem,
} from "./types";
import {
  mockAdminOverview,
  mockAdminSemesters,
  mockAdminSettings,
  mockAdminUser,
  mockAdminUsers,
  mockAuditLogs,
  mockBannedTerms,
  mockCalendarEvents,
  mockCalendarKinds,
  mockCalendarYears,
  mockFaculties,
  mockFacultyReview,
  mockModerationQueue,
  mockOutlinesCoverage,
  mockOutlinesDriveLinks,
  mockOutlinesMissing,
  mockOutlinesOcrPending,
  mockSystemInfo,
  mockTrendClasses,
  mockTrendConflicts,
  mockTrendModules,
  mockTrendPairs,
  mockTrendSearches,
  mockTrendSlots,
} from "@/mocks/admin";

export class AdminApiError extends Error {
  status: number;
  data?: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.data = data;
  }
}

type AdminRequestOptions = RequestInit & { reportConnection?: boolean };

async function adminFetch(url: string, options: RequestInit, reportConnection = true): Promise<Response> {
  const isMock = process.env.NEXT_PUBLIC_USE_MOCKS === "true";
  let response: Response;
  try {
    response = await fetch(url, { ...options, credentials: "include" });
  } catch (error) {
    if (isMock || options.signal?.aborted) throw error;
    if (reportConnection) useDataSource.getState().setOffline(true);
    throw new AdminApiError(connectionErrorMessage(), 0);
  }
  if (!isMock && response.status >= 500) {
    if (reportConnection) useDataSource.getState().setOffline(true);
    throw new AdminApiError(connectionErrorMessage(), response.status);
  }
  if (reportConnection && response.ok) useDataSource.getState().setOffline(false);
  return response;
}

let memoryCsrfToken: string | null = null;
let currentMockUser: AdminUser | null = mockAdminUser;

export const adminApi = {
  setCsrfToken(token: string | null) {
    memoryCsrfToken = token;
  },
  getCsrfToken() {
    return memoryCsrfToken;
  },
  setMockUser(user: AdminUser | null) {
    currentMockUser = user;
  },

  async request<T>(path: string, { reportConnection, ...options }: AdminRequestOptions = {}): Promise<T> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    const url = `${API_URL}${path}`;
    const headers = new Headers(options.headers || {});

    // Tự động gắn X-CSRF-Token cho các thao tác ghi (POST, PUT, PATCH, DELETE)
    const method = (options.method || "GET").toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      if (memoryCsrfToken) {
        headers.set("X-CSRF-Token", memoryCsrfToken);
      }
    }

    try {
      const res = await adminFetch(url, { ...options, headers }, reportConnection);

      if (!res.ok) {
        let errData: any = null;
        try {
          errData = await res.json();
        } catch {
          errData = null;
        }

        throw new AdminApiError(
          errData?.detail || `Admin request failed with status ${res.status}`,
          res.status,
          errData
        );
      }

      // Nhận và lưu CSRF token mới từ header nếu có
      const newCsrf = res.headers.get("X-CSRF-Token");
      if (newCsrf) {
        memoryCsrfToken = newCsrf;
      }

      return (await res.json()) as T;
    } catch (err: any) {
      if (isMock) {
        if (path === "/api/admin/overview") {
          return mockAdminOverview as unknown as T;
        }
        if (path === "/api/admin/me") {
          if (!currentMockUser) {
            throw new AdminApiError("Unauthorized", 401);
          }
          return currentMockUser as unknown as T;
        }
        if (path.startsWith("/api/admin/trends/modules")) {
          return { modules: mockTrendModules } as unknown as T;
        }
        if (path.startsWith("/api/admin/trends/pairs")) {
          return { pairs: mockTrendPairs } as unknown as T;
        }
        if (path.startsWith("/api/admin/trends/slots")) {
          return { slots: mockTrendSlots } as unknown as T;
        }
        if (path.startsWith("/api/admin/trends/conflicts")) {
          return mockTrendConflicts as unknown as T;
        }
        if (path.startsWith("/api/admin/trends/search")) {
          return { searches: mockTrendSearches } as unknown as T;
        }
        if (path.startsWith("/api/admin/trends/classes")) {
          return { classes: mockTrendClasses } as unknown as T;
        }
        if (path.startsWith("/api/admin/moderation/queue")) {
          return {
            items: mockModerationQueue,
            total: mockModerationQueue.length,
            page: 1,
            size: 20,
            counts: {
              all: mockModerationQueue.filter((x) => x.status === "pending").length,
              feedback: mockModerationQueue.filter((x) => x.type === "feedback" && x.status === "pending").length,
              comment: mockModerationQueue.filter((x) => x.type === "comment" && x.status === "pending").length,
              book: 0,
            },
          } as unknown as T;
        }
        if (path.startsWith("/api/admin/banned-terms")) {
          return mockBannedTerms as unknown as T;
        }
        if (path.startsWith("/api/admin/calendar/events")) {
          return {
            items: mockCalendarEvents,
            total: mockCalendarEvents.length,
            page: 1,
            size: 50,
            years: mockCalendarYears,
            kinds: mockCalendarKinds,
          } as unknown as T;
        }
        if (path.startsWith("/api/admin/calendar/import")) {
          return {
            status: "ok",
            dry_run: path.includes("dry_run=true"),
            success: true,
            total_incoming: mockCalendarEvents.length,
            to_add: mockCalendarEvents.length,
            to_update: 0,
            to_delete: 0,
            sample_incoming: mockCalendarEvents.slice(0, 5),
            diff_summary: {
              years: mockCalendarYears,
              sources: ["TB 223/TB-ĐHKTL-ĐT"],
            },
          } as unknown as T;
        }
        if (path.startsWith("/api/admin/semesters")) {
          return mockAdminSemesters as unknown as T;
        }
        if (path.startsWith("/api/admin/system")) {
          return mockSystemInfo as unknown as T;
        }
        if (path.startsWith("/api/admin/audit-log")) {
          return {
            items: mockAuditLogs,
            total: mockAuditLogs.length,
            page: 1,
            page_size: 50,
            total_pages: 1,
          } as unknown as T;
        }
        if (path.startsWith("/api/admin/users")) {
          return mockAdminUsers as unknown as T;
        }
        if (path.startsWith("/api/admin/settings")) {
          return mockAdminSettings as unknown as T;
        }
      }
      throw err;
    }
  },

  async getOverview(): Promise<AdminOverview> {
    return this.request<AdminOverview>("/api/admin/overview");
  },

  async getMe(options?: Pick<AdminRequestOptions, "reportConnection">): Promise<AdminUser> {
    return this.request<AdminUser>("/api/admin/me", options);
  },

  async login(payload: { email: string; password: string }): Promise<{ user: AdminUser; csrf_token?: string }> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      if (!payload.email || !payload.password) {
        throw new AdminApiError("Email và mật khẩu không được để trống", 400);
      }
      if (payload.password === "wrongpassword") {
        throw new AdminApiError("Email hoặc mật khẩu không chính xác", 401);
      }
      currentMockUser = mockAdminUser;
      return { user: mockAdminUser, csrf_token: "mock-csrf-token" };
    }

    const res = await this.request<{ user: AdminUser; csrf_token?: string }>("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.csrf_token) {
      this.setCsrfToken(res.csrf_token);
    }
    return res;
  },

  async logout(): Promise<void> {
    currentMockUser = null;
    this.setCsrfToken(null);
    try {
      await this.request<void>("/api/admin/logout", { method: "POST" });
    } catch {
      // Bỏ qua lỗi khi logout
    }
  },

  async checkAdminAvailability(): Promise<boolean> {
    try {
      await this.getMe({ reportConnection: false });
      return true;
    } catch {
      return false;
    }
  },

  // ---------- Trends API (Brief A2) ----------
  buildQueryString(params: Record<string, string | number | boolean | undefined | null>): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        q.set(k, String(v));
      }
    }
    const str = q.toString();
    return str ? `?${str}` : "";
  },

  getExportCsvUrl(endpoint: string, params: Record<string, string | number | boolean | undefined | null> = {}): string {
    const qs = this.buildQueryString({ ...params, format: "csv" });
    return `${API_URL}/api/admin/trends/${endpoint}${qs}`;
  },

  async getTrendsModules(params: {
    semester?: string;
    program?: string;
    from?: string;
    to?: string;
    range?: number;
  } = {}): Promise<{ modules: TrendModuleItem[] }> {
    const qs = this.buildQueryString(params);
    return this.request<{ modules: TrendModuleItem[] }>(`/api/admin/trends/modules${qs}`);
  },

  async getTrendsPairs(params: {
    semester?: string;
    module?: string;
    limit?: number;
  } = {}): Promise<{ pairs: TrendPairItem[] }> {
    const qs = this.buildQueryString(params);
    return this.request<{ pairs: TrendPairItem[] }>(`/api/admin/trends/pairs${qs}`);
  },

  async getTrendsSlots(params: {
    semester?: string;
    program?: string;
    from?: string;
    to?: string;
  } = {}): Promise<{ slots: TrendSlotItem[] }> {
    const qs = this.buildQueryString(params);
    return this.request<{ slots: TrendSlotItem[] }>(`/api/admin/trends/slots${qs}`);
  },

  async getTrendsConflicts(params: { semester?: string } = {}): Promise<TrendConflictData> {
    const qs = this.buildQueryString(params);
    return this.request<TrendConflictData>(`/api/admin/trends/conflicts${qs}`);
  },

  async getTrendsSearch(params: {
    from?: string;
    to?: string;
    limit?: number;
  } = {}): Promise<{ searches: TrendSearchItem[] }> {
    const qs = this.buildQueryString(params);
    return this.request<{ searches: TrendSearchItem[] }>(`/api/admin/trends/search${qs}`);
  },

  async getTrendsChatTopics(params: { days?: number; from?: string; to?: string } = {}): Promise<{ topics: TrendChatTopic[] }> {
    return this.request(`/api/admin/trends/chat-topics${this.buildQueryString(params)}`);
  },

  async getTrendsClasses(moduleCode: string, semester?: string): Promise<{ module_code: string; classes: TrendClassItem[] }> {
    const qs = this.buildQueryString({ module: moduleCode, semester });
    return this.request<{ module_code: string; classes: TrendClassItem[] }>(`/api/admin/trends/classes${qs}`);
  },

  // ---------- Moderation (Brief A3) ----------
  async getModerationQueue(params: {
    type?: string;
    status?: string;
    flagged?: boolean;
    q?: string;
    page?: number;
    size?: number;
  } = {}): Promise<ModerationQueueResponse> {
    const qs = this.buildQueryString(params);
    return this.request<ModerationQueueResponse>(`/api/admin/moderation/queue${qs}`);
  },

  async moderateItem(
    type: "feedback" | "comment" | "book" | string,
    id: number,
    action: "approve" | "reject" | "hide",
    note?: string
  ): Promise<{ success: boolean; type: string; id: number; status: string }> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      const target = mockModerationQueue.find((x) => x.type === type && x.item_id === id);
      if (target) {
        const statusMap = { approve: "approved", reject: "rejected", hide: "hidden" } as const;
        target.status = statusMap[action];
        target.moderation_note = note || null;
      }
      return { success: true, type, id, status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "hidden" };
    }
    return this.request<{ success: boolean; type: string; id: number; status: string }>(
      `/api/admin/moderation/${type}/${id}/${action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note || null }),
      }
    );
  },

  async bulkModerate(req: BulkModerationRequest): Promise<{ success: boolean; updated_count: number }> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      const statusMap = { approve: "approved", reject: "rejected", hide: "hidden" } as const;
      let count = 0;
      for (const item of req.items) {
        const target = mockModerationQueue.find((x) => x.type === item.type && x.item_id === item.id);
        if (target) {
          target.status = statusMap[req.action];
          count++;
        }
      }
      return { success: true, updated_count: count };
    }
    return this.request<{ success: boolean; updated_count: number }>("/api/admin/moderation/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  },

  async getBannedTerms(): Promise<BannedTerm[]> {
    return this.request<BannedTerm[]>("/api/admin/banned-terms");
  },

  async addBannedTerm(term: string, severity: "flag" | "block" = "flag"): Promise<BannedTerm> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      const newTerm: BannedTerm = {
        id: Date.now(),
        term: term.trim().toLowerCase(),
        severity,
        created_at: new Date().toISOString(),
      };
      mockBannedTerms.unshift(newTerm);
      return newTerm;
    }
    return this.request<BannedTerm>("/api/admin/banned-terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term, severity }),
    });
  },

  async deleteBannedTerm(id: number): Promise<{ success: boolean; id: number }> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      const idx = mockBannedTerms.findIndex((x) => x.id === id);
      if (idx !== -1) mockBannedTerms.splice(idx, 1);
      return { success: true, id };
    }
    return this.request<{ success: boolean; id: number }>(`/api/admin/banned-terms/${id}`, {
      method: "DELETE",
    });
  },

  // =========================================================================
  // Dữ liệu học phần & Đề cương (Brief A4)
  // =========================================================================

  async getFacultyReview(params: {
    kind?: string;
    q?: string;
    prefix?: string;
    faculty?: string;
    page?: number;
    size?: number;
  } = {}): Promise<FacultyReviewResponse> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      const kind = params.kind || "needs_review";
      let filtered = [...mockFacultyReview.items];
      if (params.q) {
        const ql = params.q.toLowerCase();
        filtered = filtered.filter(
          (x) => x.code.toLowerCase().includes(ql) || x.name.toLowerCase().includes(ql)
        );
      }
      return {
        ...mockFacultyReview,
        items: filtered,
        total: filtered.length,
      };
    }

    const sp = new URLSearchParams();
    if (params.kind) sp.set("kind", params.kind);
    if (params.q) sp.set("q", params.q);
    if (params.prefix) sp.set("prefix", params.prefix);
    if (params.faculty) sp.set("faculty", params.faculty);
    if (params.page) sp.set("page", String(params.page));
    if (params.size) sp.set("size", String(params.size));
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return this.request<FacultyReviewResponse>(`/api/admin/data/faculty-review${qs}`);
  },

  async patchModuleFaculty(
    code: string,
    body: { faculty?: string | null; department?: string | null }
  ): Promise<any> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      const found = mockFacultyReview.items.find((x) => x.code === code);
      if (found) {
        found.faculty = body.faculty ?? null;
        found.department = body.department ?? null;
        found.faculty_source = "admin";
      }
      return { success: true, code, ...body, faculty_source: "admin" };
    }
    return this.request(`/api/admin/modules/${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async bulkFacultyReview(body: {
    codes: string[];
    action: "accept_suggestion" | "set";
    faculty?: string | null;
    department?: string | null;
  }): Promise<{ success: boolean; updated_count: number }> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      body.codes.forEach((c) => {
        const found = mockFacultyReview.items.find((x) => x.code === c);
        if (found) {
          if (body.action === "accept_suggestion" && found.suggestion?.faculty) {
            found.faculty = found.suggestion.faculty;
          } else if (body.action === "set" && body.faculty) {
            found.faculty = body.faculty;
            if (body.department !== undefined) found.department = body.department;
          }
          found.faculty_source = "admin";
        }
      });
      return { success: true, updated_count: body.codes.length };
    }
    return this.request<{ success: boolean; updated_count: number }>(
      "/api/admin/data/faculty-review/bulk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
  },

  async deleteFacultyOverride(code: string): Promise<any> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      const found = mockFacultyReview.items.find((x) => x.code === code);
      if (found) {
        found.faculty_source = null;
      }
      return { success: true, code, faculty_source: null };
    }
    return this.request(`/api/admin/modules/${encodeURIComponent(code)}/faculty-override`, {
      method: "DELETE",
    });
  },

  async getFaculties(): Promise<FacultiesResponse> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      return mockFaculties;
    }
    return this.request<FacultiesResponse>("/api/admin/faculties");
  },

  async getOutlinesCoverage(): Promise<OutlineCoverageResponse> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      return mockOutlinesCoverage;
    }
    return this.request<OutlineCoverageResponse>("/api/admin/outlines/coverage");
  },

  async getOutlinesMissing(params: {
    sort?: string;
    q?: string;
    page?: number;
    size?: number;
  } = {}): Promise<OutlineMissingResponse> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      let filtered = [...mockOutlinesMissing.items];
      if (params.q) {
        const ql = params.q.toLowerCase();
        filtered = filtered.filter(
          (x) => x.code.toLowerCase().includes(ql) || x.name.toLowerCase().includes(ql)
        );
      }
      return {
        ...mockOutlinesMissing,
        items: filtered,
        total: filtered.length,
      };
    }
    const sp = new URLSearchParams();
    if (params.sort) sp.set("sort", params.sort);
    if (params.q) sp.set("q", params.q);
    if (params.page) sp.set("page", String(params.page));
    if (params.size) sp.set("size", String(params.size));
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return this.request<OutlineMissingResponse>(`/api/admin/outlines/missing${qs}`);
  },

  async getOutlinesOcrPending(params: {
    page?: number;
    size?: number;
  } = {}): Promise<OutlineOcrPendingResponse> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      return mockOutlinesOcrPending;
    }
    const sp = new URLSearchParams();
    if (params.page) sp.set("page", String(params.page));
    if (params.size) sp.set("size", String(params.size));
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return this.request<OutlineOcrPendingResponse>(`/api/admin/outlines/ocr-pending${qs}`);
  },

  async getOutlinesDriveLinks(params: {
    page?: number;
    size?: number;
  } = {}): Promise<OutlineDriveLinkResponse> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      return mockOutlinesDriveLinks;
    }
    const sp = new URLSearchParams();
    if (params.page) sp.set("page", String(params.page));
    if (params.size) sp.set("size", String(params.size));
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return this.request<OutlineDriveLinkResponse>(`/api/admin/outlines/drive-links${qs}`);
  },

  // =========================================================================
  // Quản trị Lịch năm học & Học kỳ (Brief A5)
  // =========================================================================

  async getCalendarEvents(params: {
    year?: string;
    cohort?: string;
    type?: string;
    verified?: boolean;
    semester_id?: string;
    q?: string;
    page?: number;
    size?: number;
  } = {}): Promise<CalendarEventsResponse> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      let filtered = [...mockCalendarEvents];
      if (params.year) {
        filtered = filtered.filter((e) => e.academic_year === params.year);
      }
      if (params.type) {
        filtered = filtered.filter((e) => e.kind === params.type);
      }
      if (params.verified !== undefined) {
        filtered = filtered.filter((e) => e.verified === params.verified);
      }
      if (params.cohort) {
        filtered = filtered.filter(
          (e) => e.cohorts.includes("all") || e.cohorts.includes(params.cohort!)
        );
      }
      if (params.semester_id) {
        filtered = filtered.filter((e) => e.semester_id === params.semester_id);
      }
      if (params.q) {
        const ql = params.q.toLowerCase();
        filtered = filtered.filter(
          (e) => e.title.toLowerCase().includes(ql) || (e.note && e.note.toLowerCase().includes(ql))
        );
      }
      return {
        items: filtered,
        total: filtered.length,
        page: params.page || 1,
        size: params.size || 50,
        years: mockCalendarYears,
        kinds: mockCalendarKinds,
      };
    }

    const sp = new URLSearchParams();
    if (params.year) sp.set("year", params.year);
    if (params.cohort) sp.set("cohort", params.cohort);
    if (params.type) sp.set("type", params.type);
    if (params.verified !== undefined) sp.set("verified", String(params.verified));
    if (params.semester_id) sp.set("semester_id", params.semester_id);
    if (params.q) sp.set("q", params.q);
    if (params.page) sp.set("page", String(params.page));
    if (params.size) sp.set("size", String(params.size));
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return this.request<CalendarEventsResponse>(`/api/admin/calendar/events${qs}`);
  },

  async createCalendarEvent(payload: Partial<AdminAcademicEvent>): Promise<AdminAcademicEvent> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      const newEvt: AdminAcademicEvent = {
        id: Date.now(),
        academic_year: payload.academic_year || "2026-2027",
        kind: payload.kind || "teaching",
        title: payload.title || "Sự kiện mới",
        start_date: payload.start_date || "2026-09-01",
        end_date: payload.end_date ?? null,
        semester_id: payload.semester_id ?? null,
        cohorts: payload.cohorts || ["all"],
        note: payload.note ?? null,
        verified: payload.verified ?? true,
        source: payload.source || "TB 223/TB-ĐHKTL-ĐT",
        updated_by: "admin@uelcourses.local",
        updated_at: new Date().toISOString(),
      };
      mockCalendarEvents.push(newEvt);
      return newEvt;
    }

    return this.request<AdminAcademicEvent>("/api/admin/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async patchCalendarEvent(
    id: number,
    payload: Partial<AdminAcademicEvent>
  ): Promise<AdminAcademicEvent> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      const found = mockCalendarEvents.find((e) => e.id === id);
      if (found) {
        Object.assign(found, payload, {
          updated_by: "admin@uelcourses.local",
          updated_at: new Date().toISOString(),
        });
        return found;
      }
      throw new AdminApiError("Không tìm thấy sự kiện", 404);
    }

    return this.request<AdminAcademicEvent>(`/api/admin/calendar/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async deleteCalendarEvent(id: number): Promise<{ success: boolean; id: number }> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      const idx = mockCalendarEvents.findIndex((e) => e.id === id);
      if (idx !== -1) {
        mockCalendarEvents.splice(idx, 1);
      }
      return { success: true, id };
    }

    return this.request<{ success: boolean; id: number }>(`/api/admin/calendar/events/${id}`, {
      method: "DELETE",
    });
  },

  async importCalendarEvents(events: any[], dryRun: boolean = false): Promise<any> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      if (dryRun) {
        return {
          status: "ok",
          dry_run: true,
          success: true,
          total_incoming: events.length,
          to_add: events.length,
          to_update: 0,
          to_delete: mockCalendarEvents.length,
          sample_incoming: events.slice(0, 5),
          diff_summary: {
            years: ["2026-2027"],
            sources: ["TB 223/TB-ĐHKTL-ĐT"],
          },
        };
      }
      return {
        status: "ok",
        dry_run: false,
        success: true,
        imported: events.length,
        academic_year: "2026-2027",
        source: "TB 223/TB-ĐHKTL-ĐT",
      };
    }

    return this.request<any>(`/api/admin/calendar/import?dry_run=${dryRun ? "true" : "false"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(events),
    });
  },

  async getAdminSemesters(): Promise<SemesterAdminItem[]> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      return mockAdminSemesters;
    }
    return this.request<SemesterAdminItem[]>("/api/admin/semesters");
  },

  async patchAdminSemester(
    id: string,
    payload: {
      is_current?: boolean;
      teaching_start?: string | null;
      teaching_end?: string | null;
      name?: string;
    }
  ): Promise<SemesterAdminItem> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      const found = mockAdminSemesters.find((s) => s.id === id);
      if (!found) throw new AdminApiError("Không tìm thấy học kỳ", 404);

      if (payload.is_current !== undefined) {
        if (payload.is_current) {
          mockAdminSemesters.forEach((s) => {
            s.is_current = s.id === id;
            s.is_current_override = s.id === id;
          });
        } else {
          found.is_current = false;
          found.is_current_override = false;
        }
      }
      if (payload.name) found.name = payload.name;
      if (payload.teaching_start !== undefined) found.teaching_start = payload.teaching_start;
      if (payload.teaching_end !== undefined) found.teaching_end = payload.teaching_end;

      return found;
    }

    return this.request<SemesterAdminItem>(`/api/admin/semesters/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  // ---------- Hệ thống, Nhật ký, Tài khoản & Cài đặt (Brief A6) ----------
  async getSystemInfo(): Promise<AdminSystemInfo> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      return mockSystemInfo;
    }
    return this.request<AdminSystemInfo>("/api/admin/system");
  },

  async getAuditLogs(params: {
    actor?: string;
    action?: string;
    entity_type?: string;
    from?: string;
    to?: string;
    page?: number;
    page_size?: number;
  } = {}): Promise<AuditLogResponse> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      let filtered = [...mockAuditLogs];
      if (params.actor) {
        const q = params.actor.toLowerCase();
        filtered = filtered.filter(
          (item) => item.actor_id?.toLowerCase().includes(q) || item.actor_type.toLowerCase().includes(q)
        );
      }
      if (params.action) {
        filtered = filtered.filter((item) => item.action === params.action);
      }
      if (params.entity_type) {
        filtered = filtered.filter((item) => item.entity_type === params.entity_type);
      }
      return {
        items: filtered,
        total: filtered.length,
        page: params.page || 1,
        page_size: params.page_size || 50,
        total_pages: Math.ceil(filtered.length / (params.page_size || 50)) || 1,
      };
    }

    const query = new URLSearchParams();
    if (params.actor) query.set("actor", params.actor);
    if (params.action) query.set("action", params.action);
    if (params.entity_type) query.set("entity_type", params.entity_type);
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    if (params.page) query.set("page", String(params.page));
    if (params.page_size) query.set("page_size", String(params.page_size));

    const qs = query.toString();
    return this.request<AuditLogResponse>(`/api/admin/audit-log${qs ? `?${qs}` : ""}`);
  },

  async exportAuditCsv(params: {
    actor?: string;
    action?: string;
    entity_type?: string;
    from?: string;
    to?: string;
  } = {}): Promise<string> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      return "ID,Thời gian (UTC),Loại người dùng,Mã / Email người dùng,Hành động,Loại đối tượng,Mã đối tượng\n101,2026-11-22T10:15:30Z,admin,admin@uel.edu.vn,update_faculty,module,BIM5001\n";
    }

    const query = new URLSearchParams();
    query.set("format", "csv");
    if (params.actor) query.set("actor", params.actor);
    if (params.action) query.set("action", params.action);
    if (params.entity_type) query.set("entity_type", params.entity_type);
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);

    const url = `${API_URL}/api/admin/audit-log?${query.toString()}`;
    const res = await adminFetch(url, {});
    if (!res.ok) throw new AdminApiError("Không thể xuất file CSV nhật ký", res.status);
    return res.text();
  },

  async getUsers(): Promise<AdminUserItem[]> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      return mockAdminUsers;
    }
    return this.request<AdminUserItem[]>("/api/admin/users");
  },

  async createUser(data: { email: string; role: AdminRole }): Promise<CreateAdminUserResponse> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      const newUser: AdminUserItem = {
        id: mockAdminUsers.length + 1,
        email: data.email,
        role: data.role,
        is_active: true,
        failed_attempts: 0,
        locked_until: null,
        last_login_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockAdminUsers.push(newUser);
      return {
        user: newUser,
        temporary_password: "MockTempPass123!4",
        message: "Tài khoản đã được tạo thành công. Mật khẩu tạm chỉ hiển thị một lần duy nhất này.",
      };
    }

    return this.request<CreateAdminUserResponse>("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  async updateUser(
    id: number,
    data: { role?: AdminRole; is_active?: boolean; is_locked?: boolean }
  ): Promise<AdminUserItem> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      const user = mockAdminUsers.find((u) => u.id === id);
      if (!user) throw new AdminApiError("Không tìm thấy người dùng", 404);
      if (data.role) user.role = data.role;
      if (data.is_active !== undefined) user.is_active = data.is_active;
      if (data.is_locked !== undefined) user.locked_until = data.is_locked ? new Date().toISOString() : null;
      user.updated_at = new Date().toISOString();
      return user;
    }

    return this.request<AdminUserItem>(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  async resetPassword(id: number): Promise<AdminPasswordResetResponse> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      return {
        user_id: id,
        temporary_password: "NewTempPassword789!",
        message: "Mật khẩu tạm đã được tạo. Hãy sao chép ngay vì chỉ hiển thị một lần.",
      };
    }

    return this.request<AdminPasswordResetResponse>(`/api/admin/users/${id}/reset-password`, {
      method: "POST",
    });
  },

  async changeMyPassword(data: { current_password: string; new_password: string }): Promise<{ message: string }> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      if (data.current_password === "wrongpassword") {
        throw new AdminApiError("Mật khẩu hiện tại không chính xác", 400);
      }
      return { message: "Đổi mật khẩu thành công. Các phiên đăng nhập khác đã được thu hồi." };
    }

    return this.request<{ message: string }>("/api/admin/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  async getSettings(): Promise<AdminSettingsData> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      return mockAdminSettings;
    }
    return this.request<AdminSettingsData>("/api/admin/settings");
  },

  async updateSettings(data: Partial<AdminSettingsData>): Promise<AdminSettingsData> {
    const isMock = typeof process !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";
    if (isMock) {
      if (data.moderation_mode) mockAdminSettings.moderation_mode = data.moderation_mode;
      if (data.analytics_enabled !== undefined) mockAdminSettings.analytics_enabled = data.analytics_enabled;
      if (data.analytics_retention_days !== undefined) mockAdminSettings.analytics_retention_days = data.analytics_retention_days;
      mockAdminSettings.updated_at = new Date().toISOString();
      return mockAdminSettings;
    }

    return this.request<AdminSettingsData>("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  // ---------- Bans (Brief A7) ----------
  async listBans(params: { status?: string; scope?: string } = {}): Promise<BanListResponse> {
    const qs = this.buildQueryString(params);
    return this.request<BanListResponse>(`/api/admin/bans${qs}`);
  },

  async liftBan(userId: number): Promise<{ success: boolean; user_id: number }> {
    return this.request<{ success: boolean; user_id: number }>(`/api/admin/bans/${userId}/lift`, {
      method: "POST",
    });
  },

  async escalateBan(userId: number, note?: string): Promise<{ success: boolean; user_id: number; ban_level: string }> {
    return this.request<{ success: boolean; user_id: number; ban_level: string }>(`/api/admin/bans/${userId}/escalate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note || null }),
    });
  },

  async notifyBan(userId: number): Promise<{ success: boolean; message?: string }> {
    return this.request<{ success: boolean; message?: string }>(`/api/admin/bans/${userId}/notify`, {
      method: "POST",
    });
  },

  // ---------- Feedback & Star Ratings ----------
  async getFeedbackSummary(
    params: { page?: number; size?: number; rating?: number } = {}
  ): Promise<AdminFeedbackSummaryResponse> {
    const qs = this.buildQueryString(params);
    return this.request<AdminFeedbackSummaryResponse>(`/api/admin/feedback-summary${qs}`);
  },

  async getFeedbackDetail(id: number): Promise<AdminFeedbackDetail> {
    return this.request<AdminFeedbackDetail>(`/api/admin/feedback/${id}`);
  },
};
