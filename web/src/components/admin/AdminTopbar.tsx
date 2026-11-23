"use client";
import React from "react";
import Link from "next/link";
import { useT } from "@/i18n";
import type { AdminRole } from "@/lib/types";

interface AdminTopbarProps {
  email?: string;
  role?: AdminRole;
  onToggleMobile?: () => void;
  onLogout?: () => void;
}

export function AdminTopbar({
  email = "dev@uelcourses.local",
  role = "admin",
  onToggleMobile,
  onLogout,
}: AdminTopbarProps) {
  const { t } = useT();

  const roleLabel = {
    admin: t("admin.roleAdmin"),
    moderator: t("admin.roleModerator"),
    data_editor: t("admin.roleDataEditor"),
  }[role];

  const roleColor = {
    admin: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
    moderator: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    data_editor: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  }[role];

  return (
    <header className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 h-14 flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-3">
        {/* Nút mở drawer trên di động */}
        <button
          type="button"
          onClick={onToggleMobile}
          className="md:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          aria-label="Mở danh mục điều hướng"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <Link href="/admin" className="font-bold text-slate-800 dark:text-slate-100 text-sm hidden sm:block">
          {t("admin.title")}
        </Link>
      </div>

      <div className="flex items-center gap-3">
        {/* User email & Role badge */}
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-slate-700 dark:text-slate-300 hidden sm:inline max-w-[180px] truncate">
            {email}
          </span>
          <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${roleColor}`}>
            {roleLabel}
          </span>
        </div>

        {/* Nút Đăng xuất */}
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="btn-outline text-xs px-2.5 py-1 text-slate-600 hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400"
          >
            {t("admin.logout")}
          </button>
        )}
      </div>
    </header>
  );
}
