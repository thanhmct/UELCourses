import { addDaysUtc, formatDateIso, mondayOfWeek } from "./occurrences";
import { parseDateOnly } from "./dates";
import { vietnameseLunarHolidays } from "./vietnameseLunar";

export interface AcademicHoliday {
  id: number;
  title: string;
  start_date: string;
  end_date: string | null;
  cohorts?: string[] | null;
  verified: boolean;
  kind: string;
}

export const HOLIDAY_THEMES = ["tet", "hungKings", "reunification", "national", "halloween", "christmas"] as const;
export type HolidayTheme = (typeof HOLIDAY_THEMES)[number];
export interface HolidayAppearance {
  theme: HolidayTheme;
  date: string;
}

const EN_HOLIDAY_TITLES: ReadonlyArray<readonly [RegExp, string]> = [
  [/Nghỉ Ngày Văn hóa Việt Nam/giu, "Vietnamese Culture Day holiday"],
  [/Nghỉ Tết (?:Âm lịch|Nguyên đán)(?: năm \d{4})?/giu, "Lunar New Year holiday"],
  [/Nghỉ Tết Dương lịch/giu, "New Year holiday"],
  [/Nghỉ Giỗ Tổ Hùng Vương/giu, "Hung Kings Commemoration holiday"],
  [/Nghỉ (?:Ngày )?Giải phóng miền Nam(?:, thống nhất đất nước)?/giu, "Reunification Day holiday"],
  [/Nghỉ (?:Ngày )?Quốc tế Lao động/giu, "International Workers' Day holiday"],
  [/Nghỉ (?:Ngày )?Quốc khánh/giu, "National Day holiday"],
  [/Đợt nghỉ theo lịch trường/giu, "School holiday"],
  [/\(không xếp lịch thi\)/giu, "(no exams scheduled)"],
];

/** Translate the controlled holiday titles returned by the academic calendar API. */
export function formatHolidayTitle(title: string, lang: "vi" | "en"): string {
  if (lang !== "en") return title;
  const translated = EN_HOLIDAY_TITLES.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    title.trim(),
  );
  return translated.replace(/^Nghỉ\s+/iu, "School holiday: ");
}

export function vietnamDate(now = new Date()): string {
  return formatDateIso(new Date(now.getTime() + 7 * 3_600_000));
}

export function overlapsHoliday(event: AcademicHoliday, from: string, to: string): boolean {
  return event.start_date <= to && (event.end_date ?? event.start_date) >= from;
}

export function verifiedHolidays(events: AcademicHoliday[], cohorts: readonly string[]): AcademicHoliday[] {
  return events.filter((event) => event.verified && event.kind === "holiday" &&
    (!event.cohorts?.length || event.cohorts.includes("all") ||
      (cohorts.length > 0 && cohorts.every((cohort) => event.cohorts?.includes(cohort)))));
}

export function noClassDates(events: AcademicHoliday[], from: string, to: string): Set<string> {
  const dates = new Set<string>();
  for (const event of events) {
    const start = parseDateOnly(event.start_date > from ? event.start_date : from);
    if (!start) continue;
    const end = event.end_date ?? event.start_date;
    for (let day = start; formatDateIso(day) <= end && formatDateIso(day) <= to; day = addDaysUtc(day, 1)) {
      dates.add(formatDateIso(day));
    }
  }
  return dates;
}

interface Festivity extends HolidayAppearance {
  earlyStart?: string;
}

function majorHoliday(theme: HolidayTheme, date: string): Festivity {
  const officialWeekStart = mondayOfWeek(parseDateOnly(date)!);
  return { theme, date, earlyStart: formatDateIso(addDaysUtc(officialWeekStart, -14)) };
}

function festivityDates(year: number): Festivity[] {
  const dates: Festivity[] = [
    majorHoliday("reunification", `${year}-04-30`),
    majorHoliday("national", `${year}-09-02`),
    { theme: "halloween", date: `${year}-10-31` },
    { theme: "christmas", date: `${year}-12-25`, earlyStart: `${year}-11-25` },
  ];
  // Vietnamese Culture Day uses the same theme as the Hung Kings commemoration.
  if (year >= 2026) dates.push({ theme: "hungKings", date: `${year}-11-24` });
  const lunar = vietnameseLunarHolidays(year);
  if (lunar?.tet) {
    dates.push(majorHoliday("hungKings", lunar.hungKings));
    const firstDay = parseDateOnly(lunar.tet)!;
    for (let offset = -1; offset <= 2; offset++) {
      const date = formatDateIso(addDaysUtc(firstDay, offset));
      dates.push(offset === 0 ? majorHoliday("tet", date) : { theme: "tet", date });
    }
  }
  return dates;
}

/** Prioritizes celebrations and their school breaks over upcoming events. */
export function holidayAppearanceFor(from: string, to: string, events: AcademicHoliday[]): HolidayAppearance | null {
  const firstYear = Number(from.slice(0, 4));
  const lastYear = Number(to.slice(0, 4));
  const dates = [...new Set([firstYear - 1, firstYear, lastYear, lastYear + 1])].flatMap(festivityDates);
  const hits = dates.filter(({ date }) => date >= from && date <= to);
  // Prefer 30/4 when its week also contains the Hung Kings commemoration.
  const celebration = hits.find(({ theme }) => theme === "reunification") ?? hits[0];
  if (celebration) return { theme: celebration.theme, date: celebration.date };
  for (const event of events) {
    if (!overlapsHoliday(event, from, to)) continue;
    const match = dates.find(({ theme, date }) => theme !== "halloween" && theme !== "christmas" &&
      date >= event.start_date && date <= (event.end_date ?? event.start_date));
    if (match) return { theme: match.theme, date: from > event.start_date ? from : event.start_date };
  }
  const upcoming = dates
    .filter(({ earlyStart, date }) => earlyStart && earlyStart <= to && date >= from)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return upcoming ? { theme: upcoming.theme, date: upcoming.date } : null;
}
