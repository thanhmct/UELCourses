import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushAnalytics,
  getAnonId,
  isAnalyticsEnabled,
  loadQueue,
  MAX_QUEUE_SIZE,
  MAX_RETRIES,
  QUEUE_STORAGE_KEY,
  saveQueue,
  setAnalyticsEnabled,
  track,
} from "../analytics";

describe("Brief A2 & N2: Client Analytics & Tracking Module", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    localStorage.clear();
  });

  it("tạo và lưu giữ anon_id duy nhất dạng UUID v4 trong localStorage", () => {
    const id1 = getAnonId();
    expect(id1).toBeDefined();
    expect(id1.length).toBeGreaterThanOrEqual(32);

    // Lần gọi kế tiếp trả về cùng 1 anon_id
    const id2 = getAnonId();
    expect(id2).toBe(id1);
    expect(localStorage.getItem("uelcourses_anon_id")).toBe(id1);
  });

  it("không gửi analytics khi Do Not Track (DNT) được bật", () => {
    Object.defineProperty(navigator, "doNotTrack", {
      value: "1",
      configurable: true,
    });

    expect(isAnalyticsEnabled()).toBe(false);

    Object.defineProperty(navigator, "doNotTrack", {
      value: "0",
      configurable: true,
    });
  });

  it("không gửi analytics khi người dùng chủ động tắt trong Cài đặt", () => {
    setAnalyticsEnabled(false);
    expect(localStorage.getItem("uelcourses_analytics_enabled")).toBe("false");
    expect(isAnalyticsEnabled()).toBe(false);

    setAnalyticsEnabled(true);
    expect(localStorage.getItem("uelcourses_analytics_enabled")).toBe("true");
  });

  it("tôn trọng biến môi trường mock và NODE_ENV test", () => {
    process.env.NEXT_PUBLIC_USE_MOCKS = "true";
    expect(isAnalyticsEnabled()).toBe(false);

    delete process.env.NEXT_PUBLIC_USE_MOCKS;
    (process.env as any).NODE_ENV = "test";
    expect(isAnalyticsEnabled()).toBe(false);
  });

  it("enqueue sự kiện vào localStorage và flush gửi lô bằng fetch khi enabled", async () => {
    delete process.env.NEXT_PUBLIC_USE_MOCKS;
    (process.env as any).NODE_ENV = "production";
    setAnalyticsEnabled(true);
    Object.defineProperty(navigator, "doNotTrack", {
      value: "0",
      configurable: true,
    });

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = mockFetch;

    track("module_view", { module_code: "BIM5001" });
    track("timetable_add", { module_code: "BIM5001", class_code: "BIM5001_01" });

    // Đã được lưu vào localStorage
    const saved = loadQueue();
    expect(saved).toHaveLength(2);

    await flushAnalytics();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toContain("/api/analytics/events");
    const body = JSON.parse(callArgs[1].body);
    expect(body.anon_id).toBeDefined();
    expect(body.events).toHaveLength(2);
    expect(body.events[0].type).toBe("module_view");
    expect(body.events[0].module_code).toBe("BIM5001");
    expect(body.events[1].type).toBe("timetable_add");
    expect(body.events[1].class_code).toBe("BIM5001_01");

    // Đã được xóa khỏi localStorage sau khi server trả 2xx
    expect(loadQueue()).toHaveLength(0);
  });

  it("giới hạn hàng đợi trong localStorage ở mức MAX_QUEUE_SIZE (500 sự kiện)", () => {
    delete process.env.NEXT_PUBLIC_USE_MOCKS;
    (process.env as any).NODE_ENV = "production";
    setAnalyticsEnabled(true);
    Object.defineProperty(navigator, "doNotTrack", {
      value: "0",
      configurable: true,
    });

    // Tạo sẵn 500 sự kiện
    const preQueue = Array.from({ length: 500 }, (_, i) => ({
      type: "search",
      query: `q_${i}`,
    }));
    saveQueue(preQueue);

    expect(loadQueue()).toHaveLength(MAX_QUEUE_SIZE);

    // Thêm 1 sự kiện mới qua track()
    track("search", { query: "new_query" });

    const queueAfter = loadQueue();
    expect(queueAfter).toHaveLength(MAX_QUEUE_SIZE);
    expect(queueAfter[queueAfter.length - 1].query).toBe("new_query");
    expect(queueAfter[0].query).toBe("q_1"); // q_0 đã bị đẩy ra
  });

  it("retry hàng đợi: không xóa khi server trả lỗi/Render ngủ và chỉ xóa khi 2xx", async () => {
    delete process.env.NEXT_PUBLIC_USE_MOCKS;
    (process.env as any).NODE_ENV = "production";
    setAnalyticsEnabled(true);
    Object.defineProperty(navigator, "doNotTrack", {
      value: "0",
      configurable: true,
    });

    // Lần 1: Server trả 500 (hoặc mạng lỗi)
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    global.fetch = mockFetch;

    track("timetable_add", { module_code: "TOA1001", class_code: "TOA1001_01" });
    expect(loadQueue()).toHaveLength(1);

    await flushAnalytics();

    // Sự kiện VẪN CÒN trong hàng đợi và tăng số lần thử
    const queueAfterFail = loadQueue();
    expect(queueAfterFail).toHaveLength(1);
    expect(queueAfterFail[0]._retries).toBe(1);

    // Lần 2: Lỗi mạng fetch ném ngoại lệ
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));
    await flushAnalytics();

    const queueAfterNetFail = loadQueue();
    expect(queueAfterNetFail).toHaveLength(1);
    expect(queueAfterNetFail[0]._retries).toBe(2);

    // Lần 3: Server thức giấc và trả 204
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
    await flushAnalytics();

    // Bây giờ mới xóa khỏi hàng đợi
    expect(loadQueue()).toHaveLength(0);
  });

  it("loại bỏ sự kiện sau khi thất bại quá MAX_RETRIES (5 lần)", async () => {
    delete process.env.NEXT_PUBLIC_USE_MOCKS;
    (process.env as any).NODE_ENV = "production";
    setAnalyticsEnabled(true);
    Object.defineProperty(navigator, "doNotTrack", {
      value: "0",
      configurable: true,
    });

    // Đặt sự kiện đã retry 4 lần
    saveQueue([
      {
        type: "timetable_add",
        module_code: "TOA1001",
        class_code: "TOA1001_01",
        _retries: 4,
      },
    ]);

    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    global.fetch = mockFetch;

    // Lần thứ 5 thất bại
    await flushAnalytics();

    // Đạt 5 lần retry -> bị loại bỏ khỏi hàng đợi
    expect(loadQueue()).toHaveLength(0);
  });
});
