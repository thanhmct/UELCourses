"use client";
import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type FocusEventHandler, type MouseEventHandler, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { ClassSection, Lesson } from "@/lib/types";
import { assignLanes, lessonsOverlap } from "@/lib/conflicts";
import { getLessonTimes } from "@/lib/occurrences";
import { PERIOD_COUNT, SESSION_BOUNDARIES, WEEKDAYS, periodStartTime, timeToColumn } from "@/lib/periods";
import { seatsAvailable } from "@/lib/modules";
import { useT, weekdayName } from "@/i18n";
import { normalizeHex, readableText } from "@/lib/appearance";

const isBoundary = (p: number) => p === SESSION_BOUNDARIES.morningEnd || p === SESSION_BOUNDARIES.afternoonEnd;

export interface BlockViolation {
  type: "conflict" | "adjacency";
  title: string;
  otherModuleCode: string;
  otherClassCode: string;
  weekday: number;
  periods: string;
  ruleNote?: string;
  weeks?: number[] | null;
}

export interface GridBlock {
  key: string;
  code: string;
  name: string;
  class_code: string;
  section?: ClassSection;
  lesson: Lesson;
  color: string;
  conflict: boolean;
  violations?: BlockViolation[];
  /**
   * Chỉ có khi đang xem MỘT tuần cụ thể: ngày thật (ISO) của buổi học mà khối này đại diện.
   * Khi có, khối ghi đúng ngày đó thay vì khoảng ngày hay nhãn "Một ngày".
   */
  occDate?: string;
}

/** "2026-09-14" -> "14/09/2026" */
export function fullDate(iso?: string | null): string {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
}

/** "2026-09-14" -> "14/09" */
export function shortDate(iso?: string | null): string {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "";
}

/** Lesson calendar info: one-day session (date_start == date_end) or a date range. */
export function lessonDates(
  l: Lesson,
  lang: "vi" | "en" = "vi",
): { oneTime: boolean; text: string; label: string } {
  const a = shortDate(l.date_start);
  const b = shortDate(l.date_end);
  if (!a && !b) return { oneTime: false, text: "", label: "" };
  if (a && (!b || fullDate(l.date_start) === fullDate(l.date_end))) {
    const prefix = lang === "en" ? "One day" : "Một ngày";
    return { oneTime: true, text: a, label: `${prefix} · ${a}` };
  }
  const range = a && b ? `${a}–${b}` : a || b;
  return { oneTime: false, text: range, label: range };
}

export interface GridClosure {
  date: string;
  titles: ReadonlySet<string>;
}

interface Props {
  blocks: GridBlock[];
  /** Full semester data for class details and the Sunday row when the grid is filtered. */
  semesterBlocks?: GridBlock[];
  /** all sections for each module, to show alternatives */
  alternatives: Record<string, ClassSection[]>;
  colors: Record<string, string>;
  closures?: ReadonlyMap<number, GridClosure>;
  onChangeClass: (code: string, classCode: string) => void;
  /** show the module name inside each block */
  showNames?: boolean;
  selectedBlockKey?: string | null;
  onSelectBlockKey?: (key: string | null) => void;
}

/** Grid dimensions in pixels. Overlapping sessions have a full-height lane each. */
const COL_W = 68;
const ROW_H = 57;
const OVERLAP_LANE_H = 60;
const MAX_VISIBLE_LANES = 2;
const LABEL_W = 64;

interface GridSlot {
  block: GridBlock;
  schedules: GridBlock[];
}

function scheduleDate(block: GridBlock) {
  return block.occDate ?? block.lesson.date_start ?? "";
}

/** A room or date change is still the same grid slot if the class and time match. */
function groupBlocks(blocks: GridBlock[]): Map<string, GridSlot> {
  const slots = new Map<string, GridSlot>();
  for (const block of blocks) {
    const { lesson } = block;
    const { start, end } = getLessonTimes(lesson);
    const key = JSON.stringify([
      block.code, block.class_code, lesson.weekday,
      start.padStart(5, "0"), end.padStart(5, "0"),
    ]);
    const slot = slots.get(key);
    if (slot) slot.schedules.push(block);
    else slots.set(key, { block, schedules: [block] });
  }
  for (const { schedules } of slots.values()) {
    schedules.sort((a, b) => scheduleDate(a).localeCompare(scheduleDate(b)));
  }
  return slots;
}

