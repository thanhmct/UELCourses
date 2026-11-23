import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { api } from "@/lib/api";
import ProgramsPage from "../page";
import { ProgramProfileDialog } from "@/components/ProgramProfileDialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Bộ chọn bậc đào tạo trang Chương trình đào tạo (Brief D6)", () => {
  it("trang Chương trình mặc định hiện đại học, chọn Thạc sĩ danh sách đổi sang CTĐT thạc sĩ", async () => {
    const mockProgramsApi = vi.spyOn(api, "programs").mockImplementation(async (filter?: any) => {
      const degree = filter?.degree || "dai_hoc";
      if (degree === "thac_si") {
        return {
          mock: false,
          data: [
            {
              program_id: "M601NC",
              name: "Kinh tế chính trị - Thạc sĩ nghiên cứu",
              cohort: "2025-2026",
              faculty: "Khoa Kinh tế",
              degree: "thac_si",
              total_credits: 60,
            },
            {
              program_id: "M601UD",
              name: "Kinh tế chính trị - Thạc sĩ ứng dụng",
              cohort: "2025-2026",
              faculty: "Khoa Kinh tế",
              degree: "thac_si",
              total_credits: 60,
            },
          ],
        };
      }
      return {
        mock: false,
        data: [
          {
            program_id: "K24404",
            name: "Tài chính - Ngân hàng Khóa 24",
            cohort: "K24",
            faculty: "Khoa Tài chính - Ngân hàng",
            degree: "dai_hoc",
            total_credits: 130,
          },
        ],
      };
    });

    render(<ProgramsPage />);

    // 1. Mặc định: gọi api.programs({ degree: "dai_hoc" })
    await waitFor(() => {
      expect(mockProgramsApi).toHaveBeenCalledWith(expect.objectContaining({ degree: "dai_hoc" }));
      expect(screen.getByText("Tài chính - Ngân hàng Khóa 24")).toBeInTheDocument();
      expect(screen.queryByText("Kinh tế chính trị - Thạc sĩ nghiên cứu")).not.toBeInTheDocument();
    });

    // 2. Chuyển sang bậc "Thạc sĩ"
    const thsTab = screen.getByRole("tab", { name: "Thạc sĩ" });
    fireEvent.click(thsTab);

    await waitFor(() => {
      expect(mockProgramsApi).toHaveBeenCalledWith(expect.objectContaining({ degree: "thac_si" }));
      expect(screen.getByText("Kinh tế chính trị - Thạc sĩ nghiên cứu")).toBeInTheDocument();
      expect(screen.getByText("Kinh tế chính trị - Thạc sĩ ứng dụng")).toBeInTheDocument();
      expect(screen.queryByText("Tài chính - Ngân hàng Khóa 24")).not.toBeInTheDocument();
    });
  });

  it("hộp thoại chọn CTĐT lấy danh mục của cả ba bậc", async () => {
    const mockProgramsApi = vi.spyOn(api, "programs").mockImplementation(async () => {
      return {
        mock: false,
        data: [
          {
            program_id: "K25405",
            name: "Kế toán Khóa 25",
            cohort: "K25",
            faculty: "Khoa Kế toán - Kiểm toán",
            degree: "dai_hoc",
            total_credits: 130,
          },
        ],
      };
    });

    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(mockProgramsApi).toHaveBeenCalledWith({ degree: "all" });
    });
  });
});
