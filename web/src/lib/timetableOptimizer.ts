import { adjacencyViolations, findConflicts, hasLessonDates, periodViolation } from "./conflicts";
import { getLessonTimes, getSectionOccurrences, getUelWeekday } from "./occurrences";
import type { ClassSection, Lesson } from "./types";

const BEAM_WIDTH = 64;
const LUNCH_MINUTES = 60;
const CHANGEOVER_MINUTES = 15;

export interface OptimizationCourse {
  code: string;
  currentClass: string | null;
  sections: ClassSection[];
  pinned: boolean;
}

export interface OptimizationPreferences {
  freeDays: number[];
  earliest: number;
  latest: number;
  maxConsecutive: number;
  lunchStart: number;
  lunchEnd: number;
}

export interface OptimizationInput {
  courses: OptimizationCourse[];
  preferences: OptimizationPreferences;
  semesterStart?: string;
  semesterEnd?: string;
  noClassDates?: ReadonlySet<string>;
}

export type OptimizationResult =
  | { status: "success"; classes: Record<string, string>; meetsPreferences: true }
  | { status: "success"; classes: Record<string, string>; meetsPreferences: false; relaxed: PreferenceDeviation }
  | { status: "unavailable" | "restricted"; code: string }
  | { status: "no-match" };

type PreferenceDeviation =
  | { kind: "freeDay"; weekday: number; minutes: number }
  | { kind: "earliest" | "latest" | "lunch" | "maxHours"; minutes: number };

interface Session extends Pick<Lesson, "start_period" | "end_period"> {
  weekday: number;
  start: number;
  end: number;
}

interface Candidate {
  section: ClassSection;
  days: Map<string, Session[]>;
  undated: Set<number>;
  changed: boolean;
}

interface State {
  chosen: Candidate[];
  days: Map<string, Session[]>;
  relaxed: PreferenceDeviation | null;
  changes: number;
}

export function clockMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function candidateDays(section: ClassSection, semesterStart?: string, semesterEnd?: string, noClassDates?: ReadonlySet<string>) {
  const days = new Map<string, Session[]>();
  const undated = new Set<number>();
  const add = (date: string, session: Session) => {
    const sessions = days.get(date) ?? [];
    sessions.push(session);
    days.set(date, sessions);
  };
  for (const occurrence of getSectionOccurrences(section, { fallbackStart: semesterStart, fallbackEnd: semesterEnd, noClassDates })) {
    add(occurrence.date, {
      start_period: occurrence.start_period,
      end_period: occurrence.end_period,
      weekday: getUelWeekday(new Date(`${occurrence.date}T00:00:00Z`)),
      start: clockMinutes(occurrence.start),
      end: clockMinutes(occurrence.end),
    });
  }
  section.lessons.forEach((lesson, index) => {
    if (hasLessonDates(section, lesson, semesterStart, semesterEnd)) return;
    undated.add(index);
    const { start, end } = getLessonTimes(lesson);
    add(`weekly-${lesson.weekday}`, {
      start_period: lesson.start_period,
      end_period: lesson.end_period,
      weekday: lesson.weekday,
      start: clockMinutes(start),
      end: clockMinutes(end),
    });
  });
  return { days, undated };
}

function incompatible(a: Candidate, b: Candidate): boolean {
  for (const [date, sessions] of a.days) {
    if (date.startsWith("weekly-")) continue;
    const other = b.days.get(date);
    if (other?.some((second) => sessions.some((first) => periodViolation(first, second) ||
      (first.start < second.end && second.start < first.end)))) return true;
  }
  if (a.undated.size === 0 && b.undated.size === 0) return false;

  const pair = [a.section, b.section];
  return [...findConflicts(pair), ...adjacencyViolations(pair)].some((conflict) =>
    a.undated.has(conflict.a.lessonIndex) || b.undated.has(conflict.b.lessonIndex));
}

