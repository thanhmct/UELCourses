import { afterEach, describe, expect, it } from "vitest";
import {
  buildProxyHeaders,
  buildProxyTarget,
  clientIpFrom,
  serverApiOrigin,
  shouldProxyApi,
} from "@/lib/apiProxy";

describe("shouldProxyApi", () => {
  it("chuyển tiếp mọi đường dẫn /api/* của API", () => {
    expect(shouldProxyApi("/api/modules")).toBe(true);
    expect(shouldProxyApi("/api/modules/BAA4041/reviews")).toBe(true);
    expect(shouldProxyApi("/api/auth/google/login")).toBe(true);
    expect(shouldProxyApi("/api/modules/ABC.1")).toBe(true); // có dấu chấm vẫn là API
  });

  it("không chuyển tiếp trang web và route do Next.js phục vụ", () => {
    expect(shouldProxyApi("/")).toBe(false);
    expect(shouldProxyApi("/modules")).toBe(false);
    expect(shouldProxyApi("/apiary")).toBe(false);
    expect(shouldProxyApi("/api/webcal")).toBe(false);
    expect(shouldProxyApi("/api/webcal/feed")).toBe(false);
  });
});

describe("buildProxyTarget", () => {
  it("giữ nguyên đường dẫn và query", () => {
    const t = buildProxyTarget("https://api.uelcourses.id.vn", "/api/modules", "?size=20&q=ke+toan");
    expect(t.toString()).toBe("https://api.uelcourses.id.vn/api/modules?size=20&q=ke+toan");
  });

  it("chịu được gốc có hoặc không có dấu gạch chéo cuối", () => {
    expect(buildProxyTarget("https://x.test/", "/api/a", "").toString()).toBe("https://x.test/api/a");
    expect(buildProxyTarget("https://x.test", "/api/a", "").toString()).toBe("https://x.test/api/a");
  });
});

describe("clientIpFrom", () => {
  it("ưu tiên x-real-ip, nếu không thì phần tử đầu của x-forwarded-for", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.5");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.6, 10.0.0.1" }))).toBe("203.0.113.6");
    expect(clientIpFrom(new Headers())).toBeNull();
  });
});

describe("buildProxyHeaders", () => {
  it("gắn khóa và IP khách, giữ cookie và các header khác", () => {
    const h = buildProxyHeaders(
      new Headers({ cookie: "uel_session=abc", accept: "application/json", "x-real-ip": "203.0.113.5" }),
      "bi-mat",
    );
    expect(h.get("x-uel-proxy-secret")).toBe("bi-mat");
    expect(h.get("x-uel-client-ip")).toBe("203.0.113.5");
    expect(h.get("cookie")).toBe("uel_session=abc");
    expect(h.get("accept")).toBe("application/json");
  });

  it("bỏ mọi header X-UEL-* do khách tự gửi (không thể giả IP hay khóa)", () => {
    const h = buildProxyHeaders(
      new Headers({ "x-uel-client-ip": "6.6.6.6", "x-uel-proxy-secret": "doan-mo", "X-UEL-Khac": "1", "x-real-ip": "203.0.113.5" }),
      undefined,
    );
    expect(h.get("x-uel-client-ip")).toBeNull();
    expect(h.get("x-uel-proxy-secret")).toBeNull();
    expect(h.get("x-uel-khac")).toBeNull();
  });

  it("không gắn khóa khi chưa cấu hình hoặc không biết IP khách", () => {
    expect(buildProxyHeaders(new Headers({ "x-real-ip": "203.0.113.5" }), undefined).get("x-uel-proxy-secret")).toBeNull();
    expect(buildProxyHeaders(new Headers(), "bi-mat").get("x-uel-proxy-secret")).toBeNull();
  });
});

describe("serverApiOrigin", () => {
  const saved = { target: process.env.API_PROXY_TARGET, pub: process.env.NEXT_PUBLIC_API_URL };
  afterEach(() => {
    for (const [k, v] of [["API_PROXY_TARGET", saved.target], ["NEXT_PUBLIC_API_URL", saved.pub]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("ưu tiên API_PROXY_TARGET, bỏ qua giá trị cùng nguồn '/'", () => {
    process.env.NEXT_PUBLIC_API_URL = "/";
    process.env.API_PROXY_TARGET = "https://api.uelcourses.id.vn/";
    expect(serverApiOrigin()).toBe("https://api.uelcourses.id.vn");
  });

  it("dùng NEXT_PUBLIC_API_URL tuyệt đối khi không có API_PROXY_TARGET, và localhost khi thiếu cả hai", () => {
    delete process.env.API_PROXY_TARGET;
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
    expect(serverApiOrigin()).toBe("https://api.example.test");
    process.env.NEXT_PUBLIC_API_URL = "/";
    expect(serverApiOrigin()).toBe("http://localhost:8000");
  });
});
