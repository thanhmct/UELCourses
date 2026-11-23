import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header, HeaderProgramCode } from "../Header";
import { useSettings } from "@/lib/store";
import { useLang } from "@/i18n";
import { api } from "@/lib/api";
import { mockPrograms } from "@/mocks/programs";
import type { ProgramSummary } from "@/lib/types";

vi.mock("@/lib/useMounted", () => ({
  useMounted: () => true,
}));

const mockK24414Summary: ProgramSummary = {
  program_id: "K24414",
  name: "Công nghệ tài chính Khóa 24",
  cohort: "K24",
  faculty: "Khoa Tài chính - Ngân hàng",
  total_credits: 140,
};

const mockK25404ESummary: ProgramSummary = {
  program_id: "K25404E",
  name: "Tài chính - Ngân hàng Khóa 25 (Hệ tiếng Anh)",
  cohort: "K25",
  faculty: "Khoa Tài chính - Ngân hàng",
  total_credits: 141,
};

const mockK23406Summary: ProgramSummary = {
  program_id: "K23406",
  name: "Hệ thống thông tin quản lý Khóa 23",
  cohort: "K23",
  faculty: "Khoa Hệ thống thông tin",
  total_credits: 140,
};

describe("Brief W26: HeaderProgramCode and Header top bar tests", () => {
  beforeEach(() => {
    act(() => {
      useSettings.getState().setProgramProfile("", "");
      useSettings.getState().setCohort("");
      useLang.getState().setLang("vi");
    });

    vi.spyOn(api, "programs").mockImplementation(async (f) => {
      const list = mockPrograms(f);
      return {
        data: [...list, mockK24414Summary, mockK25404ESummary, mockK23406Summary],
        mock: true,
      };
    });

    vi.spyOn(api, "program").mockImplementation(async (id: string) => {
      const norm = id.trim().toUpperCase();
      if (norm === "K24414") {
        return {
          data: {
            program: {
              program_id: "K24414",
              name: "Công nghệ tài chính Khóa 24",
              cohort: "K24",
              faculty: "Khoa Tài chính - Ngân hàng",
              total_credits: 140,
            },
            blocks: [],
          },
          mock: true,
        };
      }
      if (norm === "K25404" || norm === "K25404E") {
        return {
          data: {
            program: {
              program_id: norm,
              name: norm.endsWith("E")
                ? "Tài chính - Ngân hàng Khóa 25 (Hệ tiếng Anh)"
                : "Tài chính - Ngân hàng Khóa 25",
              cohort: "K25",
              faculty: "Khoa Tài chính - Ngân hàng",
              total_credits: 141,
            },
            blocks: [],
          },
          mock: true,
        };
      }
      if (norm === "K23406") {
        return {
          data: {
            program: {
              program_id: "K23406",
              name: "Hệ thống thông tin quản lý Khóa 23",
              cohort: "K23",
              faculty: "Khoa Hệ thống thông tin",
              total_credits: 140,
            },
            blocks: [],
          },
          mock: true,
        };
      }
      return { data: null, mock: true };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    act(() => {
      useSettings.getState().setProgramProfile("", "");
      useLang.getState().setLang("vi");
    });
  });

  it("1. Khi chưa có CTĐT: thanh trên hiện 'Chương trình đào tạo của bạn' và nút Chọn", () => {
    render(<HeaderProgramCode />);

    expect(screen.getAllByText("Chương trình đào tạo của bạn").length).toBeGreaterThan(0);
    const selectBtn = screen.getByRole("button", { name: "Chọn chương trình đào tạo của bạn" });
    expect(selectBtn).toHaveTextContent("Chọn");

    const svg = selectBtn.parentElement?.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("stroke-width", "1.75");

    // Tuyệt đối không có 2 nút icon
    expect(screen.queryByRole("button", { name: /Đổi/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bỏ lọc/i })).not.toBeInTheDocument();

    // Bấm chip gợi ý -> mở dialog
    fireEvent.click(selectBtn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("2. Khi có CTĐT: thanh trên hiển thị thẻ gọn (icon mũ, tên ngành, chip khóa) thay cho ô chữ mã 'K24414'", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    render(<HeaderProgramCode />);

    await waitFor(() => {
      expect(screen.getByText("Công nghệ tài chính")).toBeInTheDocument();
      expect(screen.getByText("Khóa 24")).toBeInTheDocument();
    });

    // Tuyệt đối không còn ô chỉ có chữ mã "K24414"
    expect(screen.queryByText("Nhập mã lớp")).not.toBeInTheDocument();

    // Có 2 nút icon với aria-label và title đúng, không có chữ text hiển thị
    const changeBtn = screen.getByRole("button", { name: "Đổi chương trình đào tạo" });
    const clearBtn = screen.getByRole("button", { name: "Bỏ lọc theo CTĐT" });

    expect(changeBtn).toBeInTheDocument();
    expect(clearBtn).toBeInTheDocument();
    expect(screen.queryByText("Đổi")).not.toBeInTheDocument();
    expect(screen.queryByText("Bỏ lọc CTĐT")).not.toBeInTheDocument();
  });

  it("3. Bấm icon bút chì trên thanh trên mở ProgramProfileDialog", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    render(<HeaderProgramCode />);

    await waitFor(() => {
      expect(screen.getByText("Công nghệ tài chính")).toBeInTheDocument();
    });

    const changeBtn = screen.getByRole("button", { name: "Đổi chương trình đào tạo" });
    fireEvent.click(changeBtn);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
  });

  it("4. Bấm icon ✕ trên thanh trên gọi xóa CTĐT và chuyển về chip gợi ý 'Chọn chương trình đào tạo của bạn'", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    render(<HeaderProgramCode />);

    await waitFor(() => {
      expect(screen.getByText("Công nghệ tài chính")).toBeInTheDocument();
    });

    const clearBtn = screen.getByRole("button", { name: "Bỏ lọc theo CTĐT" });
    fireEvent.click(clearBtn);

    // Profile trong store được reset về rỗng
    expect(useSettings.getState().programCode).toBe("");

    // Thẻ chuyển ngay về trạng thái chưa có CTĐT ("Chọn chương trình đào tạo của bạn")
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Chọn chương trình đào tạo của bạn" })).toBeInTheDocument();
      expect(screen.queryByText("Công nghệ tài chính")).not.toBeInTheDocument();
    });
  });

  it("5. Header tổng hợp: tích hợp HeaderProgramCode trong thanh trên sticky", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    render(<Header />);

    // Logo UELPATH
    expect(screen.getByRole("link", { name: /UELPATH/i })).toBeInTheDocument();

    // Thẻ chương trình trên thanh trên
    await waitFor(() => {
      expect(screen.getByText("Công nghệ tài chính")).toBeInTheDocument();
      expect(screen.getByText("Khóa 24")).toBeInTheDocument();
    });

    // Nút tìm kiếm Ctrl K
    expect(screen.getByRole("button", { name: /Tìm nhanh|Tìm kiếm/i })).toBeInTheDocument();
  });
});
