"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDown } from "lucide-react";
import type { FacetCount, Semester } from "@/lib/types";
import { useT } from "@/i18n";
import {
  academicYearLabel,
  semesterButtonLabel,
  semesterFull,
  semesterShort,
  semesterTerm,
} from "@/i18n/names";

const TERMS = [1, 2, 3] as const;

export interface SemesterPickerProps {
  /** Danh sách học kỳ từ API (hoặc useSemesters().data) */
  semesters: Semester[];
  /** id học kỳ đang chọn (hỗ trợ cả value và selected) */
  value?: string;
  selected?: string;
  /** Callback khi người dùng chọn một học kỳ */
  onChange: (semesterId: string, semester?: Semester) => void;
  /** Tùy chọn aria-label cho nút mở */
  ariaLabel?: string;
  /** Lớp CSS bổ sung cho container */
  className?: string;
  /** Vị trí căn lề popover: "left" | "right" | "center" (mặc định "left") */
  align?: "left" | "right" | "center";
}

interface YearGroup {
  yearLabel: string;
  startYear: number;
  terms: {
    term: number;
    sem?: Semester;
  }[];
}

/**
 * Bộ chọn học kỳ dạng ô vuông "Kỳ 1 | Kỳ 2 | Kỳ 3" theo từng năm học (Brief W19).
 * - Nút mở ghi dạng gọn "Kỳ 1 · 2026–2027" (EN "Term 1 · 2026–2027").
 * - Popover hiển thị mỗi năm học là một hàng: nhãn năm cố định bên trái,
 *   3 ô vuông ≈44×44px bên phải.
 * - Hỗ trợ phím mũi tên, Enter, Esc, click ngoài đóng, dark mode, responsive, song ngữ.
 */
