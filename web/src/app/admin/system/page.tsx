"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n";
import { adminApi } from "@/lib/adminApi";
import type { AdminSystemInfo } from "@/lib/types";

export default function AdminSystemPage() {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [systemInfo, setSystemInfo] = useState<AdminSystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getSystemInfo();
      setSystemInfo(data);
    } catch (err: any) {
      setError(err?.message || "Không thể tải thông tin hệ thống");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatBytes = (bytes?: number | null) => {
    if (bytes === undefined || bytes === null) return "—";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const filteredTables = (systemInfo?.table_stats || []).filter((tbl) =>
    tbl.name.toLowerCase().includes(tableSearch.toLowerCase().trim())
  );

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            {t("admin.sysTitle")}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t("admin.sysSubtitle")}
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2">
          <Link
            href="/admin/system"
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-white shadow-sm"
          >
            {t("admin.tabSystem")}
          </Link>
          <Link
            href="/admin/audit"
            className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            {t("admin.tabAudit")}
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-gray-100 dark:bg-gray-800 rounded-xl" />
          ))}
        </div>
      ) : systemInfo ? (
        <>
          {/* Status KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Database & ENV */}
            <div className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("admin.cardDbStatus")}
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-bold text-gray-900 dark:text-white capitalize">
                  {systemInfo.env}
                </span>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  v{systemInfo.app_version}
                </span>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-2 truncate">
                CORS: {systemInfo.safe_config?.cors_origins || "Mặc định"}
              </span>
            </div>

            {/* Alembic Revision */}
            <div className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("admin.cardAlembic")}
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-bold font-mono text-gray-900 dark:text-white">
                  {systemInfo.alembic_head || "—"}
                </span>
                {systemInfo.alembic_match ? (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                    {t("admin.statusOk")}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                    {t("admin.statusWarning")} ({systemInfo.alembic_current || "None"})
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                DB rev: {systemInfo.alembic_current || "Chưa có bảng revision"}
              </span>
            </div>

            {/* Last Import */}
            <div className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("admin.cardLastImport")}
              </span>
              <div className="mt-2">
                <span className="text-sm font-bold text-gray-900 dark:text-white truncate block">
                  {systemInfo.last_import_at
                    ? new Date(systemInfo.last_import_at).toLocaleString("vi-VN")
                    : t("admin.statusNoImport")}
                </span>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Nguồn: Cổng ĐKHP / Excel
              </span>
            </div>

            {/* 24h Errors */}
            <div className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("admin.cardErrors24h")}
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {systemInfo.errors_24h}
                </span>
                {systemInfo.errors_24h === 0 ? (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                    {t("admin.statusOk")}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300">
                    {systemInfo.errors_24h} lỗi
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Lỗi 5xx máy chủ
              </span>
            </div>
          </div>

          {/* Table Counts & Storage Table */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  {t("admin.tableStatsTitle")}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Tổng hợp số dòng và kích thước bảng trong cơ sở dữ liệu
                </p>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Lọc tên bảng..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="w-full sm:w-64 px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 uppercase font-semibold">
                    <th className="py-3 px-4">{t("admin.colTableName")}</th>
                    <th className="py-3 px-4 text-right">{t("admin.colRowCount")}</th>
                    <th className="py-3 px-4 text-right">{t("admin.colSize")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-300 font-mono">
                  {filteredTables.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-gray-400 italic font-sans">
                        Không tìm thấy bảng phù hợp.
                      </td>
                    </tr>
                  ) : (
                    filteredTables.map((tbl) => (
                      <tr key={tbl.name} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition">
                        <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-gray-100">
                          {tbl.name}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {tbl.count.toLocaleString("vi-VN")}
                        </td>
                        <td className="py-2.5 px-4 text-right text-gray-500 dark:text-gray-400">
                          {formatBytes(tbl.size_bytes)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Safe Environment Configuration */}
          <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              {t("admin.safeConfigTitle")}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-800">
                <span className="text-gray-500 dark:text-gray-400 block font-sans">Môi trường (ENV)</span>
                <span className="font-semibold font-mono text-gray-900 dark:text-white mt-0.5 block">
                  {systemInfo.safe_config?.env}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-800">
                <span className="text-gray-500 dark:text-gray-400 block font-sans">Chế độ phân tích (Analytics)</span>
                <span className="font-semibold font-mono text-gray-900 dark:text-white mt-0.5 block">
                  {systemInfo.safe_config?.analytics_enabled ? "Đang bật (Enabled)" : "Đã tắt (Disabled)"}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-800">
                <span className="text-gray-500 dark:text-gray-400 block font-sans">Thời gian lưu sự kiện thô</span>
                <span className="font-semibold font-mono text-gray-900 dark:text-white mt-0.5 block">
                  {systemInfo.safe_config?.analytics_retention_days} ngày
                </span>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-800">
                <span className="text-gray-500 dark:text-gray-400 block font-sans">Nguồn AI Quy chế (LLM)</span>
                <span className="font-semibold font-mono text-gray-900 dark:text-white mt-0.5 block">
                  {systemInfo.safe_config?.llm_provider || "extractive"}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-800">
                <span className="text-gray-500 dark:text-gray-400 block font-sans">Tự nạp mẫu (Auto Seed)</span>
                <span className="font-semibold font-mono text-gray-900 dark:text-white mt-0.5 block">
                  {systemInfo.safe_config?.auto_seed ? "True" : "False"}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-800">
                <span className="text-gray-500 dark:text-gray-400 block font-sans">Khóa CTĐT tối thiểu</span>
                <span className="font-semibold font-mono text-gray-900 dark:text-white mt-0.5 block">
                  K{systemInfo.safe_config?.min_program_cohort || 23}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Link
                href="/admin/audit"
                className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
              >
                {t("admin.goToAudit")}
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
