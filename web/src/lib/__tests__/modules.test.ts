import { describe, expect, it } from "vitest";
import { openClassesByTerm, openTerms, parseSemesterId } from "../modules";

describe("openTerms", () => {
  const m = { offering_plan: [{ academic_year: "2026-2027", terms: [1, 3] }, { academic_year: "2027-2028", terms: [2] }] };
  it("lọc theo năm học", () => {
    expect([...openTerms(m, "2026-2027")].sort()).toEqual([1, 3]);
  });
  it("gộp mọi năm khi không chỉ định", () => {
    expect([...openTerms(m)].sort()).toEqual([1, 2, 3]);
  });
  it("không có kế hoạch -> rỗng", () => {
    expect(openTerms({}).size).toBe(0);
  });
})
describe("parseSemesterId", () => {
  it("tách năm học và kỳ", () => {
    expect(parseSemesterId("2026-2027-1")).toEqual({ year: "2026-2027", term: 1 });
    expect(parseSemesterId("xyz")).toBeNull();
  });
});

describe("openClassesByTerm", () => {
  const m = { open_semesters: [{ semester: "2026-2027-1", classes: 2 }, { semester: "2026-2027-3", classes: 0 }, { semester: "2025-2026-2", classes: 5 }] };
  it("chỉ tính năm học được chọn và kỳ có lớp", () => {
    expect([...openClassesByTerm(m, "2026-2027")]).toEqual([[1, 2]]);
  });
});