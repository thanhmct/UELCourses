import { describe, expect, it } from "vitest";
import { calculateGpa, isEnglishCourse, isExcludedFromGpa } from "../gpa";

describe("môn không tính vào GPA", () => {
  it("loại Giáo dục thể chất, Học phần quốc phòng và Tiếng Anh 1–4", () => {
    expect(isExcludedFromGpa("Giáo dục thể chất 1")).toBe(true);
    expect(isExcludedFromGpa("Học phần quốc phòng – an ninh")).toBe(true);
    expect(isExcludedFromGpa("Giáo dục quốc phòng")).toBe(true);
    expect(isExcludedFromGpa("Tiếng Anh Nền tảng")).toBe(false);
    expect(isExcludedFromGpa("Tiếng Anh 1")).toBe(true);
    expect(isExcludedFromGpa("Tiếng Anh 4")).toBe(true);
    expect(isExcludedFromGpa("English 2")).toBe(true);
  });

  it("giữ lại các môn khác, kể cả tiếng Anh chuyên ngành", () => {
    expect(isExcludedFromGpa("Kinh tế vi mô")).toBe(false);
    expect(isExcludedFromGpa("Tiếng Anh chuyên ngành kinh doanh")).toBe(false);
    expect(isExcludedFromGpa("Tiếng Anh 5")).toBe(false);
    expect(isExcludedFromGpa(undefined)).toBe(false);
  });

  it("calculateGpa bỏ qua môn bị loại (cả tín chỉ lẫn điểm)", () => {
    const r = calculateGpa([
      { name: "Kinh tế vi mô", credits: 3, score10: 9 },
      { name: "Tiếng Anh 1", credits: 3, score10: 2 },
      { name: "Giáo dục thể chất 1", credits: 2, score10: 4 },
    ]);
    expect(r.gpa4).toBe(4);
    expect(r.totalCredits).toBe(3);
    expect(r.gradedCredits).toBe(3);
  });

  it("nhận diện môn Tiếng Anh 1–4 để miễn", () => {
    expect(isEnglishCourse("Tiếng Anh 3")).toBe(true);
    expect(isEnglishCourse("Kinh tế học")).toBe(false);
  });
});
