import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushAnalytics,
  getAnonId,
  isAnalyticsEnabled,
  setAnalyticsEnabled,
  track,
} from "../analytics";

describe("Brief A2: Client Analytics & Tracking Module", () => {
  const originalEnv = { ...process.env };
  const originalNavigator = { ...navigator };

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

  it("enqueue sự kiện và flush gửi lô bằng fetch khi enabled", () => {
    // Tạm thời bật enabled cho test case này
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

    flushAnalytics();

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
  });
});
