"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n";
import { adminApi, AdminApiError } from "@/lib/adminApi";
import type { BannedTerm, ModerationQueueItem } from "@/lib/types";
import { Loading } from "@/components/ui";

type SubTab = "feedback" | "comment" | "book" | "banned_terms";

export default function AdminModerationPage() {
  const { t } = useT();

  const [currentTab, setCurrentTab] = useState<SubTab>("feedback");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [flagFilter, setFlagFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Queue state
  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [counts, setCounts] = useState<{ all: number; feedback: number; comment: number; book: number }>({
    all: 0,
    feedback: 0,
    comment: 0,
    book: 0,
  });
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedItem, setSelectedItem] = useState<ModerationQueueItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moderationNote, setModerationNote] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Sync refs to avoid stale closure race conditions in keyboard listeners
  const selectedItemRef = useRef(selectedItem);
  selectedItemRef.current = selectedItem;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const actionLoadingRef = useRef(actionLoading);
  actionLoadingRef.current = actionLoading;
  const moderationNoteRef = useRef(moderationNote);
  moderationNoteRef.current = moderationNote;

  // Banned terms state
  const [bannedTerms, setBannedTerms] = useState<BannedTerm[]>([]);
  const [newTerm, setNewTerm] = useState<string>("");
  const [newSeverity, setNewSeverity] = useState<"flag" | "block">("flag");
  const [termLoading, setTermLoading] = useState<boolean>(false);
  const [termError, setTermError] = useState<string | null>(null);

  // Load moderation queue
  const loadQueue = useCallback(async () => {
    if (currentTab === "book" || currentTab === "banned_terms") return;
    setLoading(true);
    try {
      const res = await adminApi.getModerationQueue({
        type: currentTab,
        status: statusFilter,
        flagged: flagFilter === "flagged" ? true : undefined,
        q: searchQuery.trim() || undefined,
        page,
        size: pageSize,
      });

      setItems(res.items || []);
      setTotal(res.total || 0);
      if (res.counts) setCounts(res.counts);

      // Keep active selection or select first
      if (res.items && res.items.length > 0) {
        setSelectedItem((prev) => {
          if (!prev) return res.items[0];
          const found = res.items.find((x) => x.id === prev.id);
          return found || res.items[0];
        });
      } else {
        setSelectedItem(null);
      }
    } catch {
      // Handled by adminApi
    } finally {
      setLoading(false);
    }
  }, [currentTab, statusFilter, flagFilter, searchQuery, page]);

  // Load banned terms
  const loadBannedTerms = useCallback(async () => {
    if (currentTab !== "banned_terms") return;
    setTermLoading(true);
    try {
      const res = await adminApi.getBannedTerms();
      setBannedTerms(res || []);
    } catch {
      // Ignored
    } finally {
      setTermLoading(false);
    }
  }, [currentTab]);

  useEffect(() => {
    if (currentTab === "banned_terms") {
      setLoading(false);
      loadBannedTerms();
    } else if (currentTab === "book") {
      setLoading(false);
    } else {
      loadQueue();
    }
    setSelectedIds(new Set());
  }, [currentTab, statusFilter, flagFilter, page, loadQueue, loadBannedTerms]);

  // Handle single item moderation action
  const handleModerate = useCallback(
    async (action: "approve" | "reject" | "hide") => {
      const target = selectedItemRef.current || (itemsRef.current.length > 0 ? itemsRef.current[0] : null);
      if (!target || actionLoadingRef.current) return;
      setActionLoading(true);
      try {
        await adminApi.moderateItem(target.type, target.item_id, action, moderationNoteRef.current);
        setModerationNote("");
        // Refresh list
        await loadQueue();
      } catch (err: any) {
        alert(err?.message || "Lỗi khi xử lý kiểm duyệt");
      } finally {
        setActionLoading(false);
      }
    },
    [loadQueue]
  );

  // Handle bulk action
  const handleBulkModerate = async (action: "approve" | "reject" | "hide") => {
    if (selectedIds.size === 0 || actionLoading) return;
    setActionLoading(true);
    try {
      const targets = items
        .filter((it) => selectedIds.has(it.id))
        .map((it) => ({ type: it.type, id: it.item_id }));

      await adminApi.bulkModerate({
        items: targets,
        action,
        note: moderationNote || undefined,
      });

      setSelectedIds(new Set());
      setModerationNote("");
      await loadQueue();
    } catch (err: any) {
      alert(err?.message || "Lỗi thao tác hàng loạt");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle add banned term
  const handleAddTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerm.trim() || termLoading) return;
    setTermError(null);
    setTermLoading(true);
    try {
      await adminApi.addBannedTerm(newTerm.trim(), newSeverity);
      setNewTerm("");
      await loadBannedTerms();
    } catch (err: any) {
      setTermError(err?.message || "Không thể thêm từ cấm");
    } finally {
      setTermLoading(false);
    }
  };

  // Handle delete banned term
  const handleDeleteTerm = async (id: number) => {
    if (!confirm("Bạn có chắc chắn muốn xóa từ cấm này?") || termLoading) return;
    setTermLoading(true);
    try {
      await adminApi.deleteBannedTerm(id);
      await loadBannedTerms();
    } catch (err: any) {
      alert(err?.message || "Không thể xóa từ cấm");
    } finally {
      setTermLoading(false);
    }
  };

  // Keyboard shortcuts A, R, H, J, K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in inputs or textareas
      const activeTag = (document.activeElement?.tagName || "").toUpperCase();
      if (["INPUT", "TEXTAREA", "SELECT"].includes(activeTag)) return;

      const key = e.key.toLowerCase();
      if (key === "a") {
        e.preventDefault();
        handleModerate("approve");
      } else if (key === "r") {
        e.preventDefault();
        handleModerate("reject");
      } else if (key === "h") {
        e.preventDefault();
        handleModerate("hide");
      } else if (key === "j") {
        e.preventDefault();
        // Down / next item
        const curItems = itemsRef.current;
        if (curItems.length > 0) {
          const current = selectedItemRef.current || curItems[0];
          const idx = curItems.findIndex((x) => x.id === current.id);
          if (idx !== -1 && idx < curItems.length - 1) {
            setSelectedItem(curItems[idx + 1]);
          }
        }
      } else if (key === "k") {
        e.preventDefault();
        // Up / previous item
        const curItems = itemsRef.current;
        if (curItems.length > 0) {
          const current = selectedItemRef.current || curItems[0];
          const idx = curItems.findIndex((x) => x.id === current.id);
          if (idx > 0) {
            setSelectedItem(curItems[idx - 1]);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleModerate]);

  // Checkbox select all logic
  const isAllSelected = useMemo(() => {
    return items.length > 0 && items.every((x) => selectedIds.has(x.id));
  }, [items, selectedIds]);

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((x) => x.id)));
    }
  };

  const toggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const renderFlagBadges = (flags: string[]) => {
    if (!flags || flags.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1">
        {flags.map((fl, idx) => {
          let label = fl;
          let colorClass = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
          if (fl === "link") {
            label = t("admin.flagReasonLink");
            colorClass = "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300";
          } else if (fl === "contact_info") {
            label = t("admin.flagReasonContact");
            colorClass = "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300";
          } else if (fl === "banned_term") {
            label = t("admin.flagReasonBanned");
            colorClass = "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
          }
          return (
            <span key={idx} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${colorClass}`}>
              {label}
            </span>
          );
        })}
      </div>
    );
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            {t("admin.statusApproved")}
          </span>
        );
      case "rejected":
        return (
          <span className="rounded bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            {t("admin.statusRejected")}
          </span>
        );
      case "hidden":
        return (
          <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {t("admin.statusHidden")}
          </span>
        );
      default:
        return (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {t("admin.statusPending")}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t("admin.modTitle")}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("admin.modSubtitle")}
        </p>
      </div>

      {/* Subtabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-sm font-medium">
        <button
          type="button"
          onClick={() => {
            setCurrentTab("feedback");
            setPage(1);
          }}
          className={`pb-3 border-b-2 transition ${
            currentTab === "feedback"
              ? "border-brand-600 text-brand-600 font-semibold dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {t("admin.tabFeedback", { count: counts.feedback })}
        </button>
        <button
          type="button"
          onClick={() => {
            setCurrentTab("comment");
            setPage(1);
          }}
          className={`pb-3 border-b-2 transition ${
            currentTab === "comment"
              ? "border-brand-600 text-brand-600 font-semibold dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {t("admin.tabComments", { count: counts.comment })}
        </button>
        <button
          type="button"
          onClick={() => {
            setCurrentTab("book");
            setPage(1);
          }}
          className={`pb-3 border-b-2 transition ${
            currentTab === "book"
              ? "border-brand-600 text-brand-600 font-semibold dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {t("admin.tabBooks")}
        </button>
        <button
          type="button"
          onClick={() => {
            setCurrentTab("banned_terms");
            setPage(1);
          }}
          className={`pb-3 border-b-2 transition ${
            currentTab === "banned_terms"
              ? "border-brand-600 text-brand-600 font-semibold dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {t("admin.tabBannedTerms", { count: bannedTerms.length })}
        </button>
      </div>

      {/* Tab content: Book listing placeholder */}
      {currentTab === "book" && (
        <div className="card p-12 text-center text-slate-500 dark:text-slate-400">
          <p className="text-base font-semibold">{t("admin.tabBooks")}</p>
          <p className="mt-2 text-sm">{t("admin.booksA7Placeholder")}</p>
        </div>
      )}

      {/* Tab content: Banned terms management */}
      {currentTab === "banned_terms" && (
        <div className="space-y-6">
          {/* Form thêm từ cấm */}
          <form
            onSubmit={handleAddTerm}
            className="card p-5 bg-white dark:bg-slate-900 flex flex-wrap items-end gap-4 border border-slate-200 dark:border-slate-800"
          >
            <div className="flex-1 min-w-[220px]">
              <label htmlFor="banned-term-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t("admin.termInputLabel")}
              </label>
              <input
                id="banned-term-input"
                type="text"
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                placeholder="VD: blockword, spam_advertisement..."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-focus focus:outline-none focus:ring-1 focus:ring-brand-focus dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <div className="w-48">
              <label htmlFor="severity-select" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t("admin.termSeverityLabel")}
              </label>
              <select
                id="severity-select"
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as "flag" | "block")}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-brand-focus focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="flag">{t("admin.severityFlag")}</option>
                <option value="block">{t("admin.severityBlock")}</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={termLoading || !newTerm.trim()}
              className="btn-primary py-1.5 px-4 text-sm font-medium"
            >
              {termLoading ? "Đang thêm..." : t("admin.btnAddTerm")}
            </button>
            {termError && (
              <p className="w-full text-xs text-rose-600 dark:text-rose-400 font-medium">{termError}</p>
            )}
          </form>

          {/* Bảng danh sách từ cấm */}
          <div className="card overflow-hidden border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">{t("admin.colTerm")}</th>
                  <th className="py-2.5 px-4 font-semibold">{t("admin.colSeverity")}</th>
                  <th className="py-2.5 px-4 font-semibold">{t("admin.colCreatedAt")}</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {bannedTerms.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-slate-500">
                      Chưa có từ cấm nào được thiết lập.
                    </td>
                  </tr>
                ) : (
                  bannedTerms.map((bt) => (
                    <tr key={bt.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                      <td className="py-2.5 px-4 font-mono font-medium text-slate-900 dark:text-white">
                        {bt.term}
                      </td>
                      <td className="py-2.5 px-4">
                        {bt.severity === "block" ? (
                          <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            {t("admin.severityBlock")}
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            {t("admin.severityFlag")}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-500">
                        {bt.created_at ? new Date(bt.created_at).toLocaleDateString("vi-VN") : "—"}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteTerm(bt.id)}
                          className="text-xs text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300 font-medium"
                        >
                          {t("admin.btnDeleteTerm")}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab content: Queue (Feedback & Comments) */}
      {(currentTab === "feedback" || currentTab === "comment") && (
        <div className="space-y-4">
          {/* Top Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">{t("admin.filterStatus")}:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded border border-slate-300 bg-white py-1 px-2.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-950"
                  aria-label={t("admin.filterStatus")}
                >
                  <option value="pending">{t("admin.statusPending")}</option>
                  <option value="approved">{t("admin.statusApproved")}</option>
                  <option value="rejected">{t("admin.statusRejected")}</option>
                  <option value="hidden">{t("admin.statusHidden")}</option>
                  <option value="all">{t("admin.statusAll")}</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">{t("admin.filterFlags")}:</span>
                <select
                  value={flagFilter}
                  onChange={(e) => {
                    setFlagFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded border border-slate-300 bg-white py-1 px-2.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-950"
                  aria-label={t("admin.filterFlags")}
                >
                  <option value="all">{t("admin.flagAll")}</option>
                  <option value="flagged">{t("admin.flagOnly")}</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={t("admin.searchModPlaceholder")}
                className="w-56 sm:w-64 rounded border border-slate-300 bg-white py-1 px-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                aria-label={t("admin.searchModPlaceholder")}
              />
            </div>
          </div>

          {/* Bulk Action Bar (when selected) */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-50 border border-brand-200 dark:bg-brand-950/40 dark:border-brand-900 p-2.5 px-4 rounded-lg">
              <span className="text-xs font-semibold text-brand-900 dark:text-brand-200">
                {t("admin.bulkSelected", { count: selectedIds.size })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkModerate("approve")}
                  disabled={actionLoading}
                  className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  {t("admin.bulkApprove")}
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkModerate("reject")}
                  disabled={actionLoading}
                  className="rounded bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700"
                >
                  {t("admin.bulkReject")}
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkModerate("hide")}
                  disabled={actionLoading}
                  className="rounded bg-slate-600 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                >
                  {t("admin.bulkHide")}
                </button>
              </div>
            </div>
          )}

          {/* Master - Detail Split Layout */}
          <div className="flex flex-col lg:flex-row gap-5 items-start">
            {/* Left Queue Table */}
            <div className="w-full lg:flex-1 card p-0 overflow-hidden border border-slate-200 dark:border-slate-800">
              {loading ? (
                <div className="py-12">
                  <Loading />
                </div>
              ) : items.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  {t("admin.tableEmpty")}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                      <tr>
                        <th className="py-2.5 px-3 w-8">
                          <input
                            type="checkbox"
                            checked={isAllSelected}
                            onChange={toggleSelectAll}
                            className="rounded border-slate-300 text-brand-ink focus:ring-brand-focus"
                            aria-label="Chọn tất cả"
                          />
                        </th>
                        <th className="py-2.5 pr-2 font-semibold">{t("admin.colTime")}</th>
                        <th className="py-2.5 pr-2 font-semibold">{t("admin.colType")}</th>
                        <th className="py-2.5 pr-3 font-semibold">{t("admin.colContent")}</th>
                        <th className="py-2.5 pr-2 font-semibold">{t("admin.colFlags")}</th>
                        <th className="py-2.5 pr-3 font-semibold">{t("admin.colStatus")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {items.map((row) => {
                        const isCurrent = selectedItem?.id === row.id;
                        const isChecked = selectedIds.has(row.id);
                        return (
                          <tr
                            key={row.id}
                            onClick={() => setSelectedItem(row)}
                            className={`cursor-pointer transition ${
                              isCurrent
                                ? "bg-brand-50/80 dark:bg-brand-950/50 ring-1 ring-inset ring-brand-400"
                                : isChecked
                                ? "bg-slate-50 dark:bg-slate-900/60"
                                : "hover:bg-slate-50/60 dark:hover:bg-slate-900/40"
                            }`}
                          >
                            <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => toggleSelectRow(row.id, e as any)}
                                className="rounded border-slate-300 text-brand-ink focus:ring-brand-focus"
                                aria-label={`Chọn mục ${row.id}`}
                              />
                            </td>
                            <td className="py-2.5 pr-2 whitespace-nowrap text-slate-500 text-[11px]">
                              {row.created_at ? new Date(row.created_at).toLocaleDateString("vi-VN") : "—"}
                            </td>
                            <td className="py-2.5 pr-2 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                              {row.type === "feedback" ? "Góp ý" : "Bình luận"}
                            </td>
                            <td className="py-2.5 pr-3 max-w-xs truncate text-slate-700 dark:text-slate-300">
                              {row.content}
                            </td>
                            <td className="py-2.5 pr-2">
                              {renderFlagBadges(row.flag_reasons)}
                            </td>
                            <td className="py-2.5 pr-3 whitespace-nowrap">
                              {renderStatusBadge(row.status)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {total > pageSize && (
                <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 dark:border-slate-800 text-xs text-slate-500">
                  <span>
                    {t("admin.tablePage", { page, total: totalPages })} ({total} mục)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded border border-slate-300 px-2.5 py-1 text-xs disabled:opacity-40"
                    >
                      {t("admin.tablePrev")}
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="rounded border border-slate-300 px-2.5 py-1 text-xs disabled:opacity-40"
                    >
                      {t("admin.tableNext")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Detail Panel (Panel chi tiết bên phải không đổi trang) */}
            <div className="w-full lg:w-[380px] shrink-0 card p-4 sticky top-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
              {loading ? (
                <div className="py-12">
                  <Loading />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      {t("admin.detailTitle")}
                    </h2>
                    {selectedItem && renderStatusBadge(selectedItem.status)}
                  </div>

                  {!selectedItem ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      {t("admin.detailEmpty")}
                    </div>
                  ) : (
                <div className="space-y-3.5 text-xs">
                  {/* Meta info */}
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-white text-sm">
                      {selectedItem.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-slate-500 text-[11px]">
                      <span>{selectedItem.author}</span>
                      <span>·</span>
                      <span>{selectedItem.created_at ? new Date(selectedItem.created_at).toLocaleString("vi-VN") : "—"}</span>
                      {selectedItem.rating && (
                        <>
                          <span>·</span>
                          <span className="text-amber-500 font-semibold">{selectedItem.rating} ★</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Flags if any */}
                  {selectedItem.flag_reasons && selectedItem.flag_reasons.length > 0 && (
                    <div>
                      <span className="text-[11px] text-slate-400 block mb-1">Cảnh báo tự động:</span>
                      {renderFlagBadges(selectedItem.flag_reasons)}
                    </div>
                  )}

                  {/* Full content */}
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {selectedItem.content}
                  </div>

                  {/* Moderation Note */}
                  <div>
                    <label htmlFor="moderation-note" className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      {t("admin.noteLabel")}
                    </label>
                    <textarea
                      id="moderation-note"
                      value={moderationNote}
                      onChange={(e) => setModerationNote(e.target.value)}
                      rows={2}
                      placeholder={t("admin.notePlaceholder")}
                      className="w-full rounded border border-slate-300 bg-white p-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>

                  {/* Actions buttons with keyboard shortcuts [A], [R], [H] */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleModerate("approve")}
                      className="flex-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-1.5 px-2 text-xs flex items-center justify-center gap-1 shadow-sm transition"
                    >
                      <span>{t("admin.btnApprove")}</span>
                      <kbd className="rounded bg-emerald-800/60 px-1 text-[10px] font-mono">A</kbd>
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleModerate("reject")}
                      className="flex-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-medium py-1.5 px-2 text-xs flex items-center justify-center gap-1 shadow-sm transition"
                    >
                      <span>{t("admin.btnReject")}</span>
                      <kbd className="rounded bg-rose-800/60 px-1 text-[10px] font-mono">R</kbd>
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleModerate("hide")}
                      className="rounded bg-slate-600 hover:bg-slate-700 text-white font-medium py-1.5 px-2.5 text-xs flex items-center justify-center gap-1 shadow-sm transition"
                    >
                      <span>{t("admin.btnHide")}</span>
                      <kbd className="rounded bg-slate-800/60 px-1 text-[10px] font-mono">H</kbd>
                    </button>
                  </div>

                  {/* Keyboard Shortcuts Hint Bar */}
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800 text-center font-mono">
                    {t("admin.shortcutHints")}
                  </div>
                </div>
              )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
