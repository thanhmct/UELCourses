import type { ClassSection, Lesson } from "./types";
import { parseDateOnly } from "./dates";
import { parseWeekList } from "./schedule";
import { PERIOD_MINUTES } from "@/config/periods";
import { periodEndTime, periodStartTime } from "./periods";

export interface ClassOccurrence {
  /** ISO date "YYYY-MM-DD" */
  date: string;
  class_code: string;
  module_code: string;
  /** "HH:MM" start clock time */
  start: string;
  /** "HH:MM" end clock time */
  end: string;
  room?: string;
  /** 1-based start period */
  start_period: number;
  /** 1-based end period */
  end_period: number;
  /** 2=Mon ... 8=Sun */
  weekday: number;
  /** Duration in hours */
  durationHours: number;
  /** Original lesson reference */
  lesson: Lesson;
  /** Original class section reference */
  section: ClassSection;
}

export interface OccurrenceOptions {
  fallbackStart?: string;
  fallbackEnd?: string;
  semesterStart?: string;
  semesterEnd?: string;
  noClassDates?: ReadonlySet<string>;
  now?: Date;
}

export interface WeekWorkload {
  weekNumber: number;
  startIso: string;
  endIso: string;
  label: string;
  totalHours: number;
  occurrences: ClassOccurrence[];
  isCurrent: boolean;
}

