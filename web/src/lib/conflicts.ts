import type { ClassSection, Lesson } from "./types";
import { parseWeekList } from "./schedule";

function datesOverlap(a: ClassSection, b: ClassSection): boolean {
  if (!a.start_date || !a.end_date || !b.start_date || !b.end_date) return true;
  const as = Date.parse(a.start_date);
  const ae = Date.parse(a.end_date);
  const bs = Date.parse(b.start_date);
  const be = Date.parse(b.end_date);
  if ([as, ae, bs, be].some(Number.isNaN)) return true;
  return as <= be && bs <= ae;
}

function weeksOverlap(a?: string, b?: string): boolean {
  const wa = parseWeekList(a);
  const wb = parseWeekList(b);
  if (!wa || !wb) return true;
  for (const w of wa) if (wb.has(w)) return true;
  return false;
}

export function lessonsOverlap(a: Lesson, b: Lesson): boolean {
  if (a.weekday !== b.weekday) return false;
  if (a.end_period < b.start_period || b.end_period < a.start_period) return false;
  return weeksOverlap(a.weeks, b.weeks);
}

export function sectionsConflict(a: ClassSection, b: ClassSection): boolean {
  if (a.module_code === b.module_code && a.class_code === b.class_code) return false;
  if (!datesOverlap(a, b)) return false;
  return a.lessons.some((la) => b.lessons.some((lb) => lessonsOverlap(la, lb)));
}

export interface Conflict {
  a: { module_code: string; class_code: string; lessonIndex: number };
  b: { module_code: string; class_code: string; lessonIndex: number };
}

/** All pairwise lesson conflicts among selected sections. */
export function findConflicts(sections: ClassSection[]): Conflict[] {
  const out: Conflict[] = [];
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const A = sections[i];
      const B = sections[j];
      if (!datesOverlap(A, B)) continue;
      A.lessons.forEach((la, ia) =>
        B.lessons.forEach((lb, ib) => {
          if (lessonsOverlap(la, lb)) {
            out.push({
              a: { module_code: A.module_code, class_code: A.class_code, lessonIndex: ia },
              b: { module_code: B.module_code, class_code: B.class_code, lessonIndex: ib },
            });
          }
        }),
      );
    }
  }
  return out;
}

/**
 * Quy định phòng đào tạo: không được có hai lớp học cạnh nhau qua ranh giới
 * sáng | chiều (tiết 6 | 7) và chiều | tối (tiết 12 | 13).
 */
export const ADJACENCY_BOUNDARIES: [number, number][] = [
  [6, 7],
  [12, 13],
];

export function lessonsAdjacent(a: Lesson, b: Lesson): boolean {
  if (a.weekday !== b.weekday) return false;
  const adjacent = ADJACENCY_BOUNDARIES.some(
    ([x, y]) => (a.end_period === x && b.start_period === y) || (b.end_period === x && a.start_period === y),
  );
  return adjacent && weeksOverlap(a.weeks, b.weeks);
}

/** Các cặp lớp vi phạm quy định liền kề (cùng ngày, cùng tuần, cùng thời gian hiệu lực). */
export function adjacencyViolations(sections: ClassSection[]): Conflict[] {
  const out: Conflict[] = [];
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const A = sections[i];
      const B = sections[j];
      if (A.module_code === B.module_code && A.class_code === B.class_code) continue;
      if (!datesOverlap(A, B)) continue;
      A.lessons.forEach((la, ia) =>
        B.lessons.forEach((lb, ib) => {
          if (lessonsAdjacent(la, lb)) {
            out.push({
              a: { module_code: A.module_code, class_code: A.class_code, lessonIndex: ia },
              b: { module_code: B.module_code, class_code: B.class_code, lessonIndex: ib },
            });
          }
        }),
      );
    }
  }
  return out;
}

/** Set of keys "MODULE#lessonIndex" that are in conflict (trùng lịch hoặc vi phạm liền kề), for highlighting. */
export function conflictKeys(sections: ClassSection[]): Set<string> {
  const keys = new Set<string>();
  for (const c of [...findConflicts(sections), ...adjacencyViolations(sections)]) {
    keys.add(`${c.a.module_code}#${c.a.lessonIndex}`);
    keys.add(`${c.b.module_code}#${c.b.lessonIndex}`);
  }
  return keys;
}

/** Assign side-by-side lanes to overlapping blocks within one day column. */
export function assignLanes<T extends { start_period: number; end_period: number }>(
  items: T[],
): { item: T; lane: number; lanes: number }[] {
  const sorted = [...items].sort(
    (x, y) => x.start_period - y.start_period || y.end_period - x.end_period,
  );
  const result: { item: T; lane: number; lanes: number }[] = [];
  let cluster: { item: T; lane: number; lanes: number }[] = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];
  const flush = () => {
    const n = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = n));
    result.push(...cluster);
    cluster = [];
    laneEnds.length = 0;
  };
  for (const item of sorted) {
    if (item.start_period > clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((end) => end < item.start_period);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end_period);
    } else laneEnds[lane] = item.end_period;
    cluster.push({ item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, item.end_period);
  }
  if (cluster.length) flush();
  return result;
}
