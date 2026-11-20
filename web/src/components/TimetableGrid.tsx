"use client";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { forwardRef, useMemo, useState } from "react";
import type { ClassSection, Lesson } from "@/lib/types";
import { assignLanes } from "@/lib/conflicts";
import { PERIOD_COUNT, SESSION_BOUNDARIES, WEEKDAYS, periodStartTime, timeToColumn } from "@/lib/periods";
import { useT, weekdayName } from "@/i18n";

const isBoundary = (p: number) => p === SESSION_BOUNDARIES.morningEnd || p === SESSION_BOUNDARIES.afternoonEnd;

export interface GridBlock {
  key: string;
  code: string;
  name: string;
  class_code: string;
  lesson: Lesson;
  color: string;
  conflict: boolean;
}

interface Props {
  blocks: GridBlock[];
  /** all sections for each module, to show alternatives while dragging */
  alternatives: Record<string, ClassSection[]>;
  colors: Record<string, string>;
  onChangeClass: (code: string, classCode: string) => void;
  /** show the module name inside each block */
  showNames?: boolean;
}

/** Width of one period column (px), height of one stacked lane (px), width of the day-label column (px). */
const COL_W = 68;
const LANE_H = 52;
const LABEL_W = 64;

type Item =
  | { kind: "block"; block: GridBlock; start_period: number; end_period: number }
  | { kind: "ghost"; code: string; section: ClassSection; lesson: Lesson; idx: number; start_period: number; end_period: number };

/** Horizontal extent from the clock times (handles half periods); falls back to whole periods. */
function span(l: Lesson): { left: number; width: number } {
  const a = (l.start_time ? timeToColumn(l.start_time) : null) ?? l.start_period - 1;
  const b = (l.end_time ? timeToColumn(l.end_time) : null) ?? l.end_period;
  const left = Math.max(0, a);
  const right = Math.max(left + 0.4, b);
  return { left, width: right - left };
}

function posStyle(l: Lesson, lane: number) {
  const { left, width } = span(l);
  return {
    left: left * COL_W + 1,
    width: width * COL_W - 2,
    top: lane * LANE_H + 2,
    height: LANE_H - 4,
  };
}

/** "2026-09-14" -> "14/09" */
export function shortDate(iso?: string | null): string {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "";
}

/** Lesson calendar info: one-off session (date_start == date_end) or a date range. */
export function lessonDates(l: Lesson): { oneTime: boolean; text: string } {
  const a = shortDate(l.date_start);
  const b = shortDate(l.date_end);
  if (!a && !b) return { oneTime: false, text: "" };
  if (a && b && l.date_start === l.date_end) return { oneTime: true, text: a };
  return { oneTime: false, text: a && b ? `${a}–${b}` : a || b };
}

function Block({ block, lane, dimmed, showName }: { block: GridBlock; lane: number; dimmed: boolean; showName: boolean }) {
  const { t } = useT();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.key,
    data: { code: block.code },
  });
  const l = block.lesson;
  const dates = lessonDates(l);
  const day = weekdayName(t, l.weekday);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title={`${block.code} ${block.name}\n${t("tt.blockTitle", {
        cls: block.class_code,
        s: l.start_period,
        e: l.end_period,
        st: l.start_time,
        et: l.end_time,
        room: l.room ? `\n${t("tt.room", { room: l.room })}` : "",
      })}${dates.text ? `\n${dates.oneTime ? `${t("tt.oneTime")}: ${dates.text}` : dates.text}` : ""}${block.conflict ? `\n⚠ ${t("tt.conflictShort")}` : ""}`}
      aria-label={t("tt.block", {
        code: block.code,
        cls: block.class_code,
        day,
        s: l.start_period,
        e: l.end_period,
        conflict: block.conflict ? t("tt.blockConflict") : "",
      })}
      className={`absolute cursor-grab touch-none overflow-hidden rounded px-1.5 py-1 text-[11px] leading-tight text-white select-none active:cursor-grabbing ${
        block.conflict ? "ring-2 ring-inset ring-red-600" : ""
      } ${isDragging ? "z-20 opacity-90 shadow-lg" : "z-10"} ${dimmed && !isDragging ? "opacity-40" : ""}`}
      style={{
        ...posStyle(l, lane),
        backgroundColor: block.conflict ? "#b91c1c" : block.color,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
    >
      <div className="truncate text-xs font-bold">{block.code}</div>
      {showName && <div className="truncate">{block.name}</div>}
      <div className="truncate opacity-90">
        {block.class_code}
        {l.room ? ` · ${l.room}` : ""}
      </div>
      {dates.text && (
        <div className="truncate opacity-90">
          {dates.oneTime ? `${t("tt.oneTime")} · ${dates.text}` : dates.text}
        </div>
      )}
      {block.conflict && <div className="truncate font-bold">{t("tt.conflictShort")}</div>}
    </div>
  );
}