export interface WorkloadStats {
  currentWeekHours: number;
  maxWeekHours: number;
  avgWeekHours: number;
  totalHours: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDateIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addDaysUtc(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** 2 = Mon ... 8 = Sun */
export function getUelWeekday(d: Date): number {
  const jsDay = d.getUTCDay();
  return jsDay === 0 ? 8 : jsDay + 1;
}

/** Find Monday of the week containing d */
export function mondayOfWeek(d: Date): Date {
  const jsDay = d.getUTCDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  return addDaysUtc(d, diff);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Return start time, end time, and actual duration in hours.
 * Uses explicit lesson times if available, otherwise falls back to UEL period schedule.
 */
export function getLessonTimes(l: Lesson): { start: string; end: string; durationHours: number } {
  let start = l.start_time;
  let end = l.end_time;

  if (!start || !/^\d{1,2}:\d{2}$/.test(start)) {
    start = periodStartTime(l.start_period);
  }
  if (!end || !/^\d{1,2}:\d{2}$/.test(end)) {
    end = periodEndTime(l.end_period);
  }

  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  let durationHours = 0;
  if (endMin > startMin) {
    durationHours = Math.round(((endMin - startMin) / 60) * 100) / 100;
  } else {
    const periods = Math.max(1, l.end_period - l.start_period + 1);
    durationHours = Math.round(periods * (PERIOD_MINUTES / 60) * 100) / 100;
  }

  return { start, end, durationHours };
}

/**
 * Expands a single lesson into actual calendar session occurrences.
 */
export function expandLessonOccurrences(
  section: ClassSection,
  lesson: Lesson,
  opts: OccurrenceOptions = {},
): ClassOccurrence[] {
  const { start, end, durationHours } = getLessonTimes(lesson);
  const out: ClassOccurrence[] = [];

  const secStart = parseDateOnly(section.start_date) ?? parseDateOnly(opts.fallbackStart);
  const secEnd = parseDateOnly(section.end_date) ?? parseDateOnly(opts.fallbackEnd);

  // Case 1: Lesson has explicit date_start
  if (lesson.date_start) {
    const lStart = parseDateOnly(lesson.date_start);
    if (!lStart) return out;
    const lEnd = parseDateOnly(lesson.date_end) ?? lStart;

    // Single-day session (e.g. thi / kiểm tra 1 ngày)
    if (lesson.date_start === lesson.date_end || lStart.getTime() === lEnd.getTime()) {
      if (secStart && lStart.getTime() < secStart.getTime()) return out;
      if (secEnd && lStart.getTime() > secEnd.getTime()) return out;

      out.push({
        date: formatDateIso(lStart),
        class_code: section.class_code,
        module_code: section.module_code,
        start,
        end,
        room: lesson.room,
        start_period: lesson.start_period,
        end_period: lesson.end_period,
        weekday: lesson.weekday,
        durationHours,
        lesson,
        section,
      });
      return out;
    }

    // Range [date_start, date_end]
    const fromTime = secStart ? Math.max(lStart.getTime(), secStart.getTime()) : lStart.getTime();
    const toTime = secEnd ? Math.min(lEnd.getTime(), secEnd.getTime()) : lEnd.getTime();
    if (fromTime > toTime) return out;

    const fromDate = new Date(fromTime);
    const toDate = new Date(toTime);
    const parsedWeeks = parseWeekList(lesson.weeks);
    const baseMon = secStart ? mondayOfWeek(secStart) : mondayOfWeek(lStart);

    for (let cur = fromDate; cur.getTime() <= toDate.getTime(); cur = addDaysUtc(cur, 1)) {
      if (getUelWeekday(cur) !== lesson.weekday) continue;

      if (parsedWeeks) {
        const weekNum = Math.floor((cur.getTime() - baseMon.getTime()) / (7 * 86_400_000)) + 1;
        if (!parsedWeeks.has(weekNum)) continue;
      }

      out.push({
        date: formatDateIso(cur),
        class_code: section.class_code,
        module_code: section.module_code,
        start,
        end,
        room: lesson.room,
        start_period: lesson.start_period,
        end_period: lesson.end_period,
        weekday: lesson.weekday,
        durationHours,
        lesson,
        section,
      });
    }
    return out;
  }

  // Case 2: Lesson has no date_start, derive from section/semester start and weeks
  if (secStart) {
    const baseMon = mondayOfWeek(secStart);
    const parsedWeeks = parseWeekList(lesson.weeks);

    if (parsedWeeks) {
      const sortedWeeks = [...parsedWeeks].sort((a, b) => a - b);
      for (const w of sortedWeeks) {
        const dayOffset = lesson.weekday === 8 ? 6 : lesson.weekday - 2;
        const cur = addDaysUtc(baseMon, (w - 1) * 7 + dayOffset);
        if (secEnd && cur.getTime() > secEnd.getTime()) continue;

        out.push({
          date: formatDateIso(cur),
          class_code: section.class_code,
          module_code: section.module_code,
          start,
          end,
          room: lesson.room,
          start_period: lesson.start_period,
          end_period: lesson.end_period,
          weekday: lesson.weekday,
          durationHours,
          lesson,
          section,
        });
      }
      return out;
    }

    // No weeks specified: repeat on matching weekday across entire [secStart, secEnd]
    if (secEnd) {
      for (let cur = secStart; cur.getTime() <= secEnd.getTime(); cur = addDaysUtc(cur, 1)) {
        if (getUelWeekday(cur) !== lesson.weekday) continue;
        out.push({
          date: formatDateIso(cur),
          class_code: section.class_code,
          module_code: section.module_code,
          start,
          end,
          room: lesson.room,
          start_period: lesson.start_period,
          end_period: lesson.end_period,
          weekday: lesson.weekday,
          durationHours,
          lesson,
          section,
        });
      }
    }
  }

  return out;
}

/**
 * A lesson that happens on exactly one calendar day (dạy bù / thi / đổi lịch).
 * `date_end` missing is treated as the same day as `date_start`, matching
 * `expandLessonOccurrences`.
 */
export function isOneDayLesson(l: Lesson): boolean {
  const start = parseDateOnly(l.date_start);
  if (!start) return false;
  const end = parseDateOnly(l.date_end) ?? start;
  return start.getTime() === end.getTime();
}

/**
 * A single-day session replaces the recurring schedule of the same class
 * within that Monday–Sunday week.
 */
export function applyOneDayOverrides(occurrences: ClassOccurrence[]): ClassOccurrence[] {
  const weekKey = (o: ClassOccurrence) => {
    const weekStart = mondayOfWeek(new Date(`${o.date}T00:00:00Z`));
    return `${o.module_code}\u0000${o.class_code}\u0000${formatDateIso(weekStart)}`;
  };
  const overridden = new Set<string>();
  for (const o of occurrences) {
    if (isOneDayLesson(o.lesson)) overridden.add(weekKey(o));
  }
  const base =
    overridden.size === 0
      ? occurrences
      : occurrences.filter((o) => isOneDayLesson(o.lesson) || !overridden.has(weekKey(o)));
  return collapseOverlappingSameDay(base);
}

/** Lower = more specific: a one-day lesson, then a shorter date range, beats the regular weekly one. */
function specificity(o: ClassOccurrence): number {
  const s = parseDateOnly(o.lesson.date_start);
  if (!s) return Number.MAX_SAFE_INTEGER;
  const e = parseDateOnly(o.lesson.date_end) ?? s;
  return Math.round((e.getTime() - s.getTime()) / 86_400_000);
}

/**
 * Same class, same date, overlapping times → the more specific lesson (one day, else the shorter
 * date range) replaces the regular weekly one on that day, like a one-day override. Equal
 * specificity (the school listing the same session twice with different end times) → the longer wins.
 */
function collapseOverlappingSameDay(occurrences: ClassOccurrence[]): ClassOccurrence[] {
  const groups = new Map<string, ClassOccurrence[]>();
  for (const o of occurrences) {
    const key = `${o.module_code}\u0000${o.class_code}\u0000${o.date}`;
    const list = groups.get(key);
    if (list) list.push(o);
    else groups.set(key, [o]);
  }
  const drop = new Set<ClassOccurrence>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const kept: ClassOccurrence[] = [];
    for (const o of [...list].sort((a, b) => specificity(a) - specificity(b) || b.durationHours - a.durationHours)) {
      const overlaps = kept.some(
        (k) => toMinutes(o.start) < toMinutes(k.end) && toMinutes(k.start) < toMinutes(o.end),
      );
      if (overlaps) drop.add(o);
      else kept.push(o);
    }
  }
  return drop.size === 0 ? occurrences : occurrences.filter((o) => !drop.has(o));
}

/**
 * Return all concrete occurrences for a ClassSection.
 */
export function getSectionOccurrences(
  section: ClassSection,
  opts: OccurrenceOptions = {},
): ClassOccurrence[] {
  const out: ClassOccurrence[] = [];
  for (const lesson of section.lessons) {
    out.push(...expandLessonOccurrences(section, lesson, opts));
  }
  const schedule = applyOneDayOverrides(out);
  const scheduled = opts.noClassDates?.size ? schedule.filter(({ date }) => !opts.noClassDates?.has(date)) : schedule;
  return scheduled.sort(
    (a, b) => a.date.localeCompare(b.date) || a.start_period - b.start_period,
  );
}

/**
 * Return all concrete occurrences across all selected ClassSections, sorted chronologically.
 */
export function getTimetableOccurrences(
  sections: ClassSection[],
  opts: OccurrenceOptions = {},
): ClassOccurrence[] {
  const out: ClassOccurrence[] = [];
  for (const s of sections) {
    out.push(...getSectionOccurrences(s, opts));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start_period - b.start_period);
}

/**
 * Group occurrences by ISO date ("YYYY-MM-DD").
 */
export function getOccurrencesByDate(
  occurrences: ClassOccurrence[],
): Map<string, ClassOccurrence[]> {
  const map = new Map<string, ClassOccurrence[]>();
  for (const occ of occurrences) {
    const list = map.get(occ.date);
    if (list) {
      list.push(occ);
    } else {
      map.set(occ.date, [occ]);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.start_period - b.start_period);
  }
  return map;
}

/**
 * Calculate total real hours for a module's selected section.
 * Sums actual session lengths without multiplying hypothetical weeks.
 */
export function getModuleTotalHours(
  section?: ClassSection | null,
  opts: OccurrenceOptions = {},
): number {
  if (!section || !section.lessons.length) return 0;
  const occs = getSectionOccurrences(section, opts);
  const total = occs.reduce((sum, o) => sum + o.durationHours, 0);
  return Math.round(total * 10) / 10;
}

/**
 * Groups occurrences into calendar weeks (Monday to Sunday) across the semester.
 */
export function getOccurrencesByWeek(
  occurrences: ClassOccurrence[],
  opts: OccurrenceOptions = {},
): WeekWorkload[] {
  if (occurrences.length === 0 && !opts.semesterStart) return [];

  let minDate = parseDateOnly(opts.semesterStart);
  let maxDate = parseDateOnly(opts.semesterEnd);

  if (!minDate && occurrences.length > 0) {
    minDate = parseDateOnly(occurrences[0].date);
  }
  if (!maxDate && occurrences.length > 0) {
    maxDate = parseDateOnly(occurrences[occurrences.length - 1].date);
  }

  if (!minDate || !maxDate) return [];

  // Align to Monday of first week and Sunday of last week
  let curMon = mondayOfWeek(minDate);
  const endSun = addDaysUtc(mondayOfWeek(maxDate), 6);

  const today = opts.now ?? new Date();
  const todayIso = formatDateIso(
    new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())),
  );

