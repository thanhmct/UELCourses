"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/admin/Sidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { adminApi, AdminApiError } from "@/lib/adminApi";
import type { AdminUser } from "@/lib/types";
import { useT } from "@/i18n";
import { ConnectionNotice } from "@/components/MockBadge";
import { Loading } from "@/components/ui";

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useT();

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notEnabled, setNotEnabled] = useState(false);

  // Trang login không bọc trong sidebar/topbar
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      try {
        const user = await adminApi.getMe();
        if (active) {
          setCurrentUser(user);
          setLoading(false);
        }
      } catch (err: any) {
        if (!active) return;

        // Nếu API trả về 404: Khu vực quản trị chưa bật (ADMIN_DEV_OPEN=false hoặc production)
        if (err instanceof AdminApiError && err.status === 404) {
          setNotEnabled(true);
          setLoading(false);
          return;
        }

        // Nếu 401 (chế độ A0 sau này): chuyển tới trang đăng nhập
        if (err instanceof AdminApiError && err.status === 401) {
          if (!isLoginPage) {
            router.push(`/admin/login?next=${encodeURIComponent(pathname)}`);
          }
          setLoading(false);
          return;
        }

        // Trường hợp khác (ví dụ offline/dev): giữ chế độ dev dự phòng
        setCurrentUser({
          id: 0,
          email: "dev@uelcourses.local",
          role: "admin",
          actor_type: "dev",
        });
        setLoading(false);
      }
    }

    checkAuth();

    return () => {
      active = false;
    };
  }, [pathname, isLoginPage, router]);

  const handleLogout = async () => {
    await adminApi.logout();
    setCurrentUser(null);
    router.push("/admin/login");
  };

  if (isLoginPage) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center">
        {/* Dải nhỏ cố định chế độ phát triển — ẩn ở production (PLAN_ADMIN Mục 8) */}
        {process.env.NODE_ENV !== "production" && (
          <div className="fixed top-0 inset-x-0 z-50 bg-amber-500/15 border-b border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs py-1 px-4 text-center font-medium">
            {t("admin.devModeBanner")}
          </div>
        )}
        {children}
      </div>
    );
  }

  // Khi API trả 404: Trang thông báo "Khu vực quản trị chưa bật" (PLAN_ADMIN mục 8)
  if (notEnabled) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="card p-8 sm:p-10 max-w-md w-full border-dashed border-2 border-slate-300 dark:border-slate-700">
          <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center justify-center text-2xl mx-auto mb-4">
            🔒
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            {t("admin.notEnabledTitle")}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            {t("admin.notEnabledDesc")}
          </p>
          <Link href="/" className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5">
            <span aria-hidden="true">←</span>
            <span>{t("admin.backToHome")}</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col text-slate-900 dark:text-slate-100">
      {/* 1. Dải nhỏ: Chế độ phát triển — ẩn ở production (PLAN_ADMIN Mục 8) */}
      {process.env.NODE_ENV !== "production" && (
        <div className="sticky top-0 z-30 bg-amber-500/15 border-b border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs py-1 px-4 text-center font-medium">
          {t("admin.devModeBanner")}
        </div>
      )}

      <div className="flex flex-1 relative">
        {/* 2. Sidebar trái cố định */}
        <Sidebar
          role={currentUser?.role || "admin"}
          isMobileOpen={isMobileOpen}
          onCloseMobile={() => setIsMobileOpen(false)}
        />

        {/* 3. Vùng nội dung chính */}
        <div className="flex-1 md:pl-64 flex flex-col min-w-0">
          <AdminTopbar
            email={currentUser?.email || "dev@uelcourses.local"}
            role={currentUser?.role || "admin"}
            onToggleMobile={() => setIsMobileOpen(true)}
            onLogout={handleLogout}
          />

          <main className="flex-1 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-6rem)]">
            <ConnectionNotice />
            {loading ? <Loading /> : children}
          </main>
        </div>
      </div>
    </div>
  );
}
