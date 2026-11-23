import { describe, expect, it } from "vitest";
import { creditsLine, formatCredits, formatCreditsAndExam } from "../moduleFormat";
import {
  finalAssessmentKind,
  formatFinalAssessment,
  type AssessmentItemLike,
} from "../finalAssessment";

describe("formatCredits", () => {
  it("định dạng đúng số tín chỉ cho tiếng Việt", () => {
    expect(formatCredits(3, "vi")).toBe("3 TC");
    expect(formatCredits(1, "vi")).toBe("1 TC");
    expect(formatCredits("2", "vi")).toBe("2 TC");
  });

  it("định dạng đúng số tín chỉ cho tiếng Anh (phân biệt số ít / số nhiều)", () => {
    expect(formatCredits(3, "en")).toBe("3 credits");
    expect(formatCredits(1, "en")).toBe("1 credit");
    expect(formatCredits("1", "en")).toBe("1 credit");
    expect(formatCredits("4", "en")).toBe("4 credits");
  });

  it("xử lý an toàn khi giá trị tín chỉ thiếu hoặc null", () => {
    expect(formatCredits(null, "vi")).toBe("? TC");
    expect(formatCredits(undefined, "vi")).toBe("? TC");
    expect(formatCredits(null, "en")).toBe("? credits");
    expect(formatCredits(undefined, "en")).toBe("? credits");
  });
});

describe("finalAssessmentKind and formatFinalAssessment", () => {
  it("nhận diện đúng hình thức thi viết từ chuỗi hoặc bài đánh giá", () => {
    expect(finalAssessmentKind("Thi kết thúc học phần: Tự luận 90 phút")).toBe("Thi viết");
    expect(formatFinalAssessment("Thi kết thúc học phần: Tự luận 90 phút", "vi")).toBe("Thi viết");
    expect(formatFinalAssessment("Thi kết thúc học phần: Tự luận 90 phút", "en")).toBe("Written exam");
  });

  it("nhận diện đúng hình thức thi chung khi đề cương không ghi cụ thể (không suy đoán)", () => {
    expect(finalAssessmentKind("Thi kết thúc học phần")).toBe("Thi");
    expect(formatFinalAssessment("Thi kết thúc học phần", "vi")).toBe("Thi");
    expect(formatFinalAssessment("Thi kết thúc học phần", "en")).toBe("Exam");
    expect(formatCreditsAndExam(3, "Thi kết thúc học phần", "vi")).toBe("3 TC · Thi");
    expect(formatCreditsAndExam(3, "Thi kết thúc học phần", "en")).toBe("3 credits · Exam");
  });

  it("nhận diện đúng hình thức thi trắc nghiệm", () => {
    expect(finalAssessmentKind("Thi trắc nghiệm máy tính")).toBe("Thi trắc nghiệm");
    expect(formatFinalAssessment("Thi trắc nghiệm máy tính", "vi")).toBe("Thi trắc nghiệm");
    expect(formatFinalAssessment("Thi trắc nghiệm máy tính", "en")).toBe("Multiple-choice exam");
  });

  it("nhận diện đúng hình thức vấn đáp", () => {
    expect(finalAssessmentKind("Vấn đáp chuyên môn cuối kỳ")).toBe("Vấn đáp");
    expect(formatFinalAssessment("Vấn đáp chuyên môn cuối kỳ", "vi")).toBe("Vấn đáp");
    expect(formatFinalAssessment("Vấn đáp chuyên môn cuối kỳ", "en")).toBe("Oral exam");
  });

  it("nhận diện đúng hình thức đồ án", () => {
    expect(finalAssessmentKind("Đồ án môn học / Capstone Project")).toBe("Đồ án");
    expect(formatFinalAssessment("Đồ án môn học / Capstone Project", "vi")).toBe("Đồ án");
    expect(formatFinalAssessment("Đồ án môn học / Capstone Project", "en")).toBe("Project");
  });

  it("nhận diện đúng hình thức tiểu luận", () => {
    expect(finalAssessmentKind("Tiểu luận cuối khóa")).toBe("Tiểu luận");
    expect(formatFinalAssessment("Tiểu luận cuối khóa", "vi")).toBe("Tiểu luận");
    expect(formatFinalAssessment("Tiểu luận cuối khóa", "en")).toBe("Essay");
  });

  it("phân tích mảng bài đánh giá từ đề cương chuẩn A3", () => {
    const assessments: AssessmentItemLike[] = [
      { item_code: "A1.1", component: "Đánh giá quá trình", item_name: "Chuyên cần", weight_pct: 10 },
      { item_code: "A2.1", component: "Đánh giá giữa kỳ", item_name: "Kiểm tra trắc nghiệm", weight_pct: 40 },
      { item_code: "A3.1", component: "Đánh giá cuối kỳ", item_name: "Bút thi tự luận 60 phút", weight_pct: 50 },
    ];
    expect(finalAssessmentKind(assessments)).toBe("Thi viết");
    expect(formatFinalAssessment(assessments, "vi")).toBe("Thi viết");
    expect(formatFinalAssessment(assessments, "en")).toBe("Written exam");
  });

  it("trả về null khi không có bài đánh giá cuối kỳ hoặc rỗng", () => {
    expect(finalAssessmentKind([])).toBeNull();
    expect(finalAssessmentKind(null)).toBeNull();
    expect(finalAssessmentKind(undefined)).toBeNull();
    expect(formatFinalAssessment([], "vi")).toBeNull();
    expect(formatFinalAssessment(null, "en")).toBeNull();
  });
});

