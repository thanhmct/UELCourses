import type { Lesson } from "./types";
import { periodEndTime, periodStartTime, weekdayLabel } from "./periods";

/** A recurring weekday is not a calendar date. Preserve date ranges separately. */
export function lessonLabel(lesson: Lesson): string {
  return `${weekdayLabel(lesson.weekday)} · Tiết ${lesson.start_period}–${lesson.end_period} · ${lesson.start_time || periodStartTime(lesson.start_period)}–${lesson.end_time || periodEndTime(lesson.end_period)}${lesson.room ? ` · Phòng ${lesson.room}` : " · Chưa có phòng"}`;
}
