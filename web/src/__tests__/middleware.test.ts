import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

describe("web/src/middleware.ts — chuyển tiếp /api/* sang API", () => {
  const saved = { target: process.env.API_PROXY_TARGET, secret: process.env.PROXY_SHARED_SECRET };
  afterEach(() => {
    if (saved.target === undefined) delete process.env.API_PROXY_TARGET;
    else process.env.API_PROXY_TARGET = saved.target;
    if (saved.secret === undefined) delete process.env.PROXY_SHARED_SECRET;
    else process.env.PROXY_SHARED_SECRET = saved.secret;
  });

  it("viết lại /api/* sang API kèm query, khóa dùng chung và IP khách thật", () => {
    process.env.API_PROXY_TARGET = "https://api.uelcourses.id.vn";
    process.env.PROXY_SHARED_SECRET = "bi-mat";
    const req = new NextRequest("https://uelpath.vercel.app/api/modules?size=5", {
      headers: { "x-real-ip": "203.0.113.5", "x-uel-client-ip": "6.6.6.6", cookie: "uel_session=abc" },
    });
    const res = middleware(req);
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://api.uelcourses.id.vn/api/modules?size=5");
    // Header gắn thêm cho yêu cầu chuyển tiếp: khóa + IP thật, IP giả của khách bị thay thế
    expect(res.headers.get("x-middleware-request-x-uel-proxy-secret")).toBe("bi-mat");
    expect(res.headers.get("x-middleware-request-x-uel-client-ip")).toBe("203.0.113.5");
    expect(res.headers.get("x-middleware-request-cookie")).toBe("uel_session=abc");
  });

  it("đường dẫn API có dấu chấm vẫn được chuyển tiếp (không bị coi là file tĩnh)", () => {
    process.env.API_PROXY_TARGET = "https://api.uelcourses.id.vn";
    const res = middleware(new NextRequest("https://uelpath.vercel.app/api/modules/ADD.1"));
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://api.uelcourses.id.vn/api/modules/ADD.1");
  });

  it("không chuyển tiếp route /api/webcal và các trang web", () => {
    process.env.API_PROXY_TARGET = "https://api.uelcourses.id.vn";
    expect(middleware(new NextRequest("https://uelpath.vercel.app/api/webcal?x=1")).headers.get("x-middleware-rewrite")).toBeNull();
    expect(middleware(new NextRequest("https://uelpath.vercel.app/timetable")).headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("không chuyển tiếp khi chưa đặt API_PROXY_TARGET (chạy local)", () => {
    delete process.env.API_PROXY_TARGET;
    const res = middleware(new NextRequest("http://localhost:3000/api/modules"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});

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