describe("creditsLine", () => {
  describe("Có final_assessment", () => {
    it("định dạng chuẩn ở chế độ VI: '3 TC · Thi viết · Khoa Kinh tế'", () => {
      const line = creditsLine(
        {
          credits: 3,
          finalAssessment: "Thi viết",
          faculty: "Khoa Kinh tế",
        },
        "vi",
      );
      expect(line).toBe("3 TC · Thi viết · Khoa Kinh tế");
    });

    it("định dạng chuẩn ở chế độ EN: '3 credits · Written exam · Faculty of Economics'", () => {
      const line = creditsLine(
        {
          credits: 3,
          finalAssessment: "Thi viết",
          faculty_en: "Faculty of Economics",
        },
        "en",
      );
      expect(line).toBe("3 credits · Written exam · Faculty of Economics");
    });

    it("hỗ trợ các dạng bài cuối kỳ khác nhau (Đồ án, Tiểu luận, Trắc nghiệm, Vấn đáp)", () => {
      expect(
        creditsLine({ credits: 3, finalAssessment: "Đồ án", faculty: "Khoa HTTT" }, "vi"),
      ).toBe("3 TC · Đồ án · Khoa HTTT");

      expect(
        creditsLine({ credits: 3, finalAssessment: "Đồ án", faculty_en: "Faculty of IS" }, "en"),
      ).toBe("3 credits · Project · Faculty of IS");

      expect(
        creditsLine({ credits: 2, finalAssessment: "Tiểu luận" }, "vi"),
      ).toBe("2 TC · Tiểu luận");

      expect(
        creditsLine({ credits: 2, finalAssessment: "Tiểu luận" }, "en"),
      ).toBe("2 credits · Essay");

      expect(
        creditsLine({ credits: 3, finalAssessment: "Thi trắc nghiệm" }, "vi"),
      ).toBe("3 TC · Thi trắc nghiệm");

      expect(
        creditsLine({ credits: 3, finalAssessment: "Thi trắc nghiệm" }, "en"),
      ).toBe("3 credits · Multiple-choice exam");

      expect(
        creditsLine({ credits: 3, finalAssessment: "Vấn đáp" }, "vi"),
      ).toBe("3 TC · Vấn đáp");

      expect(
        creditsLine({ credits: 3, finalAssessment: "Vấn đáp" }, "en"),
      ).toBe("3 credits · Oral exam");

      expect(
        creditsLine({ credits: 3, finalAssessment: "Thi", faculty: "Khoa Kinh tế" }, "vi"),
      ).toBe("3 TC · Thi · Khoa Kinh tế");

      expect(
        creditsLine({ credits: 3, finalAssessment: "Thi", faculty_en: "Faculty of Economics" }, "en"),
      ).toBe("3 credits · Exam · Faculty of Economics");
    });
  });

  describe("Không có final_assessment", () => {
    it("bỏ trống phần hình thức thi, không hiện '—' hay 'chưa rõ' ở chế độ VI", () => {
      const line = creditsLine(
        {
          credits: 3,
          finalAssessment: null,
          faculty: "Khoa Kinh tế",
        },
        "vi",
      );
      expect(line).toBe("3 TC · Khoa Kinh tế");
      expect(line).not.toContain("—");
      expect(line).not.toContain("chưa rõ");
    });

    it("bỏ trống phần hình thức thi, không hiện '—' hay 'chưa rõ' ở chế độ EN", () => {
      const line = creditsLine(
        {
          credits: 3,
          finalAssessment: undefined,
          faculty_en: "Faculty of Economics",
        },
        "en",
      );
      expect(line).toBe("3 credits · Faculty of Economics");
      expect(line).not.toContain("—");
      expect(line).not.toContain("unknown");
    });

    it("khi chỉ có số tín chỉ thì chỉ hiển thị số tín chỉ", () => {
      expect(creditsLine({ credits: 3 }, "vi")).toBe("3 TC");
      expect(creditsLine({ credits: 3 }, "en")).toBe("3 credits");
      expect(creditsLine({ credits: 1 }, "en")).toBe("1 credit");
    });
  });
});

describe("formatCreditsAndExam", () => {
  it("định dạng nhanh số tín chỉ và hình thức thi", () => {
    expect(formatCreditsAndExam(3, "Thi viết", "vi")).toBe("3 TC · Thi viết");
    expect(formatCreditsAndExam(3, "Thi viết", "en")).toBe("3 credits · Written exam");
    expect(formatCreditsAndExam(3, null, "vi")).toBe("3 TC");
    expect(formatCreditsAndExam(3, null, "en")).toBe("3 credits");
  });
});
