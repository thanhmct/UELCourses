import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COMPLETED_WITHOUT_TERM, placeModuleInPlanner } from "@/components/ModuleActions";
import { plannerEnrollmentYear, plannerSemesterId } from "../planner";
import { startPlannerTimetableSync, usePlanner, useSettings, useTimetable } from "../store";

const course = { code: "BAA2029", name: "Kế toán tài chính", credits: 3 };
const other = { code: "BAA4026", name: "Sổ kế toán", credits: 3 };
const first = "2026-2027-1";
const third = "2028-2029-3";

describe("mapping planner terms to timetable semesters", () => {
  it.each([
    ["Năm 1 – HK1", 2026, first],
    ["Năm 3 - học kỳ 3", 2026, third],
    ["Year 2 · Semester 2", 2024, "2025-2026-2"],
    ["HKHK02 năm học 2024–2025", null, "2024-2025-2"],
    ["2029-2030-3", null, "2029-2030-3"],
    ["Năm 2 – HK1 (2025–2026)", 2026, "2025-2026-1"],
    ["Năm 3", 2026, null],
    ["HK1", 2026, null],
    ["Năm 3 - HK1", null, null],
    ["HK1 2026-2028", 2026, null],
    ["HK4 2026-2027", 2026, null],
  ])("resolves %s with enrollment year %s", (name, year, expected) => {
    expect(plannerSemesterId(name, year)).toBe(expected);
  });

  it("uses the primary class code first and accepts a saved admission cohort", () => {
    expect(plannerEnrollmentYear("K26406E+K24406", "K24")).toBe(2026);
    expect(plannerEnrollmentYear("B24501", "")).toBe(2024);
    expect(plannerEnrollmentYear("", "K25")).toBe(2025);
    expect(plannerEnrollmentYear("M601", "K25")).toBeNull();
  });
});

describe("planner and timetable synchronization", () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    usePlanner.setState({ terms: [
      { id: "first", name: "Năm 1 - HK1", modules: [] },
      { id: "third", name: "Năm 3 - HK3", modules: [] },
      { id: "unknown", name: "Năm 3", modules: [] },
      { id: "explicit", name: "HK2 2030–2031", modules: [] },
    ], catalog: {}, backlog: [], completed: [] });
    useTimetable.setState({ semester: "2025-2026-3", bySemester: {}, drafts: {}, activeDrafts: {}, info: {}, plannerAssignments: {} });
    useSettings.setState({ cohort: "", programCode: "" });
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  it("adds to the active draft for the target semester and leaves the current selection intact", () => {
    useSettings.getState().setProgramCode("K26406");
    useTimetable.getState().createDraft(third, "Lịch đang xếp");
    useTimetable.getState().addModule(other, "CL-KEEP", third);
    stop = startPlannerTimetableSync();
    placeModuleInPlanner(course, "third");
    placeModuleInPlanner(course, "third");

    const timetable = useTimetable.getState();
    expect(timetable.semester).toBe("2025-2026-3");
    expect(timetable.bySemester[third]).toEqual([
      expect.objectContaining({ code: other.code, class_code: "CL-KEEP", color: 0 }),
      expect.objectContaining({ code: course.code, class_code: null, color: 1, fromPlanner: true }),
    ]);
    expect(timetable.drafts[third]["Lịch đang xếp"]).toEqual(timetable.bySemester[third]);
    expect(timetable.info[course.code]).toMatchObject(course);
  });

  it("moves and removes the synced entry while preserving manual additions and copied drafts", () => {
    useSettings.getState().setCohort("K26");
    useTimetable.getState().addModule(other, "CL-MANUAL", first);
    stop = startPlannerTimetableSync();
    placeModuleInPlanner(other, "first");
    placeModuleInPlanner(course, "first");
    useTimetable.getState().createDraft(first, "Bản sao", true);

    usePlanner.getState().move(course.code, "third");
    const timetable = useTimetable.getState();
    expect(timetable.drafts[first]["Phương án 1"].map((entry) => entry.code)).toEqual([other.code]);
    expect(timetable.drafts[first]["Bản sao"].map((entry) => entry.code)).toEqual([other.code, course.code]);
    expect(timetable.bySemester[third]).toHaveLength(1);

    usePlanner.getState().removeTerm("third");
    usePlanner.getState().removeModule(other.code);
    expect(useTimetable.getState().bySemester[third]).toEqual([]);
    expect(useTimetable.getState().drafts[first]["Phương án 1"][0]).toMatchObject({ code: other.code, class_code: "CL-MANUAL" });
  });

  it("syncs saved plans at startup and leaves subsequent timetable-only removals in place", () => {
    useSettings.getState().setCohort("K26");
    placeModuleInPlanner(course, "first");
    stop = startPlannerTimetableSync();
    expect(useTimetable.getState().bySemester[first][0].code).toBe(course.code);

    useTimetable.getState().removeModule(course.code, first);
    placeModuleInPlanner(other, "first");
    stop();
    stop = startPlannerTimetableSync();
    expect(useTimetable.getState().bySemester[first].map((entry) => entry.code)).toEqual([other.code]);
    expect(usePlanner.getState().terms[0].modules).toEqual([course.code, other.code]);
  });

  it("uses explicit dates without a profile and retries a relative term when a cohort is chosen", () => {
    stop = startPlannerTimetableSync();
    const replacement = { code: "BAA4012", name: "Kế toán chuyên ngành", credits: 4 };
    const undated = { code: "BAU4001", name: "Chuẩn mực báo cáo", credits: 3 };
    placeModuleInPlanner(course, "third");
    placeModuleInPlanner(other, "explicit");
    placeModuleInPlanner(undated, "unknown");
    placeModuleInPlanner(replacement, COMPLETED_WITHOUT_TERM);
    expect(Object.keys(useTimetable.getState().bySemester)).toEqual(["2030-2031-2"]);
    useSettings.getState().setProgramCode("K26406");
    expect(useTimetable.getState().bySemester[third][0].code).toBe(course.code);
    expect(Object.keys(useTimetable.getState().bySemester)).toHaveLength(2);
    usePlanner.getState().replaceModule(course.code, replacement);
    expect(useTimetable.getState().bySemester[third].map((entry) => entry.code)).toEqual([replacement.code]);
  });
});
