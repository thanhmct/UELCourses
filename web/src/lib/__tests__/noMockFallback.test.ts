// Mặc định (NEXT_PUBLIC_USE_MOCKS khác "true"): không bao giờ thay dữ liệu thật bằng dữ liệu mẫu.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, mocksEnabled } from "@/lib/api";
import { adminApi } from "@/lib/adminApi";
import { useDataSource } from "@/lib/dataSource";

describe("no mock fallback by default", () => {
  const saved = process.env.NEXT_PUBLIC_USE_MOCKS;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_USE_MOCKS = "false";
    useDataSource.setState({ mock: false, offline: false });
    localStorage.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_USE_MOCKS = saved;
    vi.unstubAllGlobals();
  });

  it("mocksEnabled reads the env at call time", () => {
    expect(mocksEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_USE_MOCKS = "true";
    expect(mocksEnabled()).toBe(true);
  });

  it("network failure rejects and marks offline instead of returning mock data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api.semesters()).rejects.toThrow("Chờ tí UELer, tui quay lại giờ!!!");
    expect(useDataSource.getState().offline).toBe(true);
    expect(useDataSource.getState().mock).toBe(false);
  });

  it("5xx rejects and marks offline; success clears it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("err", { status: 503 })));
    await expect(api.semesters()).rejects.toMatchObject({ status: 503, message: "Chờ tí UELer, tui quay lại giờ!!!" });
    expect(useDataSource.getState().offline).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));
    const r = await api.semesters();
    expect(r.mock).toBe(false);
    expect(useDataSource.getState().offline).toBe(false);
  });

  it("404 rejects without marking offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nf", { status: 404 })));
    await expect(api.semesters()).rejects.toMatchObject({ status: 404 });
    expect(useDataSource.getState().offline).toBe(false);
  });

  it("uses the last successful public GET response when the API is offline", async () => {
    localStorage.clear();
    const semesters = [{ id: "2026-2027-1", name: "Kỳ 1", year: "2026-2027", term: 1, is_current: true }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(semesters), { status: 200 })));
    await expect(api.semesters()).resolves.toMatchObject({ data: semesters, mock: false });

    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.semesters()).resolves.toMatchObject({ data: semesters, mock: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useDataSource.getState().offline).toBe(true);
  });

  it("queues feedback locally when the API is unreachable", async () => {
    localStorage.removeItem("uelcourses-offline-queue-v1");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.feedback({
      page: "/today",
      rating: 3,
      category: "other",
      message: "Keep it up",
      app_version: "0.1.0",
    })).resolves.toMatchObject({ mock: true });

    const queued = JSON.parse(localStorage.getItem("uelcourses-offline-queue-v1") ?? "[]");
    expect(queued).toHaveLength(1);
    expect(queued[0].url).toContain("/api/feedback");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the admin link check separate from public connection status", async () => {
    const fetchAdmin = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchAdmin);
    await expect(adminApi.checkAdminAvailability()).resolves.toBe(false);
    await expect(adminApi.checkAdminAvailability()).resolves.toBe(false);
    expect(useDataSource.getState().offline).toBe(false);

    useDataSource.getState().setOffline(true);
    await expect(adminApi.checkAdminAvailability()).resolves.toBe(true);
    expect(useDataSource.getState().offline).toBe(true);
  });

  it("reports the same network error in admin requests", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(adminApi.getMe()).rejects.toMatchObject({ status: 0, message: "Chờ tí UELer, tui quay lại giờ!!!" });
    expect(useDataSource.getState().offline).toBe(true);
  });
});
