import { describe, expect, it } from "vitest";
import { authLoginUrl } from "@/lib/api";

describe("authLoginUrl", () => {
  it("gắn next và origin của trang hiện tại", () => {
    const url = new URL(authLoginUrl("google", "/settings"), "http://placeholder");
    expect(url.pathname.endsWith("/api/auth/google/login")).toBe(true);
    expect(url.searchParams.get("next")).toBe("/settings");
    expect(url.searchParams.get("origin")).toBe(window.location.origin);
  });

  it("không có next vẫn gửi origin", () => {
    const url = new URL(authLoginUrl("facebook"), "http://placeholder");
    expect(url.searchParams.has("next")).toBe(false);
    expect(url.searchParams.get("origin")).toBe(window.location.origin);
  });
});
