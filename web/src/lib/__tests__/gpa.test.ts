import { describe, expect, it } from "vitest";
import { calculateGpa, getGpaClassification, gradeToPoints, simulateTargetGpa } from "../gpa";

describe("GPA / CAP Calculator", () => {
  it("converts letter grades to points according to UEL scale", () => {
    expect(gradeToPoints("A+")).toBe(4.0);
    expect(gradeToPoints("A")).toBe(4.0);
    expect(gradeToPoints("B+")).toBe(3.5);
    expect(gradeToPoints("B")).toBe(3.0);
    expect(gradeToPoints("C+")).toBe(2.5);
    expect(gradeToPoints("C")).toBe(2.0);
    expect(gradeToPoints("D+")).toBe(1.5);
    expect(gradeToPoints("D")).toBe(1.0);
    expect(gradeToPoints("F")).toBe(0.0);
  });

  it("calculates weighted GPA correctly", () => {
    const items = [
      { credits: 3, grade: "A" },  // 3 * 4.0 = 12.0
      { credits: 3, grade: "B+" }, // 3 * 3.5 = 10.5
      { credits: 2, grade: "B" },  // 2 * 3.0 = 6.0
      { credits: 4, grade: "" },   // Not graded yet
    ];
    // Total graded credits = 8, total points = 28.5 -> GPA = 28.5 / 8 = 3.5625 -> 3.56
    const res = calculateGpa(items);
    expect(res.gradedCredits).toBe(8);
    expect(res.totalCredits).toBe(12);
    expect(res.gpa4).toBe(3.56);
    expect(res.classification.label).toBe("Giỏi");
  });

  it("handles classifications properly", () => {
    expect(getGpaClassification(3.8).label).toBe("Xuất sắc");
    expect(getGpaClassification(3.4).label).toBe("Giỏi");
    expect(getGpaClassification(2.8).label).toBe("Khá");
    expect(getGpaClassification(2.2).label).toBe("Trung bình");
    expect(getGpaClassification(1.8).label).toBe("Yếu / Kém");
  });

  it("simulates target GPA feasibility", () => {
    // Current GPA 3.0 with 60 credits, wants 3.2 (Giỏi) with 60 credits remaining
    // (3.2 * 120 - 3.0 * 60) / 60 = (384 - 180) / 60 = 204 / 60 = 3.4
    const sim = simulateTargetGpa(3.0, 60, 60, 3.2);
    expect(sim.feasible).toBe(true);
    expect(sim.neededGpa).toBe(3.4);

    // Impossible target: Current GPA 2.0 with 100 credits, wants 3.6 with 20 credits remaining
    const simImp = simulateTargetGpa(2.0, 100, 20, 3.6);
    expect(simImp.feasible).toBe(false);
    expect(simImp.neededGpa).toBeGreaterThan(4.0);
  });
});
