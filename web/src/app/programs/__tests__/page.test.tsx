import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProgramsPage from "../page";
import { useSettings } from "@/lib/store";
import { useLang } from "@/i18n";
import { api } from "@/lib/api";
import { mockPrograms } from "@/mocks/programs";
import type { ProgramSummary } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockK24414: ProgramSummary = {
  program_id: "K24414",
  name: "Công nghệ tài chính Khóa 24",
  cohort: "K24",
  faculty: "Khoa Tài chính - Ngân hàng",
  total_credits: 144,
};

const mockK24406: ProgramSummary = {
  program_id: "K24406",
  name: "Hệ thống thông tin quản lý Khóa 24",
  cohort: "K24",
  faculty: "Khoa Hệ thống thông tin",
  total_credits: 140,
};

const mockK24407: ProgramSummary = {
  program_id: "K24407",
  name: "Quản trị kinh doanh Khóa 24",
  cohort: "K24",
  faculty: "Khoa Quản trị kinh doanh",
  total_credits: 139,
};

describe("Brief W25: Thiết lập lại hệ thống lọc trang Chương trình đào tạo (CTĐT)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/programs");
    act(() => {
      useSettings.getState().setProgramProfile("K24414", "");
      useSettings.getState().setCohort("K24");
      useLang.getState().setLang("vi");
    });

    vi.spyOn(api, "programs").mockImplementation(async () => {
      const all = mockPrograms();
      // Đảm bảo các CTĐT thử nghiệm có mặt trong danh sách và chuẩn hóa NFC
      const list = all.map((p) => ({ ...p, name: p.name.normalize("NFC") }));
      if (!list.some((p) => p.program_id === "K24414")) list.push(mockK24414);
      if (!list.some((p) => p.program_id === "K24406")) list.push(mockK24406);
      if (!list.some((p) => p.program_id === "K24407")) list.push(mockK24407);
      return { data: list, mock: true };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    act(() => {
      useSettings.getState().setProgramProfile("", "");
      useSettings.getState().setCohort("");
      useLang.getState().setLang("vi");
    });
    window.history.replaceState(null, "", "/programs");
  });

  it("1. Bỏ dòng giới thiệu: không còn câu 'Lộ trình đào tạo UEL' và 'Gần đây có' dưới tiêu đề", async () => {
    render(<ProgramsPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Chương trình đào tạo (CTĐT)" })).toBeInTheDocument();
    });

    // Không còn text giới thiệu cũ
    expect(screen.queryByText(/Lộ trình đào tạo UEL/i)).toBeNull();
    expect(screen.queryByText(/Gần đây có/i)).toBeNull();
    expect(screen.queryByText(/Xem trực quan các học phần theo học kỳ gợi ý/i)).toBeNull();
  });

  it("2. Mặc định chỉ hiển thị CTĐT của người dùng: có chương trình K24414 → mặc định chỉ duy nhất một thẻ 'Công nghệ tài chính'", async () => {
    render(<ProgramsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Công nghệ tài chính/i)).toBeInTheDocument();
    });

    // Thẻ K24414 có liên kết tới /programs/K24414 và nhãn Ngành chính
    const link = screen.getByRole("link", { name: /Công nghệ tài chính/i });
    expect(link).toHaveAttribute("href", "/programs/K24414");
    expect(screen.getByText("Ngành chính")).toBeInTheDocument();

    // Các chương trình khác không xuất hiện trong danh sách
    expect(screen.queryByRole("link", { name: /Hệ thống thông tin quản lý/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Quản trị kinh doanh/i })).toBeNull();

    // Số lượng hiển thị: 1 chương trình
    expect(screen.getByText("1 chương trình")).toBeInTheDocument();
  });

  it("3. Nút 'Xem tất cả CTĐT' nằm TRONG khối lọc (within khối form/region tìm chương trình); bấm → hiện tất cả CTĐT từ mock, bộ lọc về mặc định", async () => {
    render(<ProgramsPage />);

    // Tìm khối lọc theo role="region" có tên "Tìm chương trình"
    const filterRegion = await screen.findByRole("region", { name: "Tìm chương trình" });
    expect(filterRegion).toBeInTheDocument();

    // Nút "Xem tất cả CTĐT" nằm TRONG khối lọc này
    const viewAllBtn = within(filterRegion).getByRole("button", { name: "Xem tất cả CTĐT" });
    expect(viewAllBtn).toBeInTheDocument();

    // Bấm nút "Xem tất cả CTĐT"
    fireEvent.click(viewAllBtn);

    // Hiển thị toàn bộ các CTĐT có trong mock/database
    await waitFor(() => {
      expect(screen.getAllByText(/Hệ thống thông tin quản lý/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Quản trị kinh doanh/i).length).toBeGreaterThan(0);
    });

    // Mọi bộ lọc về mặc định: ô tìm kiếm rỗng, khóa = tất cả, khoa = tất cả
    const searchInput = within(filterRegion).getByRole("textbox", { name: "Tìm chương trình" }) as HTMLInputElement;
    const cohortSelect = screen.getByLabelText("Khóa tuyển sinh") as HTMLSelectElement;
    const facultySelect = screen.getByLabelText("Khoa quản lý") as HTMLSelectElement;

    expect(searchInput.value).toBe("");
    expect(cohortSelect.value).toBe("all");
    expect(facultySelect.value).toBe("all");

    // Nút trong khối lọc đổi thành "Chỉ CTĐT của tôi"
    expect(within(filterRegion).getByRole("button", { name: "Chỉ CTĐT của tôi" })).toBeInTheDocument();
  });

  it("4. Bấm 'Chỉ CTĐT của tôi' → quay lại chế độ mặc định chỉ hiển thị CTĐT của người dùng", async () => {
    render(<ProgramsPage />);

    const filterRegion = await screen.findByRole("region", { name: "Tìm chương trình" });
    const viewAllBtn = within(filterRegion).getByRole("button", { name: "Xem tất cả CTĐT" });
    fireEvent.click(viewAllBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Hệ thống thông tin quản lý/i).length).toBeGreaterThan(0);
    });

    // Bấm nút "Chỉ CTĐT của tôi"
    const onlyMineBtn = within(filterRegion).getByRole("button", { name: "Chỉ CTĐT của tôi" });
    fireEvent.click(onlyMineBtn);

    // Quay lại chỉ hiển thị CTĐT của người dùng
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /Hệ thống thông tin quản lý/i })).toBeNull();
      expect(screen.getByText(/Công nghệ tài chính/i)).toBeInTheDocument();
    });

    // Nút đổi lại thành "Xem tất cả CTĐT"
    expect(within(filterRegion).getByRole("button", { name: "Xem tất cả CTĐT" })).toBeInTheDocument();
  });

  it("5. Gõ tìm kiếm khi ở chế độ mặc định ('chỉ CTĐT của tôi') → tự chuyển sang xem tất cả", async () => {
    render(<ProgramsPage />);

    const filterRegion = await screen.findByRole("region", { name: "Tìm chương trình" });
    const searchInput = within(filterRegion).getByRole("textbox", { name: "Tìm chương trình" });

    // Đang ở chế độ chỉ CTĐT của tôi (chỉ có Công nghệ tài chính)
    await waitFor(() => {
      expect(screen.getByText(/Công nghệ tài chính/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: /Quản trị kinh doanh/i })).toBeNull();

    // Gõ tìm kiếm ngành khác (ví dụ "Quản trị")
    fireEvent.change(searchInput, { target: { value: "Quản trị" } });

    // Tự động chuyển sang chế độ xem tất cả và lọc ra kết quả
    await waitFor(() => {
      expect(screen.getAllByText(/Quản trị kinh doanh/i).length).toBeGreaterThan(0);
    });

    // Nút đổi thành "Chỉ CTĐT của tôi" vì đang ở chế độ xem tất cả
    expect(within(filterRegion).getByRole("button", { name: "Chỉ CTĐT của tôi" })).toBeInTheDocument();
  });

  it("6. Tìm kiếm theo từ viết tắt (HTTQL) hoặc mã CTĐT không phân biệt hoa thường", async () => {
    render(<ProgramsPage />);

    const filterRegion = await screen.findByRole("region", { name: "Tìm chương trình" });
    const viewAllBtn = within(filterRegion).getByRole("button", { name: "Xem tất cả CTĐT" });
    fireEvent.click(viewAllBtn);

    const searchInput = within(filterRegion).getByRole("textbox", { name: "Tìm chương trình" });

    // Gõ từ viết tắt HTTQL -> tìm thấy Hệ thống thông tin quản lý
    fireEvent.change(searchInput, { target: { value: "HTTQL" } });

    await waitFor(() => {
      expect(screen.getAllByText(/Hệ thống thông tin quản lý/i).length).toBeGreaterThan(0);
      expect(screen.queryByRole("link", { name: /Quản trị kinh doanh/i })).toBeNull();
    });

    // Gõ mã CTĐT k24407 (chữ thường) -> tìm thấy Quản trị kinh doanh Khóa 24
    fireEvent.change(searchInput, { target: { value: "k24407" } });

    await waitFor(() => {
      expect(screen.getAllByText(/Quản trị kinh doanh/i).length).toBeGreaterThan(0);
      expect(screen.queryByRole("link", { name: /Hệ thống thông tin quản lý/i })).toBeNull();
    });
  });

  it("7. Song ngành: có ngành 2 → mặc định hiện 2 thẻ với nhãn Ngành chính / Ngành 2", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414", "K24406");
    });

    render(<ProgramsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Công nghệ tài chính/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Hệ thống thông tin quản lý/i).length).toBeGreaterThan(0);
    });

    // Nhãn Ngành chính và Ngành 2 xuất hiện trên các thẻ
    expect(screen.getByText("Ngành chính")).toBeInTheDocument();
    expect(screen.getByText("Ngành 2")).toBeInTheDocument();

    // Môn khác ngoài 2 ngành này không xuất hiện
    expect(screen.queryByRole("link", { name: /Quản trị kinh doanh/i })).toBeNull();
    expect(screen.getByText("2 chương trình")).toBeInTheDocument();
  });

  it("8. Chưa có chương trình → hiển thị toàn bộ CTĐT, kèm gợi ý chọn chương trình và không có nút 'Chỉ CTĐT của tôi'", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("", "");
      useSettings.getState().setCohort("");
    });

    render(<ProgramsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Công nghệ tài chính/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Hệ thống thông tin quản lý/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Quản trị kinh doanh/i).length).toBeGreaterThan(0);
    });

    // Có gợi ý "Chọn chương trình đào tạo của bạn"
    expect(screen.getByText("Chọn chương trình đào tạo của bạn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chọn" })).toBeInTheDocument();

    // Không có nút "Chỉ CTĐT của tôi" trong khối lọc vì chưa có chương trình
    const filterRegion = screen.getByRole("region", { name: "Tìm chương trình" });
    expect(within(filterRegion).queryByRole("button", { name: "Chỉ CTĐT của tôi" })).toBeNull();
    expect(within(filterRegion).queryByRole("button", { name: "Xem tất cả CTĐT" })).toBeNull();
  });

  it("9. Hỗ trợ giao diện tiếng Anh (EN): nhãn nút, tiêu đề và số lượng hiển thị tiếng Anh", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414", "");
      useLang.getState().setLang("en");
    });

    render(<ProgramsPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Training programmes" })).toBeInTheDocument();
      expect(screen.getByText("Primary major")).toBeInTheDocument();
      expect(screen.getByText("1 programmes")).toBeInTheDocument();
    });

    // Khối lọc tiếng Anh
    const filterRegion = screen.getByRole("region", { name: "Search programmes" });
    const viewAllBtn = within(filterRegion).getByRole("button", { name: "View all programmes" });
    expect(viewAllBtn).toBeInTheDocument();

    // Bấm View all programmes
    fireEvent.click(viewAllBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Management Information Systems/i).length).toBeGreaterThan(0);
    });

    // Nút đổi thành "Only my programmes"
    expect(within(filterRegion).getByRole("button", { name: "Only my programmes" })).toBeInTheDocument();
  });

  it("10. Đổi chương trình qua profile → danh sách mặc định cập nhật ngay lập tức", async () => {
    render(<ProgramsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Công nghệ tài chính/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: /Quản trị kinh doanh/i })).toBeNull();

    // Giả lập người dùng đổi chương trình sang K24407 (Quản trị kinh doanh)
    act(() => {
      useSettings.getState().setProgramProfile("K24407", "");
    });

    // Danh sách cập nhật ngay lập tức
    await waitFor(() => {
      expect(screen.getAllByText(/Quản trị kinh doanh/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole("link", { name: /Công nghệ tài chính/i })).toBeNull();
  });
});
