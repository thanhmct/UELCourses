"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { SemesterPicker } from "@/components/SemesterPicker";
import { useSemesters } from "@/lib/semesters";
import { adminApi } from "@/lib/adminApi";
import type {
  TrendClassItem,
  TrendConflictData,
  TrendModuleItem,
  TrendPairItem,
  TrendSearchItem,
  TrendSlotItem,
} from "@/lib/types";
import { useT } from "@/i18n";

const COHORT_OPTIONS = ["", "K22", "K23", "K24", "K25", "K26"];
const WEEKDAYS = [
  { val: 2, label: "Thứ Hai" },
  { val: 3, label: "Thứ Ba" },
  { val: 4, label: "Thứ Tư" },
  { val: 5, label: "Thứ Năm" },
  { val: 6, label: "Thứ Sáu" },
  { val: 7, label: "Thứ Bảy" },
  { val: 8, label: "Chủ nhật" },
];

export default function AdminTrendsPage() {
  const { t, lang } = useT();
  const sems = useSemesters();

  // Filters state
  const [semester, setSemester] = useState<string>("");
  const [program, setProgram] = useState<string>("");
  const [rangeOption, setRangeOption] = useState<"7" | "30" | "90" | "custom">("30");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Data state
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<TrendModuleItem[]>([]);
  const [pairs, setPairs] = useState<TrendPairItem[]>([]);
  const [slots, setSlots] = useState<TrendSlotItem[]>([]);
  const [conflicts, setConflicts] = useState<TrendConflictData | null>(null);
  const [searches, setSearches] = useState<TrendSearchItem[]>([]);
  const [activity, setActivity] = useState<{ date: string; count: number }[]>([]);

  // Drilldown class state
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [classesLoading, setClassesLoading] = useState(false);
  const [classes, setClasses] = useState<TrendClassItem[]>([]);

  // Tự động gán học kỳ hiện tại khi tải xong danh sách học kỳ
  useEffect(() => {
    if (!semester && sems.current) {
      setSemester(sems.current.id);
    }
  }, [sems.current, semester]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const rangeDays = rangeOption === "custom" ? undefined : parseInt(rangeOption, 10);
    const fDate = rangeOption === "custom" ? fromDate || undefined : undefined;
    const tDate = rangeOption === "custom" ? toDate || undefined : undefined;

    try {
      const [modsRes, pairsRes, slotsRes, confRes, searchRes, overviewRes] = await Promise.all([
        adminApi.getTrendsModules({
          semester: semester || undefined,
          program: program || undefined,
          range: rangeDays,
          from: fDate,
          to: tDate,
        }),
        adminApi.getTrendsPairs({
          semester: semester || undefined,
        }),
        adminApi.getTrendsSlots({
          semester: semester || undefined,
          program: program || undefined,
          from: fDate,
          to: tDate,
        }),
        adminApi.getTrendsConflicts({
          semester: semester || undefined,
        }),
        adminApi.getTrendsSearch({
          from: fDate,
          to: tDate,
        }),
        adminApi.getOverview(),
      ]);

      setModules(modsRes.modules || []);
      setPairs(pairsRes.pairs || []);
      setSlots(slotsRes.slots || []);
      setConflicts(confRes);
      setSearches(searchRes.searches || []);
      setActivity(overviewRes.activity_30d || []);
    } catch {
      // Fallback khi lỗi
      setModules([]);
      setPairs([]);
      setSlots([]);
      setConflicts(null);
      setSearches([]);
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }, [semester, program, rangeOption, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Tải danh sách lớp khi người dùng chọn xem chi tiết một môn
  const handleViewClasses = useCallback(async (moduleCode: string) => {
    setSelectedModule(moduleCode);
    setClassesLoading(true);
    try {
      const res = await adminApi.getTrendsClasses(moduleCode, semester || undefined);
      setClasses(res.classes || []);
    } catch {
      setClasses([]);
    } finally {
      setClassesLoading(false);
    }
  }, [semester]);

  // Tính toán màu cho bản đồ nhiệt Thứ × Tiết
  const maxSlotCount = useMemo(() => {
    let max = 0;
    for (const s of slots) {
      if (s.count_raw > max) max = s.count_raw;
    }
    return max > 0 ? max : 1;
  }, [slots]);

  const getSlotColor = (countRaw: number) => {
    if (countRaw === 0) return "fill-slate-100 dark:fill-slate-800";
    const ratio = countRaw / maxSlotCount;
    if (ratio < 0.2) return "fill-sky-100 dark:fill-sky-950 text-sky-900";
    if (ratio < 0.4) return "fill-sky-300 dark:fill-sky-800 text-sky-950";
    if (ratio < 0.7) return "fill-sky-500 dark:fill-sky-600 text-white";
    return "fill-blue-700 dark:fill-blue-500 text-white";
  };

  // Tính toán biểu đồ đường SVG
  const activitySvgData = useMemo(() => {
    if (!activity.length) return { points: "", max: 1 };
    const max = Math.max(...activity.map((a) => a.count), 10);
    const width = 600;
    const height = 140;
    const padding = 20;

    const points = activity.map((item, idx) => {
      const x = padding + (idx / (activity.length - 1)) * (width - 2 * padding);
      const y = height - padding - (item.count / max) * (height - 2 * padding);
      return `${x},${y}`;
    }).join(" ");

    return { points, max, width, height, padding };
  }, [activity]);

  return (
    <div className="space-y-6 pb-12">
      {/* Tiêu đề trang & Ghi chú k-anonymity */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {t("admin.trendsTitle")}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("admin.trendsSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 rounded-md border border-amber-200 dark:border-amber-800">
            {t("admin.anonymityNote")}
          </span>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="btn-outline p-2 text-slate-600 hover:text-slate-900 cursor-pointer"
            title="Tải lại dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Thanh bộ lọc cố định trên cùng */}
      <section className="card p-4 bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-4 text-sm">
        {/* Bộ chọn học kỳ */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            {t("admin.filterSemester")}:
          </label>
          {sems.data && sems.data.length > 0 ? (
            <SemesterPicker
              semesters={sems.data}
              value={semester}
              onChange={(id) => setSemester(id)}
              className="text-xs"
            />
          ) : (
            <input
              type="text"
              className="input text-xs py-1 px-2 w-32"
              placeholder="2026-2027-1"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            />
          )}
        </div>

        {/* Bộ chọn Khóa / CTĐT */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            {t("admin.filterProgram")}:
          </label>
          <select
            className="input text-xs py-1 px-2 w-28"
            value={program}
            onChange={(e) => setProgram(e.target.value)}
          >
            <option value="">Tất cả</option>
            {COHORT_OPTIONS.filter(Boolean).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Khoảng thời gian */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            {t("admin.filterRange")}:
          </label>
          <div className="flex rounded-md border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
            {(["7", "30", "90", "custom"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setRangeOption(opt)}
                className={`px-2.5 py-1 text-xs font-medium rounded ${
                  rangeOption === opt
                    ? "bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-300 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                {opt === "7" ? t("admin.range7d") : opt === "30" ? t("admin.range30d") : opt === "90" ? t("admin.range90d") : t("admin.rangeCustom")}
              </button>
            ))}
          </div>

          {rangeOption === "custom" && (
            <div className="flex items-center gap-1.5 ml-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="input text-xs py-1 px-2 w-32"
                aria-label={t("admin.fromDate")}
              />
              <span className="text-slate-400">–</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="input text-xs py-1 px-2 w-32"
                aria-label={t("admin.toDate")}
              />
            </div>
          )}
        </div>
      </section>

      {/* Khối (g) & (f): Xu hướng hoạt động 30 ngày & Tỷ lệ xung đột TKB */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Biểu đồ đường hoạt động */}
        <section className="card p-5 lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {t("admin.activityTitle")}
            </h2>
            <span className="text-xs text-slate-500">
              {activity.length} ngày gần nhất
            </span>
          </div>

          {loading ? (
            <div className="h-40 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-md" />
          ) : activity.length > 0 ? (
            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${activitySvgData.width || 600} ${activitySvgData.height || 140}`}
                className="w-full h-36 overflow-visible"
                role="img"
                aria-label={t("admin.activityTitle")}
              >
                {/* Đường biểu đồ */}
                <polyline
                  fill="none"
                  className="stroke-brand-focus"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={activitySvgData.points}
                />
                {/* Các điểm tròn */}
                {activity.map((item, idx) => {
                  const width = activitySvgData.width || 600;
                  const height = activitySvgData.height || 140;
                  const padding = activitySvgData.padding || 20;
                  const x = padding + (idx / (activity.length - 1)) * (width - 2 * padding);
                  const y = height - padding - (item.count / activitySvgData.max) * (height - 2 * padding);
                  return (
                    <circle
                      key={item.date}
                      cx={x}
                      cy={y}
                      r="3.5"
                      className="fill-brand-focus stroke-white dark:stroke-slate-900 cursor-pointer hover:r-5 transition-all"
                    >
                      <title>{`${item.date}: ${item.count} sự kiện`}</title>
                    </circle>
                  );
                })}
              </svg>
            </div>
          ) : (
            <div className="h-36 flex items-center justify-center text-xs text-slate-500">
              {t("admin.emptyTrendData")}
            </div>
          )}
        </section>

        {/* Khối (f): Tỷ lệ TKB có xung đột */}
        <section className="card p-5 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {t("admin.conflictsTitle")}
            </h2>
            <a
              href={adminApi.getExportCsvUrl("conflicts", { semester })}
              target="_blank"
              rel="noreferrer"
              className="btn-outline text-xs px-2 py-1 flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              {t("admin.exportCsv")}
            </a>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-3xl font-extrabold text-brand-600 dark:text-brand-400">
                {conflicts?.conflict_rate_pct ?? 0}%
              </span>
              <p className="text-xs text-slate-500 mt-1">
                {t("admin.conflictRate")}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <span className="text-slate-400 block">{t("admin.conflictedSchedules")}</span>
                <span className="font-bold text-sm">{conflicts?.conflicted_schedules ?? 0}</span>
              </div>
              <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <span className="text-slate-400 block">{t("admin.totalSchedules")}</span>
                <span className="font-bold text-sm">{conflicts?.total_schedules ?? 0}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Khối (a): Bảng Top môn */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
            {t("admin.topModulesTitle")}
          </h2>
          <a
            href={adminApi.getExportCsvUrl("modules", {
              semester,
              program,
              range: rangeOption !== "custom" ? rangeOption : undefined,
              from: rangeOption === "custom" ? fromDate : undefined,
              to: rangeOption === "custom" ? toDate : undefined,
            })}
            target="_blank"
            rel="noreferrer"
            className="btn-outline text-xs px-3 py-1 flex items-center gap-1.5 font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            {t("admin.exportCsv")}
          </a>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
            ))}
          </div>
        ) : modules.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500">
                  <th className="py-2.5 px-3">{t("admin.colModuleCode")}</th>
                  <th className="py-2.5 px-3">{t("admin.colModuleName")}</th>
                  <th className="py-2.5 px-3 text-right">{t("admin.colTimetable")}</th>
                  <th className="py-2.5 px-3 text-right">{t("admin.colPlanner")}</th>
                  <th className="py-2.5 px-3 text-right">{t("admin.colViews")}</th>
                  <th className="py-2.5 px-3 text-center">{t("admin.colTrend")}</th>
                  <th className="py-2.5 px-3 text-center">{t("admin.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {modules.map((m) => (
                  <tr
                    key={m.module_code}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                      selectedModule === m.module_code ? "bg-brand-50 dark:bg-brand-950" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-semibold text-brand-700 dark:text-brand-400">
                      {m.module_code}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                      {lang === "en" && m.module_name_en ? m.module_name_en : m.module_name}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {m.timetable_adds}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {m.planner_adds}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      {m.views}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                          m.trend_dir === "up"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : m.trend_dir === "down"
                            ? "text-red-700 dark:text-red-400"
                            : "text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {m.trend_dir === "up" && <TrendingUp className="w-3.5 h-3.5" />}
                        {m.trend_dir === "down" && <TrendingDown className="w-3.5 h-3.5" />}
                        {m.trend_pct}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleViewClasses(m.module_code)}
                        className="btn-outline text-xs px-2.5 py-0.5 text-brand-600 dark:text-brand-400 cursor-pointer"
                      >
                        {t("admin.viewClasses")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-500">
            {t("admin.emptyTrendData")}
          </div>
        )}
      </section>

      {/* Khối (d): Lớp được chọn nhiều của môn đang chọn */}
      {selectedModule && (
        <section className="card p-5 space-y-4 border-2 border-brand-200 dark:border-brand-900/60">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {t("admin.classesForModule", { code: selectedModule })}
            </h3>
            <div className="flex items-center gap-2">
              <a
                href={adminApi.getExportCsvUrl("classes", { module: selectedModule, semester })}
                target="_blank"
                rel="noreferrer"
                className="btn-outline text-xs px-2 py-1 flex items-center gap-1 font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                {t("admin.exportCsv")}
              </a>
              <button
                type="button"
                onClick={() => setSelectedModule(null)}
                className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕ Đóng
              </button>
            </div>
          </div>

          {classesLoading ? (
            <div className="h-16 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
          ) : classes.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {classes.map((c) => (
                <div
                  key={c.class_code}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-center"
                >
                  <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    {c.class_code}
                  </span>
                  <span className="text-lg font-extrabold text-brand-600 dark:text-brand-400 block mt-1">
                    {c.count}
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    {t("admin.colClassSelects")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-4">
              Không có lớp nào được thêm gần đây cho môn này.
            </p>
          )}
        </section>
      )}

      {/* Khối (b): Bản đồ nhiệt Thứ × Tiết */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
              {t("admin.heatmapTitle")}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Phân bố số lượng lượt chọn theo khung giờ trong tuần (Thứ 2 đến Chủ nhật, Tiết 1 đến 16)
            </p>
          </div>
          <a
            href={adminApi.getExportCsvUrl("slots", {
              semester,
              program,
              from: rangeOption === "custom" ? fromDate : undefined,
              to: rangeOption === "custom" ? toDate : undefined,
            })}
            target="_blank"
            rel="noreferrer"
            className="btn-outline text-xs px-3 py-1 flex items-center gap-1.5 font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            {t("admin.exportCsv")}
          </a>
        </div>

        {loading ? (
          <div className="h-64 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg" />
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[640px]">
              {/* SVG Heatmap 7 cột × 16 hàng */}
              <svg
                viewBox="0 0 680 440"
                className="w-full h-auto"
                role="img"
                aria-label={t("admin.heatmapTitle")}
              >
                {/* Tiêu đề cột các Thứ */}
                {WEEKDAYS.map((wd, colIdx) => (
                  <text
                    key={wd.val}
                    x={80 + colIdx * 82 + 38}
                    y={20}
                    textAnchor="middle"
                    className="text-[11px] font-semibold fill-slate-500 dark:fill-slate-400"
                  >
                    {wd.label}
                  </text>
                ))}

                {/* Tiêu đề hàng các Tiết */}
                {Array.from({ length: 16 }, (_, i) => i + 1).map((period) => (
                  <text
                    key={period}
                    x={65}
                    y={35 + (period - 1) * 24 + 16}
                    textAnchor="end"
                    className="text-[10px] font-mono fill-slate-400"
                  >
                    Tiết {period}
                  </text>
                ))}

                {/* Lưới các ô 7 × 16 = 112 ô */}
                {WEEKDAYS.map((wd, colIdx) => (
                  <g key={wd.val}>
                    {Array.from({ length: 16 }, (_, i) => i + 1).map((period) => {
                      const item = slots.find((s) => s.weekday === wd.val && s.period === period);
                      const rawCount = item?.count_raw ?? 0;
                      const displayCount = item?.count ?? 0;
                      const x = 80 + colIdx * 82;
                      const y = 35 + (period - 1) * 24;

                      return (
                        <g key={`${wd.val}-${period}`}>
                          <rect
                            x={x}
                            y={y}
                            width={76}
                            height={20}
                            rx={3}
                            className={`${getSlotColor(rawCount)} transition-colors cursor-pointer hover:stroke-brand-600 hover:stroke-2`}
                          >
                            <title>{`${wd.label}, Tiết ${period}: ${displayCount} lượt chọn`}</title>
                          </rect>
                          {rawCount > 0 && (
                            <text
                              x={x + 38}
                              y={y + 14}
                              textAnchor="middle"
                              className="text-[10px] font-mono font-bold pointer-events-none fill-current"
                            >
                              {displayCount}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                ))}
              </svg>

              {/* Chú giải mức độ heatmap */}
              <div className="flex items-center justify-end gap-3 mt-4 text-xs text-slate-500">
                <span>{t("admin.heatmapLegendLow")}</span>
                <div className="flex items-center gap-1">
                  <span className="w-5 h-3.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                  <span className="w-5 h-3.5 rounded bg-sky-100 dark:bg-sky-950" />
                  <span className="w-5 h-3.5 rounded bg-sky-300 dark:bg-sky-800" />
                  <span className="w-5 h-3.5 rounded bg-sky-500 dark:bg-sky-600" />
                  <span className="w-5 h-3.5 rounded bg-blue-700 dark:bg-blue-500" />
                </div>
                <span>{t("admin.heatmapLegendHigh")}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Khối (c) & (e): Cặp môn đi cùng & Từ khóa tìm không thấy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Khối (c): Cặp môn hay đi cùng */}
        <section className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {t("admin.pairsTitle")}
            </h2>
            <a
              href={adminApi.getExportCsvUrl("pairs", { semester })}
              target="_blank"
              rel="noreferrer"
              className="btn-outline text-xs px-2.5 py-1 flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              {t("admin.exportCsv")}
            </a>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
              ))}
            </div>
          ) : pairs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 px-2">Môn A</th>
                    <th className="py-2 px-2">Môn B</th>
                    <th className="py-2 px-2 text-right">{t("admin.colPairCount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pairs.slice(0, 10).map((p) => (
                    <tr key={`${p.module_a}-${p.module_b}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-2">
                        <span className="font-mono font-semibold text-brand-600 dark:text-brand-400">{p.module_a}</span>
                        <span className="text-slate-500 block truncate max-w-[140px]">{p.module_a_name}</span>
                      </td>
                      <td className="py-2 px-2">
                        <span className="font-mono font-semibold text-brand-600 dark:text-brand-400">{p.module_b}</span>
                        <span className="text-slate-500 block truncate max-w-[140px]">{p.module_b_name}</span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold">
                        {p.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-6">
              {t("admin.emptyTrendData")}
            </p>
          )}
        </section>

        {/* Khối (e): Từ khóa tìm kiếm không có kết quả */}
        <section className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {t("admin.searchTitle")}
            </h2>
            <a
              href={adminApi.getExportCsvUrl("search", {
                from: rangeOption === "custom" ? fromDate : undefined,
                to: rangeOption === "custom" ? toDate : undefined,
              })}
              target="_blank"
              rel="noreferrer"
              className="btn-outline text-xs px-2.5 py-1 flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              {t("admin.exportCsv")}
            </a>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
              ))}
            </div>
          ) : searches.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 px-2">Từ khóa</th>
                    <th className="py-2 px-2 text-right">{t("admin.colSearchCount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {searches.map((s) => (
                    <tr key={s.query} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-2 font-medium text-slate-800 dark:text-slate-200">
                        {s.query}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-brand-600 dark:text-brand-400">
                        {s.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-6">
              Không có từ khóa tìm kiếm không kết quả nào gần đây.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
