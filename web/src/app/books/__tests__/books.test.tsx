import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BooksPage from "../page";
import { useLang } from "@/i18n";
import { MOCK_BOOKS } from "@/mocks/books";

vi.mock("@/lib/useMounted", () => ({
  useMounted: () => true,
}));

describe("W9: Trang Trao đổi sách (/books)", () => {
  beforeEach(() => {
    useLang.getState().setLang("vi");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("hiển thị banner đầu trang thông báo dữ liệu mẫu", () => {
    render(<BooksPage />);
    const alertBanner = screen.getByRole("alert");
    expect(alertBanner).toBeInTheDocument();
    expect(alertBanner).toHaveTextContent("Tính năng đang thiết kế — dữ liệu hiển thị là mẫu.");
  });

  it("hiển thị đầy đủ 8 thẻ giáo trình mẫu ban đầu", () => {
    render(<BooksPage />);
    for (const book of MOCK_BOOKS) {
      expect(screen.getByText(book.title)).toBeInTheDocument();
      expect(screen.getAllByText(book.moduleCode).length).toBeGreaterThan(0);
    }
  });

  it("uses English sample content throughout the English UI", () => {
    useLang.getState().setLang("en");
    render(<BooksPage />);

    expect(screen.getByText("Principles of Accounting Textbook (University of Economics and Law)")).toBeVisible();
    expect(screen.getByText(/Accounting Principles/)).toBeVisible();
    expect(screen.getAllByText(/Faculty of Accounting and Auditing/).length).toBeGreaterThan(0);
    expect(screen.getByText("K24 student · Accounting")).toBeVisible();
    expect(screen.queryByText("Giáo trình Nguyên lý kế toán (ĐH Kinh tế - Luật)")).not.toBeInTheDocument();
    expect(screen.queryByText("SV K24 · Kế toán")).not.toBeInTheDocument();
  });

  it("lọc theo từ khóa tìm kiếm (mã môn hoặc tên sách)", () => {
    render(<BooksPage />);
    const searchInput = screen.getByLabelText(/Tìm kiếm giáo trình/i);

    // Search for BIM5001
    fireEvent.change(searchInput, { target: { value: "BIM5001" } });
    expect(screen.getByText("Giáo trình Hệ cơ sở dữ liệu & Bài tập thực hành")).toBeInTheDocument();
    expect(screen.queryByText("Giáo trình Nguyên lý kế toán (ĐH Kinh tế - Luật)")).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getByText("Giáo trình Nguyên lý kế toán (ĐH Kinh tế - Luật)")).toBeInTheDocument();
  });

  it("lọc theo hình thức trao đổi (tặng miễn phí / đổi / bán lại)", () => {
    render(<BooksPage />);
    const typeSelect = screen.getByLabelText(/Hình thức/i);

    // Filter giveaway
    fireEvent.change(typeSelect, { target: { value: "giveaway" } });
    expect(screen.getByText("Giáo trình Pháp luật đại cương (NXB ĐHQG-HCM)")).toBeInTheDocument();
    expect(screen.queryByText("Kinh tế vi mô - Principles of Microeconomics")).not.toBeInTheDocument();

    // Filter resell
    fireEvent.change(typeSelect, { target: { value: "resell" } });
    expect(screen.getByText("Kinh tế vi mô - Principles of Microeconomics")).toBeInTheDocument();
    expect(screen.queryByText("Giáo trình Pháp luật đại cương (NXB ĐHQG-HCM)")).not.toBeInTheDocument();
  });

  it("lọc theo tình trạng sách", () => {
    render(<BooksPage />);
    const conditionSelect = screen.getByLabelText(/Tình trạng/i);

    // Filter new (Mới 100%)
    fireEvent.change(conditionSelect, { target: { value: "new" } });
    expect(screen.getByText("Kinh tế vi mô - Principles of Microeconomics")).toBeInTheDocument();
    expect(screen.queryByText("Giáo trình Hệ cơ sở dữ liệu & Bài tập thực hành")).not.toBeInTheDocument();
  });

  it("bấm nút Liên hệ hiển thị hộp thoại yêu cầu đăng nhập và nút Đăng nhập bằng email trường disabled kèm Sắp ra mắt", () => {
    render(<BooksPage />);

    // Click the first Contact button
    const contactButtons = screen.getAllByRole("button", { name: "Liên hệ" });
    fireEvent.click(contactButtons[0]);

    // Dialog appears
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Cần đăng nhập để liên hệ")).toBeInTheDocument();

    // Disabled login button with "Sắp ra mắt"
    const loginBtn = within(dialog).getByRole("button", { name: /đăng nhập bằng email trường/i });
    expect(loginBtn).toBeInTheDocument();
    expect(loginBtn).toBeDisabled();
    expect(within(loginBtn).getByText("Sắp ra mắt")).toBeInTheDocument();

    // Close dialog
    const closeBtn = within(dialog).getAllByRole("button", { name: "Đóng" })[0];
    fireEvent.click(closeBtn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("bấm nút Đăng bài mở hộp thoại biểu mẫu kèm banner đăng nhập và nút disabled Sắp ra mắt", () => {
    render(<BooksPage />);

    // Click "Đăng bài" button
    const createBtn = screen.getByRole("button", { name: /Đăng bài/i });
    fireEvent.click(createBtn);

    // Dialog appears
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Đăng bài trao đổi giáo trình")).toBeInTheDocument();
    expect(within(dialog).getByText("Đăng nhập để đăng bài và liên hệ")).toBeInTheDocument();

    // Disabled login button with "Sắp ra mắt" inside the dialog
    const loginBtn = within(dialog).getByRole("button", { name: /đăng nhập bằng email trường/i });
    expect(loginBtn).toBeInTheDocument();
    expect(loginBtn).toBeDisabled();
    expect(within(loginBtn).getByText("Sắp ra mắt")).toBeInTheDocument();

    // Form fields exist
    expect(within(dialog).getByPlaceholderText("VD: BIM5001 hoặc Cơ sở dữ liệu")).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText("VD: Giáo trình Hệ cơ sở dữ liệu - UEL")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Đăng bài ngay" })).toBeInTheDocument();
  });
});
