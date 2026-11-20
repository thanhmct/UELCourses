"use client";

import { calculateWorkload, formatWorkloadString } from "@/lib/workload";

interface Props {
  credits: number;
  type?: string;
  showDetails?: boolean;
}

export function WorkloadBreakdownView({ credits, type, showDetails = false }: Props) {
  const w = calculateWorkload(credits, type);

  if (w.total_hours === 0) return null;

  return (
    <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-800 dark:text-slate-100">
          Khối lượng học tập (Workload):
        </span>
        <span className="font-mono rounded bg-slate-100 px-2 py-0.5 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {formatWorkloadString(w)}
        </span>
      </div>

      {showDetails && (
        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
          <div className="rounded border border-slate-200 p-1.5 dark:border-slate-700">
            <span className="block text-[10px] text-slate-400">Giảng đường / LT</span>
            <span className="font-semibold text-brand-700 dark:text-brand-300">{w.lecture} giờ/tuần</span>
          </div>
          {w.tutorial > 0 && (
            <div className="rounded border border-slate-200 p-1.5 dark:border-slate-700">
              <span className="block text-[10px] text-slate-400">Thảo luận / Bài tập</span>
              <span className="font-semibold text-brand-700 dark:text-brand-300">{w.tutorial} giờ/tuần</span>
            </div>
          )}
          {w.practical > 0 && (
            <div className="rounded border border-slate-200 p-1.5 dark:border-slate-700">
              <span className="block text-[10px] text-slate-400">Thực hành / Phòng Lab</span>
              <span className="font-semibold text-amber-700 dark:text-amber-300">{w.practical} giờ/tuần</span>
            </div>
          )}
          {w.project > 0 && (
            <div className="rounded border border-slate-200 p-1.5 dark:border-slate-700">
              <span className="block text-[10px] text-slate-400">Dự án nhóm</span>
              <span className="font-semibold text-purple-700 dark:text-purple-300">{w.project} giờ/tuần</span>
            </div>
          )}
          <div className="rounded border border-slate-200 p-1.5 dark:border-slate-700">
            <span className="block text-[10px] text-slate-400">Tự học & Chuẩn bị</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">{w.self_study} giờ/tuần</span>
          </div>
        </div>
      )}
    </div>
  );
}