/** Horizontal extent from the clock times (handles half periods); falls back to whole periods. */
function span(l: Lesson): { left: number; width: number } {
  const { start, end } = getLessonTimes(l);
  const a = timeToColumn(start) ?? l.start_period - 1;
  const b = timeToColumn(end) ?? l.end_period;
  const left = Math.max(0, a);
  const right = Math.max(left + 0.4, b);
  return { left, width: right - left };
}

function posStyle(l: Lesson, lane: number, lanes: number, rowHeight: number) {
  const { left, width } = span(l);
  const laneHeight = lanes > 1 ? OVERLAP_LANE_H : Math.min(rowHeight, OVERLAP_LANE_H);
  const laneTop = lanes > 1 ? lane * laneHeight : (rowHeight - laneHeight) / 2;
  return {
    left: left * COL_W + 1,
    width: width * COL_W - 2,
    top: laneTop + 2,
    height: laneHeight - 4,
  };
}

export interface GhostBlockData {
  key: string;
  moduleCode: string;
  moduleName: string;
  classCode: string;
  lesson: Lesson;
  color: string;
  hasClash: boolean;
  section: ClassSection;
}

type LayoutItem =
  | { kind: "slot"; slotKey: string; lesson: Lesson; start_period: number; end_period: number }
  | { kind: "ghost"; ghost: GhostBlockData; start_period: number; end_period: number };

function slotsByDay(slots: Map<string, GridSlot>) {
  const map = new Map<number, LayoutItem[]>(WEEKDAYS.map((day) => [day, []]));
  for (const [slotKey, { block: { lesson } }] of slots) {
    map.get(lesson.weekday)?.push({
      kind: "slot", slotKey, lesson, start_period: lesson.start_period, end_period: lesson.end_period,
    });
  }
  return map;
}

function rowHeightFor(laid: ReturnType<typeof assignLanes<LayoutItem>>, slots: Map<string, GridSlot>) {
  const lanes = Math.min(MAX_VISIBLE_LANES, Math.max(1, ...laid.map((entry) => entry.lanes)));
  const hasConflict = laid.some(({ item }) => item.kind === "slot" && slots.get(item.slotKey)?.schedules.some(({ conflict }) => conflict));
  return lanes > 1 || hasConflict ? lanes * OVERLAP_LANE_H : ROW_H;
}

function layoutDay(items: LayoutItem[], selectedSlotKey: string | null) {
  const layout = assignLanes(items);
  const selected = layout.find(({ item }) => item.kind === "slot" && item.slotKey === selectedSlotKey);
  if (!selected || selected.lane < MAX_VISIBLE_LANES) return layout;

  // Keep the selected slot visible if earlier alternatives push it into the overflow list.
  const visibleLane = MAX_VISIBLE_LANES - 1;
  for (const entry of layout) {
    if (entry.lane === visibleLane
      && entry.item.start_period <= selected.item.end_period
      && entry.item.end_period >= selected.item.start_period) {
      entry.lane = selected.lane;
    }
  }
  selected.lane = visibleLane;
  return layout;
}

function GridTooltip({ anchor, id, label, onMouseLeave, onBlur, children }: {
  anchor: RefObject<HTMLButtonElement | null>;
  id: string;
  label?: string;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  children: ReactNode;
}) {
  const tooltip = useRef<HTMLDivElement>(null);
  const scrollable = !!onMouseLeave;

  useLayoutEffect(() => {
    const button = anchor.current;
    const overlay = tooltip.current;
    if (!button || !overlay) return;
    const scroller = button.closest('[role="region"]');
    const margin = 8;
    const gap = scrollable ? 0 : 6;

    const positionTooltip = () => {
      const rect = button.getBoundingClientRect();
      const clip = scroller?.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight;
      const left = Math.max(rect.left, clip?.left ?? 0, 0);
      const right = Math.min(rect.right, clip?.right ?? width, width);
      if (left >= right || rect.bottom <= 0 || rect.top >= height) {
        overlay.style.visibility = "hidden";
        return;
      }

      const above = rect.top - gap;
      const below = rect.bottom + gap;
      const spaceAbove = above - margin;
      const spaceBelow = height - below - margin;
      const measuredHeight = overlay.getBoundingClientRect().height;
      const preferredHeight = scrollable ? Math.max(measuredHeight, overlay.scrollHeight) : measuredHeight;
      const showAbove = preferredHeight <= spaceAbove || (preferredHeight > spaceBelow && spaceAbove > spaceBelow);
      if (scrollable) {
        const availableHeight = Math.max(0, showAbove ? spaceAbove : spaceBelow);
        overlay.style.maxHeight = `min(16rem, ${availableHeight}px)`;
      }
      const { width: tooltipWidth, height: tooltipHeight } = overlay.getBoundingClientRect();
      const top = showAbove ? above - tooltipHeight : below;
      overlay.style.left = `${Math.max(margin, Math.min(right - tooltipWidth, width - tooltipWidth - margin))}px`;
      overlay.style.top = `${Math.max(margin, Math.min(top, height - tooltipHeight - margin))}px`;
      overlay.style.visibility = "visible";
    };

    positionTooltip();
    window.addEventListener("scroll", positionTooltip, true);
    window.addEventListener("resize", positionTooltip);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(positionTooltip);
    observer?.observe(button);
    observer?.observe(overlay);
    if (scroller) observer?.observe(scroller);
    return () => {
      window.removeEventListener("scroll", positionTooltip, true);
      window.removeEventListener("resize", positionTooltip);
      observer?.disconnect();
    };
  }, [anchor, children, scrollable]);

  return createPortal(
    <div
      ref={tooltip}
      id={id}
      role={label ? "region" : "tooltip"}
      aria-label={label}
      onMouseLeave={onMouseLeave}
      onBlur={onBlur}
      onClick={scrollable ? (event) => event.stopPropagation() : undefined}
      className={`fixed invisible z-[1000] w-max max-w-[min(18rem,calc(100%_-_1rem))] max-h-[calc(100dvh-1rem)] overflow-auto break-words rounded-lg border px-2.5 py-1.5 text-left text-xs shadow-xl ${
        scrollable
          ? "overscroll-contain border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          : "pointer-events-none border-slate-700 bg-slate-900 text-white dark:bg-slate-800"
      }`}
    >
      {children}
    </div>,
    document.body,
  );
}

