import { describe, expect, it } from "vitest";
import { adjacencyViolations, lessonsAdjacent } from "../conflicts";
import type { ClassSection, Lesson } from "../types";

const L = (weekday: number, start: number, end: number, weeks?: string): Lesson => ({
  weekday,
  start_period: start,
  end_period: end,
  start_time: "",
  end_time: "",
  weeks,
});

const sec = (module_code: string, class_code: string, lessons: Lesson[]): ClassSection =>
  ({ module_code, class_code, lessons }) as ClassSection;

describe("quy tắc không xếp hai lớp liền kề qua tiết 6|7 và 12|13", () => {
  it("flags tiết 4–6 followed by tiết 7–9 on the same day", () => {
    expect(lessonsAdjacent(L(2, 4, 6), L(2, 7, 9))).toBe(true);
    expect(lessonsAdjacent(L(2, 7, 9), L(2, 4, 6))).toBe(true);
  });

  it("flags tiết 10–12 followed by tiết 13–15", () => {
    expect(lessonsAdjacent(L(3, 10, 12), L(3, 13, 15))).toBe(true);
  });

  it("allows a gap, other boundaries, and other days", () => {
    expect(lessonsAdjacent(L(2, 4, 5), L(2, 7, 9))).toBe(false); // có khoảng trống
    expect(lessonsAdjacent(L(2, 1, 3), L(2, 4, 6))).toBe(false); // không qua ranh giới
    expect(lessonsAdjacent(L(2, 4, 6), L(3, 7, 9))).toBe(false); // khác ngày
  });

  it("reports violations between selected sections", () => {
    const a = sec("BIM1", "C1", [L(2, 4, 6)]);
    const b = sec("BIM2", "C2", [L(2, 7, 9)]);
    expect(adjacencyViolations([a, b])).toHaveLength(1);
    expect(adjacencyViolations([a])).toHaveLength(0);
  });
});
