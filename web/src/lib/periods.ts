// Period helpers; the actual timetable lives in src/config/periods.ts.
import { PERIOD_MINUTES, PERIOD_START_TIMES, SESSION_BOUNDARIES } from "@/config/periods";

export { PERIOD_MINUTES, SESSION_BOUNDARIES };
export const PERIOD_COUNT = PERIOD_START_TIMES.length;
export const WEEKDAYS = [2, 3, 4, 5, 6, 7, 8] as const;

export function weekdayLabel(weekday: number, short = false): string {
  if (weekday === 8) return short ? "CN" : "Chủ nhật";
  return short ? `T${weekday}` : `Thứ ${weekday}`;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function fmt(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function startMin(period: number): number {
  const p = Math.min(Math.max(1, period), PERIOD_COUNT);
  return toMin(PERIOD_START_TIMES[p - 1]);
}

export function periodStartTime(period: number): string {
  return fmt(startMin(period));
}

export function periodEndTime(period: number): string {
  return fmt(startMin(period) + PERIOD_MINUTES);
}

export function sessionOfPeriod(period: number): "Sáng" | "Chiều" | "Tối" {
  if (period <= SESSION_BOUNDARIES.morningEnd) return "Sáng";
  if (period <= SESSION_BOUNDARIES.afternoonEnd) return "Chiều";
  return "Tối";
}

/** Map a clock time "HH:MM" to the period running at (or starting right after) that time. */
export function timeToPeriod(time: string): number | null {
  const m = /^(\d{1,2})[:hH](\d{2})?/.exec(time.trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2] ?? 0);
  for (let p = 1; p <= PERIOD_COUNT; p++) {
    const s = startMin(p);
    if (minutes < s) return p === 1 ? null : p; // in a break -> next period
    if (minutes < s + PERIOD_MINUTES) return p;
  }
  return null;
}

/**
 * Horizontal position of a clock time in period units (0 = start of period 1, 1 = start of period 2 ...).
 * Start times snap to the period they fall in; end times use the same scale, so an end inside a
 * period (e.g. "09:10") gives a fractional column ("tiết nửa") and an end in a break snaps to the previous period's end.
 */
export function timeToColumn(time: string): number | null {
  const m = /^(\d{1,2})[:hH](\d{2})?/.exec(time.trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2] ?? 0);
  for (let p = 1; p <= PERIOD_COUNT; p++) {
    const s = startMin(p);
    if (minutes < s) return p - 1;
    if (minutes <= s + PERIOD_MINUTES) return p - 1 + (minutes - s) / PERIOD_MINUTES;
  }
  return PERIOD_COUNT;
}