function dayDeviations(sessions: Session[], preferences: OptimizationPreferences): PreferenceDeviation[] {
  const ordered = [...sessions].sort((a, b) => a.start - b.start);
  let blockStart = ordered[0].start;
  let blockEnd = blockStart;
  let excess = 0;
  let lunchCursor = preferences.lunchStart;
  let lunchBreak = 0;

  for (const { start, end } of ordered) {
    if (start - blockEnd > CHANGEOVER_MINUTES) {
      excess += Math.max(0, blockEnd - blockStart - preferences.maxConsecutive);
      blockStart = start;
    }
    blockEnd = Math.max(blockEnd, end);

    if (end > preferences.lunchStart && start < preferences.lunchEnd) {
      lunchBreak = Math.max(lunchBreak, start - lunchCursor);
      lunchCursor = Math.max(lunchCursor, end);
    }
  }

  excess += Math.max(0, blockEnd - blockStart - preferences.maxConsecutive);
  lunchBreak = Math.max(lunchBreak, preferences.lunchEnd - lunchCursor);
  const deviations: PreferenceDeviation[] = [
    { kind: "earliest", minutes: preferences.earliest - ordered[0].start },
    { kind: "latest", minutes: blockEnd - preferences.latest },
    { kind: "lunch", minutes: LUNCH_MINUTES - lunchBreak },
    { kind: "maxHours", minutes: excess },
  ];
  const weekday = ordered[0].weekday;
  if (preferences.freeDays.includes(weekday)) {
    deviations.push({ kind: "freeDay", weekday, minutes: ordered.reduce((total, { start, end }) => total + end - start, 0) });
  }
  return deviations.filter(({ minutes }) => minutes > 0);
}

function deviationKey(deviation: PreferenceDeviation | null): string {
  if (deviation?.kind === "freeDay") return `freeDay:${deviation.weekday}`;
  return deviation?.kind ?? "none";
}

function rank(a: Pick<State, "relaxed" | "changes">, b: Pick<State, "relaxed" | "changes">): number {
  return (a.relaxed?.minutes ?? 0) - (b.relaxed?.minutes ?? 0) || a.changes - b.changes;
}

function search(groups: Candidate[][], preferences: OptimizationPreferences, allowRelaxation: boolean): State | undefined {
  let beam: State[] = [{ chosen: [], days: new Map(), relaxed: null, changes: 0 }];

  for (const group of groups) {
    const next: (Pick<State, "relaxed" | "changes"> & { candidate: Candidate; parent: State })[] = [];
    for (const candidate of group) {
      const byPrevious = new Map<Candidate, boolean>();
      parents: for (const parent of beam) {
        if (parent.chosen.some((previous) => {
          let clashes = byPrevious.get(previous);
          if (clashes === undefined) {
            clashes = incompatible(previous, candidate);
            byPrevious.set(previous, clashes);
          }
          return clashes;
        })) continue;

        let relaxed = parent.relaxed;
        for (const [date, sessions] of candidate.days) {
          const earlier = parent.days.get(date) ?? [];
          for (const deviation of dayDeviations([...earlier, ...sessions], preferences)) {
            if (!allowRelaxation || (relaxed && deviationKey(relaxed) !== deviationKey(deviation))) continue parents;
            if (!relaxed || deviation.minutes > relaxed.minutes) relaxed = deviation;
          }
        }
        next.push({ candidate, parent, relaxed, changes: parent.changes + Number(candidate.changed) });
      }
    }
    if (!next.length) return undefined;
    next.sort(rank);
    // Keep alternatives for each preference so a cheaper relaxation cannot crowd out a compatible one.
    const countByCondition = new Map<string, number>();
    beam = [];
    for (const { candidate, parent, relaxed, changes } of next) {
      const key = deviationKey(relaxed);
      const count = countByCondition.get(key) ?? 0;
      if (count >= BEAM_WIDTH) continue;
      countByCondition.set(key, count + 1);
      const days = new Map(parent.days);
      for (const [date, sessions] of candidate.days) days.set(date, [...(days.get(date) ?? []), ...sessions]);
      beam.push({ chosen: [...parent.chosen, candidate], days, relaxed, changes });
    }
  }
  return beam[0];
}

/** Search for one whole UEL class section per course. All meetings of a section move together. */
export function optimizeTimetable({ courses, preferences, semesterStart, semesterEnd, noClassDates }: OptimizationInput): OptimizationResult {
  if (!courses.length) return { status: "no-match" };
  const groups: Candidate[][] = [];
  for (const course of courses) {
    const scheduled = course.sections.filter((section) => section.lessons.length);
    if (!scheduled.length) return { status: "unavailable", code: course.code };

    const options: Candidate[] = [];
    for (const section of scheduled) {
      const changed = section.class_code !== course.currentClass;
      if (course.pinned && changed) continue;
      const { days, undated } = candidateDays(section, semesterStart, semesterEnd, noClassDates);
      if (days.size) options.push({ section, days, undated, changed });
    }
    if (!options.length) return { status: "restricted", code: course.code };
    groups.push(options);
  }
  groups.sort((a, b) => a.length - b.length);

  const best = search(groups, preferences, false) ?? search(groups, preferences, true);
  if (!best) return { status: "no-match" };
  const classes = Object.fromEntries(best.chosen.map(({ section }) => [section.module_code, section.class_code]));
  return best.relaxed
    ? { status: "success", classes, meetsPreferences: false, relaxed: best.relaxed }
    : { status: "success", classes, meetsPreferences: true };
}
