import { describe, expect, it } from "vitest";
import { totalCredits, creditLoad } from "../credits";
import { moveModule, prerequisiteWarnings, suggestReplacements, termCredits, type PlanState } from "../planner";
import { formatOfferingPlan, seatsAvailable, capacityText } from "../modules";
import { cohortFromId, admissionYear, COHORTS } from "../cohort";
import { freeVenues, venuesFromSections, isVenueFree, buildingOf } from "../venues";
import type { ClassSection } from "../types";

describe("credits", () => {
  it("sums credits, optionally excluding hidden", () => {
    const items = [{ credits: 3 }, { credits: 2, hidden: true }, { credits: Number.NaN }];
    expect(totalCredits(items)).toBe(5);
    expect(totalCredits(items, false)).toBe(3);
  });
  it("classifies load", () => {
    expect(creditLoad(0)).toBe("empty");
    expect(creditLoad(10)).toBe("low");
    expect(creditLoad(18)).toBe("normal");
    expect(creditLoad(30)).toBe("high");
  });
});

const base = (): PlanState => ({
  terms: [
    { id: "t1", name: "HK1", modules: ["TKE2001"] },
    { id: "t2", name: "HK2", modules: ["TOA1001", "KTL3001"] },
  ],
  backlog: ["MI71"],
  completed: [],
  catalog: {
    TOA1001: { code: "TOA1001", name: "Toán", credits: 3 },
    TKE2001: { code: "TKE2001", name: "XSTK", credits: 3, prerequisites: ["TOA1001"] },
    KTL3001: { code: "KTL3001", name: "KTL", credits: 3, prerequisites: ["TKE2001", "KTE1001"] },
    KTE1001E: { code: "KTE1001E", name: "Micro", credits: 3, equivalents: [{ code: "KTE1001", name: "Vi mô", credits: 3 }] },
    MI71: { code: "MI71", name: "GDTC", credits: 1, equivalents: [{ code: "MI72", name: "GDTC 2", credits: 1 }] },
  },
});

describe("planner", () => {
  it("warns when prerequisites are not in earlier terms", () => {
    const w = prerequisiteWarnings(base());
    expect(w).toEqual([
      { termId: "t1", code: "TKE2001", missing: ["TOA1001"] },
      { termId: "t2", code: "KTL3001", missing: ["KTE1001"] },
    ]);
  });
  it("accepts completed modules and equivalents", () => {
    const s = base();
    s.completed = ["TOA1001", "KTE1001E"];
    expect(prerequisiteWarnings(s)).toEqual([]);
  });
  it("moves modules between terms and backlog", () => {
    let s = moveModule(base(), "TOA1001", "t1");
    expect(s.terms[0].modules).toEqual(["TKE2001", "TOA1001"]);
    expect(s.terms[1].modules).toEqual(["KTL3001"]);
    s = moveModule(s, "MI71", "t2");
    expect(s.backlog).toEqual([]);
    s = moveModule(s, "MI71", "backlog");
    expect(s.backlog).toEqual(["MI71"]);
    expect(moveModule(s, "MI71", "nope")).toBe(s);
  });
  it("computes term credits and suggests replacements", () => {
    expect(termCredits(base(), "t2")).toBe(6);
    expect(termCredits(base(), "x")).toBe(0);
    expect(suggestReplacements(base(), "MI71")).toEqual([{ code: "MI72", name: "GDTC 2", credits: 1 }]);
  });
});

describe("module helpers", () => {
  it("formats offering plan", () => {
    expect(formatOfferingPlan([{ academic_year: "2026-2027", terms: [3, 1], open_pct: 80 }])).toBe("Dự kiến mở: HK1, HK3 năm 2026-2027");
    expect(formatOfferingPlan(undefined)).toBe("");
  });
  it("computes available seats", () => {
    expect(seatsAvailable({ available: 5 })).toBe(5);
    expect(seatsAvailable({ quota_max: 60, registered: 70 })).toBe(0);
    expect(seatsAvailable({ quota: 60 })).toBeNull();
    expect(capacityText({ module_code: "A", class_code: "B", lessons: [], quota_max: 80, registered: 50, available: 30 })).toBe("50/80 · còn 30 chỗ");
  });
});

describe("cohort", () => {
  it("derives cohort from student ID or class code", () => {
    expect(cohortFromId("K224040496")).toBe("K22");
    expect(cohortFromId("k24404e")).toBe("K24");
    expect(cohortFromId("  K25 ")).toBe("K25");
    expect(cohortFromId("224040496")).toBeNull();
    expect(admissionYear("K22")).toBe(2022);
    expect(COHORTS[0]).toBe("K19");
    expect(COHORTS[COHORTS.length - 1]).toBe("K26");
  });
});

describe("venues", () => {
  const secs: ClassSection[] = [
    { module_code: "A", class_code: "1", lessons: [{ weekday: 2, start_period: 1, end_period: 3, start_time: "", end_time: "", room: "B.203" }] },
    { module_code: "B", class_code: "2", lessons: [{ weekday: 2, start_period: 7, end_period: 9, start_time: "", end_time: "", room: "A.101" }] },
  ];
  const v = venuesFromSections(secs);
  it("groups sessions by room", () => {
    expect(v.map((x) => x.room)).toEqual(["A.101", "B.203"]);
    expect(buildingOf("B.203")).toBe("B");
  });
  it("finds free rooms in a slot", () => {
    expect(freeVenues(v, 2, 2, 4).map((x) => x.room)).toEqual(["A.101"]);
    expect(freeVenues(v, 3, 1, 15)).toHaveLength(2);
    expect(isVenueFree(v[0], 2, 9, 10)).toBe(false);
  });
});