function SchedulePopover({ label, renderTriggers, children }: {
  label?: string;
  renderTriggers: (props: {
    anchor: RefObject<HTMLButtonElement | null>;
    preview: ButtonHTMLAttributes<HTMLButtonElement>;
    toggle: ButtonHTMLAttributes<HTMLButtonElement>;
  }) => ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const openOnPointerDown = useRef<boolean | null>(null);
  const touchingBlock = useRef(false);
  const [mode, setMode] = useState<"preview" | "click" | null>(null);
  const open = mode !== null;
  const close = () => setMode(null);
  const openPreview = () => {
    if (!touchingBlock.current) setMode((current) => current ?? "preview");
  };
  const getPanel = () => document.getElementById(id);
  const isTrigger = useCallback((target: Node) =>
    target instanceof Element && target.closest("[data-schedule-trigger]")?.getAttribute("data-schedule-trigger") === id,
  [id]);
  const leavePreview = (event: { relatedTarget: EventTarget | null }) => {
    const next = event.relatedTarget;
    if (next instanceof Node && (isTrigger(next) || getPanel()?.contains(next))) return;
    setMode((current) => current === "click" ? current : null);
  };

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node
        && !isTrigger(target)
        && !document.getElementById(id)?.contains(target)) {
        setMode(null);
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (label) event.stopPropagation();
      if (document.getElementById(id)?.contains(document.activeElement)) anchor.current?.focus();
      setMode(null);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("click", dismissOutside, true);
    window.addEventListener("keydown", dismissOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("click", dismissOutside, true);
      window.removeEventListener("keydown", dismissOnEscape, true);
    };
  }, [id, isTrigger, label, open]);

  const endTouch = () => { touchingBlock.current = false; };
  const preview = {
    "data-schedule-trigger": id,
    "aria-describedby": open && !label ? id : undefined,
    onMouseEnter: openPreview,
    onMouseLeave: leavePreview,
    onFocus: openPreview,
    onBlur: leavePreview,
    onPointerDown: (event) => { touchingBlock.current = event.pointerType === "touch"; },
    onPointerCancel: endTouch,
    onClick: endTouch,
  } satisfies ButtonHTMLAttributes<HTMLButtonElement> & { "data-schedule-trigger": string };
  const toggle = {
    ...preview,
    "aria-expanded": open,
    "aria-controls": open ? id : undefined,
    onPointerDown: () => {
      endTouch();
      openOnPointerDown.current = open;
    },
    onPointerCancel: () => { openOnPointerDown.current = null; },
    onClick: (event) => {
      event.stopPropagation();
      // A touch can focus the button before its click arrives.
      const wasOpen = event.detail > 0 ? openOnPointerDown.current ?? open : open;
      openOnPointerDown.current = null;
      setMode(wasOpen ? null : "click");
    },
    onKeyDown: (event) => {
      if (event.key !== "Tab" || event.shiftKey || !open || !label) return;
      const firstAction = getPanel()?.querySelector("button");
      if (firstAction) {
        event.preventDefault();
        firstAction.focus();
      }
    },
  } satisfies ButtonHTMLAttributes<HTMLButtonElement>;

  return (
    <>
      {renderTriggers({ anchor, preview, toggle })}
      {open && (
        <GridTooltip anchor={anchor} id={id} label={label}
          onMouseLeave={(event) => {
            if (!getPanel()?.contains(document.activeElement)) leavePreview(event);
          }}
          onBlur={leavePreview}
        >
          {children(close)}
        </GridTooltip>
      )}
    </>
  );
}

