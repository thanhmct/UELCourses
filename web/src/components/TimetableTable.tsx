"use client";
import { forwardRef } from "react";
import type { GridBlock, GridClosure } from "@/components/TimetableGrid";
import { fullDate, lessonDates } from "@/components/TimetableGrid";
import { getLessonTimes } from "@/lib/occurrences";
import { WEEKDAYS } from "@/lib/periods";
import { useT, weekdayName } from "@/i18n";
import { normalizeHex, readableText } from "@/lib/appearance";

interface Props {
  blocks: GridBlock[];
  closures?: ReadonlyMap<number, GridClosure>;
  showNames?: boolean;
}

/**
 * Cột đầu (nhãn phòng) rộng cố định; các cột ngày không khai độ rộng nên với table-layout: fixed,
 * trình duyệt tự chia đều phần còn lại cho chúng (CSS2.1 §17.5.2.1) — bảng luôn lấp đầy khung chứa
 * trên máy tính mà không cần đo đạc bằng JS. min-width của khung bọc chỉ đảm bảo không co hẹp hơn
 * mức đọc được; hẹp hơn thế thì cuộn ngang như trên điện thoại.
 */
const ROOM_COL_W = 84;
const MIN_DAY_COL_W = 112;

/** One row per room, alphabetically. Lessons without an assigned room have nowhere to go in this view. */
function roomsOf(blocks: GridBlock[]): string[] {
  const rooms = new Set<string>();
  for (const b of blocks) if (b.lesson.room) rooms.add(b.lesson.room);
  return [...rooms].sort((a, b) => a.localeCompare(b));
}

/** Alternate timetable view: one row per room, one column per weekday/date (vs. the period grid). */
export const TimetableTable = forwardRef<HTMLDivElement, Props>(function TimetableTable(
  { blocks, closures, showNames = true },
  ref,
) {
  const { t } = useT();
  const roomBlocks = blocks.filter((b) => !!b.lesson.room);
  const rooms = roomsOf(roomBlocks);
  const days = WEEKDAYS.filter((d) => d !== 8 || closures?.has(8) || roomBlocks.some((b) => b.lesson.weekday === d));
  // Khi đang xem một tuần cụ thể, mọi khối cùng thứ đều mang ngày thật (occDate) của tuần đó.
  const dateOf = (d: number) => fullDate(blocks.find((b) => b.lesson.weekday === d && b.occDate)?.occDate);
  const minWidth = ROOM_COL_W + days.length * MIN_DAY_COL_W;

  return (
    <div
      className="w-full min-w-0 max-w-full overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800"
      role="region"
      aria-label={t("tt.tableAria")}
      tabIndex={0}
    >
      <div ref={ref} className="w-full bg-white dark:bg-slate-900" style={{ minWidth }}>
        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr>
              <th
                scope="col"
                style={{ width: ROOM_COL_W }}
                className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200"
              >
                {t("tt.tableRoomHeader")}
              </th>
              {days.map((d) => {
                const date = dateOf(d);
                return (
                  <th
                    key={d}
                    scope="col"
                    className="border-b border-l border-slate-200 bg-slate-50 px-2 py-1.5 text-center font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200"
                  >
                    <div className="truncate">{weekdayName(t, d, true)}</div>
                    {date && <div className="truncate text-[10px] font-normal tabular-nums text-slate-500 dark:text-slate-400">{date}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                <th
                  scope="row"
                  style={{ width: ROOM_COL_W }}
                  className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200"
                >
                  <div className="truncate">{room}</div>
                </th>
                {days.map((d) => {
                  const closure = closures?.get(d);
                  if (closure) {
                    return (
                      <td key={d} title={[...closure.titles].join(" / ")}
                        className="border-l border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                        <div className="truncate">{[...closure.titles].join(" / ")}</div>
                      </td>
                    );
                  }
                  const cellBlocks = roomBlocks.filter((b) => b.lesson.room === room && b.lesson.weekday === d);
                  return (
                    <td key={d} className="align-top border-l border-slate-100 px-2 py-1.5 dark:border-slate-800">
                      <div className="space-y-1">
                        {cellBlocks.map((block) => {
                          const { start, end } = getLessonTimes(block.lesson);
                          const date = block.occDate ? fullDate(block.occDate) : lessonDates(block.lesson).text;
                          const ink = readableText(normalizeHex(block.color) ?? "#144E8C");
                          return (
                            <div
                              key={block.key}
                              className={`rounded px-1 py-0.5 ${block.conflict ? "border border-rose-400 bg-rose-50 text-rose-950 dark:border-rose-600 dark:bg-rose-950 dark:text-rose-100" : ""}`}
                              style={block.conflict ? undefined : { backgroundColor: block.color, color: ink }}
                            >
                              <div className="truncate font-bold">
                                {block.code}
                                {showNames && <span className="ml-1 font-normal">{block.name}</span>}
                              </div>
                              <div className="font-medium tabular-nums">{start}–{end}</div>
                              {date && <div className="truncate text-[10px] opacity-80">{date}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
