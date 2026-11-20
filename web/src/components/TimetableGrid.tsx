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
import { PERIOD_COUNT, SESSION_BOUNDARIES, WEEKDAYS, periodStartTime, weekdayLabel } from "@/lib/periods";

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
}

const ROW_H = 44;

type Item =
  | { kind: "block"; block: GridBlock; start_period: number; end_period: number }
  | { kind: "ghost"; code: string; section: ClassSection; lesson: Lesson; idx: number; start_period: number; end_period: number };

function Block({ block, lane, lanes, dimmed }: { block: GridBlock; lane: number; lanes: number; dimmed: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.key,
    data: { code: block.code },
  });
  const l = block.lesson;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title={`${block.code} ${block.name}\nLớp ${block.class_code}\nTiết ${l.start_period}–${l.end_period} (${l.start_time}–${l.end_time})${l.room ? `\nPhòng ${l.room}` : ""}${block.conflict ? "\n⚠ Trùng lịch" : ""}\nKéo để đổi lớp`}
      aria-label={`${block.code} lớp ${block.class_code}, ${weekdayLabel(l.weekday)} tiết ${l.start_period} đến ${l.end_period}${block.conflict ? ", trùng lịch" : ""}. Kéo để đổi lớp.`}
      className={`absolute cursor-grab touch-none overflow-hidden rounded-md border-l-4 p-1 text-[11px] leading-tight shadow-sm select-none active:cursor-grabbing ${
        block.conflict ? "ring-2 ring-red-500 bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100" : "text-slate-900 dark:text-white"
      } ${isDragging ? "z-20 opacity-90 shadow-lg" : "z-10"} ${dimmed && !isDragging ? "opacity-40" : ""}`}
      style={{
        top: (l.start_period - 1) * ROW_H + 1,
        height: (l.end_period - l.start_period + 1) * ROW_H - 2,
        left: `calc(${(lane / lanes) * 100}% + 1px)`,
        width: `calc(${100 / lanes}% - 2px)`,
        borderLeftColor: block.conflict ? "#dc2626" : block.color,
        backgroundColor: block.conflict ? undefined : `${block.color}22`,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
    >
      <div className="font-semibold">{block.code}</div>
      <div className="truncate">{block.name}</div>
      <div className="truncate opacity-80">{l.room ?? ""}{l.weeks ? ` · T${l.weeks}` : ""}</div>
      {block.conflict && <div className="font-bold text-red-700 dark:text-red-300">Trùng lịch</div>}
    </div>
  );
}

function Ghost({ item, lane, lanes, color }: { item: Extract<Item, { kind: "ghost" }>; lane: number; lanes: number; color: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `alt|${item.code}|${item.section.class_code}|${item.idx}`,
    data: { code: item.code, classCode: item.section.class_code },
  });
  const l = item.lesson;
  return (
    <div
      ref={setNodeRef}
      className={`absolute z-0 overflow-hidden rounded-md border-2 border-dashed p-1 text-[10px] leading-tight ${isOver ? "bg-brand-100 dark:bg-brand-900" : "bg-white/70 dark:bg-slate-800/70"}`}
      style={{
        top: (l.start_period - 1) * ROW_H + 1,
        height: (l.end_period - l.start_period + 1) * ROW_H - 2,
        left: `calc(${(lane / lanes) * 100}% + 1px)`,
        width: `calc(${100 / lanes}% - 2px)`,
        borderColor: color,
      }}
    >
      <div className="font-semibold">{item.section.class_code}</div>
      <div className="truncate opacity-80">{l.room ?? ""}</div>
    </div>
  );
}

export const TimetableGrid = forwardRef<HTMLDivElement, Props>(function TimetableGrid(
  { blocks, alternatives, colors, onChangeClass },
  ref,
) {
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

  function onDragStart(e: DragStartEvent) {
    setDragCode((e.active.data.current as { code: string }).code);
  }
  function onDragEnd(e: DragEndEvent) {
    const over = e.over?.data.current as { code: string; classCode: string } | undefined;
    if (over && dragCode && over.code === dragCode) onChangeClass(over.code, over.classCode);
    setDragCode(null);
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragCode(null)}>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <div ref={ref} className="min-w-[760px] bg-white dark:bg-slate-900">
          <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-slate-200 text-center text-xs font-semibold dark:border-slate-800">
            <div className="py-2 text-slate-400">Tiết</div>
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2">{weekdayLabel(d)}</div>
            ))}
          </div>
          <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
            <div>
              {Array.from({ length: PERIOD_COUNT }, (_, i) => (
                <div
                  key={i}
                  className={`flex flex-col items-center justify-center border-b text-[10px] text-slate-500 ${isBoundary(i + 1) ? "border-slate-300 dark:border-slate-600" : "border-slate-100 dark:border-slate-800"}`}
                  style={{ height: ROW_H }}
                >
                  <span className="font-semibold">{i + 1}</span>
                  <span>{periodStartTime(i + 1)}</span>
                </div>
              ))}
            </div>
            {WEEKDAYS.map((d) => {
              const items = byDay.get(d) ?? [];
              const laid = assignLanes(items);
              return (
                <div key={d} className="relative border-l border-slate-100 dark:border-slate-800" style={{ height: ROW_H * PERIOD_COUNT }}>
                  {Array.from({ length: PERIOD_COUNT }, (_, i) => (
                    <div
                      key={i}
                      className={`absolute inset-x-0 border-b ${isBoundary(i + 1) ? "border-slate-300 dark:border-slate-600" : "border-slate-100 dark:border-slate-800"}`}
                      style={{ top: i * ROW_H, height: ROW_H }}
                    />
                  ))}
                  {laid.map(({ item, lane, lanes }) =>
                    item.kind === "block" ? (
                      <Block key={item.block.key} block={item.block} lane={lane} lanes={lanes} dimmed={!!dragCode && dragCode !== item.block.code} />
                    ) : (
                      <Ghost key={`g-${item.section.class_code}-${item.idx}`} item={item} lane={lane} lanes={lanes} color={colors[item.code] ?? "#0b4f9c"} />
                    ),
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DndContext>
  );
});

