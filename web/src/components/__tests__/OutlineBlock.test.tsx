import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutlineBlock } from "@/components/OutlineBlock";
import { api, type OutlineData } from "@/lib/api";
import { useLang } from "@/i18n";

describe("OutlineBlock", () => {
  beforeEach(() => {
    useLang.getState().setLang("vi");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders database assessment weights and selected-syllabus materials", async () => {
    const mockData: OutlineData = {
      module_code: "BFF4009",
      outline_year: 2025,
      outline_year_fallback: false,
      course: {
        faculty: "Khoa Tài chính - Ngân hàng",
        credits: 3,
      },
      objectives: [{ code: "CO1", description: "Hiểu thị trường tài chính" }],
      clos: [{ code: "CLO1", description: "Phân tích danh mục đầu tư" }],
      assessments: [{ component: "Tỷ trọng cũ", weight_pct: 70 }],
      materials: [{ kind: "reference", citation: "Sách tham khảo" }],
    };

    const outlineSpy = vi.spyOn(api, "outline").mockResolvedValue(mockData);

    render(<OutlineBlock code="BFF4009" cohort="K25"
      assessment={{ final_ratio: 0.5, final_form: "Tự luận" }}
      textbooks={[{ name: "Giáo trình chính", is_main: true }]}
    />);

    expect(await screen.findByText("Sách tham khảo")).toBeVisible();
    expect(screen.getByText("50%")).toBeVisible();
    expect(screen.getByText("Tự luận")).toBeVisible();
    expect(screen.getByText("Giáo trình chính")).toBeVisible();
    expect(screen.queryByText("Khoa Tài chính - Ngân hàng")).not.toBeInTheDocument();
    expect(screen.queryByText("Hiểu thị trường tài chính")).not.toBeInTheDocument();
    expect(screen.queryByText("70%")).not.toBeInTheDocument();
    expect(outlineSpy).toHaveBeenCalledWith("BFF4009", { cohort: "K25" });
  });

  it("renders assessments and textbooks even when the detailed outline is unavailable", async () => {
    vi.spyOn(api, "outline").mockResolvedValue(null);
    render(<OutlineBlock code="BFF4009" cohort="K24"
      assessment={{ process_ratio: 0.3 }}
      textbooks={[{ name: "Giáo trình chính", is_main: true }]}
    />);

    expect(await screen.findByText("30%")).toBeVisible();
    expect(screen.getByText("Giáo trình chính")).toBeVisible();
  });

  it("translates controlled assessment and material text in the English UI", async () => {
    useLang.getState().setLang("en");
    vi.spyOn(api, "outline").mockResolvedValue({
      module_code: "BAA2028",
      materials: [{ kind: "reference", citation: "Bài giảng của Giảng viên" }],
    });

    render(<OutlineBlock code="BAA2028"
      assessment={{
        process_ratio: 0.3,
        process_form: "Trắc nghiệm + Tự luận + Thuyết trình nhóm",
        exam_type: "Thi giấy",
      }}
      textbooks={[{ name: "Giáo trình Nguyên lý kế toán: Trường Đại học Kinh tế - Luật. NXB ĐHQG TP.HCM", is_main: true }]}
    />);

    expect(await screen.findByText("Lecturer's course materials")).toBeVisible();
    expect(screen.getByText("Multiple-choice test + essay + group presentation")).toBeVisible();
    expect(screen.getByText("Written exam")).toBeVisible();
    expect(screen.getByText(/Principles of Accounting Textbook/)).toBeVisible();
    expect(screen.queryByText(/Trắc nghiệm|Thi giấy|Bài giảng của Giảng viên/)).not.toBeInTheDocument();
  });
});
