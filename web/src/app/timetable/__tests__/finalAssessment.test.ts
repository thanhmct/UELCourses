import { describe, expect, it } from "vitest";
import {
  clearFinalAssessmentCache,
  finalAssessmentKind,
  formatFinalAssessment,
  getCachedFinalAssessmentKind,
  setCachedFinalAssessmentKind,
} from "../finalAssessment";

describe("finalAssessmentKind", () => {
  it("trả về null nếu không có assessments hoặc rỗng", () => {
    expect(finalAssessmentKind(null)).toBeNull();
    expect(finalAssessmentKind(undefined)).toBeNull();
    expect(finalAssessmentKind([])).toBeNull();
  });

  it("trả về null nếu không có bài đánh giá cuối kỳ (không có A3 hay cuối kỳ)", () => {
    const assessments = [
      { item_code: "A1.1", component: "Đánh giá quá trình", item_name: "Chuyên cần" },
      { item_code: "A2.1", component: "Đánh giá giữa kỳ", item_name: "Kiểm tra giữa kỳ" },
    ];
    expect(finalAssessmentKind(assessments)).toBeNull();
  });

  it("nhận diện 'Thi' cho ca thi chung (không suy đoán 'Thi viết' khi không có từ khóa cụ thể)", () => {
    expect(
      finalAssessmentKind([
        { item_code: "A3.1", component: "Đánh giá cuối kỳ", item_name: "Thi kết thúc học phần" },
      ]),
    ).toBe("Thi");

    expect(
      finalAssessmentKind([
        { item_code: "A3", component: "Final assessment", item_name: "Final Exam" },
      ]),
    ).toBe("Thi");

    expect(
      finalAssessmentKind("Thi kết thúc học phần"),
    ).toBe("Thi");
  });

  it("nhận diện các hình thức thi cụ thể khi có từ khóa rõ ràng (trắc nghiệm, tự luận/viết, vấn đáp)", () => {
    expect(
      finalAssessmentKind([
        { item_code: "A3", component: "Thi trắc nghiệm", item_name: "Trắc nghiệm trên máy" },
      ]),
    ).toBe("Thi trắc nghiệm");

    expect(
      finalAssessmentKind([
        { component: "Đánh giá cuối kỳ", criteria: "Hình thức thi tự luận 90 phút" },
      ]),
    ).toBe("Thi viết");

    expect(
      finalAssessmentKind([
        { item_code: "A3.2", component: "Vấn đáp cuối kỳ", item_name: "Thi vấn đáp" },
      ]),
    ).toBe("Vấn đáp");

    expect(
      finalAssessmentKind([
        { item_code: "A3", component: "Final Exam", item_name: "Written test" },
      ]),
    ).toBe("Thi viết");
  });

  it("nhận diện 'Đồ án' qua các từ khóa đồ án/project/tiểu luận lớn/dự án", () => {
    expect(
      finalAssessmentKind([
        { item_code: "A3", component: "Đánh giá cuối kỳ", item_name: "Đồ án môn học" },
      ]),
    ).toBe("Đồ án");

    expect(
      finalAssessmentKind([
        { item_code: "A3.1", component: "Final assessment", item_name: "Course Project" },
      ]),
    ).toBe("Đồ án");

    expect(
      finalAssessmentKind([
        { component: "Đánh giá cuối kỳ", criteria: "Báo cáo tiểu luận lớn kết thúc môn" },
      ]),
    ).toBe("Đồ án");

    expect(
      finalAssessmentKind([
        { item_code: "A3", component: "Đánh giá cuối kỳ", item_name: "Báo cáo dự án thực tế" },
      ]),
    ).toBe("Đồ án");
  });

  it("ưu tiên 'tiểu luận lớn' là 'Đồ án' thay vì 'Tiểu luận'", () => {
    expect(
      finalAssessmentKind([
        { item_code: "A3.1", component: "Cuối kỳ", item_name: "Tiểu luận lớn" },
      ]),
    ).toBe("Đồ án");
  });

  it("nhận diện 'Tiểu luận' qua các từ khóa tiểu luận/essay/report/báo cáo", () => {
    expect(
      finalAssessmentKind([
        { item_code: "A3", component: "Đánh giá cuối kỳ", item_name: "Viết tiểu luận môn học" },
      ]),
    ).toBe("Tiểu luận");

    expect(
      finalAssessmentKind([
        { item_code: "A3.1", component: "Final assessment", item_name: "Individual Essay" },
      ]),
    ).toBe("Tiểu luận");

    expect(
      finalAssessmentKind([
        { component: "Đánh giá cuối kỳ", criteria: "Nộp report báo cáo cuối kỳ" },
      ]),
    ).toBe("Tiểu luận");
  });

  it("nhận diện 'Khác' nếu có bài đánh giá cuối kỳ nhưng không chứa từ khóa quen thuộc", () => {
    expect(
      finalAssessmentKind([
        { item_code: "A3.1", component: "Đánh giá cuối kỳ", item_name: "Tham gia hội thảo chuyên đề" },
      ]),
    ).toBe("Khác");
  });

  it("bộ nhớ đệm cache hoạt động chính xác", () => {
    clearFinalAssessmentCache();
    expect(getCachedFinalAssessmentKind("BIM5001")).toBeUndefined();
    setCachedFinalAssessmentKind("BIM5001", "Đồ án");
    expect(getCachedFinalAssessmentKind("BIM5001")).toBe("Đồ án");
    setCachedFinalAssessmentKind("BIM5002", null);
    expect(getCachedFinalAssessmentKind("BIM5002")).toBeNull();
    clearFinalAssessmentCache();
    expect(getCachedFinalAssessmentKind("BIM5001")).toBeUndefined();
  });
});

