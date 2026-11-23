import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramFilterBar } from "../ProgramFilterBar";
import { useSettings } from "@/lib/store";
import { useLang } from "@/i18n";
import { api } from "@/lib/api";
import { useProfileDialog } from "@/lib/profileDialog";
import { mockProgram, mockPrograms } from "@/mocks/programs";
import type { ProgramDetail, ProgramSummary } from "@/lib/types";

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

describe("Brief W16: ProgramFilterBar component tests", () => {
  beforeEach(() => {
    act(() => {
      useProfileDialog.getState().close();
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
      const direct = mockProgram(id);
      if (direct) return { data: direct, mock: true };
      return { data: null, mock: true };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    act(() => {
      useProfileDialog.getState().close();
      useSettings.getState().setProgramProfile("", "");
      useLang.getState().setLang("vi");
    });
  });

  it("1. Hiển thị tên ngành + chip 'Khóa 24' cho hệ chuẩn", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    render(<ProgramFilterBar />);

    // Nhãn xám CTĐT CỦA BẠN
    expect(screen.getByText("CTĐT CỦA BẠN")).toBeInTheDocument();

    // Tên ngành đậm vừa + chip Khóa 24
    await waitFor(() => {
      expect(screen.getByText("Công nghệ tài chính")).toBeInTheDocument();
      expect(screen.getByText("Khóa 24")).toBeInTheDocument();
    });

    // Tooltip / aria-label chứa câu đầy đủ
    const bar = screen.getByTestId("program-filter-bar");
    expect(bar).toHaveAttribute(
      "title",
      "Chương trình đào tạo ngành Công nghệ tài chính khóa 24",
    );
  });

  it("2. Hệ tiếng Anh (E) hiển thị chip 'Tiếng Anh'", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K25404E");
    });

    render(<ProgramFilterBar />);

    await waitFor(() => {
      expect(screen.getByText("Tài chính - Ngân hàng")).toBeInTheDocument();
      expect(screen.getByText("Khóa 25")).toBeInTheDocument();
      expect(screen.getByText("Tiếng Anh")).toBeInTheDocument();
    });
  });

  it("3. Hệ Cử nhân tài năng (T) và Coop (H) hiển thị chip đặc biệt tương ứng", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24404T");
    });

    const { unmount } = render(<ProgramFilterBar />);

    await waitFor(() => {
      expect(screen.getByText("Cử nhân tài năng")).toBeInTheDocument();
    });

    unmount();

    act(() => {
      useSettings.getState().setProgramProfile("K23406H");
    });

    render(<ProgramFilterBar />);

    await waitFor(() => {
      expect(screen.getByText("Co-op")).toBeInTheDocument();
    });
  });

  it("4. Có ngành 2 -> hiển thị hai chip cạnh nhau, ngăn bởi dấu '+' mờ, có nhãn 'Ngành chính' và 'Ngành 2'", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414", "K23406");
    });

    render(<ProgramFilterBar />);

    await waitFor(() => {
      // Nhãn phân biệt ngành chính và ngành 2
      expect(screen.getByText("Ngành chính")).toBeInTheDocument();
      expect(screen.getByText("Ngành 2")).toBeInTheDocument();

      // Cả 2 tên ngành và 2 khóa hiển thị
      expect(screen.getByText("Công nghệ tài chính")).toBeInTheDocument();
      expect(screen.getByText("Khóa 24")).toBeInTheDocument();
      expect(screen.getByText("Hệ thống thông tin quản lý")).toBeInTheDocument();
      expect(screen.getByText("Khóa 23")).toBeInTheDocument();

      // Ký tự ngăn cách +
      expect(screen.getByText("+")).toBeInTheDocument();
    });
  });

  it("5. Bấm nút 'Đổi' -> mở hộp thoại pop-up (role='dialog'), URL không đổi; lưu mã mới cập nhật thanh tức thì", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    const initialUrl = window.location.href;
    render(<ProgramFilterBar />);

    // Ban đầu chưa có hộp thoại
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Bấm nút Đổi
    const changeBtn = screen.getByRole("button", { name: /Đổi/i });
    fireEvent.click(changeBtn);

    // Hộp thoại role="dialog" xuất hiện trên trang hiện tại, URL không đổi
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(window.location.href).toBe(initialUrl);

    // Nhập mã lớp mới K23406 vào ô ngành chính
    const primaryInput = within(dialog).getByLabelText(/Ngành chính/i);
    fireEvent.change(primaryInput, { target: { value: "K23406" } });

    // Bấm Lưu
    const saveBtn = within(dialog).getByRole("button", { name: /Lưu thông tin/i });
    fireEvent.click(saveBtn);

    // Hộp thoại đóng lại
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Thanh chương trình cập nhật sang K23406 (Hệ thống thông tin quản lý Khóa 23) mà không cần reload
    await waitFor(() => {
      expect(screen.getByText("Hệ thống thông tin quản lý")).toBeInTheDocument();
      expect(screen.getByText("Khóa 23")).toBeInTheDocument();
      expect(screen.queryByText("Công nghệ tài chính")).not.toBeInTheDocument();
    });
  });

  it("6. Bấm nút 'Bỏ lọc' -> gọi callback onClearFilter", () => {
    const handleClear = vi.fn();
    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    render(<ProgramFilterBar onClearFilter={handleClear} />);

    const clearBtn = screen.getByRole("button", { name: /Bỏ lọc/i });
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(handleClear).toHaveBeenCalledTimes(1);
  });

  it("7. Chưa có chương trình -> thay bằng một chip gợi ý nhẹ 'Chọn chương trình đào tạo của bạn' với nút 'Chọn'", () => {
    act(() => {
      useSettings.getState().setProgramProfile("", "");
    });

    render(<ProgramFilterBar />);

    expect(screen.getByText("Chọn chương trình đào tạo của bạn")).toBeInTheDocument();
    const selectBtn = screen.getByRole("button", { name: "Chọn" });
    expect(selectBtn).toBeInTheDocument();

    // Bấm nút Chọn -> mở hộp thoại
    fireEvent.click(selectBtn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("8. Chế độ tiếng Anh (EN): hiển thị 'YOUR PROGRAMME', tên ngành tiếng Anh, chip 'Cohort 24', 'English'", async () => {
    act(() => {
      useLang.getState().setLang("en");
      useSettings.getState().setProgramProfile("K24414");
    });

    render(<ProgramFilterBar />);

    expect(screen.getByText("YOUR PROGRAMME")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Financial Technology")).toBeInTheDocument();
      expect(screen.getByText("Cohort 24")).toBeInTheDocument();
    });

    const changeBtn = screen.getByRole("button", { name: /Change/i });
    expect(changeBtn).toBeInTheDocument();
  });

  it("9. Fallback khi chưa có tên ngành -> hiển thị 'Ngành mã 414' thay cho tên", async () => {
    vi.spyOn(api, "programs").mockResolvedValue({ data: [], mock: true });
    vi.spyOn(api, "program").mockResolvedValue({ data: null, mock: true });

    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    render(<ProgramFilterBar />);

    await waitFor(() => {
      expect(screen.getByText("Ngành mã 414")).toBeInTheDocument();
      expect(screen.getByText("Khóa 24")).toBeInTheDocument();
    });
  });

  it("10. Segmented control mode: cho phép bấm chuyển giữa Ngành chính, Ngành 2 và Cả hai", async () => {
    const handleChange = vi.fn();
    act(() => {
      useSettings.getState().setProgramProfile("K24414", "K23406");
    });

    render(
      <ProgramFilterBar
        trackControl={{
          current: "all",
          onChange: handleChange,
        }}
      />,
    );

    // Các nút chuyển đổi
    const bothBtn = screen.getByRole("button", { name: /Cả hai ngành/i });
    const p1Btn = screen.getByRole("button", { name: "Ngành chính" });
    const p2Btn = screen.getByRole("button", { name: "Ngành 2" });

    expect(bothBtn).toHaveAttribute("aria-pressed", "true");
    expect(p1Btn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(p1Btn);
    expect(handleChange).toHaveBeenCalledWith("primary");

    fireEvent.click(p2Btn);
    expect(handleChange).toHaveBeenCalledWith("secondary");
  });

  it("11. Hiển thị số kết quả resultsCount bên phải", () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    render(<ProgramFilterBar resultsCount="71 học phần tìm thấy" />);

    expect(screen.getByText("71 học phần tìm thấy")).toHaveAttribute("role", "status");
  });

  it("12. Khi có chương trình nhưng isFilterActive=false -> chip bar vẫn hiện tên ngành và nút 'Lọc theo CTĐT'", async () => {
    const handleToggle = vi.fn();
    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    render(<ProgramFilterBar isFilterActive={false} onClearFilter={handleToggle} />);

    await waitFor(() => {
      expect(screen.getByText("Công nghệ tài chính")).toBeInTheDocument();
      expect(screen.getByText("Khóa 24")).toBeInTheDocument();
    });

    const filterBtn = screen.getByRole("button", { name: "Lọc theo CTĐT" });
    expect(filterBtn).toBeInTheDocument();

    fireEvent.click(filterBtn);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it("13. Brief W26: Hai nút 'Đổi' và 'Bỏ lọc CTĐT' chỉ còn ICON, bỏ chữ; có aria-label đúng, nút vuông 36x36", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    render(<ProgramFilterBar onClearFilter={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Công nghệ tài chính")).toBeInTheDocument();
    });

    // TUYỆT ĐỐI không có chữ "Đổi" hay "Bỏ lọc CTĐT" hiển thị dưới dạng text trần
    expect(screen.queryByText("Đổi")).not.toBeInTheDocument();
    expect(screen.queryByText("Bỏ lọc CTĐT")).not.toBeInTheDocument();
    expect(screen.queryByText("Bỏ lọc")).not.toBeInTheDocument();

    // Nút bút chì (Đổi)
    const changeBtn = screen.getByRole("button", { name: "Đổi chương trình đào tạo" });
    expect(changeBtn).toBeInTheDocument();
    expect(changeBtn).toHaveAttribute("title", "Đổi chương trình đào tạo");
    expect(changeBtn.className).toContain("h-9");
    expect(changeBtn.className).toContain("w-9");
    expect(changeBtn.className).toContain("rounded-lg");

    const pencilSvg = changeBtn.querySelector("svg");
    expect(pencilSvg).toBeInTheDocument();
    expect(pencilSvg).toHaveAttribute("stroke-width", "1.75");

    // Nút dấu ✕ (Bỏ lọc)
    const clearBtn = screen.getByRole("button", { name: "Bỏ lọc theo CTĐT" });
    expect(clearBtn).toBeInTheDocument();
    expect(clearBtn).toHaveAttribute("title", "Bỏ lọc theo CTĐT");
    expect(clearBtn.className).toContain("h-9");
    expect(clearBtn.className).toContain("w-9");
    expect(clearBtn.className).toContain("rounded-lg");

    const closeSvg = clearBtn.querySelector("svg");
    expect(closeSvg).toBeInTheDocument();
    expect(closeSvg).toHaveAttribute("stroke-width", "1.75");
  });

  it("14. Compact/Header: Chưa có CTĐT -> hiện nhãn chính và nút Chọn riêng", () => {
    act(() => {
      useSettings.getState().setProgramProfile("", "");
    });

    render(<ProgramFilterBar compact />);

    expect(screen.getByText("Chương trình đào tạo của bạn")).toBeInTheDocument();
    const selectBtn = screen.getByRole("button", { name: /Chọn chương trình đào tạo của bạn/i });
    expect(selectBtn).toHaveTextContent("Chọn");

    const svg = selectBtn.parentElement?.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("stroke-width", "1.75");

    // TUYỆT ĐỐI không có 2 nút icon bút chì hay dấu ✕
    expect(screen.queryByRole("button", { name: /Đổi/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bỏ lọc/i })).not.toBeInTheDocument();

    // Bấm chip gợi ý -> mở dialog
    fireEvent.click(selectBtn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("15. Brief W26 (compact/Header mode): Có CTĐT -> hiện thẻ gọn (icon mũ, tên ngành, chip khóa/hệ); bấm thẻ mở dialog, bấm ✕ bỏ lọc", async () => {
    const handleClear = vi.fn();
    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    render(<ProgramFilterBar compact onClearFilter={handleClear} />);

    await waitFor(() => {
      expect(screen.getByText("Công nghệ tài chính")).toBeInTheDocument();
      expect(screen.getByText("Khóa 24")).toBeInTheDocument();
    });

    // Ẩn nhãn "CTĐT CỦA BẠN" để vừa thanh trên
    expect(screen.queryByText("CTĐT CỦA BẠN")).not.toBeInTheDocument();

    // Bấm vào phần nội dung thẻ mở hộp thoại
    const cardInfoBtn = screen.getByRole("button", {
      name: "Chương trình đào tạo ngành Công nghệ tài chính khóa 24",
    });
    fireEvent.click(cardInfoBtn);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    // Đóng hộp thoại
    const closeDialogBtn = screen.getByRole("button", { name: /Đóng/i });
    fireEvent.click(closeDialogBtn);

    // Bấm nút dấu ✕ -> gọi onClearFilter
    const clearBtn = screen.getByRole("button", { name: "Bỏ lọc theo CTĐT" });
    fireEvent.click(clearBtn);
    expect(handleClear).toHaveBeenCalledTimes(1);
  });

  it("16. Brief W26 (compact/Header mode): Song ngành -> hiện 2 chip ngành cạnh nhau với dấu '+'", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414", "K23406");
    });

    render(<ProgramFilterBar compact />);

    await waitFor(() => {
      expect(screen.getByText("Công nghệ tài chính")).toBeInTheDocument();
      expect(screen.getByText("Khóa 24")).toBeInTheDocument();
      expect(screen.getByText("Hệ thống thông tin quản lý")).toBeInTheDocument();
      expect(screen.getByText("Khóa 23")).toBeInTheDocument();
      expect(screen.getByText("+")).toBeInTheDocument();
    });
  });
});
