import { describe, expect, it } from "vitest";
import { cohortSemesterSlots, cohortStartYear, scopeSemesters } from "../semesters";
import type { Semester } from "../types";

const api = (id: string, year: string, term: number, cur = false): Semester => ({
  id,
  name: `HK${term} ${year}`,
  year,
  term,
  is_current: cur,
});

describe("học kỳ theo khóa", () => {
  it("K26 bắt đầu năm học 2026-2027", () => {
    expect(cohortStartYear("K26")).toBe(2026);
    const slots = cohortSemesterSlots("K26");
    expect(slots).toHaveLength(12);
    expect(slots[0].id).toBe("2026-2027-1");
    expect(slots[2].id).toBe("2026-2027-3");
    expect(slots[11].id).toBe("2029-2030-3");
  });

  it("không có khóa thì giữ nguyên danh sách", () => {
    const all = [api("2025-2026-1", "2025-2026", 1)];
    expect(scopeSemesters(all, "")).toBe(all);
  });

  it("K26 không hiện năm học 2025-2026, và hiện đủ 12 học kỳ kể cả chưa có dữ liệu", () => {
    const all = [api("2025-2026-1", "2025-2026", 1), api("2026-2027-1", "2026-2027", 1, true)];
    const scoped = scopeSemesters(all, "K26");
    expect(scoped).toHaveLength(12);
    expect(scoped.some((s) => s.year === "2025-2026")).toBe(false);
    expect(scoped[0].is_current).toBe(true);
    expect(scoped[3].name).toBe("Học kỳ 1, 2027-2028");
  });
});
