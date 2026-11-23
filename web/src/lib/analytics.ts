/**
 * Thu thập xu hướng sử dụng ẩn danh (Brief A2, D-A5).
 * - Sử dụng anon_id ngẫu nhiên (UUID v4 lưu trong localStorage).
 * - KHÔNG BAO GIỜ lưu hay gửi: tên, email, token, mật khẩu, MSSV, IP, user-agent.
 * - Tôn trọng tín hiệu Do Not Track (DNT) và công tắc người dùng trong Cài đặt.
 * - Hàng đợi trong bộ nhớ, tự động gửi theo lô mỗi 10 giây hoặc khi đóng/ẩn trang (sendBeacon).
 * - Bỏ qua khi chạy môi trường test hoặc NEXT_PUBLIC_USE_MOCKS=true.
 */

import { API_URL } from "./api";

const ANON_ID_STORAGE_KEY = "uelcourses_anon_id";
const ANALYTICS_ENABLED_STORAGE_KEY = "uelcourses_analytics_enabled";
const BATCH_INTERVAL_MS = 10000;
const MAX_BATCH_SIZE = 50;

export interface AnalyticsEventItem {
  type: string;
  module_code?: string | null;
  class_code?: string | null;
  semester_id?: string | null;
  program_code?: string | null;
  query?: string | null;
  query_text?: string | null;
  filters?: Record<string, any> | null;
  page?: string | null;
  ts?: string | number;
}

let eventQueue: AnalyticsEventItem[] = [];
let batchTimer: any = null;
let listenersAttached = false;

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback bên dưới
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getAnonId(): string {
  if (typeof window === "undefined" || !window.localStorage) {
    return "00000000-0000-4000-8000-000000000000";
  }
  try {
    let id = localStorage.getItem(ANON_ID_STORAGE_KEY);
    if (!id || id.length < 32) {
      id = generateUUID();
      localStorage.setItem(ANON_ID_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return "00000000-0000-4000-8000-000000000000";
  }
}

export function isAnalyticsEnabled(): boolean {
  if (typeof window === "undefined") return false;

  // 1. Môi trường mock hoặc unit test -> tắt
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") return false;
  if (process.env.NODE_ENV === "test") return false;

  // 2. Tín hiệu Do Not Track từ trình duyệt
  if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") {
    return false;
  }

  // 3. Người dùng chủ động tắt trong Cài đặt
  try {
    if (localStorage.getItem(ANALYTICS_ENABLED_STORAGE_KEY) === "false") {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

export function setAnalyticsEnabled(enabled: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(ANALYTICS_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
    if (!enabled) {
      eventQueue = [];
    }
  } catch {
    // Bỏ qua lỗi hạn chế lưu trữ
  }
}

function attachPageListeners(): void {
  if (typeof window === "undefined" || listenersAttached) return;
  listenersAttached = true;

  // Gửi sự kiện khi người dùng chuyển tab hoặc ẩn trang
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        flushAnalytics();
      }
    });
  }

  window.addEventListener("pagehide", () => {
    flushAnalytics();
  });
}

function scheduleBatch(): void {
  if (batchTimer) return;
  batchTimer = setTimeout(() => {
    batchTimer = null;
    flushAnalytics();
  }, BATCH_INTERVAL_MS);
}

export function flushAnalytics(): void {
  if (eventQueue.length === 0) return;
  if (!isAnalyticsEnabled()) {
    eventQueue = [];
    return;
  }

  const batch = eventQueue.slice(0, MAX_BATCH_SIZE);
  eventQueue = eventQueue.slice(MAX_BATCH_SIZE);

  const anonId = getAnonId();
  const payload = JSON.stringify({
    anon_id: anonId,
    events: batch,
  });

  const url = `${API_URL}/api/analytics/events`;

  // Ưu tiên navigator.sendBeacon khi trang đang ẩn hoặc đóng
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function" &&
    typeof document !== "undefined" &&
    document.visibilityState === "hidden"
  ) {
    try {
      const blob = new Blob([payload], { type: "application/json" });
      const sent = navigator.sendBeacon(url, blob);
      if (sent) return;
    } catch {
      // Fallback fetch
    }
  }

  // Fetch chuẩn với keepalive
  if (typeof fetch !== "undefined") {
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
      keepalive: true,
      credentials: "omit",
    }).catch(() => {
      // Bỏ qua lỗi mạng
    });
  }
}

/**
 * Ghi nhận một sự kiện hành vi ẩn danh.
 */
export function track(
  eventType: string,
  data: Partial<AnalyticsEventItem> = {}
): void {
  if (!isAnalyticsEnabled()) return;

  attachPageListeners();

  const item: AnalyticsEventItem = {
    type: eventType,
    module_code: data.module_code || null,
    class_code: data.class_code || null,
    semester_id: data.semester_id || null,
    program_code: data.program_code || null,
    query: data.query || data.query_text || null,
    filters: data.filters || null,
    page: data.page || (typeof window !== "undefined" ? window.location.pathname : null),
    ts: new Date().toISOString(),
  };

  eventQueue.push(item);

  if (eventQueue.length >= 20) {
    flushAnalytics();
  } else {
    scheduleBatch();
  }
}