  const byDate = getOccurrencesByDate(occurrences);
  const weeks: WeekWorkload[] = [];
  let weekIndex = 1;

  while (curMon.getTime() <= endSun.getTime()) {
    const startIso = formatDateIso(curMon);
    const endSunDate = addDaysUtc(curMon, 6);
    const endIso = formatDateIso(endSunDate);

    const weekOccs: ClassOccurrence[] = [];
    for (let d = curMon; d.getTime() <= endSunDate.getTime(); d = addDaysUtc(d, 1)) {
      const iso = formatDateIso(d);
      const list = byDate.get(iso);
      if (list) weekOccs.push(...list);
    }

    const totalHours =
      Math.round(weekOccs.reduce((sum, o) => sum + o.durationHours, 0) * 10) / 10;
    const isCurrent = todayIso >= startIso && todayIso <= endIso;

    const startShort = `${startIso.slice(8, 10)}/${startIso.slice(5, 7)}`;
    const endShort = `${endIso.slice(8, 10)}/${endIso.slice(5, 7)}`;

    weeks.push({
      weekNumber: weekIndex,
      startIso,
      endIso,
      label: `Tuần ${weekIndex} (${startShort} – ${endShort})`,
      totalHours,
      occurrences: weekOccs,
      isCurrent,
    });

    curMon = addDaysUtc(curMon, 7);
    weekIndex++;
  }

