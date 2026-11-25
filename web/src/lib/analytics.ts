/**
 * Thu thập xu hướng sử dụng ẩn danh (Brief A2, D-A5, N2).
 * - Sử dụng anon_id ngẫu nhiên (UUID v4 lưu trong localStorage).
 * - KHÔNG BAO GIỜ lưu hay gửi: tên, email, token, mật khẩu, MSSV, IP, user-agent.
 * - Tôn trọng tín hiệu Do Not Track (DNT) và công tắc người dùng trong Cài đặt.
 * - Hàng đợi bền vững lưu trong localStorage (giới hạn tối đa ~500 sự kiện).
 * - Tự động gửi lại sau thất bại (exponential backoff, tối đa 5 lần) và gửi nốt khi mở trang.
 * - Chỉ xóa khỏi hàng đợi khi server trả mã 2xx.
 * - Vẫn dùng sendBeacon khi ẩn trang; bỏ qua khi chạy môi trường test/mock.
 */

import { API_URL } from "./api";

const ANON_ID_STORAGE_KEY = "uelcourses_anon_id";
const ANALYTICS_ENABLED_STORAGE_KEY = "uelcourses_analytics_enabled";
export const QUEUE_STORAGE_KEY = "uelcourses_analytics_queue";

export const BATCH_INTERVAL_MS = 10000;
export const MAX_BATCH_SIZE = 50;
export const MAX_QUEUE_SIZE = 500;
export const MAX_RETRIES = 5;

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

export interface QueuedEventItem extends AnalyticsEventItem {
  _retries?: number;
}

let batchTimer: any = null;
let listenersAttached = false;
let isFlushing = false;
let failureCount = 0;

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

export function loadQueue(): QueuedEventItem[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveQueue(queue: QueuedEventItem[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    if (queue.length === 0) {
      localStorage.removeItem(QUEUE_STORAGE_KEY);
    } else {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE)));
    }
  } catch {
    // Bỏ qua lỗi vượt hạn mức lưu trữ
  }
}

export function clearQueue(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.removeItem(QUEUE_STORAGE_KEY);
  } catch {
    // Bỏ qua lỗi
  }
}

export function setAnalyticsEnabled(enabled: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(ANALYTICS_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
    if (!enabled) {
      clearQueue();
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
        void flushAnalytics();
      }
    });
  }

  window.addEventListener("pagehide", () => {
    void flushAnalytics();
  });

  // Gửi nốt sự kiện tồn đọng khi vừa mở/tải trang
  if (loadQueue().length > 0) {
    scheduleBatch(1000);
  }
}

function scheduleBatch(delay: number = BATCH_INTERVAL_MS): void {
  if (batchTimer) return;
  batchTimer = setTimeout(() => {
    batchTimer = null;
    void flushAnalytics();
  }, delay);
}

export async function flushAnalytics(): Promise<void> {
  if (isFlushing) return;

  if (!isAnalyticsEnabled()) {
    clearQueue();
    return;
  }

  const queue = loadQueue();
  if (queue.length === 0) {
    failureCount = 0;
    return;
  }

  const batch = queue.slice(0, MAX_BATCH_SIZE);
  const anonId = getAnonId();

  // Loại bỏ các trường nội bộ như _retries trước khi gửi lên API
  const cleanEvents = batch.map(({ _retries, ...item }) => item);
  const payload = JSON.stringify({
    anon_id: anonId,
    events: cleanEvents,
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
      if (sent) {
        // Beacon được trình duyệt xếp hàng gửi thành công
        const remaining = queue.slice(batch.length);
        saveQueue(remaining);
        return;
      }
    } catch {
      // Fallback sang fetch bên dưới
    }
  }

  if (typeof fetch === "undefined") return;

  isFlushing = true;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
      keepalive: true,
      credentials: "omit",
    });

    if (res.ok) {
      // Chỉ xóa khỏi hàng đợi khi server trả 2xx
      failureCount = 0;
      const latestQueue = loadQueue();
      // Loại bỏ đúng số lượng phần tử của batch từ đầu hàng đợi
      const remaining = latestQueue.slice(batch.length);
      saveQueue(remaining);

      // Nếu vẫn còn sự kiện trong hàng đợi, tiếp tục gửi lô tiếp theo
      if (remaining.length > 0) {
        scheduleBatch(500);
      }
    } else {
      // Thất bại HTTP (429, 500, etc.): tăng số lần retry và thực hiện backoff
      handleFlushFailure(batch.length);
    }
  } catch {
    // Lỗi mạng hoặc Render ngủ
    handleFlushFailure(batch.length);
  } finally {
    isFlushing = false;
  }
}

function handleFlushFailure(batchLength: number): void {
  failureCount++;
  const latestQueue = loadQueue();

  // Tăng số lần thử _retries cho các phần tử trong batch
  const updatedBatch: QueuedEventItem[] = latestQueue.slice(0, batchLength).map((item) => ({
    ...item,
    _retries: (item._retries ?? 0) + 1,
  }));

  // Loại bỏ các sự kiện đã vượt quá MAX_RETRIES (tối đa 5 lần)
  const keptBatch = updatedBatch.filter((item) => (item._retries ?? 0) < MAX_RETRIES);
  const remaining = latestQueue.slice(batchLength);
  saveQueue([...keptBatch, ...remaining]);

  // Exponential backoff: tối đa 60 giây
  const backoffDelay = Math.min(60000, 2000 * Math.pow(2, Math.min(failureCount - 1, 5)));
  scheduleBatch(backoffDelay);
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

  const item: QueuedEventItem = {
    type: eventType,
    module_code: data.module_code || null,
    class_code: data.class_code || null,
    semester_id: data.semester_id || null,
    program_code: data.program_code || null,
    query: data.query || data.query_text || null,
    filters: data.filters || null,
    page: data.page || (typeof window !== "undefined" ? window.location.pathname : null),
    ts: new Date().toISOString(),
    _retries: 0,
  };

  const queue = loadQueue();
  queue.push(item);
  saveQueue(queue);

  if (queue.length >= 20) {
    void flushAnalytics();
  } else {
    scheduleBatch();
  }
}
