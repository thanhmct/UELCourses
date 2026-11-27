import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueRequest, flushOfflineQueue } from "../offlineQueue";

describe("offline submission queue", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replays queued requests and removes them after success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    enqueueRequest("https://api.example.test/api/feedback", {
      method: "POST",
      body: JSON.stringify({ message: "Thanks" }),
    });

    await flushOfflineQueue("https://api.example.test");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem("uelcourses-offline-queue-v1") ?? "[]")).toEqual([]);
  });

  it("leaves queued requests untouched while offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    enqueueRequest("https://api.example.test/api/feedback", { method: "POST", body: "{}" });

    await flushOfflineQueue("https://api.example.test");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("uelcourses-offline-queue-v1") ?? "[]")).toHaveLength(1);
  });
});
