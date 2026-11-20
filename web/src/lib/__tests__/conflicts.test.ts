import { describe, expect, it } from "vitest";
import { assignLanes, conflictKeys, findConflicts, lessonsOverlap, sectionsConflict } from "../conflicts";
import type { ClassSection, Lesson } from "../types";

const L = (weekday: number, s: number, e: number, weeks?: string): Lesson => ({
  weekday, start_period: s, end_period: e, start_time: "", end_time: "", ...(weeks ? { weeks } : {}),
});
const S = (module_code: string, class_code: string, lessons: Lesson[], extra: Partial<ClassSection> = {}): ClassSection => ({
  module_code, class_code, lessons, ...extra,
});

describe("lessonsOverlap", () => {
  it("detects overlapping periods on the same day", () => {
    expect(lessonsOverlap(L(2, 1, 3), L(2, 3, 5))).toBe(true);
    expect(lessonsOverlap(L(2, 1, 3), L(2, 4, 5))).toBe(false);
    expect(lessonsOverlap(L(2, 1, 3), L(3, 1, 3))).toBe(false);
  });
  it("respects disjoint week lists", () => {
    expect(lessonsOverlap(L(2, 1, 3, "1-3"), L(2, 1, 3, "4-12"))).toBe(false);
    expect(lessonsOverlap(L(2, 1, 3, "1-5"), L(2, 1, 3, "4-12"))).toBe(true);
    expect(lessonsOverlap(L(2, 1, 3), L(2, 1, 3, "4-12"))).toBe(true);
  });
});

describe("sections", () => {
  const a = S("KTE1001", "261KTE100101", [L(2, 1, 3), L(4, 7, 9)]);
  const b = S("EIE3004", "261EIE300401", [L(4, 8, 10)]);
  const c = S("MI71", "261MI7101", [L(6, 1, 2)]);
  it("finds conflicts between sections", () => {
    expect(sectionsConflict(a, b)).toBe(true);
    expect(sectionsConflict(a, c)).toBe(false);
    const cs = findConflicts([a, b, c]);
    expect(cs).toHaveLength(1);
    expect(cs[0].a).toMatchObject({ module_code: "KTE1001", lessonIndex: 1 });
    expect([...conflictKeys([a, b, c])].sort()).toEqual(["EIE3004#0", "KTE1001#1"]);
  });
  it("ignores sections whose date ranges do not overlap", () => {
    const x = S("A1", "x", [L(2, 1, 3)], { start_date: "2026-01-01", end_date: "2026-02-01" });
    const y = S("B1", "y", [L(2, 1, 3)], { start_date: "2026-03-01", end_date: "2026-05-01" });
    expect(sectionsConflict(x, y)).toBe(false);
  });
});

describe("assignLanes", () => {
  it("places overlapping items side by side", () => {
    const r = assignLanes([
      { id: 1, start_period: 1, end_period: 3 },
      { id: 2, start_period: 2, end_period: 4 },
      { id: 3, start_period: 7, end_period: 8 },
    ]);
    const byId = Object.fromEntries(r.map((x) => [x.item.id, x]));
    expect(byId[1].lanes).toBe(2);
    expect(byId[2].lanes).toBe(2);
    expect(byId[1].lane).not.toBe(byId[2].lane);
    expect(byId[3]).toMatchObject({ lane: 0, lanes: 1 });
  });
});