export function SemesterPicker({
  semesters,
  value,
  selected,
  onChange,
  ariaLabel,
  className = "",
  align = "left",
}: SemesterPickerProps) {
  const { t, lang } = useT();
  const uid = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLDivElement>(null);

  const activeValue = value !== undefined ? value : selected ?? "";
  const [open, setOpen] = useState(false);

  // Tìm học kỳ hiện tại đang chọn
  const currentSem = useMemo(
    () => semesters.find((s) => s.id === activeValue),
    [semesters, activeValue],
  );

  // Nhóm các học kỳ theo từng năm học
  const yearGroups = useMemo<YearGroup[]>(() => {
    const map = new Map<string, { startYear: number; byTerm: Map<number, Semester> }>();

    for (const sem of semesters) {
      const yLabel = academicYearLabel(sem);
      if (!yLabel) continue;

      if (!map.has(yLabel)) {
        const startY = parseInt(yLabel.slice(0, 4), 10) || 0;
        map.set(yLabel, { startYear: startY, byTerm: new Map() });
      }

      const termNum = semesterTerm(sem);
      if (termNum && termNum >= 1 && termNum <= 3) {
        map.get(yLabel)!.byTerm.set(termNum, sem);
      }
    }

    // Sắp xếp năm mới nhất lên trên
    const sortedYears = Array.from(map.entries()).sort(
      ([, a], [, b]) => b.startYear - a.startYear,
    );

    return sortedYears.map(([yearLabel, info]) => ({
      yearLabel,
      startYear: info.startYear,
      terms: TERMS.map((term) => ({
        term,
        sem: info.byTerm.get(term),
      })),
    }));
  }, [semesters]);

  // Vị trí ô đang focus bằng bàn phím
  const [focusedCoord, setFocusedCoord] = useState<{ yearIdx: number; termIdx: number }>({
    yearIdx: 0,
    termIdx: 0,
  });

  // Khi mở popover: xác định ô đang chọn để focus và cuộn tới đó
  useEffect(() => {
    if (!open) return;

    if (currentSem) {
      const curYear = academicYearLabel(currentSem);
      const curTerm = semesterTerm(currentSem);
      const yIdx = yearGroups.findIndex((g) => g.yearLabel === curYear);
      if (yIdx >= 0) {
        const tIdx = curTerm ? curTerm - 1 : 0;
        setFocusedCoord({ yearIdx: yIdx, termIdx: tIdx });
      }
    } else if (yearGroups.length > 0) {
      setFocusedCoord({ yearIdx: 0, termIdx: 0 });
    }

    const timer = setTimeout(() => {
      selectedRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 50);

    return () => clearTimeout(timer);
  }, [open, currentSem, yearGroups]);

  // Đóng khi click ngoài
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Chọn học kỳ và đóng popover
  const handleSelect = useCallback(
    (sem?: Semester) => {
      if (!sem) return;
      onChange(sem.id, sem);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  // Điều hướng bàn phím trong popover
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (yearGroups.length === 0) return;

      const { yearIdx, termIdx } = focusedCoord;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (termIdx > 0) {
          setFocusedCoord({ yearIdx, termIdx: termIdx - 1 });
        } else if (yearIdx > 0) {
          setFocusedCoord({ yearIdx: yearIdx - 1, termIdx: 2 });
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (termIdx < 2) {
          setFocusedCoord({ yearIdx, termIdx: termIdx + 1 });
        } else if (yearIdx < yearGroups.length - 1) {
          setFocusedCoord({ yearIdx: yearIdx + 1, termIdx: 0 });
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (yearIdx > 0) {
          setFocusedCoord({ yearIdx: yearIdx - 1, termIdx });
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (yearIdx < yearGroups.length - 1) {
          setFocusedCoord({ yearIdx: yearIdx + 1, termIdx });
        }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const targetGroup = yearGroups[yearIdx];
        const targetCell = targetGroup?.terms[termIdx];
        if (targetCell?.sem) {
          handleSelect(targetCell.sem);
        }
      }
    },
    [open, yearGroups, focusedCoord, handleSelect],
  );

  // Focus ô tương ứng khi focusedCoord đổi
  useEffect(() => {
    if (!open) return;
    const btnId = `${uid}-cell-${focusedCoord.yearIdx}-${focusedCoord.termIdx}`;
    const el = document.getElementById(btnId);
    el?.focus();
  }, [open, focusedCoord, uid]);

  // Nhãn hiển thị trên trigger button
  const buttonLabel = useMemo(() => {
    if (currentSem) {
      return semesterButtonLabel(currentSem, lang);
    }
    if (activeValue) {
      return semesterButtonLabel(activeValue, lang) || activeValue;
    }
    return t("tt.selectSem");
  }, [currentSem, activeValue, lang, t]);

  const alignClass =
    align === "right"
      ? "right-0"
      : align === "center"
      ? "left-1/2 -translate-x-1/2"
      : "left-0";

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        id={`${uid}-trigger`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel || t("tt.selectSem")}
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex h-9 min-w-[15rem] items-center justify-center rounded-lg border border-slate-300 bg-white px-9 py-1.5 text-sm font-medium text-slate-800 shadow-xs transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-focus focus-visible:ring-offset-1 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
      >
        <span className="truncate text-center">{buttonLabel}</span>
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180 text-brand-600 dark:text-brand-400" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Popover dialog */}
      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("sem.pickerTitle")}
          className={`absolute z-50 mt-1.5 w-full min-w-[15rem] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-800 dark:bg-slate-900 ${alignClass}`}
        >
          {/* Danh sách các hàng năm học (không có tiêu đề; đóng bằng Esc, bấm ra ngoài hoặc bấm lại nút chọn) */}
          <div className="max-h-[60vh] space-y-0.5 overflow-y-auto overflow-x-hidden sm:max-h-[300px]">
            {yearGroups.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">
                {t("sem.missingTerm")}
              </p>
            ) : (
              yearGroups.map((group, yIdx) => {
                const isSelectedYear = group.terms.some(
                  (tSlot) => tSlot.sem && tSlot.sem.id === activeValue,
                );

                return (
                  <div
                    key={group.yearLabel}
                    ref={isSelectedYear ? selectedRowRef : undefined}
                    className={`flex items-center justify-center gap-6 rounded-lg px-1 py-1 transition ${
                      isSelectedYear
                        ? "bg-brand-50/60 dark:bg-brand-950/30"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    {/* Nhãn năm học bên trái */}
                    <div className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                      {group.yearLabel}
                    </div>

                    {/* 3 ô vuông bên phải, kích thước cố định, giãn cách đều, không co/chồng lên nhau */}
                    <div
                      className="grid shrink-0 grid-cols-[repeat(3,2.5rem)] gap-1"
                      role="group"
                      aria-label={group.yearLabel}
                    >
                      {group.terms.map(({ term, sem }, tIdx) => {
                        const isAvailable = Boolean(sem);
                        const isSelected = Boolean(sem && sem.id === activeValue);
                        const isCurrent = Boolean(sem && sem.is_current);
                        const isFocused =
                          focusedCoord.yearIdx === yIdx && focusedCoord.termIdx === tIdx;

                        const cellLabel = semesterShort({ term }, lang);
                        const fullTitle = semesterFull(
                          sem || { term, year: group.yearLabel },
                          lang,
                        );

                        return (
                          <button
                            key={term}
                            id={`${uid}-cell-${yIdx}-${tIdx}`}
                            type="button"
                            disabled={!isAvailable}
                            aria-disabled={!isAvailable}
                            aria-selected={isSelected}
                            title={isAvailable ? fullTitle : `${cellLabel} (${t("sem.missingTerm")})`}
                            aria-label={fullTitle}
                            onClick={() => handleSelect(sem)}
                            onFocus={() =>
                              setFocusedCoord({ yearIdx: yIdx, termIdx: tIdx })
                            }
                            className={`relative flex h-7 w-10 shrink-0 items-center justify-center whitespace-nowrap rounded-md border text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-focus focus-visible:ring-offset-1 ${
                              isSelected
                                ? "border-brand-600 bg-brand-600 font-semibold text-white shadow-xs"
                                : isAvailable
                                ? "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-brand-500 dark:hover:bg-slate-800"
                                : "cursor-not-allowed border-slate-200/50 bg-slate-50 text-slate-300 opacity-40 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-600 pointer-events-none"
                            } ${
                              isFocused && !isSelected
                                ? "ring-2 ring-brand-400 dark:ring-brand-500"
                                : ""
                            }`}
                          >
                            <span>{cellLabel}</span>

                            {/* Chấm tròn báo kỳ hiện tại */}
                            {isCurrent && (
                              <span
                                className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${
                                  isSelected
                                    ? "bg-amber-300 ring-2 ring-brand-700"
                                    : "bg-amber-500 ring-2 ring-amber-200 dark:ring-amber-900"
                                }`}
                                title={t("sem.currentTermBadge")}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface SemesterFilterSquaresProps {
  /** Danh sách facet từ API: semester_id kèm count số môn/lớp */
  items: FacetCount[];
  /** Danh sách học kỳ đang được chọn */
  values: string[];
  /** Callback khi thay đổi các học kỳ được chọn */
  onValuesChange: (values: string[]) => void;
  /** Tiêu đề bộ lọc */
  title?: string;
  /** Ghi chú đếm bên cạnh tiêu đề */
  countNote?: string;
  /** Lớp CSS */
  className?: string;
}

/**
 * Bộ lọc học kỳ có lớp mở dạng ô vuông nhỏ theo năm học (trang Học phần /modules).
 * - Hiển thị dạng ô vuông nhỏ theo năm học: `Kỳ 1 · 651`
 * - Chỉ hiện các kỳ có lớp (`count > 0` hoặc đang chọn)
 * - Cho phép chọn nhiều học kỳ độc lập
 */
export function SemesterFilterSquares({
  items,
  values,
  onValuesChange,
  title,
  countNote,
  className = "",
}: SemesterFilterSquaresProps) {
  const { t, lang } = useT();

  // Nhóm các học kỳ có lớp theo từng năm học
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        startYear: number;
        terms: {
          id: string;
          term: number;
          count: number;
          modules?: number;
        }[];
      }
    >();

    for (const item of items) {
      if (!item.value) continue;
      const isSelected = values.includes(item.value);
      if (item.count <= 0 && !isSelected) continue;

      const yLabel = academicYearLabel(item.value);
      if (!yLabel) continue;

      if (!map.has(yLabel)) {
        const startY = parseInt(yLabel.slice(0, 4), 10) || 0;
        map.set(yLabel, { startYear: startY, terms: [] });
      }

      const termNum = semesterTerm(item.value) || 1;
      map.get(yLabel)!.terms.push({
        id: item.value,
        term: termNum,
        count: item.count,
        modules: item.modules,
      });
    }

    // Sắp xếp năm học mới nhất lên đầu, trong mỗi năm sắp theo thứ tự kỳ 1 -> 3
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b.startYear - a.startYear)
      .map(([yearLabel, info]) => ({
        yearLabel,
        startYear: info.startYear,
        terms: info.terms.sort((a, b) => a.term - b.term),
      }));
  }, [items, values]);

  const toggleSemester = (id: string) => {
    if (values.includes(id)) {
      onValuesChange(values.filter((v) => v !== id));
    } else {
      onValuesChange([...values, id]);
    }
  };

  if (groups.length === 0) return null;

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Tiêu đề */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title || t("mod.filterSemester")}
        </span>
        <div className="flex items-center gap-2">
          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onValuesChange([])}
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              {t("common.clear")}
            </button>
          )}
          {countNote && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {countNote}
            </span>
          )}
        </div>
      </div>

      {/* Danh sách các năm học và các ô vuông kỳ */}
      <div className="space-y-2">
        {groups.map((group) => (
          <div key={group.yearLabel} className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {group.yearLabel}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.terms.map(({ id, term, count, modules }) => {
                const isSelected = values.includes(id);
                const termStr = semesterShort({ term }, lang);

                return (
                  <button
                    key={id}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={semesterFull({ term, year: group.yearLabel }, lang)}
                    onClick={() => toggleSemester(id)}
                    title={`${semesterFull({ term, year: group.yearLabel }, lang)}${
                      modules != null
                        ? lang === "en"
                          ? ` — ${count} classes · ${modules} courses`
                          : ` — ${count} lớp · ${modules} học phần`
                        : ""
                    }`}
                    className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-focus ${
                      isSelected
                        ? "border-brand-600 bg-brand-600 font-semibold text-white shadow-xs"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700"
                    }`}
                  >
                    <span>{termStr}</span>
                    <span
                      className={`text-[10px] ${
                        isSelected
                          ? "text-white/90"
                          : "text-slate-400 dark:text-slate-400"
                      }`}
                    >
                      · {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
