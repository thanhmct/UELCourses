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
