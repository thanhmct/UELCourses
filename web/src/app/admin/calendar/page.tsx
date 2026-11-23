"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  Clock,
  Edit2,
  FileDown,
  FileText,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useT } from "@/i18n";
import { adminApi, AdminApiError } from "@/lib/adminApi";
import type {
  AdminAcademicEvent,
  CalendarImportDryRunResult,
  SemesterAdminItem,
} from "@/lib/types";
import { Loading } from "@/components/ui";

type ActiveTab = "events" | "semesters" | "import";
type ViewMode = "table" | "timeline";

const AVAILABLE_COHORTS = ["all", "K22", "K23", "K24", "K25", "K26"];

const EVENT_KIND_LABELS: Record<string, { labelKey: string; colorClass: string }> = {
  teaching: { labelKey: "admin.kindTeaching", colorClass: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300" },
  online_study: { labelKey: "admin.kindOnlineStudy", colorClass: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300" },
  defense_training: { labelKey: "admin.kindDefenseTraining", colorClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" },
  midterm_exam: { labelKey: "admin.kindMidtermExam", colorClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  final_exam: { labelKey: "admin.kindFinalExam", colorClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300" },
  makeup_day: { labelKey: "admin.kindMakeupDay", colorClass: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300" },
  holiday: { labelKey: "admin.kindHoliday", colorClass: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300" },
  reserve_week: { labelKey: "admin.kindReserveWeek", colorClass: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300" },
  break: { labelKey: "admin.kindBreak", colorClass: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300" },
  defense_week_internship: { labelKey: "admin.kindDefenseInternship", colorClass: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300" },
  thesis: { labelKey: "admin.kindThesis", colorClass: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300" },
  language_cert: { labelKey: "admin.kindLanguageCert", colorClass: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300" },
  graduation_review: { labelKey: "admin.kindGraduationReview", colorClass: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300" },
  ceremony: { labelKey: "admin.kindCeremony", colorClass: "bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300" },
  academic_review: { labelKey: "admin.kindAcademicReview", colorClass: "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-300" },
  second_program: { labelKey: "admin.kindSecondProgram", colorClass: "bg-lime-100 text-lime-800 dark:bg-lime-950/60 dark:text-lime-300" },
  registration: { labelKey: "admin.kindRegistration", colorClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-300" },
  registration_adjust: { labelKey: "admin.kindRegistrationAdjust", colorClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  other: { labelKey: "admin.kindOther", colorClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

export default function AdminCalendarPage() {
  const { t } = useT();

  const [activeTab, setActiveTab] = useState<ActiveTab>("events");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // Filter state for Events tab
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedCohort, setSelectedCohort] = useState<string>("");
  const [selectedKind, setSelectedKind] = useState<string>("");
  const [unverifiedOnly, setUnverifiedOnly] = useState<boolean>(false);

  // Events data state
  const [events, setEvents] = useState<AdminAcademicEvent[]>([]);
  const [totalEvents, setTotalEvents] = useState<number>(0);
  const [yearsList, setYearsList] = useState<string[]>([]);
  const [kindsList, setKindsList] = useState<string[]>([]);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(true);

  // Semesters data state
  const [semesters, setSemesters] = useState<SemesterAdminItem[]>([]);
  const [loadingSemesters, setLoadingSemesters] = useState<boolean>(false);
  const [editingSemesters, setEditingSemesters] = useState<
    Record<string, { name: string; teaching_start: string; teaching_end: string }>
  >({});
  const [savingSemId, setSavingSemId] = useState<string | null>(null);

  // Right Panel Drawer State (Add / Edit Event)
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<AdminAcademicEvent | null>(null);
  const [formValues, setFormValues] = useState<{
    academic_year: string;
    kind: string;
    title: string;
    start_date: string;
    end_date: string;
    semester_id: string;
    cohorts: string[];
    source: string;
    note: string;
    verified: boolean;
  }>({
    academic_year: "2026-2027",
    kind: "teaching",
    title: "",
    start_date: "",
    end_date: "",
    semester_id: "",
    cohorts: ["all"],
    source: "TB 223/TB-ĐHKTL-ĐT",
    note: "",
    verified: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [savingEvent, setSavingEvent] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deletingEvent, setDeletingEvent] = useState<boolean>(false);

  // JSON Import state
  const [importJsonText, setImportJsonText] = useState<string>("");
  const [dryRunLoading, setDryRunLoading] = useState<boolean>(false);
  const [dryRunResult, setDryRunResult] = useState<CalendarImportDryRunResult | null>(null);
  const [importLoading, setImportLoading] = useState<boolean>(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const [importErrorMsg, setImportErrorMsg] = useState<string | null>(null);

  // Load events
  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await adminApi.getCalendarEvents({
        year: selectedYear || undefined,
        cohort: selectedCohort || undefined,
        type: selectedKind || undefined,
        verified: unverifiedOnly ? false : undefined,
        q: searchQuery.trim() || undefined,
      });
      setEvents(res.items || []);
      setTotalEvents(res.total || 0);
      if (res.years?.length) setYearsList(res.years);
      if (res.kinds?.length) setKindsList(res.kinds);
    } catch (err: any) {
      // Handled gracefully
    } finally {
      setLoadingEvents(false);
    }
  }, [selectedYear, selectedCohort, selectedKind, unverifiedOnly, searchQuery]);

  // Load semesters
  const loadSemesters = useCallback(async () => {
    setLoadingSemesters(true);
    try {
      const data = await adminApi.getAdminSemesters();
      setSemesters(data || []);
      const initEdits: Record<string, { name: string; teaching_start: string; teaching_end: string }> = {};
      data.forEach((s) => {
        initEdits[s.id] = {
          name: s.name || "",
          teaching_start: s.teaching_start || "",
          teaching_end: s.teaching_end || "",
        };
      });
      setEditingSemesters(initEdits);
    } catch (err) {
      // Handled
    } finally {
      setLoadingSemesters(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "events") {
      loadEvents();
    } else if (activeTab === "semesters") {
      loadSemesters();
    }
  }, [activeTab, loadEvents, loadSemesters]);

  // Open Add Event panel
  const handleOpenAddEvent = () => {
    setEditingEvent(null);
    setFormValues({
      academic_year: selectedYear || yearsList[0] || "2026-2027",
      kind: "teaching",
      title: "",
      start_date: "",
      end_date: "",
      semester_id: "",
      cohorts: ["all"],
      source: "TB 223/TB-ĐHKTL-ĐT",
      note: "",
      verified: true,
    });
    setFormError(null);
    setShowDeleteConfirm(false);
    setIsPanelOpen(true);
  };

  // Open Edit Event panel
  const handleOpenEditEvent = (evt: AdminAcademicEvent) => {
    setEditingEvent(evt);
    setFormValues({
      academic_year: evt.academic_year,
      kind: evt.kind,
      title: evt.title,
      start_date: evt.start_date,
      end_date: evt.end_date || "",
      semester_id: evt.semester_id || "",
      cohorts: evt.cohorts && evt.cohorts.length > 0 ? evt.cohorts : ["all"],
      source: evt.source || "TB 223/TB-ĐHKTL-ĐT",
      note: evt.note || "",
      verified: evt.verified,
    });
    setFormError(null);
    setShowDeleteConfirm(false);
    setIsPanelOpen(true);
  };

  // Save Event (Create or Update)
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formValues.title.trim()) {
      setFormError("Vui lòng nhập tên sự kiện.");
      return;
    }
    if (!formValues.start_date) {
      setFormError("Vui lòng chọn ngày bắt đầu.");
      return;
    }
    if (formValues.end_date && formValues.end_date < formValues.start_date) {
      setFormError("Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.");
      return;
    }

    setSavingEvent(true);
    try {
      const payload = {
        academic_year: formValues.academic_year.trim(),
        kind: formValues.kind,
        title: formValues.title.trim(),
        start_date: formValues.start_date,
        end_date: formValues.end_date || null,
        semester_id: formValues.semester_id.trim() || null,
        cohorts: formValues.cohorts,
        source: formValues.source.trim(),
        note: formValues.note.trim() || null,
        verified: formValues.verified,
      };

      if (editingEvent) {
        await adminApi.patchCalendarEvent(editingEvent.id, payload);
      } else {
        await adminApi.createCalendarEvent(payload);
      }

      setIsPanelOpen(false);
      loadEvents();
    } catch (err: any) {
      setFormError(err?.message || "Lỗi khi lưu sự kiện.");
    } finally {
      setSavingEvent(false);
    }
  };

  // Toggle quick verify directly from row
  const handleToggleVerified = async (evt: AdminAcademicEvent) => {
    try {
      const updated = await adminApi.patchCalendarEvent(evt.id, {
        verified: !evt.verified,
      });
      setEvents((prev) => prev.map((e) => (e.id === evt.id ? updated : e)));
    } catch (err) {
      // Ignored
    }
  };

  // Delete event
  const handleDeleteEvent = async () => {
    if (!editingEvent) return;
    setDeletingEvent(true);
    try {
      await adminApi.deleteCalendarEvent(editingEvent.id);
      setIsPanelOpen(false);
      loadEvents();
    } catch (err: any) {
      setFormError(err?.message || "Lỗi khi xóa sự kiện.");
    } finally {
      setDeletingEvent(false);
    }
  };

  // Set current semester
  const handleSetCurrentSemester = async (semId: string) => {
    try {
      await adminApi.patchAdminSemester(semId, { is_current: true });
      loadSemesters();
    } catch (err) {
      // Handled
    }
  };

  // Save semester row edits
  const handleSaveSemesterRow = async (semId: string) => {
    const edit = editingSemesters[semId];
    if (!edit) return;

    if (edit.teaching_start && edit.teaching_end && edit.teaching_end < edit.teaching_start) {
      alert("Ngày kết thúc học thực tế phải lớn hơn hoặc bằng ngày bắt đầu.");
      return;
    }

    setSavingSemId(semId);
    try {
      await adminApi.patchAdminSemester(semId, {
        name: edit.name.trim(),
        teaching_start: edit.teaching_start || null,
        teaching_end: edit.teaching_end || null,
      });
      loadSemesters();
    } catch (err) {
      // Handled
    } finally {
      setSavingSemId(null);
    }
  };

  // JSON File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportJsonText(content);
      setDryRunResult(null);
      setImportSuccessMsg(null);
      setImportErrorMsg(null);
    };
    reader.readAsText(file);
  };

  // Preview Diff (Dry-run)
  const handleDryRunImport = async () => {
    setDryRunLoading(true);
    setImportErrorMsg(null);
    setImportSuccessMsg(null);
    setDryRunResult(null);

    try {
      let parsed: any;
      try {
        parsed = JSON.parse(importJsonText);
      } catch {
        throw new Error(t("admin.jsonInvalidError") || "Định dạng JSON không hợp lệ.");
      }
      if (!Array.isArray(parsed)) {
        throw new Error(t("admin.jsonArrayError") || "Nội dung JSON phải là một mảng danh sách các sự kiện.");
      }
      const res = await adminApi.importCalendarEvents(parsed, true);
      setDryRunResult(res);
    } catch (err: any) {
      setImportErrorMsg(err?.message || "Định dạng JSON không hợp lệ.");
    } finally {
      setDryRunLoading(false);
    }
  };

  // Confirm Real Import
  const handleConfirmImport = async () => {
    setImportLoading(true);
    setImportErrorMsg(null);
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(importJsonText);
      } catch {
        throw new Error(t("admin.jsonInvalidError") || "Định dạng JSON không hợp lệ.");
      }
      if (!Array.isArray(parsed)) {
        throw new Error(t("admin.jsonArrayError") || "Nội dung JSON phải là một mảng danh sách các sự kiện.");
      }
      await adminApi.importCalendarEvents(parsed, false);
      setImportSuccessMsg(t("admin.importSuccessMsg"));
      setDryRunResult(null);
      setImportJsonText("");
      loadEvents();
    } catch (err: any) {
      setImportErrorMsg(err?.message || "Lỗi khi nạp dữ liệu.");
    } finally {
      setImportLoading(false);
    }
  };

  // Format date helper
  const formatDateRange = (start: string, end?: string | null) => {
    if (!start) return "";
    const [sy, sm, sd] = start.split("-");
    const sFormatted = `${sd}/${sm}/${sy}`;
    if (!end || end === start) {
      return sFormatted;
    }
    const [ey, em, ed] = end.split("-");
    const eFormatted = `${ed}/${em}/${ey}`;
    return `${sFormatted} – ${eFormatted}`;
  };

  // Group events by Month for Timeline View
  const timelineGroups = useMemo(() => {
    const groups: Record<string, AdminAcademicEvent[]> = {};
    events.forEach((evt) => {
      const [y, m] = evt.start_date.split("-");
      const key = `Tháng ${parseInt(m, 10)}/${y}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(evt);
    });
    return Object.entries(groups);
  }, [events]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-brand-600 dark:text-brand-400" />
            {t("admin.calTitle")}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t("admin.calSubtitle")}
          </p>
        </div>

        {activeTab === "events" && (
          <button
            type="button"
            onClick={handleOpenAddEvent}
            className="btn-primary text-xs sm:text-sm flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            {t("admin.btnAddEvent")}
          </button>
        )}
      </div>

      {/* 3 Main Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab("events")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "events"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          <span>{t("admin.tabCalEvents")}</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
            {totalEvents}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("semesters")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "semesters"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>{t("admin.tabCalSemesters")}</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
            {semesters.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("import")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "import"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>{t("admin.tabCalImport")}</span>
        </button>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: SỰ KIỆN NĂM HỌC                                              */}
      {/* =================================================================== */}
      {activeTab === "events" && (
        <div className="space-y-4">
          {/* Filters & Search Toolbar */}
          <div className="card p-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search query */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={t("admin.searchEventPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-text w-full pl-9 text-xs sm:text-sm"
                />
              </div>

              {/* Year filter */}
              <div className="w-full md:w-44">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="input-select w-full text-xs sm:text-sm"
                >
                  <option value="">{t("admin.filterAllYears")}</option>
                  {yearsList.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cohort filter */}
              <div className="w-full md:w-36">
                <select
                  value={selectedCohort}
                  onChange={(e) => setSelectedCohort(e.target.value)}
                  className="input-select w-full text-xs sm:text-sm"
                >
                  <option value="">{t("admin.filterAllCohorts")}</option>
                  {AVAILABLE_COHORTS.map((c) => (
                    <option key={c} value={c}>
                      {c === "all" ? "Tất cả (all)" : c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Kind filter */}
              <div className="w-full md:w-48">
                <select
                  value={selectedKind}
                  onChange={(e) => setSelectedKind(e.target.value)}
                  className="input-select w-full text-xs sm:text-sm"
                >
                  <option value="">{t("admin.filterAllKinds")}</option>
                  {kindsList.map((k) => (
                    <option key={k} value={k}>
                      {t(EVENT_KIND_LABELS[k]?.labelKey || k)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
              {/* Unverified toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={unverifiedOnly}
                  onChange={(e) => setUnverifiedOnly(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  {t("admin.filterUnverifiedOnly")}
                </span>
              </label>

              {/* View mode toggle: Table vs Timeline */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    viewMode === "table"
                      ? "bg-white dark:bg-slate-900 font-semibold text-slate-900 dark:text-slate-100 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  {t("admin.viewTable")}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("timeline")}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    viewMode === "timeline"
                      ? "bg-white dark:bg-slate-900 font-semibold text-slate-900 dark:text-slate-100 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  {t("admin.viewTimeline")}
                </button>
              </div>
            </div>
          </div>

          {/* Events Content: Table or Timeline */}
          {loadingEvents ? (
            <div className="p-8 text-center">
              <Loading />
            </div>
          ) : events.length === 0 ? (
            <div className="card p-8 text-center text-slate-500 text-sm">
              {t("admin.tableEmpty")}
            </div>
          ) : viewMode === "table" ? (
            /* Table View */
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-3.5 font-semibold whitespace-nowrap">{t("admin.calColDates")}</th>
                      <th className="py-3 px-3.5 font-semibold min-w-[240px]">{t("admin.calColTitle")}</th>
                      <th className="py-3 px-3.5 font-semibold whitespace-nowrap">{t("admin.calColKind")}</th>
                      <th className="py-3 px-3.5 font-semibold whitespace-nowrap">{t("admin.calColCohorts")}</th>
                      <th className="py-3 px-3.5 font-semibold whitespace-nowrap">{t("admin.calColSemester")}</th>
                      <th className="py-3 px-3.5 font-semibold whitespace-nowrap">{t("admin.calColVerified")}</th>
                      <th className="py-3 px-3.5 font-semibold text-right whitespace-nowrap">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {events.map((evt) => {
                      const kindCfg = EVENT_KIND_LABELS[evt.kind] || {
                        labelKey: evt.kind,
                        colorClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                      };

                      return (
                        <tr
                          key={evt.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-3.5 whitespace-nowrap font-mono text-xs text-slate-600 dark:text-slate-400">
                            {formatDateRange(evt.start_date, evt.end_date)}
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {evt.title}
                            </div>
                            {evt.note && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                                {evt.note}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${kindCfg.colorClass}`}
                            >
                              {t(kindCfg.labelKey)}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              {evt.cohorts?.map((c) => (
                                <span
                                  key={c}
                                  className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono"
                                >
                                  {c === "all" ? "Tất cả" : c}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap font-mono text-xs text-slate-500">
                            {evt.semester_id || "—"}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleToggleVerified(evt)}
                              title={evt.verified ? t("admin.quickUnverify") : t("admin.quickVerify")}
                              aria-label={evt.verified ? t("admin.statusVerified") : t("admin.btnQuickVerify")}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors ${
                                evt.verified
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 hover:bg-emerald-100"
                                  : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 hover:bg-amber-100"
                              }`}
                            >
                              {evt.verified ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                  <span>{t("admin.statusVerified")}</span>
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                  <span>{t("admin.btnQuickVerify")}</span>
                                </>
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleOpenEditEvent(evt)}
                              className="btn-outline text-xs px-2.5 py-1 text-brand-600 dark:text-brand-400 inline-flex items-center gap-1 font-medium"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              {t("admin.btnEditEvent")}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Timeline View (Monthly breakdown) */
            <div className="space-y-6">
              {timelineGroups.map(([monthLabel, groupEvents]) => (
                <div key={monthLabel} className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 border-l-4 border-brand-600 pl-2">
                    {monthLabel} ({groupEvents.length} sự kiện)
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {groupEvents.map((evt) => {
                      const kindCfg = EVENT_KIND_LABELS[evt.kind] || {
                        labelKey: evt.kind,
                        colorClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                      };
                      return (
                        <div
                          key={evt.id}
                          className="card p-3.5 hover:shadow-sm transition-shadow flex flex-col justify-between gap-2"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-medium ${kindCfg.colorClass}`}
                              >
                                {t(kindCfg.labelKey)}
                              </span>
                              <span className="font-mono text-xs text-slate-500">
                                {formatDateRange(evt.start_date, evt.end_date)}
                              </span>
                            </div>

                            <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                              {evt.title}
                            </div>

                            {evt.note && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                                {evt.note}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                            <div className="flex items-center gap-1.5">
                              {evt.verified ? (
                                <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 text-[11px]">
                                  <Check className="w-3 h-3" />
                                  {t("admin.statusVerified")}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 text-[11px]">
                                  <AlertTriangle className="w-3 h-3" />
                                  {t("admin.statusUnverified")}
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleOpenEditEvent(evt)}
                              className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
                            >
                              {t("admin.btnEditEvent")} →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: HỌC KỲ                                                       */}
      {/* =================================================================== */}
      {activeTab === "semesters" && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-3.5 font-semibold whitespace-nowrap">{t("admin.semColId")}</th>
                    <th className="py-3 px-3.5 font-semibold min-w-[200px]">{t("admin.semColName")}</th>
                    <th className="py-3 px-3.5 font-semibold whitespace-nowrap">{t("admin.semColYearTerm")}</th>
                    <th className="py-3 px-3.5 font-semibold whitespace-nowrap">{t("admin.semColCurrent")}</th>
                    <th className="py-3 px-3.5 font-semibold whitespace-nowrap">{t("admin.semColDates")}</th>
                    <th className="py-3 px-3.5 font-semibold min-w-[240px]">{t("admin.semColTeachingDates")}</th>
                    <th className="py-3 px-3.5 font-semibold text-right whitespace-nowrap">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loadingSemesters ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center">
                        <Loading />
                      </td>
                    </tr>
                  ) : (
                    semesters.map((s) => {
                      const edit = editingSemesters[s.id] || {
                        name: s.name,
                        teaching_start: s.teaching_start || "",
                        teaching_end: s.teaching_end || "",
                      };

                      return (
                        <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-3.5 whitespace-nowrap font-mono font-medium text-slate-900 dark:text-slate-100">
                            {s.id}
                          </td>
                          <td className="py-3 px-3.5">
                            <input
                              type="text"
                              value={edit.name}
                              onChange={(e) =>
                                setEditingSemesters((prev) => ({
                                  ...prev,
                                  [s.id]: { ...prev[s.id], name: e.target.value },
                                }))
                              }
                              className="input-text w-full text-xs py-1 px-2"
                            />
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap text-slate-600 dark:text-slate-400">
                            {s.year} · HK{s.term}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            {s.is_current ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                {t("admin.isCurrentBadge")}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSetCurrentSemester(s.id)}
                                className="btn-outline text-xs px-2.5 py-1 text-slate-600 dark:text-slate-400 hover:text-brand-ink hover:border-brand-300"
                              >
                                {t("admin.btnSetCurrent")}
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap font-mono text-xs text-slate-500">
                            {formatDateRange(s.start_date || "", s.end_date || "")}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="date"
                                value={edit.teaching_start}
                                onChange={(e) =>
                                  setEditingSemesters((prev) => ({
                                    ...prev,
                                    [s.id]: { ...prev[s.id], teaching_start: e.target.value },
                                  }))
                                }
                                className="input-text text-xs py-1 px-1.5 w-32 font-mono"
                              />
                              <span className="text-slate-400">–</span>
                              <input
                                type="date"
                                value={edit.teaching_end}
                                onChange={(e) =>
                                  setEditingSemesters((prev) => ({
                                    ...prev,
                                    [s.id]: { ...prev[s.id], teaching_end: e.target.value },
                                  }))
                                }
                                className="input-text text-xs py-1 px-1.5 w-32 font-mono"
                              />
                            </div>
                          </td>
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleSaveSemesterRow(s.id)}
                              disabled={savingSemId === s.id}
                              className="btn-primary text-xs px-3 py-1 font-medium"
                            >
                              {savingSemId === s.id ? "Đang lưu..." : t("admin.btnSaveSemester")}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: NHẬP JSON                                                    */}
      {/* =================================================================== */}
      {activeTab === "import" && (
        <div className="card p-5 space-y-4 max-w-4xl">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Upload className="w-5 h-5 text-brand-ink" />
              {t("admin.jsonImportTitle")}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t("admin.jsonImportDesc")}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="btn-outline text-xs px-3 py-1.5 cursor-pointer inline-flex items-center gap-1.5 font-medium">
              <FileDown className="w-4 h-4" />
              {t("admin.btnUploadFile")}
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            {importJsonText && (
              <span className="text-xs text-slate-500">
                Đã nạp văn bản ({importJsonText.length.toLocaleString()} ký tự)
              </span>
            )}
          </div>

          <div>
            <textarea
              rows={8}
              value={importJsonText}
              onChange={(e) => {
                setImportJsonText(e.target.value);
                setDryRunResult(null);
                setImportSuccessMsg(null);
                setImportErrorMsg(null);
              }}
              placeholder={t("admin.jsonPlaceholder")}
              className="input-text w-full font-mono text-xs leading-relaxed"
            />
          </div>

          {importErrorMsg && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{importErrorMsg}</span>
            </div>
          )}

          {importSuccessMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{importSuccessMsg}</span>
            </div>
          )}

          {/* Dry Run Preview Result */}
          {dryRunResult && (
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                {t("admin.diffSummaryTitle")}
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="card p-2.5">
                  <div className="text-slate-500">{t("admin.diffTotalIncoming")}</div>
                  <div className="text-lg font-bold text-brand-ink">{dryRunResult.total_incoming}</div>
                </div>
                <div className="card p-2.5">
                  <div className="text-slate-500">{t("admin.diffToReplace")}</div>
                  <div className="text-lg font-bold text-amber-600">{dryRunResult.to_delete}</div>
                </div>
                <div className="card p-2.5">
                  <div className="text-slate-500">Năm học áp dụng</div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {dryRunResult.diff_summary?.years?.join(", ") || "—"}
                  </div>
                </div>
              </div>

              {dryRunResult.sample_incoming?.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t("admin.diffSampleTitle")}:
                  </div>
                  <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc pl-5">
                    {dryRunResult.sample_incoming.map((item: any, i: number) => (
                      <li key={i}>
                        <span className="font-semibold">{item.title}</span> ({item.kind} · {item.start_date})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleDryRunImport}
              disabled={dryRunLoading || !importJsonText.trim()}
              className="btn-outline text-xs sm:text-sm px-4 py-2 font-medium"
            >
              {dryRunLoading ? "Đang kiểm tra..." : t("admin.btnPreviewDiff")}
            </button>

            {dryRunResult && (
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importLoading}
                className="btn-primary text-xs sm:text-sm px-4 py-2 font-medium"
              >
                {importLoading ? "Đang nạp..." : t("admin.btnConfirmImport")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* RIGHT PANEL DRAWER: THÊM / SỬA SỰ KIỆN                              */}
      {/* =================================================================== */}
      {isPanelOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => !savingEvent && setIsPanelOpen(false)}
          />

          {/* Side Drawer Panel */}
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl h-full flex flex-col z-10 overflow-hidden border-l border-slate-200 dark:border-slate-800">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-brand-ink" />
                {editingEvent ? t("admin.formEditEventTitle") : t("admin.formCreateEventTitle")}
              </h2>
              <button
                type="button"
                onClick={() => setIsPanelOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Form Body */}
            <form onSubmit={handleSaveEvent} className="flex-1 overflow-y-auto p-4 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Event Title */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t("admin.fieldEventTitle")} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formValues.title}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="VD: Thời gian học tập Học kỳ 1..."
                  className="input-text w-full text-xs sm:text-sm"
                />
              </div>

              {/* Academic Year & Kind */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t("admin.fieldAcademicYear")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formValues.academic_year}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, academic_year: e.target.value }))}
                    placeholder="2026-2027"
                    className="input-text w-full text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t("admin.fieldKind")} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formValues.kind}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, kind: e.target.value }))}
                    className="input-select w-full text-xs"
                  >
                    {Object.entries(EVENT_KIND_LABELS).map(([k, cfg]) => (
                      <option key={k} value={k}>
                        {t(cfg.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t("admin.fieldStartDate")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formValues.start_date}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, start_date: e.target.value }))}
                    className="input-text w-full text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t("admin.fieldEndDate")}
                  </label>
                  <input
                    type="date"
                    value={formValues.end_date}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, end_date: e.target.value }))}
                    className="input-text w-full text-xs font-mono"
                  />
                </div>
              </div>

              {/* Semester ID & Document Source */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t("admin.fieldSemesterId")}
                  </label>
                  <input
                    type="text"
                    value={formValues.semester_id}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, semester_id: e.target.value }))}
                    placeholder="2026-2027-1"
                    className="input-text w-full text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t("admin.fieldSource")}
                  </label>
                  <input
                    type="text"
                    value={formValues.source}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, source: e.target.value }))}
                    className="input-text w-full text-xs"
                  />
                </div>
              </div>

              {/* Applicable Cohorts */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t("admin.fieldCohorts")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_COHORTS.map((c) => {
                    const isChecked = formValues.cohorts.includes(c);
                    return (
                      <label
                        key={c}
                        className={`px-2.5 py-1 rounded text-xs font-mono cursor-pointer border transition-colors ${
                          isChecked
                            ? "bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-950/60 dark:border-brand-800 dark:text-brand-300 font-semibold"
                            : "bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (c === "all") {
                              setFormValues((prev) => ({ ...prev, cohorts: ["all"] }));
                            } else {
                              const withoutAll = formValues.cohorts.filter((x) => x !== "all");
                              const updated = e.target.checked
                                ? [...withoutAll, c]
                                : withoutAll.filter((x) => x !== c);
                              setFormValues((prev) => ({
                                ...prev,
                                cohorts: updated.length > 0 ? updated : ["all"],
                              }));
                            }
                          }}
                          className="hidden"
                        />
                        {c === "all" ? "Tất cả (all)" : c}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Note */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t("admin.fieldNote")}
                </label>
                <textarea
                  rows={3}
                  value={formValues.note}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="Ghi chú chi tiết, số tuần học, ngày học bù..."
                  className="input-text w-full text-xs"
                />
              </div>

              {/* Verified Switch */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formValues.verified}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, verified: e.target.checked }))}
                    className="rounded border-slate-300 text-brand-ink focus:ring-brand-focus w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t("admin.fieldVerified")}
                  </span>
                </label>
              </div>

              {/* Delete confirmation box inside panel */}
              {showDeleteConfirm && (
                <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 space-y-2">
                  <div className="text-xs font-bold text-red-800 dark:text-red-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    {t("admin.confirmDeleteEventTitle")}
                  </div>
                  <p className="text-[11px] text-red-700 dark:text-red-400">
                    {t("admin.confirmDeleteEventDesc")}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleDeleteEvent}
                      disabled={deletingEvent}
                      className="px-3 py-1 rounded bg-red-600 text-white font-medium text-xs hover:bg-red-700"
                    >
                      {deletingEvent ? "Đang xóa..." : t("admin.btnConfirmDelete")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs hover:bg-slate-300"
                    >
                      {t("admin.btnCancel")}
                    </button>
                  </div>
                </div>
              )}

              {/* Drawer Footer Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={savingEvent}
                    className="btn-primary text-xs sm:text-sm px-4 py-2 font-medium"
                  >
                    {savingEvent ? "Đang lưu..." : t("admin.btnSaveEvent")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPanelOpen(false)}
                    className="btn-outline text-xs sm:text-sm px-3 py-2 font-medium"
                  >
                    {t("admin.btnClose")}
                  </button>
                </div>

                {editingEvent && !showDeleteConfirm && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="btn-outline text-xs px-2.5 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900 font-medium inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t("admin.btnDeleteEvent")}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
