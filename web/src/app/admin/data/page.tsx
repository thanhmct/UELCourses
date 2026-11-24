"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, RefreshCw, RotateCcw, Save, Search, Sparkles, Trash2 } from "lucide-react";
import { useT } from "@/i18n";
import { adminApi, AdminApiError } from "@/lib/adminApi";
import type { FacultiesResponse, FacultyReviewItem, FacultyReviewResponse } from "@/lib/types";
import { Loading } from "@/components/ui";

type DataTab = "needs_review" | "prefix_conflict" | "no_source" | "admin_modified";

const KNOWN_PREFIXES = [
  "",
  "AA",
  "AU",
  "BB",
  "BM",
  "BU",
  "EE",
  "EM",
  "FB",
  "FF",
  "IE",
  "IM",
  "KB",
  "KT",
  "LB",
  "LC",
  "LD",
  "MA",
  "MM",
  "RB",
  "RE",
];

export default function AdminDataPage() {
  const { t } = useT();

  const [currentTab, setCurrentTab] = useState<DataTab>("needs_review");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPrefix, setSelectedPrefix] = useState<string>("");
  const [selectedFaculty, setSelectedFaculty] = useState<string>("");

  // Data state
  const [loading, setLoading] = useState<boolean>(true);
  const [items, setItems] = useState<FacultyReviewItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;
  const [counts, setCounts] = useState<{
    needs_review: number;
    prefix_conflict: number;
    no_source: number;
    admin_modified: number;
  }>({
    needs_review: 0,
    prefix_conflict: 0,
    no_source: 0,
    admin_modified: 0,
  });

  // Faculties & Departments dropdown metadata
  const [facultiesData, setFacultiesData] = useState<FacultiesResponse | null>(null);

  // Row edit state: code -> { faculty, department }
  const [rowEdits, setRowEdits] = useState<Record<string, { faculty: string; department: string }>>({});
  const [savingCodes, setSavingCodes] = useState<Set<string>>(new Set());
  const [savedCodes, setSavedCodes] = useState<Set<string>>(new Set());

  // Bulk selection
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [bulkFaculty, setBulkFaculty] = useState<string>("");
  const [bulkLoading, setBulkLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load canonical faculties metadata
  useEffect(() => {
    let isMounted = true;
    adminApi
      .getFaculties()
      .then((res) => {
        if (isMounted) setFacultiesData(res);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Load table data
  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminApi.getFacultyReview({
        kind: currentTab,
        q: searchQuery.trim() || undefined,
        prefix: selectedPrefix || undefined,
        faculty: selectedFaculty || undefined,
        page,
        size: pageSize,
      });

      setItems(res.items || []);
      setTotal(res.total || 0);
      if (res.counts) setCounts(res.counts);

      // Initialize row edits from items
      const initialEdits: Record<string, { faculty: string; department: string }> = {};
      res.items.forEach((item) => {
        initialEdits[item.code] = {
          faculty: item.faculty || "",
          department: item.department || "",
        };
      });
      setRowEdits(initialEdits);
      setSelectedCodes(new Set());
    } catch (err: any) {
      if (err instanceof AdminApiError && err.status === 403) {
        setErrorMsg("Bạn không có quyền truy cập chức năng này (yêu cầu vai trò Admin hoặc Data Editor).");
      } else {
        setErrorMsg("Không thể tải danh sách học phần. Vui lòng thử lại.");
      }
    } finally {
      setLoading(false);
    }
  }, [currentTab, searchQuery, selectedPrefix, selectedFaculty, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle single row edit changes
  const handleEditChange = (code: string, field: "faculty" | "department", value: string) => {
    setRowEdits((prev) => ({
      ...prev,
      [code]: {
        ...(prev[code] || { faculty: "", department: "" }),
        [field]: value,
      },
    }));
  };

  // Depart suggestions for datalist based on selected faculty
  const getDeptSuggestions = (facultyName: string) => {
    if (!facultiesData) return [];
    const found = facultiesData.faculties.find((f) => f.name === facultyName);
    return found ? found.departments : facultiesData.all_departments;
  };

  // Save single row
  const handleSaveRow = async (code: string) => {
    const edit = rowEdits[code];
    if (!edit) return;

    setSavingCodes((prev) => new Set(prev).add(code));
    try {
      await adminApi.patchModuleFaculty(code, {
        faculty: edit.faculty.trim() || null,
        department: edit.department.trim() || null,
      });

      // Hiệu ứng mờ dần tại chỗ (giữ chỗ, không làm nhảy layout)
      setSavedCodes((prev) => new Set(prev).add(code));

      // Cập nhật số đếm thống kê
      setCounts((prev) => ({
        ...prev,
        [currentTab]: Math.max(0, prev[currentTab] - 1),
        admin_modified: prev.admin_modified + 1,
      }));

      // Sau 1.2s xóa khỏi danh sách nội bộ một cách mượt mà
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.code !== code));
        setSavedCodes((prev) => {
          const next = new Set(prev);
          next.delete(code);
          return next;
        });
      }, 1200);
    } catch (err: any) {
      alert(err?.data?.detail || err?.message || "Lưu thất bại.");
    } finally {
      setSavingCodes((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
    }
  };

  // Accept suggestion for single row
  const handleAcceptSuggestion = async (item: FacultyReviewItem) => {
    if (!item.suggestion?.faculty) return;

    setSavingCodes((prev) => new Set(prev).add(item.code));
    try {
      await adminApi.patchModuleFaculty(item.code, {
        faculty: item.suggestion.faculty,
        department: item.department || null,
      });

      setSavedCodes((prev) => new Set(prev).add(item.code));
      setCounts((prev) => ({
        ...prev,
        [currentTab]: Math.max(0, prev[currentTab] - 1),
        admin_modified: prev.admin_modified + 1,
      }));

      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.code !== item.code));
        setSavedCodes((prev) => {
          const next = new Set(prev);
          next.delete(item.code);
          return next;
        });
      }, 1200);
    } catch (err: any) {
      alert(err?.data?.detail || err?.message || "Nhận đề xuất thất bại.");
    } finally {
      setSavingCodes((prev) => {
        const next = new Set(prev);
        next.delete(item.code);
        return next;
      });
    }
  };

  // Delete override (reset to automatic)
  const handleDeleteOverride = async (code: string) => {
    setSavingCodes((prev) => new Set(prev).add(code));
    try {
      await adminApi.deleteFacultyOverride(code);
      setSavedCodes((prev) => new Set(prev).add(code));
      setCounts((prev) => ({
        ...prev,
        admin_modified: Math.max(0, prev.admin_modified - 1),
      }));

      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.code !== code));
        setSavedCodes((prev) => {
          const next = new Set(prev);
          next.delete(code);
          return next;
        });
      }, 1200);
    } catch (err: any) {
      alert(err?.data?.detail || err?.message || "Hủy ghi đè thất bại.");
    } finally {
      setSavingCodes((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
    }
  };

  // Bulk actions
  const handleBulkAcceptSuggestions = async () => {
    if (selectedCodes.size === 0) return;
    setBulkLoading(true);
    try {
      const codes = Array.from(selectedCodes);
      await adminApi.bulkFacultyReview({
        codes,
        action: "accept_suggestion",
      });

      // Đánh dấu các dòng đã lưu để mờ dần
      setSavedCodes(new Set(codes));
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => !selectedCodes.has(x.code)));
        setSelectedCodes(new Set());
        setSavedCodes(new Set());
        loadData();
      }, 1000);
    } catch (err: any) {
      alert(err?.data?.detail || err?.message || "Thao tác hàng loạt thất bại.");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkSetFaculty = async () => {
    if (selectedCodes.size === 0 || !bulkFaculty) return;
    setBulkLoading(true);
    try {
      const codes = Array.from(selectedCodes);
      await adminApi.bulkFacultyReview({
        codes,
        action: "set",
        faculty: bulkFaculty,
      });

      setSavedCodes(new Set(codes));
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => !selectedCodes.has(x.code)));
        setSelectedCodes(new Set());
        setSavedCodes(new Set());
        loadData();
      }, 1000);
    } catch (err: any) {
      alert(err?.data?.detail || err?.message || "Đặt khoa hàng loạt thất bại.");
    } finally {
      setBulkLoading(false);
    }
  };

  // Select all checkbox
  const isAllSelected = items.length > 0 && items.every((x) => selectedCodes.has(x.code));
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedCodes(new Set());
    } else {
      setSelectedCodes(new Set(items.map((x) => x.code)));
    }
  };

  const toggleSelectRow = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  // Format faculty source badge
  const renderSourceBadge = (source: string | null | undefined) => {
    if (source === "admin") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
          {t("admin.sourceAdmin")}
        </span>
      );
    }
    if (source === "outline") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-800">
          {t("admin.sourceOutline")}
        </span>
      );
    }
    if (source === "counterpart_outline") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
          {t("admin.sourceCpOutline")}
        </span>
      );
    }
    if (source === "prefix") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          {t("admin.sourcePrefix")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        {t("admin.sourceNone")}
      </span>
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {t("admin.dataTitle")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t("admin.dataSubtitle")}
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300 rounded-lg">
          {errorMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="flex space-x-6" aria-label="Tabs">
          <button
            type="button"
            onClick={() => {
              setCurrentTab("needs_review");
              setPage(1);
            }}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              currentTab === "needs_review"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {t("admin.tabNeedsReview", { count: counts.needs_review })}
          </button>
          <button
            type="button"
            onClick={() => {
              setCurrentTab("prefix_conflict");
              setPage(1);
            }}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              currentTab === "prefix_conflict"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {t("admin.tabPrefixConflict", { count: counts.prefix_conflict })}
          </button>
          <button
            type="button"
            onClick={() => {
              setCurrentTab("no_source");
              setPage(1);
            }}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              currentTab === "no_source"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {t("admin.tabNoSource", { count: counts.no_source })}
          </button>
          <button
            type="button"
            onClick={() => {
              setCurrentTab("admin_modified");
              setPage(1);
            }}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              currentTab === "admin_modified"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {t("admin.tabAdminModified", { count: counts.admin_modified })}
          </button>
        </nav>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder={t("admin.searchCoursePlaceholder")}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filter Prefix */}
        <div className="flex items-center gap-2">
          <label htmlFor="filter-prefix" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {t("admin.filterPrefix")}:
          </label>
          <select
            id="filter-prefix"
            value={selectedPrefix}
            onChange={(e) => {
              setSelectedPrefix(e.target.value);
              setPage(1);
            }}
            className="text-sm px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200"
          >
            <option value="">{t("admin.allPrefixes")}</option>
            {KNOWN_PREFIXES.filter(Boolean).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* Filter Faculty */}
        <div className="flex items-center gap-2">
          <label htmlFor="filter-faculty" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {t("admin.filterFaculty")}:
          </label>
          <select
            id="filter-faculty"
            value={selectedFaculty}
            onChange={(e) => {
              setSelectedFaculty(e.target.value);
              setPage(1);
            }}
            className="text-sm px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 max-w-[220px]"
          >
            <option value="">{t("admin.allFaculties")}</option>
            {facultiesData?.canonical_faculties.map((fac) => (
              <option key={fac} value={fac}>
                {fac}
              </option>
            ))}
          </select>
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="p-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          title="Tải lại dữ liệu"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Bulk Action Bar */}
      {selectedCodes.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl transition-all shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">
              {t("admin.bulkSelected", { count: selectedCodes.size })}
            </span>
            <button
              type="button"
              onClick={() => setSelectedCodes(new Set())}
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Bỏ chọn
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Nhận đề xuất hàng loạt */}
            <button
              type="button"
              onClick={handleBulkAcceptSuggestions}
              disabled={bulkLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("admin.btnBulkAccept", { count: selectedCodes.size })}
            </button>

            {/* Đặt khoa hàng loạt */}
            <div className="flex items-center gap-1.5">
              <select
                value={bulkFaculty}
                onChange={(e) => setBulkFaculty(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
              >
                <option value="">{t("admin.selectFacultyPrompt")}</option>
                {facultiesData?.canonical_faculties.map((fac) => (
                  <option key={fac} value={fac}>
                    {fac}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleBulkSetFaculty}
                disabled={bulkLoading || !bulkFaculty}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {t("admin.btnBulkSet", { count: selectedCodes.size })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        {loading && items.length === 0 ? (
          <div className="p-12 flex justify-center">
            <Loading />
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {t("admin.tableEmpty")}
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[420px]">
            <table className="w-full text-left text-sm text-zinc-800 dark:text-zinc-200">
              <thead className="bg-zinc-50 dark:bg-zinc-950/60 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                      aria-label="Chọn tất cả"
                    />
                  </th>
                  <th className="p-3 w-32">{t("admin.colModuleCode")}</th>
                  <th className="p-3 min-w-[200px]">{t("admin.colModuleName")}</th>
                  <th className="p-3 min-w-[240px]">{t("admin.colCurFaculty")}</th>
                  <th className="p-3 w-28">{t("admin.colSource")}</th>
                  <th className="p-3 min-w-[220px]">{t("admin.colSuggestion")}</th>
                  <th className="p-3 min-w-[180px]">{t("admin.colReason")}</th>
                  <th className="p-3 w-28 text-center">{t("admin.colStats")}</th>
                  <th className="p-3 min-w-[300px]">{t("admin.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                {items.map((item) => {
                  const isChecked = selectedCodes.has(item.code);
                  const isSaved = savedCodes.has(item.code);
                  const isSaving = savingCodes.has(item.code);
                  const edit = rowEdits[item.code] || {
                    faculty: item.faculty || "",
                    department: item.department || "",
                  };

                  return (
                    <tr
                      key={item.code}
                      className={`transition-all duration-700 ${
                        isSaved
                          ? "opacity-25 bg-green-50/50 dark:bg-green-950/20 pointer-events-none"
                          : isChecked
                          ? "bg-blue-50/50 dark:bg-blue-950/20"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-950/40"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectRow(item.code)}
                          className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                          aria-label={`Chọn môn ${item.code}`}
                        />
                      </td>

                      {/* Module Code + External Link */}
                      <td className="p-3 font-mono font-semibold">
                        <Link
                          href={`/modules/${item.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                          title={t("admin.openInNewTab")}
                        >
                          {item.code}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </Link>
                      </td>

                      {/* Module Name + Credits */}
                      <td className="p-3">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {item.name}
                        </div>
                        {item.credits !== null && item.credits !== undefined && (
                          <div className="mt-0.5 text-zinc-400">
                            {t("admin.colCredits")}: {item.credits}
                          </div>
                        )}
                      </td>

                      {/* Current Faculty & Dept */}
                      <td className="p-3">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {item.faculty || <span className="text-zinc-400 italic">Chưa có khoa</span>}
                        </div>
                        {item.department && (
                          <div className="text-zinc-500 dark:text-zinc-400 text-[11px] mt-0.5">
                            {item.department}
                          </div>
                        )}
                      </td>

                      {/* Source */}
                      <td className="p-3 whitespace-nowrap">
                        {renderSourceBadge(item.faculty_source)}
                      </td>

                      {/* Suggestion */}
                      <td className="p-3">
                        {item.suggestion?.faculty ? (
                          <div className="flex flex-col gap-1 items-start">
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              {item.suggestion.faculty}
                            </span>
                            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                              <span>Nguồn: {item.suggestion.source}</span>
                              {item.suggestion.confidence && (
                                <span>({item.suggestion.confidence})</span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAcceptSuggestion(item)}
                              disabled={isSaving}
                              className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200 transition-colors"
                            >
                              <Sparkles className="h-3 w-3" />
                              {t("admin.btnAcceptSuggestion")}
                            </button>
                          </div>
                        ) : (
                          <span className="text-zinc-400 italic">Không có đề xuất</span>
                        )}
                      </td>

                      {/* Reason / Issue */}
                      <td className="p-3 text-zinc-600 dark:text-zinc-400 text-[11px]">
                        {item.reason || "—"}
                      </td>

                      {/* Open Classes & Programs Count */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="font-medium text-zinc-800 dark:text-zinc-200">
                          {t("admin.classesCount", { count: item.open_classes_count })}
                        </div>
                        <div className="text-zinc-400 text-[11px]">
                          {t("admin.programsCount", { count: item.program_count })}
                        </div>
                      </td>

                      {/* Inline Actions */}
                      <td className="p-3">
                        {isSaved ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <Check className="h-4 w-4" /> {t("admin.savedSuccess")}
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {/* Faculty select */}
                            <select
                              value={edit.faculty}
                              onChange={(e) => handleEditChange(item.code, "faculty", e.target.value)}
                              className="w-full text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                            >
                              <option value="">{t("admin.selectFacultyPrompt")}</option>
                              {facultiesData?.canonical_faculties.map((fac) => (
                                <option key={fac} value={fac}>
                                  {fac}
                                </option>
                              ))}
                            </select>

                            {/* Department input with datalist */}
                            <input
                              type="text"
                              list={`depts-${item.code}`}
                              value={edit.department}
                              onChange={(e) => handleEditChange(item.code, "department", e.target.value)}
                              placeholder={t("admin.deptPlaceholder")}
                              className="w-full text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                            />
                            <datalist id={`depts-${item.code}`}>
                              {getDeptSuggestions(edit.faculty).map((d) => (
                                <option key={d} value={d} />
                              ))}
                            </datalist>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 mt-0.5">
                              <button
                                type="button"
                                onClick={() => handleSaveRow(item.code)}
                                disabled={isSaving || !edit.faculty}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                              >
                                <Save className="h-3 w-3" />
                                {t("admin.btnSave")}
                              </button>

                              {item.faculty_source === "admin" && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteOverride(item.code)}
                                  disabled={isSaving}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-zinc-200 dark:border-zinc-800 text-zinc-600 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                  title="Hủy ghi đè admin và tính lại khoa tự động"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  {t("admin.btnDeleteOverride")}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between p-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40">
          <div>
            Tổng số: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{total}</span> học phần
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-800 disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {t("admin.tablePrev")}
            </button>
            <span>
              {t("admin.tablePage", { page, total: totalPages })}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-800 disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {t("admin.tableNext")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
