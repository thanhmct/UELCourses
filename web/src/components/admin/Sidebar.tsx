"use client";
import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n";
import { LogoMark } from "@/components/icons";
import type { AdminRole } from "@/lib/types";

export interface NavItem {
  id: string;
  labelKey: string;
  href: string;
  requiredRole?: AdminRole;
  badge?: string;
  icon: (props: { className?: string }) => React.ReactNode;
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    id: "overview",
    labelKey: "admin.overview",
    href: "/admin",
    icon: (p) => (
      <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    id: "trends",
    labelKey: "admin.trends",
    href: "/admin/trends",
    icon: (p) => (
      <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
  {
    id: "feedback",
    labelKey: "admin.feedback",
    href: "/admin/feedback",
    icon: (p) => (
      <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  },
  {
    id: "moderation",
    labelKey: "admin.moderation",
    href: "/admin/moderation",
    badge: "A3",
    icon: (p) => (
      <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    id: "data",
    labelKey: "admin.data",
    href: "/admin/data",
    badge: "A4",
    icon: (p) => (
      <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    id: "outlines",
    labelKey: "admin.outlines",
    href: "/admin/outlines",
    badge: "A4",
    icon: (p) => (
      <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: "calendar",
    labelKey: "admin.calendar",
    href: "/admin/calendar",
    badge: "A5",
    icon: (p) => (
      <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: "system",
    labelKey: "admin.system",
    href: "/admin/system",
    badge: "A6",
    icon: (p) => (
      <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    ),
  },
  {
    id: "users",
    labelKey: "admin.users",
    href: "/admin/users",
    requiredRole: "admin",
    badge: "A6",
    icon: (p) => (
      <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    id: "settings",
    labelKey: "admin.settings",
    href: "/admin/settings",
    badge: "A6",
    icon: (p) => (
      <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

interface SidebarProps {
  role?: AdminRole;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ role = "admin", isMobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useT();

  // Đóng drawer khi nhấn phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileOpen && onCloseMobile) {
        onCloseMobile();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileOpen, onCloseMobile]);

  // Lọc mục theo quyền hạn (PLAN mục 5 & Brief A1: role moderator ẩn mục Tài khoản quản trị)
  const items = ADMIN_NAV_ITEMS.filter((item) => {
    if (item.requiredRole && role !== item.requiredRole) {
      return false;
    }
    return true;
  });

  const navContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      {/* Brand header trong sidebar */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <Link
          href="/admin"
          className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm hover:opacity-80 transition-opacity"
          onClick={onCloseMobile}
        >
          <LogoMark className="h-8 w-auto shrink-0" />
          <div className="leading-tight">
            <div>UELPATH</div>
            <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
              {t("admin.title").replace("UELPATH · ", "")}
            </div>
          </div>
        </Link>
        {isMobileOpen && (
          <button
            type="button"
            className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onCloseMobile}
            aria-label="Đóng menu"
          >
            ✕
          </button>
        )}
      </div>

      {/* Navigation links */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {items.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onCloseMobile}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "brand-selected bg-brand-50 text-brand-ink dark:bg-brand-900 font-semibold"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {item.icon({ className: `w-4 h-4 ${isActive ? "text-brand-600 dark:text-brand-400" : "text-slate-400 dark:text-slate-500"}` })}
                <span>{t(item.labelKey)}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer sidebar */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
        <Link
          href="/"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <span>←</span>
          <span>{t("admin.backToHome")}</span>
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden md:block w-64 shrink-0 fixed inset-y-0 left-0 z-20">
        {navContent}
      </aside>

      {/* Mobile drawer overlay */}
      {isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer panel */}
      {isMobileOpen && (
        <aside
          className="md:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform transition-transform duration-200 ease-in-out translate-x-0"
          aria-label="Admin Navigation"
        >
          {navContent}
        </aside>
      )}
    </>
  );
}
