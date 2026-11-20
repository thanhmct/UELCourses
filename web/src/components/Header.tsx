"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MockBadge } from "./MockBadge";

export const NAV = [
  { href: "/today", label: "Hôm nay" },
  { href: "/modules", label: "Học phần" },
  { href: "/programs", label: "CTĐT" },
  { href: "/timetable", label: "Thời khóa biểu" },
  { href: "/planner", label: "Kế hoạch" },
  { href: "/venues", label: "Phòng học" },
  { href: "/equivalents", label: "Tương đương" },
  { href: "/regulations", label: "Quy chế" },
  { href: "/settings", label: "Cài đặt" },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold text-brand-600 dark:text-brand-300">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm text-white">UP</span>
      <span className="text-lg tracking-tight">UELPlan</span>
    </Link>
  );
}

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => path === href || path.startsWith(href + "/");
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Logo />
        <MockBadge />
        <nav className="ml-auto hidden gap-1 lg:flex" aria-label="Điều hướng chính">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                active(n.href)
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <button
          className="btn-ghost ml-auto lg:hidden"
          aria-label="Mở menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        </button>
      </div>
      {open && (
        <nav className="border-t border-slate-200 px-4 py-2 lg:hidden dark:border-slate-800" aria-label="Điều hướng di động">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={`block rounded-lg px-3 py-2 text-sm ${active(n.href) ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-200" : ""}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
