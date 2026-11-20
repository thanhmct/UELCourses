import { describe, expect, it } from "vitest";
import { useTimetable } from "../store";

describe("Multiple Timetable Drafts", () => {
  it("initializes with default draft and allows creating new drafts", () => {
    const sem = "2024_1";
    useTimetable.getState().setSemester(sem);
    useTimetable.getState().createDraft(sem, "Phương án 1", false);
    useTimetable.getState().addModule({ code: "ECO101", name: "Kinh tế vi mô", credits: 3 }, "ECO101_01");

    expect(useTimetable.getState().bySemester[sem].length).toBe(1);

    // Create a duplicate draft "Phương án 2 (Dự phòng)"
    useTimetable.getState().createDraft(sem, "Phương án 2 (Dự phòng)", true);
    expect(useTimetable.getState().activeDrafts[sem]).toBe("Phương án 2 (Dự phòng)");
    expect(useTimetable.getState().bySemester[sem].length).toBe(1);

    // Modify duplicate draft
    useTimetable.getState().addModule({ code: "MAT101", name: "Toán", credits: 3 }, "MAT101_01");
    expect(useTimetable.getState().bySemester[sem].length).toBe(2);

    // Switch back to "Phương án 1"
    useTimetable.getState().switchDraft(sem, "Phương án 1");
    expect(useTimetable.getState().activeDrafts[sem]).toBe("Phương án 1");
    expect(useTimetable.getState().bySemester[sem].length).toBe(1);
  });
});