  return weeks;
}

/**
 * Summary stats for weekly workloads across the semester.
 */
export function getWorkloadStats(weeks: WeekWorkload[]): WorkloadStats {
  if (weeks.length === 0) {
    return { currentWeekHours: 0, maxWeekHours: 0, avgWeekHours: 0, totalHours: 0 };
  }

  const totalHours = Math.round(weeks.reduce((sum, w) => sum + w.totalHours, 0) * 10) / 10;
  const maxWeekHours = Math.max(...weeks.map((w) => w.totalHours));

  const activeWeeks = weeks.filter((w) => w.totalHours > 0);
  const avgWeekHours =
    activeWeeks.length > 0
      ? Math.round((activeWeeks.reduce((sum, w) => sum + w.totalHours, 0) / activeWeeks.length) * 10) /
        10
      : 0;

  const current = weeks.find((w) => w.isCurrent) ?? weeks[0];
  const currentWeekHours = current ? current.totalHours : 0;

  return {
    currentWeekHours,
    maxWeekHours,
    avgWeekHours,
    totalHours,
  };
}

/**
 * Filter occurrences that fall into the week of the given Monday.
 */
export function getOccurrencesForWeek(
  occurrences: ClassOccurrence[],
  weekMondayIso: string,
): ClassOccurrence[] {
  const mon = parseDateOnly(weekMondayIso);
  if (!mon) return [];
  const startIso = formatDateIso(mon);
  const endIso = formatDateIso(addDaysUtc(mon, 6));
  return occurrences.filter((o) => o.date >= startIso && o.date <= endIso);
}