function Ghost({ item, lane, color }: { item: Extract<Item, { kind: "ghost" }>; lane: number; color: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `alt|${item.code}|${item.section.class_code}|${item.idx}`,
    data: { code: item.code, classCode: item.section.class_code },
  });
  const l = item.lesson;
  return (
    <div
      ref={setNodeRef}
      className={`absolute z-0 overflow-hidden rounded border-2 border-dashed px-1.5 py-1 text-[10px] leading-tight ${isOver ? "bg-brand-100 dark:bg-brand-900" : "bg-white/70 dark:bg-slate-800/70"}`}
      style={{ ...posStyle(l, lane), borderColor: color }}
    >
      <div className="font-semibold">{item.section.class_code}</div>
      <div className="truncate opacity-80">{l.room ?? ""}</div>
    </div>
  );
}

/** Weekly timetable: one row per weekday, one column per period (with real start times). */
export const TimetableGrid = forwardRef<HTMLDivElement, Props>(function TimetableGrid(
  { blocks, alternatives, colors, onChangeClass, showNames = true },
  ref,
) {
  const { t } = useT();
  const [dragCode, setDragCode] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const currentClass = useMemo(() => {
    const m: Record<string, string> = {};
    blocks.forEach((b) => (m[b.code] = b.class_code));
    return m;
  }, [blocks]);

  const byDay = useMemo(() => {
    const map = new Map<number, Item[]>();
    for (const d of WEEKDAYS) map.set(d, []);
    for (const b of blocks) {
      map.get(b.lesson.weekday)?.push({ kind: "block", block: b, start_period: b.lesson.start_period, end_period: b.lesson.end_period });
    }
    if (dragCode) {
      for (const s of alternatives[dragCode] ?? []) {
        if (s.class_code === currentClass[dragCode]) continue;
        s.lessons.forEach((l, idx) =>
          map.get(l.weekday)?.push({ kind: "ghost", code: dragCode, section: s, lesson: l, idx, start_period: l.start_period, end_period: l.end_period }),
        );
      }
    }
    return map;
  }, [blocks, alternatives, dragCode, currentClass]);

  // Sunday row only when a session falls on Sunday
  const days = WEEKDAYS.filter((d) => d !== 8 || (byDay.get(8)?.length ?? 0) > 0);

  function onDragStart(e: DragStartEvent) {
    setDragCode((e.active.data.current as { code: string }).code);
  }
  function onDragEnd(e: DragEndEvent) {
    const over = e.over?.data.current as { code: string; classCode: string } | undefined;
    if (over && dragCode && over.code === dragCode) onChangeClass(over.code, over.classCode);
    setDragCode(null);
  }

  const width = LABEL_W + PERIOD_COUNT * COL_W;
  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragCode(null)}>
      <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800" role="region" aria-label={t("tt.gridAria")} tabIndex={0}>
        <div ref={ref} className="bg-white dark:bg-slate-900" style={{ width, minWidth: width }}>
          <div className="flex border-b border-slate-200 text-center text-[10px] text-slate-500 dark:border-slate-800">
            <div className="shrink-0 py-1 font-semibold" style={{ width: LABEL_W }}>{t("tt.periodHeader")}</div>
            {Array.from({ length: PERIOD_COUNT }, (_, i) => (
              <div
                key={i}
                className={`shrink-0 border-l py-1 ${isBoundary(i) ? "border-slate-300 dark:border-slate-600" : "border-slate-100 dark:border-slate-800"}`}
                style={{ width: COL_W }}
              >
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{periodStartTime(i + 1)}</div>
                <div>{t("period.n", { n: i + 1 })}</div>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const laid = assignLanes(byDay.get(d) ?? []);
            const rows = Math.max(1, ...laid.map((x) => x.lane + 1));
            return (
              <div key={d} className="flex border-b border-slate-200 last:border-b-0 dark:border-slate-800" role="row" aria-label={weekdayName(t, d)}>
                <div
                  className="flex shrink-0 items-center justify-center bg-slate-50 text-xs font-semibold text-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                  style={{ width: LABEL_W }}
                  role="rowheader"
                >
                  {weekdayName(t, d, true)}
                </div>
                <div className="relative" style={{ width: PERIOD_COUNT * COL_W, height: rows * LANE_H }}>
                  {Array.from({ length: PERIOD_COUNT }, (_, i) => (
                    <div
                      key={i}
                      className={`absolute inset-y-0 border-l ${isBoundary(i + 1) ? "border-slate-300 dark:border-slate-600" : "border-slate-100 dark:border-slate-800"} ${i < SESSION_BOUNDARIES.morningEnd || i >= SESSION_BOUNDARIES.afternoonEnd ? "bg-white dark:bg-slate-900" : "bg-slate-50/70 dark:bg-slate-800/30"}`}
                      style={{ left: i * COL_W, width: COL_W }}
                    />
                  ))}
                  {laid.map(({ item, lane }) =>
                    item.kind === "block" ? (
                      <Block key={item.block.key} block={item.block} lane={lane} dimmed={!!dragCode && dragCode !== item.block.code} showName={showNames} />
                    ) : (
                      <Ghost key={`g-${item.section.class_code}-${item.idx}`} item={item} lane={lane} color={colors[item.code] ?? "#0b4f9c"} />
                    ),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
});