function ScheduleEntries({ schedules }: {
  schedules: Pick<GridBlock, "key" | "lesson" | "section" | "occDate">[];
}) {
  const { t } = useT();
  return (
    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
      {schedules.map(({ key, lesson, section, occDate }) => {
        const { start, end } = getLessonTimes(lesson);
        const from = fullDate(lesson.date_start);
        const to = fullDate(lesson.date_end);
        const date = occDate
          ? fullDate(occDate)
          : from && to && from !== to ? `${from}–${to}` : from || to;
        return (
          <li key={key} className="space-y-0.5 py-2">
            <p>{[date || t("tt.scheduleDateUnknown"), lesson.room && t("tt.room", { room: lesson.room })].filter(Boolean).join(" · ")}</p>
            <p>{weekdayName(t, lesson.weekday)} · {t("tt.scheduleTime", { s: lesson.start_period, e: lesson.end_period, start, end })}</p>
            {!occDate && lesson.weeks && <p>{t("tt.scheduleWeeks", { weeks: lesson.weeks })}</p>}
            {section?.lecturer && <p>{t("tt.scheduleLecturer", { name: section.lecturer })}</p>}
            {section?.student_groups?.length ? <p>{section.student_groups.join(", ")}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

function scheduleViolations(schedules: GridBlock[]): BlockViolation[] {
  return [...new Map(schedules.flatMap(({ violations = [] }) =>
    violations.map((violation) => [JSON.stringify(violation), violation] as const)
  )).values()];
}

function ScheduleWarnings({ block, schedules }: { block: GridBlock; schedules: GridBlock[] }) {
  const { t } = useT();
  const allViolations = scheduleViolations(schedules);
  const violations = allViolations.filter(({ type }) => type === "conflict");
  return (
    <>
      {allViolations.length === 0 && schedules.some(({ conflict }) => conflict) && (
        <p className="border-t border-slate-200 pt-2 font-semibold text-rose-700 dark:border-slate-700 dark:text-rose-300">
          {t("tt.clashWarning")}
        </p>
      )}
      {violations.map((violation) => (
        <div key={JSON.stringify(violation)} className="space-y-0.5 border-t border-slate-200 py-2 dark:border-slate-700">
          <p className="font-semibold text-rose-700 dark:text-rose-300">{violation.title}</p>
          {violation.otherModuleCode && (
            <p>{block.code} ↔ {violation.otherModuleCode}</p>
          )}
          <p>{weekdayName(t, violation.weekday)}, {violation.periods}</p>
        </div>
      ))}
    </>
  );
}

function Block({
  slot,
  position,
  isSelected,
  dimmed,
  showName,
  onSelectBlockKey,
}: {
  slot: GridSlot;
  position: ReturnType<typeof posStyle>;
  isSelected: boolean;
  dimmed: boolean;
  showName: boolean;
  onSelectBlockKey: (key: string | null) => void;
}) {
  const { t } = useT();
  const { block, schedules } = slot;
  const l = block.lesson;
  const dates = lessonDates(l);
  const day = weekdayName(t, l.weekday);
  const hasDetails = schedules.length > 1;
  const titleLayout = position.width >= 2 * COL_W - 2 ? "line-clamp-2" : "truncate";
  const { start, end } = getLessonTimes(l);
  const clockRange = Number.isInteger(l.end_period) ? "" : `${start}–${end}`;
  const rooms = [...new Set(schedules.map(({ lesson }) => lesson.room).filter(Boolean))].join(" · ");
  const dateSummary = [...new Set(schedules.map(({ lesson, occDate }) => occDate ? fullDate(occDate) : lessonDates(lesson).text).filter(Boolean))].join(" · ");
  const conflict = schedules.some((entry) => entry.conflict);
  const ink = readableText(normalizeHex(block.color) ?? "#144E8C");
  const badgeClassName = `rounded px-1 py-0.5 text-[10px] font-semibold focus-visible:outline-2 ${
    conflict ? "bg-rose-100 text-rose-950 dark:bg-rose-800 dark:text-white"
      : ink === "#FFFFFF" ? "bg-black/35 text-white hover:bg-black/50" : "bg-white/50 text-black hover:bg-white/75"
  } ${dimmed ? "opacity-40" : ""}`;
  const visibleDate = block.occDate ? fullDate(block.occDate) : dates.oneTime
    ? `${t("tt.oneTime")} · ${dates.text}`
    : dates.text;

  const violations = scheduleViolations(schedules);
  const conflictAria =
    violations.length > 0
      ? `, ${violations
          .map((v) =>
            v.otherModuleCode
              ? `${v.title} · ${v.otherModuleCode} (${v.otherClassCode})`
              : v.title,
          )
          .join(". ")}`
      : conflict
      ? t("tt.blockConflict")
      : "";

  return (
    <div className={`absolute ${isSelected ? "z-30" : conflict ? "z-20" : "z-10"}`} style={position}>
      <SchedulePopover renderTriggers={({ anchor, preview, toggle }) => (
        <>
          <button
            {...(hasDetails ? preview : {})}
            ref={anchor}
            type="button"
            onClick={(event) => {
              preview.onClick?.(event);
              onSelectBlockKey(isSelected ? null : block.key);
            }}
            aria-pressed={isSelected}
            aria-label={[t("tt.block", {
              code: block.code,
              cls: block.class_code,
              day,
              s: l.start_period,
              e: l.end_period,
              conflict: conflictAria,
            }), clockRange].filter(Boolean).join(" · ")}
            className={`absolute inset-0 flex w-full cursor-pointer flex-col justify-center overflow-hidden rounded-[4.4px] px-1.5 text-[11px] leading-[13px] select-none text-left transition-colors ${
              isSelected ? "timetable-block-selected" : ""
            } ${
              conflict
                ? "border-2 border-rose-400 bg-rose-50 text-rose-950 hover:bg-rose-100 hover:border-rose-500 dark:border-rose-600 dark:bg-rose-950 dark:text-rose-100 dark:hover:bg-rose-900"
                : "hover:ring-1 hover:ring-inset hover:ring-current"
            } ${dimmed ? "opacity-40" : ""}`}
            style={conflict ? undefined : { backgroundColor: block.color, color: ink }}
          >
            <div className="flex w-full shrink-0 items-start justify-between gap-1">
              <div className={`min-w-0 text-[12px] font-bold ${titleLayout}`}>
                {block.code}
                {showName && <span className="ml-1 font-normal">{block.name}</span>}
              </div>
              {conflict && (
                <span
                  className="shrink-0 text-rose-600 dark:text-rose-400"
                  aria-hidden="true"
                >
                  <svg
                    className="h-3.5 w-3.5 inline-block"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </span>
              )}
            </div>
            {(clockRange || rooms) && (
              <div className="flex w-full min-w-0 items-baseline gap-1">
                {clockRange && <span className="shrink-0 font-medium tabular-nums">{clockRange}</span>}
                {rooms && <span className="truncate">{clockRange && "· "}{rooms}</span>}
              </div>
            )}
            <div className={`w-full truncate ${hasDetails ? "pr-7" : ""}`}>
              {hasDetails ? dateSummary : visibleDate}
            </div>
          </button>
          {hasDetails && (
            <button {...toggle} type="button" className={`absolute right-0.5 bottom-0.5 ${badgeClassName}`}
              aria-label={t("tt.moreClassSchedules", { cls: block.class_code })}>+{schedules.length - 1}</button>
          )}
        </>
      )}>
        {() => <>
          <p className="font-bold">{block.code === block.name ? block.code : `${block.code} · ${block.name}`}</p>
          <ScheduleEntries schedules={schedules} />
        </>}
      </SchedulePopover>
    </div>
  );
}

function GhostBlock({
  ghost,
  position,
  onChoose,
}: {
  ghost: GhostBlockData;
  position: ReturnType<typeof posStyle>;
  onChoose: () => void;
}) {
  const { t } = useT();
  const anchor = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const [showTooltip, setShowTooltip] = useState(false);
  const l = ghost.lesson;
  const day = weekdayName(t, l.weekday);
  const left = seatsAvailable(ghost.section);
  const leftText = left !== null ? (left === 0 ? t("tt.full") : t("tt.seatsLeft", { n: left })) : "";
  const lecturer = ghost.section.lecturer ? t("tt.scheduleLecturer", { name: ghost.section.lecturer }) : "";
  const room = l.room ? t("tt.room", { room: l.room }) : "";

  const ariaLabel = t("tt.ghostBlockAria", {
    code: ghost.moduleCode,
    cls: ghost.classCode,
    day,
    s: l.start_period,
    e: l.end_period,
    conflict: ghost.hasClash ? t("tt.blockConflict") : "",
  });

  return (
    <>
      <button
        ref={anchor}
        type="button"
        data-testid={`ghost-block-${ghost.classCode}`}
        onClick={(e) => {
          e.stopPropagation();
          onChoose();
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setShowTooltip(false);
        }}
        aria-label={ariaLabel}
        aria-describedby={showTooltip ? tooltipId : undefined}
        className={`absolute z-20 cursor-pointer rounded-[4.4px] border-2 border-dashed px-1.5 text-[11px] leading-tight select-none text-left transition-colors ${
          ghost.hasClash
            ? "border-red-500 bg-red-50/90 text-red-800 hover:bg-red-100 hover:border-red-600 dark:border-red-600 dark:bg-red-950/80 dark:text-red-200 dark:hover:bg-red-900/90"
            : "bg-white/90 text-slate-800 hover:bg-white hover:shadow-md dark:bg-slate-900/90 dark:text-slate-100 dark:hover:bg-slate-800"
        }`}
        style={{
          ...position,
          ...(ghost.hasClash ? {} : { borderColor: ghost.color }),
        }}
      >
        <div className="flex items-center justify-between gap-1">
          <span
            className="truncate font-bold text-xs"
            style={ghost.hasClash ? undefined : { color: ghost.color }}
          >
            {ghost.classCode}
          </span>
          {ghost.hasClash && (
            <span className="shrink-0 rounded bg-red-100 px-1 text-[10px] font-bold text-red-700 dark:bg-red-900 dark:text-red-200">
              ⚠ {t("tt.clashWarning")}
            </span>
          )}
        </div>

        <div className="truncate text-[10px] text-slate-600 dark:text-slate-300">
          {[room, leftText].filter(Boolean).join(" · ")}
        </div>
      </button>
      {showTooltip && (
        <GridTooltip anchor={anchor} id={tooltipId}>
          <div className="font-bold">{ghost.classCode}</div>
          {lecturer && <div>{lecturer}</div>}
          {room && <div>{room}</div>}
          {leftText && <div className={left === 0 ? "text-red-400 font-semibold" : "text-emerald-400"}>{leftText}</div>}
          {ghost.hasClash && <div className="text-red-400 font-bold">⚠ {t("tt.clashWarning")}</div>}
        </GridTooltip>
      )}
    </>
  );
}

/** Weekly timetable: one row per weekday, one column per period. Click block to switch classes. */
export const TimetableGrid = forwardRef<HTMLDivElement, Props>(function TimetableGrid(
  {
    blocks,
    semesterBlocks = blocks,
    alternatives,
    colors,
    closures,
    onChangeClass,
    showNames = true,
    selectedBlockKey,
    onSelectBlockKey,
  },
  ref,
) {
  const { t } = useT();
  const [internalSelectedKey, setInternalSelectedKey] = useState<string | null>(null);

  const activeSelectedKey = selectedBlockKey !== undefined ? selectedBlockKey : internalSelectedKey;
  const setSelectedKey = useCallback((key: string | null) => {
    if (onSelectBlockKey) onSelectBlockKey(key);
    else setInternalSelectedKey(key);
  }, [onSelectBlockKey]);

  // Esc key deselects
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelectedKey]);

  const selectedBlock = useMemo(() => {
    return activeSelectedKey ? blocks.find((b) => b.key === activeSelectedKey) ?? null : null;
  }, [activeSelectedKey, blocks]);

  useEffect(() => {
    if (selectedBlockKey === undefined && internalSelectedKey && !selectedBlock) {
      setInternalSelectedKey(null);
    }
  }, [internalSelectedKey, selectedBlock, selectedBlockKey]);

  const otherSections = useMemo(() => {
    if (!selectedBlock) return [];
    const all = alternatives[selectedBlock.code] ?? [];
    return all.filter((s) => s.class_code !== selectedBlock.class_code);
  }, [selectedBlock, alternatives]);

  const ghostBlocks = useMemo(() => {
    if (!selectedBlock || otherSections.length === 0) return [];
    const otherBlocks = blocks.filter((b) => b.code !== selectedBlock.code);
    const color = colors[selectedBlock.code] || selectedBlock.color;

    const result: GhostBlockData[] = [];
    for (const s of otherSections) {
      if (!s.lessons || s.lessons.length === 0) continue;
      const sectionClash = otherBlocks.some((b) =>
        s.lessons.some((la) => lessonsOverlap(la, b.lesson)),
      );
      s.lessons.forEach((l, idx) => {
        if (closures?.has(l.weekday)) return;
        const lessonClash = otherBlocks.some((b) => lessonsOverlap(l, b.lesson));
        result.push({
          key: `ghost-${s.class_code}#${idx}`,
          moduleCode: selectedBlock.code,
          moduleName: selectedBlock.name,
          classCode: s.class_code,
          lesson: l,
          color,
          hasClash: lessonClash || sectionClash,
          section: s,
        });
      });
    }
    return result;
  }, [selectedBlock, otherSections, blocks, colors, closures]);

  const visibleSlots = useMemo(() => groupBlocks(blocks), [blocks]);
  const selectedSlotKey = activeSelectedKey
    ? [...visibleSlots].find(([, slot]) => slot.schedules.some(({ key }) => key === activeSelectedKey))?.[0] ?? null
    : null;
  const byDay = useMemo(() => {
    const map = slotsByDay(visibleSlots);
    for (const g of ghostBlocks) {
      map.get(g.lesson.weekday)?.push({
        kind: "ghost",
        ghost: g,
        start_period: g.lesson.start_period,
        end_period: g.lesson.end_period,
      });
    }
    return map;
  }, [visibleSlots, ghostBlocks]);
  // Reserve room for the semester layout so filtering a week does not move other days.
  const semesterRowHeights = useMemo(() => {
    const slots = groupBlocks(semesterBlocks);
    return new Map([...slotsByDay(slots)].map(([day, items]) => [day, rowHeightFor(assignLanes(items), slots)]));
  }, [semesterBlocks]);

  // Keep Sunday across week changes when the semester has a Sunday session.
  const days = WEEKDAYS.filter((d) => d !== 8 || closures?.has(8) || (byDay.get(8)?.length ?? 0) > 0 || semesterBlocks.some((b) => b.lesson.weekday === 8));

  const width = LABEL_W + PERIOD_COUNT * COL_W;

  return (
    <div className="space-y-3">
      <div
        className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800"
        role="region"
        aria-label={t("tt.gridAria")}
        tabIndex={0}
        onClick={(event) => {
          if (!(event.target as Element).closest("button") && activeSelectedKey) {
            setSelectedKey(null);
          }
        }}
      >
        <div ref={ref} className="bg-white dark:bg-slate-900" style={{ width, minWidth: width }}>
          <div className="flex border-b border-slate-200 text-center text-[10px] text-slate-500 dark:border-slate-800">
            <div aria-hidden="true" className="shrink-0 py-1" style={{ width: LABEL_W }} />
            {Array.from({ length: PERIOD_COUNT }, (_, i) => (
              <div
                key={i}
                className={`shrink-0 border-l py-1 ${
                  isBoundary(i) ? "border-slate-300 dark:border-slate-600" : "border-slate-100 dark:border-slate-800"
                }`}
                style={{ width: COL_W }}
              >
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {periodStartTime(i + 1)}
                </div>
                <div>{t("period.n", { n: i + 1 })}</div>
              </div>
            ))}
          </div>

          {days.map((d) => {
            const closure = closures?.get(d);
            const dayItems = closure ? [] : byDay.get(d) ?? [];
            const laid = layoutDay(dayItems, selectedSlotKey);
            const rowHeight = Math.max(semesterRowHeights.get(d) ?? ROW_H, rowHeightFor(laid, visibleSlots));
            const overflow = laid.filter(({ lane }) => lane >= MAX_VISIBLE_LANES);
            const overflowTitle = t("tt.overlappingSchedules", { day: weekdayName(t, d) });

            return (
              <div
                key={d}
                className="flex border-b border-slate-200 last:border-b-transparent dark:border-slate-800 dark:last:border-b-transparent"
                role="row"
                aria-label={weekdayName(t, d)}
              >
                <div
                  className="flex shrink-0 flex-col items-center justify-center bg-slate-50 text-xs font-semibold text-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                  style={{ width: LABEL_W }}
                  role="rowheader"
                >
                  {weekdayName(t, d, true)}
                  {closure && <span className="text-[10px] font-medium text-amber-800 dark:text-amber-200">{t("holiday.closed")}</span>}
                  {overflow.length > 0 && (
                    <SchedulePopover label={overflowTitle} renderTriggers={({ anchor, toggle }) => (
                      <button {...toggle} ref={anchor} type="button" aria-label={overflowTitle}
                        className="cursor-pointer rounded px-1.5 py-0.5 text-brand-700 underline dark:text-brand-300"
                      >+{overflow.length}</button>
                    )}>
                      {(close) => (
                        <div className="divide-y divide-slate-200 dark:divide-slate-700">
                          <p className="pb-1 font-bold">{overflowTitle}</p>
                          {overflow.map(({ item }) => {
                            if (item.kind === "ghost") {
                              const { ghost } = item;
                              return (
                                <div className="py-1.5" key={ghost.key}>
                                  <p className="font-bold">{ghost.moduleCode} {ghost.moduleName} · {ghost.classCode}</p>
                                  <ScheduleEntries schedules={[ghost]} />
                                  {ghost.hasClash && <p className="mb-1 text-rose-700 dark:text-rose-300">{t("tt.clashWarning")}</p>}
                                  <button type="button" className="btn-outline w-full" onClick={() => {
                                    onChangeClass(ghost.moduleCode, ghost.classCode);
                                    setSelectedKey(null);
                                    close();
                                  }}>{t("tt.ghostBlockAria", {
                                    code: ghost.moduleCode,
                                    cls: ghost.classCode,
                                    day: weekdayName(t, d),
                                    s: ghost.lesson.start_period,
                                    e: ghost.lesson.end_period,
                                    conflict: ghost.hasClash ? t("tt.blockConflict") : "",
                                  })}</button>
                                </div>
                              );
                            }
                            const slot = visibleSlots.get(item.slotKey);
                            if (!slot) return null;
                            const { block, schedules } = slot;
                            const title = `${block.code} ${block.name} · ${block.class_code}`;
                            const canSelect = alternatives[block.code]?.some((section) => section.class_code !== block.class_code);
                            return (
                              <div className="py-1.5" key={item.slotKey}>
                                {canSelect ? (
                                  <button type="button" className="text-left font-bold underline" onClick={() => {
                                    setSelectedKey(block.key);
                                    close();
                                  }}>{title}</button>
                                ) : <p className="font-bold">{title}</p>}
                                <ScheduleEntries schedules={schedules} />
                                <ScheduleWarnings block={block} schedules={schedules} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </SchedulePopover>
                  )}
                </div>
                {closure ? (
                  <div role="cell" aria-colspan={PERIOD_COUNT} className="flex flex-1 items-center border-l border-amber-200 bg-amber-50 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                    style={{ minHeight: rowHeight }}>
                    <div className="sticky left-3 max-w-[min(100%,calc(100vw-7rem))] px-3 py-2">
                      <time className="font-semibold tabular-nums" dateTime={closure.date}>{fullDate(closure.date)}</time>
                      {` · ${[...closure.titles].join(" / ")}`}
                    </div>
                  </div>
                ) : <div className="relative" style={{ width: PERIOD_COUNT * COL_W, height: rowHeight }}>
                  {Array.from({ length: PERIOD_COUNT }, (_, i) => (
                    <div
                      key={i}
                      className={`absolute inset-y-0 border-l ${
                        isBoundary(i + 1)
                          ? "border-slate-300 dark:border-slate-600"
                          : "border-slate-100 dark:border-slate-800"
                      } ${
                        i < SESSION_BOUNDARIES.morningEnd || i >= SESSION_BOUNDARIES.afternoonEnd
                          ? "bg-white dark:bg-slate-900"
                          : "bg-slate-50/70 dark:bg-slate-800/30"
                      }`}
                      style={{ left: i * COL_W, width: COL_W }}
                    />
                  ))}
                  {laid.filter(({ lane }) => lane < MAX_VISIBLE_LANES).map(({ item, lane, lanes }) => {
                    if (item.kind === "slot") {
                      const slot = visibleSlots.get(item.slotKey);
                      if (!slot) return null;
                      const { block } = slot;
                      const isSelected = item.slotKey === selectedSlotKey;
                      const dimmed = !!selectedBlock && block.code !== selectedBlock.code;
                      return (
                        <Block
                          key={item.slotKey}
                          slot={slot}
                          position={posStyle(item.lesson, lane, lanes, rowHeight)}
                          isSelected={isSelected}
                          dimmed={dimmed}
                          showName={showNames}
                          onSelectBlockKey={setSelectedKey}
                        />
                      );
                    }
                    return (
                      <GhostBlock
                        key={item.ghost.key}
                        ghost={item.ghost}
                        position={posStyle(item.ghost.lesson, lane, lanes, rowHeight)}
                        onChoose={() => {
                          onChangeClass(item.ghost.moduleCode, item.ghost.classCode);
                          setSelectedKey(null);
                        }}
                      />
                    );
                  })}
                </div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
