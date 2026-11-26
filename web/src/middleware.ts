import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildProxyHeaders, buildProxyTarget, shouldProxyApi } from "@/lib/apiProxy";

export function middleware(request: NextRequest) {
  const surface = process.env.UELPATH_SURFACE || "student";
  const { pathname } = request.nextUrl;

  // Chuyển tiếp /api/* sang API (bật khi đặt API_PROXY_TARGET, vd trên Vercel). Đặt trước mọi kiểm tra khác
  // vì đường dẫn API có thể chứa dấu chấm (mã học phần) và không được coi là file tĩnh.
  const proxyBase = process.env.API_PROXY_TARGET;
  if (proxyBase && shouldProxyApi(pathname)) {
    const target = buildProxyTarget(proxyBase, pathname, request.nextUrl.search);
    return NextResponse.rewrite(target, {
      request: { headers: buildProxyHeaders(request.headers, process.env.PROXY_SHARED_SECRET) },
    });
  }

  // Always pass through /_next/*, static files (anything with a file extension), favicon/manifest/icons/sw.js, and Next internals
  if (
    pathname.startsWith("/_next") ||
    pathname === "/sw.js" ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (surface === "admin") {
    // Admin surface: ONLY /admin and /admin/*
    // "/" redirects to "/admin"; any other non-/admin page path redirects to "/admin".
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      return NextResponse.next();
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/admin";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Student surface (default)
  // Any request to /admin or /admin/* returns a 404 (rewrite to the app's not-found, status 404)
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const notFoundUrl = request.nextUrl.clone();
    notFoundUrl.pathname = "/not-found";
    return NextResponse.rewrite(notFoundUrl, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sw.js (service worker)
     * - Static asset file extensions
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff|woff2)$).*)",
  ],
};
