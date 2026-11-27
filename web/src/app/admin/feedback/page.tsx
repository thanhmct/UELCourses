"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n";
import { adminApi } from "@/lib/adminApi";
import type {
  AdminFeedbackDetail,
  AdminFeedbackItem,
  AdminFeedbackSummaryResponse,
  ModuleReviewStat,
} from "@/lib/types";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { KpiCard } from "@/components/admin/KpiCard";

type ActiveTab = "text" | "modules";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function renderStars(rating: number): string {
  const clamped = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(clamped) + "☆".repeat(5 - clamped);
}

function truncateText(text: string, maxLen = 80): string {
  if (!text) return "";
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

export default function AdminFeedbackPage() {
  const { t } = useT();

  const [activeTab, setActiveTab] = useState<ActiveTab>("text");
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AdminFeedbackSummaryResponse | null>(null);

  const [detailOpen, setDetailOpen] = useState<boolean>(false);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [selectedDetail, setSelectedDetail] = useState<AdminFeedbackDetail | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getFeedbackSummary({
        page,
        size: pageSize,
        rating: ratingFilter ?? undefined,
      });
      setSummary(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load feedback summary");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, ratingFilter]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleFilterChange = (star: number | null) => {
    setRatingFilter(star);
    setPage(1);
  };

  const handleOpenDetail = async (item: AdminFeedbackItem) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setSelectedDetail({
      ...item,
      is_quick_rating: false,
    });
    try {
      const detail = await adminApi.getFeedbackDetail(item.id);
      setSelectedDetail(detail);
    } catch {
      // Keep basic item fields if detail fetch fails
    } finally {
      setDetailLoading(false);
    }
  };

  const feedbackStats = summary?.feedback_stats;
  const reviewsStats = summary?.reviews_stats;
  const dist = feedbackStats?.rating_distribution || { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  const totalFb = feedbackStats?.total ?? 0;

  const textColumns: Column<AdminFeedbackItem>[] = [
    {
      key: "rating",
      header: t("admin.feedbackColRating"),
      className: "whitespace-nowrap",
      render: (item) => (
        <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
          <span>{renderStars(item.rating)}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">({item.rating})</span>
        </span>
      ),
    },
    {
      key: "page",
      header: t("admin.feedbackColPage"),
      className: "font-mono text-xs whitespace-nowrap",
    },
    {
      key: "category",
      header: t("admin.feedbackColCategory"),
      className: "whitespace-nowrap",
      render: (item) => (
        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {item.category}
        </span>
      ),
    },
    {
      key: "message",
      header: t("admin.feedbackColMessage"),
      render: (item) => (
        <button
          type="button"
          onClick={() => handleOpenDetail(item)}
          className="text-left w-full text-slate-800 dark:text-slate-200 hover:text-brand-600 dark:hover:text-brand-400 transition-colors underline-offset-2 hover:underline"
          title={t("admin.feedbackDetailViewBtn")}
        >
          {truncateText(item.message, 90)}
        </button>
      ),
    },
    {
      key: "created_at",
      header: t("admin.feedbackColDate"),
      className: "whitespace-nowrap text-xs text-slate-500",
      render: (item) => formatDate(item.created_at),
    },
  ];

  const moduleColumns: Column<ModuleReviewStat>[] = [
    {
      key: "module_code",
      header: t("admin.feedbackColModule"),
      className: "font-mono font-semibold whitespace-nowrap",
    },
    {
      key: "module_name",
      header: t("admin.feedbackColModuleName"),
      render: (item) => item.module_name || "—",
    },
    {
      key: "count",
      header: t("admin.feedbackColCount"),
      className: "font-mono whitespace-nowrap",
    },
    {
      key: "average_rating",
      header: t("admin.feedbackColAvg"),
      className: "whitespace-nowrap",
      render: (item) => (
        <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
          <span>★</span>
          <span>{item.average_rating.toFixed(2)}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          {t("admin.feedbackTitle")}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {t("admin.feedbackSubtitle")}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 text-sm"
        >
          {error}
        </div>
      )}

      {/* KPI Cards & 1-5 Star Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          title={t("admin.feedbackAvgRating")}
          value={
            feedbackStats?.average_rating !== null && feedbackStats?.average_rating !== undefined
              ? `${feedbackStats.average_rating.toFixed(2)} ★`
              : "—"
          }
          subtitle={t("admin.feedbackTotalRatings", { count: totalFb })}
          loading={loading && !summary}
        />

        <KpiCard
          title={t("admin.reviewsAvgRating")}
          value={
            reviewsStats?.average_rating !== null && reviewsStats?.average_rating !== undefined
              ? `${reviewsStats.average_rating.toFixed(2)} ★`
              : "—"
          }
          subtitle={t("admin.reviewsTotal", { count: reviewsStats?.total ?? 0 })}
          loading={loading && !summary}
        />

        <div className="card p-5 flex flex-col justify-between min-h-[120px]">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            {t("admin.feedbackDistribution")}
          </div>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = dist[String(star)] ?? 0;
              const pct = totalFb > 0 ? Math.round((count / totalFb) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-8 font-mono text-slate-600 dark:text-slate-300">
                    {star}★
                  </span>
                  <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 dark:bg-amber-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-mono text-slate-500 dark:text-slate-400">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabs + Star Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 sm:border-b-0">
          <button
            type="button"
            onClick={() => setActiveTab("text")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "text"
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {t("admin.feedbackTabText")} ({summary?.total ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("modules")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "modules"
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {t("admin.feedbackTabModules")} ({reviewsStats?.by_module.length ?? 0})
          </button>
        </div>

        {activeTab === "text" && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("admin.feedbackColRating")}>
            <button
              type="button"
              onClick={() => handleFilterChange(null)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                ratingFilter === null
                  ? "bg-brand-600 text-white border-brand-600"
                  : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {t("admin.feedbackFilterAllStars")}
            </button>
            {[5, 4, 3, 2, 1].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => handleFilterChange(star)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  ratingFilter === star
                    ? "bg-amber-500 text-white border-amber-500"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {t("admin.feedbackFilterStar", { star })}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === "text" ? (
        !loading && (summary?.items?.length ?? 0) === 0 ? (
          <EmptyState title={t("admin.feedbackEmpty")} />
        ) : (
          <DataTable<AdminFeedbackItem>
            columns={textColumns}
            data={summary?.items || []}
            loading={loading}
            page={page}
            total={summary?.total || 0}
            pageSize={pageSize}
            onPageChange={setPage}
            emptyTitle={t("admin.feedbackEmpty")}
          />
        )
      ) : !loading && (reviewsStats?.by_module?.length ?? 0) === 0 ? (
        <EmptyState title={t("admin.feedbackReviewsEmpty")} />
      ) : (
        <DataTable<ModuleReviewStat>
          columns={moduleColumns}
          data={reviewsStats?.by_module || []}
          keyField="module_code"
          loading={loading}
          emptyTitle={t("admin.feedbackReviewsEmpty")}
        />
      )}

      {/* Detail Modal */}
      {detailOpen && selectedDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-detail-title"
        >
          <div className="card w-full max-w-lg p-6 space-y-4 bg-white dark:bg-slate-900 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="feedback-detail-title"
                  className="text-lg font-bold text-slate-900 dark:text-slate-50"
                >
                  {t("admin.feedbackDetailTitle")} #{selectedDetail.id}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatDate(selectedDetail.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="btn-outline px-3 py-1 text-xs"
              >
                {t("admin.feedbackDetailClose")}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">{t("admin.feedbackColRating")}: </span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {renderStars(selectedDetail.rating)} ({selectedDetail.rating}/5)
                </span>
              </div>
              <div>
                <span className="text-slate-500">{t("admin.feedbackColCategory")}: </span>
                <span className="font-medium">{selectedDetail.category}</span>
              </div>
              <div>
                <span className="text-slate-500">{t("admin.feedbackColPage")}: </span>
                <span className="font-mono">{selectedDetail.page}</span>
              </div>
              <div>
                <span className="text-slate-500">{t("admin.feedbackDetailVersion")}: </span>
                <span className="font-mono">{selectedDetail.app_version || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500">{t("admin.feedbackDetailStatus")}: </span>
                <span className="font-medium">{selectedDetail.status}</span>
              </div>
              {selectedDetail.contact && (
                <div>
                  <span className="text-slate-500">{t("admin.feedbackDetailContact")}: </span>
                  <span>{selectedDetail.contact}</span>
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
              {detailLoading ? "..." : selectedDetail.message}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
