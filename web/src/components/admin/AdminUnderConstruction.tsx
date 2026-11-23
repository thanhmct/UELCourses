"use client";
import React from "react";
import Link from "next/link";
import { useT } from "@/i18n";

interface AdminUnderConstructionProps {
  titleKey: string;
  phaseCode: string; // e.g. "A2", "A3", "A4", "A5", "A6"
}

export function AdminUnderConstruction({ titleKey, phaseCode }: AdminUnderConstructionProps) {
  const { t } = useT();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
          {t(titleKey)}
        </h1>
        <span className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Kế hoạch {phaseCode}
        </span>
      </div>

      <div className="card p-10 text-center flex flex-col items-center justify-center min-h-[360px] border-dashed border-2 border-slate-200 dark:border-slate-800">
        <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center text-2xl mb-4 font-mono">
          🔨
        </div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
          {t("admin.underConstruction")} ({phaseCode})
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
          {t("admin.underConstructionDesc")}
        </p>
        <Link href="/admin" className="btn-primary text-xs px-4 py-2">
          ← {t("admin.overview")}
        </Link>
      </div>
    </div>
  );
}
