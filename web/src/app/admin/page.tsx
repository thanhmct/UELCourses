"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { KpiCard } from "@/components/admin/KpiCard";
import { adminApi } from "@/lib/adminApi";
import type { AdminOverview } from "@/lib/types";
import { useT } from "@/i18n";

export default function AdminOverviewPage() {
  const { t } = useT();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await adminApi.getOverview();
        if (active) {
          setOverview(data);
          setLoading(false);
        }
      } catch {
        if (active) {
          // Fallback an toàn số liệu 0
          setOverview({
            active_anon_7d: 0,
            active_anon_30d: 0,
            timetable_adds_7d: 0,
            planner_adds_7d: 0,
            moderation_pending: 0,
            data_review_pending: 0,
            errors_24h: 0,
            last_import_at: null,
          });
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const pendingModeration = overview?.moderation_pending || 0;
  const pendingDataReview = overview?.data_review_pending || 0;
  const errorCount24h = overview?.errors_24h || 0;
  const hasTodos = pendingModeration > 0 || pendingDataReview > 0 || errorCount24h > 0;

  return (
    <div className="space-y-6">
      {/* Tiêu đề trang */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
          {t("admin.overview")}
        </h1>
        {overview?.last_import_at && (
          <span className="text-xs text-slate-500 font-mono">
            {t("admin.kpiLastImport")}: {new Date(overview.last_import_at).toLocaleString("vi-VN")}
          </span>
        )}
      </div>

      {/* 6 Thẻ KPI chính (Brief A1 Yêu cầu 4) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          title={t("admin.kpiActive7d")}
          value={overview?.active_anon_7d ?? 0}
          subtitle="Người dùng ẩn danh tuần qua"
          loading={loading}
        />
        <KpiCard
          title={t("admin.kpiActive30d")}
          value={overview?.active_anon_30d ?? 0}
          subtitle="Người dùng ẩn danh tháng qua"
          loading={loading}
        />
        <KpiCard
          title={t("admin.kpiTimetable7d")}
          value={overview?.timetable_adds_7d ?? 0}
          subtitle="Lượt thêm môn vào TKB"
          loading={loading}
        />
        <KpiCard
          title={t("admin.kpiPlanner7d")}
          value={overview?.planner_adds_7d ?? 0}
          subtitle="Lượt thêm môn vào Kế hoạch"
          loading={loading}
        />
        <KpiCard
          title={t("admin.kpiModeration")}
          value={pendingModeration}
          subtitle={pendingModeration > 0 ? t("admin.viewDetails") : "Không có hàng chờ"}
          href={pendingModeration > 0 ? "/admin/moderation" : undefined}
          loading={loading}
        />
        <KpiCard
          title={t("admin.kpiDataReview")}
          value={pendingDataReview}
          subtitle={pendingDataReview > 0 ? t("admin.viewDetails") : "Dữ liệu đã đầy đủ"}
          href={pendingDataReview > 0 ? "/admin/data" : undefined}
          loading={loading}
        />
      </div>

      {/* Biểu đồ hoạt động 30 ngày (Brief A2) */}
      <section className="card p-5 sm:p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
            {t("admin.activityLast30d")}
          </h2>
          <Link
            href="/admin/trends"
            className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
          >
            {t("admin.trends")} →
          </Link>
        </div>
        {loading ? (
          <div className="h-28 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-md" />
        ) : overview?.activity_30d && overview.activity_30d.length > 0 ? (
          <div className="w-full overflow-x-auto">
            <svg
              viewBox="0 0 600 120"
              className="w-full h-28 overflow-visible"
              role="img"
              aria-label={t("admin.activityLast30d")}
            >
              {(() => {
                const acts = overview.activity_30d;
                const max = Math.max(...acts.map((a) => a.count), 10);
                const pts = acts.map((item, idx) => {
                  const x = 20 + (idx / (acts.length - 1)) * 560;
                  const y = 100 - (item.count / max) * 80;
                  return `${x},${y}`;
                }).join(" ");
                return (
                  <>
                    <polyline
                      fill="none"
                      className="stroke-brand-focus"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={pts}
                    />
                    {acts.map((item, idx) => {
                      const x = 20 + (idx / (acts.length - 1)) * 560;
                      const y = 100 - (item.count / max) * 80;
                      return (
                        <circle
                          key={item.date}
                          cx={x}
                          cy={y}
                          r="3"
                          className="fill-brand-focus stroke-white dark:stroke-slate-900 cursor-pointer hover:r-4 transition-all"
                        >
                          <title>{`${item.date}: ${item.count} sự kiện`}</title>
                        </circle>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-4 text-center">Chưa có dữ liệu hoạt động 30 ngày.</p>
        )}
      </section>

      {/* Danh sách Việc cần làm (To-do list) */}
      <section className="card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
            {t("admin.todosTitle")}
          </h2>
          <span className="text-xs text-slate-500">
            {hasTodos ? "Cần xử lý" : "Đã hoàn thành"}
          </span>
        </div>

        {hasTodos ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {pendingModeration > 0 && (
              <div className="py-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-slate-800 dark:text-slate-200">
                    {t("admin.todoModeration", { count: pendingModeration })}
                  </span>
                </div>
                <Link
                  href="/admin/moderation"
                  className="btn-outline text-xs px-3 py-1 font-medium text-brand-600 dark:text-brand-400"
                >
                  Xử lý ngay →
                </Link>
              </div>
            )}

            {pendingDataReview > 0 && (
              <div className="py-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sky-500" />
                  <span className="text-slate-800 dark:text-slate-200">
                    {t("admin.todoDataReview", { count: pendingDataReview })}
                  </span>
                </div>
                <Link
                  href="/admin/data"
                  className="btn-outline text-xs px-3 py-1 font-medium text-brand-600 dark:text-brand-400"
                >
                  Rà soát →
                </Link>
              </div>
            )}

            {errorCount24h > 0 && (
              <div className="py-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-slate-800 dark:text-slate-200">
                    {t("admin.todoErrors", { count: errorCount24h })}
                  </span>
                </div>
                <Link
                  href="/admin/system"
                  className="btn-outline text-xs px-3 py-1 font-medium text-red-600 dark:text-red-400"
                >
                  Xem nhật ký →
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 text-center text-slate-500 text-xs">
            <span className="text-emerald-500 text-lg mr-1.5">✓</span>
            {t("admin.todoEmpty")}
          </div>
        )}
      </section>
    </div>
  );
}
