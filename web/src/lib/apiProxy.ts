/**
 * Chuyển tiếp /api/* từ web (Vercel) sang API (Render qua Cloudflare).
 *
 * Mục đích: một số mạng (trường, nhà mạng) chặn tên miền api.uelcourses.id.vn. Khi trình duyệt chỉ gọi
 * cùng nguồn với trang web (`/api/...`), người dùng chỉ cần truy cập được tên miền của web.
 *
 * Bảo mật: web gắn IP khách thật (do Vercel đặt, khách không giả được) và khóa dùng chung vào header để API
 * phân biệt đúng người dùng khi giới hạn tần suất; mọi header X-UEL-* do khách gửi đều bị bỏ.
 */

/** Các route /api do chính Next.js phục vụ, không chuyển tiếp. */
const LOCAL_API_PREFIXES = ["/api/webcal"];

export const PROXY_SECRET_HEADER = "x-uel-proxy-secret";
export const PROXY_CLIENT_IP_HEADER = "x-uel-client-ip";

export function shouldProxyApi(pathname: string): boolean {
  if (pathname !== "/api" && !pathname.startsWith("/api/")) return false;
  return !LOCAL_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Địa chỉ đích: ghép gốc API với đường dẫn và query của yêu cầu gốc. */
export function buildProxyTarget(base: string, pathname: string, search: string): URL {
  return new URL(`${pathname}${search}`, base.endsWith("/") ? base : `${base}/`);
}

/** IP khách do hạ tầng Vercel đặt (x-real-ip, hoặc phần tử đầu của x-forwarded-for). */
export function clientIpFrom(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || null;
}

/** Header gửi sang API: bỏ mọi X-UEL-* do khách gửi, rồi gắn khóa và IP khách thật. */
export function buildProxyHeaders(incoming: Headers, secret: string | undefined): Headers {
  const headers = new Headers(incoming);
  for (const name of Array.from(headers.keys())) {
    if (name.toLowerCase().startsWith("x-uel-")) headers.delete(name);
  }
  const ip = clientIpFrom(incoming);
  if (secret && ip) {
    headers.set(PROXY_SECRET_HEADER, secret);
    headers.set(PROXY_CLIENT_IP_HEADER, ip);
  }
  return headers;
}

/** Gốc API dùng ở phía máy chủ Next.js (route /api/webcal, middleware). */
export function serverApiOrigin(): string {
  const candidates = [process.env.API_PROXY_TARGET, process.env.NEXT_PUBLIC_API_URL];
  for (const value of candidates) {
    const v = (value || "").trim().replace(/\/$/, "");
    if (v && v.startsWith("http")) return v;
  }
  return "http://localhost:8000";
}
