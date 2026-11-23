/**
 * Date calculations and formatting helpers for the Today (/today) view.
 * Handles "Today & Tomorrow" and "Next Week" tab schedules.
 */

export interface DayScheduleItem {
  date: Date;
  weekday: number; // 2..8 (Mon=2 .. Sun=8)
  isoDate: string; // YYYY-MM-DD
  label: string; // "Thứ hai, 23/11" or "Monday, 23/11"
  isToday: boolean;
}

const VI_WEEKDAY_NAMES: Record<number, string> = {
  2: "Thứ hai",
  3: "Thứ ba",
  4: "Thứ tư",
  5: "Thứ năm",
  6: "Thứ sáu",
  7: "Thứ bảy",
  8: "Chủ nhật",
};

const EN_WEEKDAY_NAMES: Record<number, string> = {
  2: "Monday",
  3: "Tuesday",
  4: "Wednesday",
  5: "Thursday",
  6: "Friday",
  7: "Saturday",
  8: "Sunday",
};

/** Convert JS Date getDay() (0=Sun, 1=Mon..6=Sat) to UEL weekday (2=Mon..8=Sun) */
export function getWeekdayNumber(d: Date): number {
  const jsDay = d.getDay();
  return jsDay === 0 ? 8 : jsDay + 1;
}

/** Get full weekday label in Vietnamese or English */
export function getWeekdayLabel(weekday: number, lang: "vi" | "en" = "vi"): string {
  if (lang === "en") {
    return EN_WEEKDAY_NAMES[weekday] ?? "Monday";
  }
  return VI_WEEKDAY_NAMES[weekday] ?? "Thứ hai";
}

/** Format date as DD/MM */
export function formatDayMonth(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/** Format "Thứ hai, 23/11" or "Monday, 23/11" */
export function formatDateWithWeekday(d: Date, lang: "vi" | "en" = "vi"): string {
  const w = getWeekdayNumber(d);
  const wLabel = getWeekdayLabel(w, lang);
  const dm = formatDayMonth(d);
  return `${wLabel}, ${dm}`;
}

/** YYYY-MM-DD in local time */
export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Get days for "Hôm nay & mai" tab:
 * From today to tomorrow within this week.
 * If today is Sunday (weekday=8), returns only today.
 */
export function getTodayAndTomorrowDays(now: Date = new Date(), lang: "vi" | "en" = "vi"): DayScheduleItem[] {
  const weekday = getWeekdayNumber(now);
  const todayItem: DayScheduleItem = {
    date: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    weekday,
    isoDate: isoDay(now),
    label: formatDateWithWeekday(now, lang),
    isToday: true,
  };

  if (weekday === 8) {
    // Sunday is the last day of this week: only today
    return [todayItem];
  }

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowWeekday = getWeekdayNumber(tomorrow);
  const tomorrowItem: DayScheduleItem = {
    date: tomorrow,
    weekday: tomorrowWeekday,
    isoDate: isoDay(tomorrow),
    label: formatDateWithWeekday(tomorrow, lang),
    isToday: false,
  };

  return [todayItem, tomorrowItem];
}

/**
 * Get days for "Tuần sau" tab:
 * Monday through Sunday of the next week (7 days).
 */
export function getNextWeekDays(now: Date = new Date(), lang: "vi" | "en" = "vi"): DayScheduleItem[] {
  const currentWeekday = getWeekdayNumber(now);
  // Days until next Monday: Mon(2)->7, Tue(3)->6, ..., Sun(8)->1
  const daysUntilNextMonday = 9 - currentWeekday;

  const days: DayScheduleItem[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilNextMonday + i);
    const w = getWeekdayNumber(d);
    days.push({
      date: d,
      weekday: w,
      isoDate: isoDay(d),
      label: formatDateWithWeekday(d, lang),
      isToday: false,
    });
  }
  return days;
}
