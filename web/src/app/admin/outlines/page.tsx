"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpen, ExternalLink, FileText, Layers, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { useT } from "@/i18n";
import { adminApi, AdminApiError } from "@/lib/adminApi";
import type {
  OutlineCoverageResponse,
  OutlineDriveLinkItem,
  OutlineMissingItem,
  OutlineOcrPendingItem,
} from "@/lib/types";
import { Loading } from "@/components/ui";

export default function AdminOutlinesPage() {
  const { t } = useT();

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Coverage Data
  const [coverageData, setCoverageData] = useState<OutlineCoverageResponse | null>(null);

  // Missing Outlines State
  const [missingItems, setMissingItems] = useState<OutlineMissingItem[]>([]);
  const [missingTotal, setMissingTotal] = useState<number>(0);
  const [missingPage, setMissingPage] = useState<number>(1);
  const [missingSearch, setMissingSearch] = useState<string>("");
  const [missingSort, setMissingSort] = useState<string>("open_classes");
  const pageSize = 15;

  // OCR Pending State
  const [ocrItems, setOcrItems] = useState<OutlineOcrPendingItem[]>([]);
  const [ocrTotal, setOcrTotal] = useState<number>(0);

  // Drive Links State
  const [driveItems, setDriveItems] = useState<OutlineDriveLinkItem[]>([]);
  const [driveTotal, setDriveTotal] = useState<number>(0);

  // Load All Outlines Data
  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [covRes, misRes, ocrRes, driveRes] = await Promise.all([
        adminApi.getOutlinesCoverage(),
        adminApi.getOutlinesMissing({
          sort: missingSort,
          q: missingSearch.trim() || undefined,
          page: missingPage,
          size: pageSize,
        }),
        adminApi.getOutlinesOcrPending({ page: 1, size: 20 }),
        adminApi.getOutlinesDriveLinks({ page: 1, size: 20 }),
      ]);

      setCoverageData(covRes);
      setMissingItems(misRes.items || []);
      setMissingTotal(misRes.total || 0);
      setOcrItems(ocrRes.items || []);
      setOcrTotal(ocrRes.total || 0);
      setDriveItems(driveRes.items || []);
      setDriveTotal(driveRes.total || 0);
    } catch (err: any) {
      if (err instanceof AdminApiError && err.status === 403) {
        setErrorMsg("Bạn không có quyền truy cập chức năng này (yêu cầu vai trò Admin hoặc Data Editor).");
      } else {
        setErrorMsg("Không thể tải thông tin độ phủ đề cương. Vui lòng thử lại.");
      }
    } finally {
      setLoading(false);
    }
  }, [missingSort, missingSearch, missingPage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalMissingPages = Math.max(1, Math.ceil(missingTotal / pageSize));

  return (
    <div className="space-y-8 pb-16">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {t("admin.outlinesTitle")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t("admin.outlinesSubtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300 rounded-lg">
          {errorMsg}
        </div>
      )}

      {loading && !coverageData ? (
        <div className="p-16 flex justify-center">
          <Loading />
        </div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {t("admin.coverageTotal")}
                </span>
                <Layers className="h-5 w-5 text-brand-ink" />
              </div>
              <div className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {coverageData?.total_modules ?? 0}
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                Tổng số học phần trong danh mục đào tạo
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {t("admin.coverageWithOutline")}
                </span>
                <BookOpen className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {coverageData?.modules_with_outline ?? 0}
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                Học phần đã có đề cương chi tiết (PDF)
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {t("admin.coverageRate")}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded info-chip">
                  {coverageData?.coverage_pct ?? 0}%
                </span>
              </div>
              <div className="mt-2 text-2xl font-bold text-brand-ink">
                {coverageData?.coverage_pct ?? 0}%
              </div>
              {/* Overall SVG Bar */}
              <div className="mt-3 w-full">
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className="brand-progress h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, coverageData?.coverage_pct ?? 0))}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Coverage by Faculty (SVG Horizontal Bars) */}
          <div
            data-testid="faculty-coverage-section"
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm"
          >
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              {t("admin.coverageByFaculty")}
            </h2>

            <div className="space-y-4">
              {coverageData?.by_faculty.map((item) => (
                <div key={item.faculty} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {item.faculty}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {item.with_outline}
                      </span>{" "}
                      / {item.total_modules} môn ({item.coverage_pct}%)
                    </span>
                  </div>

                  <svg className="w-full h-3 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                    <rect
                      height="100%"
                      width={`${Math.min(100, Math.max(0, item.coverage_pct))}%`}
                      rx="6"
                      className={`${
                        item.coverage_pct >= 50
                          ? "fill-emerald-500 dark:fill-emerald-400"
                          : item.coverage_pct >= 25
                          ? "fill-blue-500 dark:fill-blue-400"
                          : "fill-amber-500 dark:fill-amber-400"
                      }`}
                    />
                  </svg>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Coverage by Semester */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              {t("admin.coverageBySemester")}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {coverageData?.by_semester.slice(0, 6).map((sem) => (
                <div
                  key={sem.semester_id}
                  className="p-4 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {sem.semester_name}
                    </span>
                    <span className="font-bold text-brand-ink">
                      {sem.coverage_pct}%
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {sem.with_outline} / {sem.total_modules} môn mở lớp có đề cương
                  </div>
                  <svg className="w-full h-2 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                    <rect
                      height="100%"
                      width={`${Math.min(100, Math.max(0, sem.coverage_pct))}%`}
                      rx="4"
                      className="fill-brand-focus"
                    />
                  </svg>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Missing Outlines Table */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {t("admin.missingOutlinesTitle")}
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {t("admin.missingOutlinesSubtitle")}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search */}
                <div className="relative min-w-[220px]">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                  <input
                    type="text"
                    value={missingSearch}
                    onChange={(e) => {
                      setMissingSearch(e.target.value);
                      setMissingPage(1);
                    }}
                    placeholder={t("admin.searchCoursePlaceholder")}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-brand-focus"
                  />
                </div>

                {/* Sort */}
                <select
                  value={missingSort}
                  onChange={(e) => {
                    setMissingSort(e.target.value);
                    setMissingPage(1);
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200"
                >
                  <option value="open_classes">Sắp theo: Số lớp mở giảm dần</option>
                  <option value="code">Sắp theo: Mã môn (A-Z)</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-left text-xs text-zinc-800 dark:text-zinc-200">
                <thead className="bg-zinc-50 dark:bg-zinc-950/60 uppercase font-medium text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="p-3 w-32">{t("admin.colModuleCode")}</th>
                    <th className="p-3 min-w-[220px]">{t("admin.colModuleName")}</th>
                    <th className="p-3 min-w-[200px]">{t("admin.filterFaculty")}</th>
                    <th className="p-3 w-28 text-center">{t("admin.colOpenClasses")}</th>
                    <th className="p-3 min-w-[220px]">{t("admin.colCounterpart")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {missingItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-zinc-400">
                        {t("admin.tableEmpty")}
                      </td>
                    </tr>
                  ) : (
                    missingItems.map((item) => (
                      <tr key={item.code} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/40">
                        <td className="p-3 font-mono font-semibold">
                          <Link
                            href={`/modules/${item.code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-brand-ink hover:underline"
                          >
                            {item.code}
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </Link>
                        </td>

                        <td className="p-3">
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">
                            {item.name}
                          </div>
                          {item.credits !== null && item.credits !== undefined && (
                            <div className="text-zinc-400 text-[11px] mt-0.5">
                              {item.credits} TC
                            </div>
                          )}
                        </td>

                        <td className="p-3">
                          <div>{item.faculty || "—"}</div>
                          {item.department && (
                            <div className="text-zinc-400 text-[11px]">{item.department}</div>
                          )}
                        </td>

                        <td className="p-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                              item.open_classes_count > 0
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}
                          >
                            {t("admin.classesCount", { count: item.open_classes_count })}
                          </span>
                        </td>

                        <td className="p-3">
                          {item.counterpart_code ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-medium">{item.counterpart_code}</span>
                              {item.counterpart_has_outline ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  {t("admin.cpHasOutline")}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                  {t("admin.cpNoOutline")}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination for Missing Outlines */}
            <div className="flex items-center justify-between p-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40">
              <div>
                Tổng số thiếu: <span className="font-semibold">{missingTotal}</span> học phần
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMissingPage((p) => Math.max(1, p - 1))}
                  disabled={missingPage <= 1}
                  className="px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-800 disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {t("admin.tablePrev")}
                </button>
                <span>
                  {t("admin.tablePage", { page: missingPage, total: totalMissingPages })}
                </span>
                <button
                  type="button"
                  onClick={() => setMissingPage((p) => Math.min(totalMissingPages, p + 1))}
                  disabled={missingPage >= totalMissingPages}
                  className="px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-800 disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {t("admin.tableNext")}
                </button>
              </div>
            </div>
          </div>

          {/* Section 4: OCR Pending Documents */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {t("admin.ocrPendingTitle")} ({ocrTotal})
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Các tài liệu PDF dạng quét chưa có lớp văn bản cần xử lý OCR để phục vụ phân tích đề cương
                </p>
              </div>
            </div>

            {ocrItems.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 rounded-lg">
                Không có tài liệu nào đang chờ OCR.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-800 dark:text-zinc-200">
                  <thead className="bg-zinc-50 dark:bg-zinc-950/60 font-medium text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="p-3">Tên tài liệu</th>
                      <th className="p-3 w-28">Dung lượng</th>
                      <th className="p-3 w-24 text-center">{t("admin.ocrPages")}</th>
                      <th className="p-3 min-w-[200px]">{t("admin.relatedModules")}</th>
                      <th className="p-3 w-48">{t("admin.ocrEngine")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {ocrItems.map((doc) => (
                      <tr key={doc.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/40">
                        <td className="p-3 font-medium flex items-center gap-1.5 text-zinc-900 dark:text-zinc-100">
                          <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                          <span className="truncate max-w-xs">{doc.file_name}</span>
                        </td>
                        <td className="p-3 text-zinc-500">
                          {(doc.size_bytes / 1024 / 1024).toFixed(1)} MB
                        </td>
                        <td className="p-3 text-center text-zinc-500">
                          {doc.page_count ?? "—"}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {doc.related_modules.length > 0 ? (
                              doc.related_modules.map((m) => (
                                <span
                                  key={m}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                >
                                  {m}
                                </span>
                              ))
                            ) : (
                              <span className="text-zinc-400 italic">Chưa liên kết</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-zinc-500 font-mono text-[11px]">
                          {doc.ocr_engine || "tesseract vie+eng"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 5: Google Drive / Docs Links Awaiting Consent */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {t("admin.driveLinksTitle")} ({driveTotal})
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Danh sách liên kết đề cương Google Docs / Drive từ danh mục chương trình đào tạo
              </p>
            </div>

            {/* Warning Consent Notice */}
            <div className="flex items-center gap-2.5 p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong className="font-semibold">Lưu ý quan trọng:</strong> {t("admin.driveNotice")} (Hệ thống chỉ liệt kê danh sách liên kết, tuyệt đối không tự động tải về mà chưa có sự đồng ý).
              </span>
            </div>

            {driveItems.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 rounded-lg">
                Không có liên kết Google Drive nào đang chờ tải.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-800 dark:text-zinc-200">
                  <thead className="bg-zinc-50 dark:bg-zinc-950/60 font-medium text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="p-3 min-w-[200px]">Tài liệu / Loại</th>
                      <th className="p-3 min-w-[280px]">Đường dẫn Google Drive / Docs</th>
                      <th className="p-3 min-w-[160px]">{t("admin.relatedModules")}</th>
                      <th className="p-3 w-28 text-center">Trạng thái</th>
                      <th className="p-3 w-28 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {driveItems.map((item) => (
                      <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/40">
                        <td className="p-3">
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">
                            {item.label || item.kind || "Đề cương học phần"}
                          </div>
                          {item.kind && (
                            <div className="text-zinc-400 text-[11px] mt-0.5">{item.kind}</div>
                          )}
                        </td>

                        <td className="p-3 font-mono text-[11px] text-zinc-600 dark:text-zinc-400 max-w-sm truncate">
                          {item.url || "—"}
                        </td>

                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {item.module_codes.length > 0 ? (
                              item.module_codes.map((m) => (
                                <span
                                  key={m}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                >
                                  {m}
                                </span>
                              ))
                            ) : (
                              <span className="text-zinc-400 italic">Chưa xác định</span>
                            )}
                          </div>
                        </td>

                        <td className="p-3 text-center whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            Chưa tải ({item.status})
                          </span>
                        </td>

                        <td className="p-3 text-center whitespace-nowrap">
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-brand-ink hover:underline"
                            >
                              {t("admin.btnOpenLink")}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