describe("formatFinalAssessment", () => {
  it("định dạng 'Thi' chung thành VI 'Thi' và EN 'Exam'", () => {
    expect(formatFinalAssessment("Thi", "vi")).toBe("Thi");
    expect(formatFinalAssessment("Thi", "en")).toBe("Exam");

    const genericExam = [
      { item_code: "A3.1", component: "Đánh giá cuối kỳ", item_name: "Thi kết thúc học phần" },
    ];
    expect(formatFinalAssessment(genericExam, "vi")).toBe("Thi");
    expect(formatFinalAssessment(genericExam, "en")).toBe("Exam");
  });

  it("định dạng chuẩn các hình thức thi cụ thể theo ngôn ngữ VI và EN", () => {
    expect(formatFinalAssessment("Thi viết", "vi")).toBe("Thi viết");
    expect(formatFinalAssessment("Thi viết", "en")).toBe("Written exam");

    expect(formatFinalAssessment("Thi trắc nghiệm", "vi")).toBe("Thi trắc nghiệm");
    expect(formatFinalAssessment("Thi trắc nghiệm", "en")).toBe("Multiple-choice exam");

    expect(formatFinalAssessment("Vấn đáp", "vi")).toBe("Vấn đáp");
    expect(formatFinalAssessment("Vấn đáp", "en")).toBe("Oral exam");

    expect(formatFinalAssessment("Đồ án", "vi")).toBe("Đồ án");
    expect(formatFinalAssessment("Đồ án", "en")).toBe("Project");

    expect(formatFinalAssessment("Tiểu luận", "vi")).toBe("Tiểu luận");
    expect(formatFinalAssessment("Tiểu luận", "en")).toBe("Essay");
  });

  it("trả về null cho 'Khác' hoặc dữ liệu rỗng", () => {
    expect(formatFinalAssessment("Khác", "vi")).toBeNull();
    expect(formatFinalAssessment("Khác", "en")).toBeNull();
    expect(formatFinalAssessment(null, "vi")).toBeNull();
    expect(formatFinalAssessment(undefined, "en")).toBeNull();
  });
});
