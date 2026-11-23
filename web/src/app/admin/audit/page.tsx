"use client";
import { Loading } from "@/components/ui";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n";
import { adminApi } from "@/lib/adminApi";
import type { AuditLogItem } from "@/lib/types";

export default function AdminAuditPage() {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Diff drawer
  const [selectedItem, setSelectedItem] = useState<AuditLogItem | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getAuditLogs({
        actor: actorFilter.trim() || undefined,
        action: actionFilter || undefined,
        entity_type: entityFilter || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        page,
        page_size: pageSize,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || "Không thể tải nhật ký thao tác");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter, entityFilter]);

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const handleExportCsv = async () => {
    try {
      const csvStr = await adminApi.exportAuditCsv({
        actor: actorFilter.trim() || undefined,
        action: actionFilter || undefined,
        entity_type: entityFilter || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
      });
      const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Xuất CSV thất bại: " + (err?.message || "Lỗi không xác định"));
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  const getActorBadge = (actorType: string) => {
    switch (actorType) {
      case "admin":
        return "bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300";
      case "system":
        return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300";
      case "dev":
        return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
      default:
        return "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            {t("admin.auditTitle")}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t("admin.auditSubtitle")}
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2">
          <Link
            href="/admin/system"
            className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            {t("admin.tabSystem")}
          </Link>
          <Link
            href="/admin/audit"
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-white shadow-sm"
          >
            {t("admin.tabAudit")}
          </Link>
        </div>
      </div>

      {/* Filter toolbar */}
      <form
        onSubmit={handleApplyFilter}
        className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs"
      >
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search Actor */}
          <input
            type="text"
            placeholder={t("admin.searchActorPlaceholder")}
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="w-48 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />

          {/* Action Filter */}
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t("admin.allActions")}</option>
            <option value="create_user">Tạo tài khoản (create_user)</option>
            <option value="update_user">Cập nhật tài khoản (update_user)</option>
            <option value="reset_password">Đặt lại mật khẩu (reset_password)</option>
            <option value="change_password">Đổi mật khẩu (change_password)</option>
            <option value="update_faculty">Cập nhật khoa/bộ môn (update_faculty)</option>
            <option value="bulk_update_faculty">Cập nhật hàng loạt khoa (bulk_update_faculty)</option>
            <option value="approve_comment">Duyệt bình luận (approve_comment)</option>
            <option value="reject_comment">Từ chối bình luận (reject_comment)</option>
            <option value="update_settings">Cập nhật cài đặt (update_settings)</option>
            <option value="create_event">Tạo sự kiện lịch (create_event)</option>
            <option value="update_event">Cập nhật sự kiện lịch (update_event)</option>
            <option value="update_semester">Cập nhật học kỳ (update_semester)</option>
            <option value="server_error">Lỗi hệ thống 5xx (server_error)</option>
          </select>

          {/* Entity Filter */}
          <select
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t("admin.allEntities")}</option>
            <option value="admin_user">Tài khoản quản trị (admin_user)</option>
            <option value="module">Học phần (module)</option>
            <option value="module_comment">Bình luận học phần (module_comment)</option>
            <option value="academic_event">Sự kiện lịch năm học (academic_event)</option>
            <option value="semester">Học kỳ (semester)</option>
            <option value="admin_settings">Cài đặt hệ thống (admin_settings)</option>
            <option value="http_5xx">Lỗi máy chủ (http_5xx)</option>
          </select>

          {/* From Date */}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            title={t("admin.filterFromDate")}
          />

          {/* To Date */}
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            title={t("admin.filterToDate")}
          />

          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium text-gray-700 dark:text-gray-200 transition"
          >
            Lọc
          </button>
        </div>

        {/* CSV Export Button */}
        <div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium text-gray-700 dark:text-gray-200 transition flex items-center gap-1.5 shadow-sm"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t("admin.btnExportCsv")}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Audit Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 uppercase font-semibold">
                <th className="py-3 px-4">{t("admin.colAuditTime")}</th>
                <th className="py-3 px-4">{t("admin.colAuditActor")}</th>
                <th className="py-3 px-4">{t("admin.colAuditAction")}</th>
                <th className="py-3 px-4">{t("admin.colAuditEntity")}</th>
                <th className="py-3 px-4 text-right">{t("admin.colAuditDetails")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-300">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">
                    <Loading compact />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400 italic">
                    Không tìm thấy bản ghi nhật ký phù hợp.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition">
                    <td className="py-3 px-4 font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(item.created_at).toLocaleString("vi-VN")}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${getActorBadge(item.actor_type)}`}>
                          {item.actor_type}
                        </span>
                        <span className="font-mono text-gray-900 dark:text-gray-200 truncate max-w-[140px]" title={item.actor_id || ""}>
                          {item.actor_id || "system"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-gray-900 dark:text-white font-mono">
                        {item.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {item.entity_type} {item.entity_id ? `(${item.entity_id})` : ""}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {(item.before || item.after) && (
                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-primary-600 dark:text-primary-400 transition"
                        >
                          {t("admin.btnViewDiff")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {total > 0 && (
          <div className="p-3.5 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              Tổng số <strong className="text-gray-900 dark:text-white">{total}</strong> bản ghi (Trang {page}/{totalPages})
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                Trang trước
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                Trang sau
              </button>
            </div>
          </div>
        )}
      </div>

      {/* JSON Diff Drawer / Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  {t("admin.diffModalTitle")}
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  #{selectedItem.id} · {selectedItem.action} · {selectedItem.entity_type} {selectedItem.entity_id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                ✕
              </button>
            </div>

            {/* Modal Content: Before vs After side by side or stacked */}
            <div className="p-4 overflow-y-auto space-y-4 text-xs font-mono">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Before */}
                <div className="p-3 rounded-xl bg-red-50/60 dark:bg-red-950/20 border border-red-200/80 dark:border-red-900/50">
                  <span className="font-bold text-red-700 dark:text-red-400 block mb-2 font-sans">
                    {t("admin.diffBefore")}
                  </span>
                  <pre className="text-red-900 dark:text-red-300 whitespace-pre-wrap break-all text-[11px] overflow-x-auto max-h-72">
                    {selectedItem.before ? JSON.stringify(selectedItem.before, null, 2) : t("admin.diffEmpty")}
                  </pre>
                </div>

                {/* After */}
                <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 block mb-2 font-sans">
                    {t("admin.diffAfter")}
                  </span>
                  <pre className="text-emerald-900 dark:text-emerald-300 whitespace-pre-wrap break-all text-[11px] overflow-x-auto max-h-72">
                    {selectedItem.after ? JSON.stringify(selectedItem.after, null, 2) : t("admin.diffEmpty")}
                  </pre>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-gray-200 dark:border-gray-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
