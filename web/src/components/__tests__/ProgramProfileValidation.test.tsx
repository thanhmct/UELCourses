import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramProfileDialog } from "../ProgramProfileDialog";
import { ProgramFilterBar } from "../ProgramFilterBar";
import ModulesPage from "@/app/modules/page";
import { useSettings } from "@/lib/store";
import { useLang } from "@/i18n";
import { api } from "@/lib/api";
import { useProfileDialog } from "@/lib/profileDialog";
import { mockValidProgramGroups } from "@/mocks/programs";

vi.mock("@/lib/useMounted", () => ({
  useMounted: () => true,
}));

// Mock Next.js Link
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("Brief W30: Program Code Validation & Auto-Open Tests", () => {
  beforeEach(() => {
    sessionStorage.clear();
    act(() => {
      useProfileDialog.getState().close();
      useSettings.getState().setProgramProfile("", "");
      useSettings.getState().setCohort("");
      useLang.getState().setLang("vi");
    });

    vi.spyOn(api, "programs").mockImplementation(async () => ({
      mock: true,
      data: [
        {
          program_id: "K24414",
          name: "Công nghệ tài chính Khóa 24",
          cohort: "K24",
          faculty: "Khoa Tài chính - Ngân hàng",
          total_credits: 140,
        },
        {
          program_id: "K24404",
          name: "Tài chính - Ngân hàng Khóa 24",
          cohort: "K24",
          faculty: "Khoa Tài chính - Ngân hàng",
          total_credits: 141,
        },
        {
          program_id: "K24404E",
          name: "Tài chính - Ngân hàng Khóa 24 (Hệ tiếng Anh)",
          cohort: "K24",
          faculty: "Khoa Tài chính - Ngân hàng",
          total_credits: 141,
        },
        {
          program_id: "K25405",
          name: "Kế toán Khóa 25",
          cohort: "K25",
          faculty: "Khoa Kế toán - Kiểm toán",
          total_credits: 140,
        },
      ],
    }));

    vi.spyOn(api, "program").mockImplementation(async (id: string) => {
      const norm = id.trim().toUpperCase();
      if (norm === "K24414") {
        return {
          mock: true,
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
        };
      }
      if (norm === "K24404" || norm === "K24404E") {
        return {
          mock: true,
          data: {
            program: {
              program_id: norm,
              name: norm.endsWith("E")
                ? "Tài chính - Ngân hàng Khóa 24 (Hệ tiếng Anh)"
                : "Tài chính - Ngân hàng Khóa 24",
              cohort: "K24",
              faculty: "Khoa Tài chính - Ngân hàng",
              total_credits: 141,
            },
            blocks: [],
          },
        };
      }
      return { mock: true, data: null };
    });

    vi.spyOn(api, "validGroups").mockImplementation(async () => ({
      mock: true,
      data: mockValidProgramGroups(),
    }));

    vi.spyOn(api, "modules").mockImplementation(async () => ({
      mock: true,
      data: {
        items: [],
        total: 0,
        page: 1,
        page_size: 30,
        pages: 1,
      },
    }));

    vi.spyOn(api, "semesters").mockImplementation(async () => ({
      mock: true,
      data: [
        { id: "241", name: "Học kỳ 1", year: "2024-2025", term: 1, is_current: true },
      ],
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
    act(() => {
      useProfileDialog.getState().close();
      useSettings.getState().setProgramProfile("", "");
      useLang.getState().setLang("vi");
    });
  });

  // 1. Kiểm tra khi nhập mã giả K24414E vào ProgramProfileDialog
  it("1. Nhập K24414E (không tồn tại) hiển thị lỗi đỏ, liệt kê mã hợp lệ và chặn Lưu", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "K24414E" } });

    await waitFor(() => {
      expect(
        screen.getByText(/Không tìm thấy lớp K24414E\. Các mã hợp lệ của ngành này: K24414, K24414H/),
      ).toBeInTheDocument();
    });

    // Bấm nút Lưu
    const saveBtn = screen.getByRole("button", { name: "Lưu thông tin" });
    fireEvent.click(saveBtn);

    // Không được lưu vào store
    expect(useSettings.getState().programCode).toBe("");
    expect(
      screen.getByText(/Không tìm thấy lớp K24414E\. Các mã hợp lệ của ngành này: K24414, K24414H/),
    ).toBeInTheDocument();
  });

  // 2. Nhập mã hợp lệ K24414
  it("2. Nhập K24414 hợp lệ hiển thị mô tả đúng và cho phép Lưu", async () => {
    const handleClose = vi.fn();
    render(<ProgramProfileDialog open={true} onClose={handleClose} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "K24414" } });

    await waitFor(() => {
      expect(
        screen.getByText(
          /→ Khóa 2024, chương trình đào tạo ngành Công nghệ tài chính, chương trình tiếng Việt\./,
        ),
      ).toBeInTheDocument();
    });

    // Bấm Lưu
    const saveBtn = screen.getByRole("button", { name: "Lưu thông tin" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    fireEvent.click(saveBtn);

    expect(useSettings.getState().programCode).toBe("K24414");
    expect(handleClose).toHaveBeenCalled();
  });

  it.each([
    ["k23414", "K24404B", "K23414A", "K24404B"],
    ["K23414B", "K24404", "K23414B", "K24404A"],
  ])("Lưu %s và %s thành %s và %s", async (primary, secondary, savedPrimary, savedSecondary) => {
    const handleClose = vi.fn();
    render(<ProgramProfileDialog open={true} onClose={handleClose} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: primary } });
    fireEvent.change(screen.getByLabelText(/Ngành học thứ hai/i), { target: { value: secondary } });

    const saveBtn = screen.getByRole("button", { name: "Lưu thông tin" });
    expect(saveBtn).toBeDisabled();
    fireEvent.keyDown(primaryInput, { key: "Enter" });
    expect(useSettings.getState().programCode).toBe("");
    await waitFor(() => expect(saveBtn).toBeEnabled());
    fireEvent.click(saveBtn);

    expect(useSettings.getState().programCode).toBe(savedPrimary);
    expect(useSettings.getState().secondaryProgramCode).toBe(savedSecondary);
    expect(handleClose).toHaveBeenCalled();
  });

  it.each([
    ["K23501", "K25502"],
    ["K26503", "K24504"],
  ])("Lưu lớp A cho %s và %s khi API xác nhận lớp nhưng chưa có CTĐT", async (primary, secondary) => {
    vi.spyOn(api, "validGroups").mockResolvedValueOnce({
      mock: false,
      data: [primary, secondary].flatMap((programId) => ["A", "B"].map((suffix) => ({
        code: `${programId}${suffix}`,
        cohort: programId.slice(0, 3),
        major: programId.slice(3),
        suffix,
        kind: "standard" as const,
        program_id: programId,
        source: "class_sections" as const,
      }))),
    });
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText(/^Ngành chính$/i), { target: { value: primary } });
    fireEvent.change(screen.getByLabelText(/Ngành học thứ hai/i), { target: { value: secondary } });

    const saveBtn = screen.getByRole("button", { name: "Lưu thông tin" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    fireEvent.click(saveBtn);

    expect(useSettings.getState().programCode).toBe(`${primary}A`);
    expect(useSettings.getState().secondaryProgramCode).toBe(`${secondary}A`);
  });

  it("Báo lỗi khi mã thiếu hậu tố và ngành chỉ có lớp B", async () => {
    vi.spyOn(api, "validGroups").mockResolvedValueOnce({
      mock: false,
      data: mockValidProgramGroups().filter((group) => group.code === "K23414B"),
    });
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText(/^Ngành chính$/i), { target: { value: "K23414" } });
    expect(await screen.findByText("Không tìm thấy lớp K23414. Các mã hợp lệ của ngành này: K23414B"))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin" }));

    expect(useSettings.getState().programCode).toBe("");
  });

  // 3. Nhập mã tiếng Anh hợp lệ K24404E
  it("3. Nhập K24404E hợp lệ (Tài chính - Ngân hàng có hệ tiếng Anh) hiển thị mô tả tiếng Anh và cho phép Lưu", async () => {
    const handleClose = vi.fn();
    render(<ProgramProfileDialog open={true} onClose={handleClose} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "K24404E" } });

    await waitFor(() => {
      expect(
        screen.getByText(
          /→ Khóa 2024, chương trình đào tạo ngành Tài chính - Ngân hàng, chương trình tiếng Anh\./,
        ),
      ).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole("button", { name: "Lưu thông tin" });
    fireEvent.click(saveBtn);

    expect(useSettings.getState().programCode).toBe("K24404E");
    expect(handleClose).toHaveBeenCalled();
  });

  // 4. Nhập mã ngành không tồn tại ở khóa đó (vd K24999)
  it("4. Nhập mã ngành không có trong khóa (K24999) báo lỗi 'Không tìm thấy ngành mã 999 ở khóa 24'", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "K24999" } });

    await waitFor(() => {
      expect(screen.getByText("Không tìm thấy ngành mã 999 ở khóa 24")).toBeInTheDocument();
    });

    // Chặn lưu
    const saveBtn = screen.getByRole("button", { name: "Lưu thông tin" });
    fireEvent.click(saveBtn);
    expect(useSettings.getState().programCode).toBe("");
  });

  // 5. API validGroups rỗng / lỗi: fallback không chặn người dùng
  it("5. API validGroups lỗi hoặc rỗng thì không chặn mã có định dạng hợp lệ", async () => {
    vi.spyOn(api, "validGroups").mockResolvedValueOnce({
      mock: false,
      data: [],
    });

    const handleClose = vi.fn();
    render(<ProgramProfileDialog open={true} onClose={handleClose} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "K25405A" } });

    await waitFor(() => {
      expect(
        screen.getByText(
          /→ Khóa 2025, chương trình đào tạo ngành Kế toán, chương trình tiếng Việt\./,
        ),
      ).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole("button", { name: "Lưu thông tin" });
    fireEvent.click(saveBtn);
    expect(useSettings.getState().programCode).toBe("K25405A");
  });

  // 6. Thanh trên (compact mode): khi đã lưu mã không hợp lệ K24414E, hiện chip cảnh báo vàng
  it("6. Thanh trên hiện chip cảnh báo vàng khi mã đã lưu là K24414E, bấm mở dialog và không tự xóa mã", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414E");
    });

    render(<ProgramFilterBar compact={true} />);

    await waitFor(() => {
      expect(
        screen.getByText("Mã K24414E không hợp lệ — bấm để sửa"),
      ).toBeInTheDocument();
    });

    // Mã trong store vẫn được giữ nguyên
    expect(useSettings.getState().programCode).toBe("K24414E");

    // Bấm vào chip cảnh báo mở hộp thoại
    const warningBtn = screen.getByRole("button", {
      name: "Mã K24414E không hợp lệ — bấm để sửa",
    });
    fireEvent.click(warningBtn);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
  });

  // Bộ chọn trên Header là điểm vào chính; trang không tự bật hộp thoại nữa.
  it("7. Vào /modules khi bộ nhớ trống -> không tự động mở hộp thoại", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("", "");
    });

    render(<ModulesPage />);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  // 8. BỔ SUNG: Không tự mở hộp thoại khi đã có mã hợp lệ
  it("8. Vào /modules khi đã có mã hợp lệ K24414 -> hộp thoại KHÔNG tự mở", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    render(<ModulesPage />);

    // Đợi tải xong và đảm bảo không có dialog
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("9. Mã đã lưu không hợp lệ không ép mở hộp thoại trên /modules", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414E");
    });

    render(<ModulesPage />);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useSettings.getState().programCode).toBe("K24414E");
  });

  it("10. Rerender /modules vẫn không tự động mở hộp thoại", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("", "");
    });

    const { unmount } = render(<ModulesPage />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unmount();
    render(<ModulesPage />);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
