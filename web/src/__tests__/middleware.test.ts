import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

describe("web/src/middleware.ts", () => {
  const originalEnv = process.env.UELPATH_SURFACE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.UELPATH_SURFACE;
    } else {
      process.env.UELPATH_SURFACE = originalEnv;
    }
  });

  describe("Student surface (default)", () => {
    beforeEach(() => {
      delete process.env.UELPATH_SURFACE;
    });

    it("returns 404 rewrite for /admin", () => {
      const req = new NextRequest("http://localhost:3000/admin");
      const res = middleware(req);
      expect(res.status).toBe(404);
      expect(res.headers.get("x-middleware-rewrite")).toContain("/not-found");
    });

    it("returns 404 rewrite for /admin/*", () => {
      const req = new NextRequest("http://localhost:3000/admin/trends");
      const res = middleware(req);
      expect(res.status).toBe(404);
      expect(res.headers.get("x-middleware-rewrite")).toContain("/not-found");
    });

    it("allows non-admin student pages untouched", () => {
      const req = new NextRequest("http://localhost:3000/timetable");
      const res = middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
      expect(res.headers.get("location")).toBeNull();
    });

    it("leaves /_next and /favicon.ico untouched", () => {
      const reqNext = new NextRequest("http://localhost:3000/_next/static/chunks/main.js");
      const resNext = middleware(reqNext);
      expect(resNext.headers.get("x-middleware-rewrite")).toBeNull();
      expect(resNext.headers.get("location")).toBeNull();

      const reqFavicon = new NextRequest("http://localhost:3000/favicon.ico");
      const resFavicon = middleware(reqFavicon);
      expect(resFavicon.headers.get("x-middleware-rewrite")).toBeNull();
      expect(resFavicon.headers.get("location")).toBeNull();
    });
  });

  describe("Admin surface (UELPATH_SURFACE=admin)", () => {
    beforeEach(() => {
      process.env.UELPATH_SURFACE = "admin";
    });

    it("redirects / to /admin", () => {
      const req = new NextRequest("http://localhost:3100/");
      const res = middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost:3100/admin");
    });

    it("redirects non-/admin page (/timetable) to /admin", () => {
      const req = new NextRequest("http://localhost:3100/timetable");
      const res = middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost:3100/admin");
    });

    it("allows /admin and /admin/* untouched", () => {
      const reqAdmin = new NextRequest("http://localhost:3100/admin");
      const resAdmin = middleware(reqAdmin);
      expect(resAdmin.headers.get("location")).toBeNull();
      expect(resAdmin.headers.get("x-middleware-rewrite")).toBeNull();

      const reqUsers = new NextRequest("http://localhost:3100/admin/users");
      const resUsers = middleware(reqUsers);
      expect(resUsers.headers.get("location")).toBeNull();
      expect(resUsers.headers.get("x-middleware-rewrite")).toBeNull();
    });

    it("leaves /_next and /favicon.ico untouched on admin surface", () => {
      const reqNext = new NextRequest("http://localhost:3100/_next/static/chunks/main.js");
      const resNext = middleware(reqNext);
      expect(resNext.headers.get("location")).toBeNull();
      expect(resNext.headers.get("x-middleware-rewrite")).toBeNull();

      const reqFavicon = new NextRequest("http://localhost:3100/favicon.ico");
      const resFavicon = middleware(reqFavicon);
      expect(resFavicon.headers.get("location")).toBeNull();
      expect(resFavicon.headers.get("x-middleware-rewrite")).toBeNull();
    });
  });
});
