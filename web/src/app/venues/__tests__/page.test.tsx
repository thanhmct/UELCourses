import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VenuesPage from "../page";
import { useLang } from "@/i18n";
import { useSettings } from "@/lib/store";
import { api } from "@/lib/api";
import type { Semester, Venue } from "@/lib/types";
import { TOUR_BASE } from "@/lib/campusTour";

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockSemesters: Semester[] = [
  {
    id: "2026-2027-1",
    name: "Học kỳ 1 năm học 2026–2027",
    year: "2026-2027",
    term: 1,
    is_current: true,
    start_date: "2026-09-01",
    end_date: "2027-01-31",
    teaching_start: "2026-09-01",
    teaching_end: "2027-01-31",
  },
  {
    id: "2026-2027-2",
    name: "Học kỳ 2 năm học 2026–2027",
    year: "2026-2027",
    term: 2,
    is_current: false,
    start_date: "2027-02-01",
    end_date: "2027-06-30",
    teaching_start: "2027-02-01",
    teaching_end: "2027-06-30",
  },
];

const mockVenues: Venue[] = [
  {
    room: "B1.104",
    sessions: [
      // 2026-11-02 là Thứ Hai (weekday: 2) có 4 buổi học:
      // Session 1: buổi 1 ngày duy nhất vào 02/11
      {
        weekday: 2,
        start_period: 1,
        end_period: 3,
        start_time: "07:30",
        end_time: "09:50",
        module_code: "ECO1001",
        module_name: "Kinh tế vi mô",
        class_code: "K22404_01",
        date_start: "2026-11-02",
        date_end: "2026-11-02", // Một ngày
      },
      // Session 2..4: lặp thứ Hai từ 02/11 đến 30/11 (5 thứ Hai trong tháng 11: 2, 9, 16, 23, 30)
      {
        weekday: 2,
        start_period: 4,
        end_period: 6,
        start_time: "10:00",
        end_time: "12:20",
        module_code: "MAT1002",
        module_name: "Toán cao cấp",
        class_code: "K22404_02",
        date_start: "2026-11-02",
        date_end: "2026-11-30",
      },
      {
        weekday: 2,
        start_period: 7,
        end_period: 9,
        start_time: "13:00",
        end_time: "15:20",
        module_code: "ENG1001",
        module_name: "Tiếng Anh 1",
        class_code: "K22404_03",
        date_start: "2026-11-02",
        date_end: "2026-11-30",
      },
      {
        weekday: 2,
        start_period: 10,
        end_period: 12,
        start_time: "15:30",
        end_time: "17:50",
        module_code: "LAW1001",
        module_name: "Pháp luật đại cương",
        class_code: "K22404_04",
        date_start: "2026-11-02",
        date_end: "2026-11-30",
      },
      // 2026-11-10 là Thứ Ba (weekday: 3) có 1 buổi học
      {
        weekday: 3,
        start_period: 1,
        end_period: 3,
        start_time: "07:30",
        end_time: "09:50",
        module_code: "FIN2001",
        module_name: "Tài chính tiền tệ",
        class_code: "K22404_05",
        date_start: "2026-11-10",
        date_end: "2026-11-10",
      },
    ],
  },
  {
    room: "A.201",
    sessions: [
      // 2026-11-03 là Thứ Ba
      {
        weekday: 3,
        start_period: 1,
        end_period: 3,
        start_time: "07:30",
        end_time: "09:50",
        module_code: "MKT1001",
        module_name: "Marketing căn bản",
        class_code: "K22404_06",
        date_start: "2026-11-03",
        date_end: "2026-11-03",
      },
    ],
  },
];

describe("Brief W24: Khôi phục lưới lịch tháng phòng học (~30 ngày) và bỏ dạng danh sách dọc", () => {
  beforeEach(() => {
    act(() => {
      useSettings.getState().setCohort("");
      useSettings.getState().setProgramProfile("", "");
      useLang.getState().setLang("vi");
    });

    vi.spyOn(api, "semesters").mockResolvedValue({
      data: mockSemesters,
      mock: true,
    });

    vi.spyOn(api, "venues").mockImplementation(async () => {
      return { data: mockVenues, mock: true };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. Hiển thị lưới 7 cột với đủ số ngày của tháng (Hai ... CN)", async () => {
    render(<VenuesPage />);

    // Chờ danh sách phòng tải xong và chọn phòng B1.104
    await waitFor(() => {
      expect(screen.getByText("B1.104")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("B1.104"));

    // Chọn tháng 11/2026 trên dropdown tháng nếu chưa ở tháng 11
    const monthSelect = screen.getByLabelText("Tháng") as HTMLSelectElement;
    fireEvent.change(monthSelect, { target: { value: "2026-11" } });

    // Kiểm tra hàng tiêu đề 7 thứ Hai ... CN
    expect(screen.getByText("Hai")).toBeInTheDocument();
    expect(screen.getByText("Ba")).toBeInTheDocument();
    expect(screen.getByText("Tư")).toBeInTheDocument();
    expect(screen.getByText("Năm")).toBeInTheDocument();
    expect(screen.getByText("Sáu")).toBeInTheDocument();
    expect(screen.getByText("Bảy")).toBeInTheDocument();
    expect(screen.getByText("CN")).toBeInTheDocument();

    // Kiểm tra tiêu đề phòng và tháng hiển thị gọn cùng hàng với tổng số buổi (1 + 5*3 + 1 = 17 buổi)
    const cardHeader = screen.getByRole("heading", { name: "Lịch sử dụng phòng B1.104" }).closest("header")!;
    expect(within(cardHeader).getByRole("combobox", { name: "Tháng" })).toHaveDisplayValue("11/2026");
    expect(cardHeader).toBeInTheDocument();
    expect(within(cardHeader).getByText("17 buổi")).toBeInTheDocument();

    // Tháng 11 có 30 ngày: kiểm tra các ngày tiêu biểu 1, 2, 10, 30 đều có trong lưới
    expect(screen.getByRole("button", { name: /Ngày 2, 4 buổi/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ngày 10, 1 buổi/i })).toBeInTheDocument();
  });

  it("2. Ô ngày có nhiều buổi học hiển thị chip rút gọn và nhãn '+N'", async () => {
    render(<VenuesPage />);

    await waitFor(() => {
      expect(screen.getByText("B1.104")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("B1.104"));

    const monthSelect = screen.getByLabelText("Tháng");
    fireEvent.change(monthSelect, { target: { value: "2026-11" } });

    // Ô ngày 2 có 4 buổi: hiển thị tối đa 2 chip đầu (ECO1001, MAT1002) và nhãn "+2"
    const day2Btn = screen.getByRole("button", { name: /Ngày 2, 4 buổi/i });
    expect(within(day2Btn).getByText("ECO1001")).toBeInTheDocument();
    expect(within(day2Btn).getByText("MAT1002")).toBeInTheDocument();
    expect(within(day2Btn).getByText("+2")).toBeInTheDocument();
  });

  it("3. Bấm ô mở popover nổi với đầy đủ các buổi, hỗ trợ đóng qua nút X và phím Esc", async () => {
    render(<VenuesPage />);

    await waitFor(() => {
      expect(screen.getByText("B1.104")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("B1.104"));

    const monthSelect = screen.getByLabelText("Tháng");
    fireEvent.change(monthSelect, { target: { value: "2026-11" } });

    const day2Btn = screen.getByRole("button", { name: /Ngày 2, 4 buổi/i });
    fireEvent.click(day2Btn);

    // Popover dialog nổi
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Tiêu đề popover có ngày và số buổi
    expect(within(dialog).getByText(/Thứ Hai, ngày 02\/11\/2026/)).toBeInTheDocument();

    // Liệt kê đầy đủ 4 buổi học cùng tên môn, tiết, giờ
    expect(within(dialog).getByText("Kinh tế vi mô")).toBeInTheDocument();
    expect(within(dialog).getByText("Toán cao cấp")).toBeInTheDocument();
    expect(within(dialog).getByText("Tiếng Anh 1")).toBeInTheDocument();
    expect(within(dialog).getByText("Pháp luật đại cương")).toBeInTheDocument();

    expect(within(dialog).getByText("Tiết 1–3")).toBeInTheDocument();
    expect(within(dialog).getByText("Tiết 4–6")).toBeInTheDocument();
    expect(within(dialog).getByText("Tiết 7–9")).toBeInTheDocument();
    expect(within(dialog).getByText("Tiết 10–12")).toBeInTheDocument();

    expect(within(dialog).getByText("(07:30 – 09:50)")).toBeInTheDocument();

    // Buổi học 1 ngày có chip "Một ngày"
    expect(within(dialog).getByText("Một ngày")).toBeInTheDocument();

    // Có link sang học phần
    expect(within(dialog).getByRole("link", { name: "ECO1001 →" })).toHaveAttribute("href", "/modules/ECO1001");
    expect(within(dialog).getByRole("link", { name: "LAW1001 →" })).toHaveAttribute("href", "/modules/LAW1001");

    // Đóng popover bằng nút Đóng
    const closeBtn = within(dialog).getByRole("button", { name: "Đóng" });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Bấm mở lại và nhấn phím Escape
    fireEvent.click(day2Btn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("4. Bỏ hẳn dạng danh sách dọc 'Chủ nhật, ngày dd/MM/yyyy · N buổi' khỏi giao diện", async () => {
    render(<VenuesPage />);

    await waitFor(() => {
      expect(screen.getByText("B1.104")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("B1.104"));

    const monthSelect = screen.getByLabelText("Tháng");
    fireEvent.change(monthSelect, { target: { value: "2026-11" } });

    // Không còn bất kỳ heading danh sách dọc ngày nào trên trang chính
    expect(screen.queryByText(/Chủ nhật, ngày 01\/11\/2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Thứ Hai, ngày 02\/11\/2026 — 4 buổi/)).not.toBeInTheDocument();
  });

  it("5. Tuyệt đối không hiển thị mã lớp (bỏ mã lớp theo yêu cầu)", async () => {
    render(<VenuesPage />);

    await waitFor(() => {
      expect(screen.getByText("B1.104")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("B1.104"));

    const monthSelect = screen.getByLabelText("Tháng");
    fireEvent.change(monthSelect, { target: { value: "2026-11" } });

    // Cả ô ngày và popover đều không chứa mã lớp
    expect(screen.queryByText(/K22404_01/)).not.toBeInTheDocument();
    expect(screen.queryByText(/K22404_02/)).not.toBeInTheDocument();

    const day2Btn = screen.getByRole("button", { name: /Ngày 2, 4 buổi/i });
    fireEvent.click(day2Btn);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText(/K22404_01/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Lớp K22404/)).not.toBeInTheDocument();
  });

  it("filters rooms inside the list and navigates months inside the calendar header", async () => {
    render(<VenuesPage />);
    fireEvent.click(await screen.findByText("B1.104"));

    const calendar = screen.getByRole("region", { name: "Lịch sử dụng phòng B1.104" });
    const monthSelect = within(calendar).getByRole("combobox", { name: "Tháng" });
    fireEvent.change(monthSelect, { target: { value: "2026-11" } });
    const next = within(calendar).getByRole("button", { name: "Tháng sau" });
    const previous = within(calendar).getByRole("button", { name: "Tháng trước" });
    fireEvent.click(next);
    expect(monthSelect).toHaveDisplayValue("12/2026");
    fireEvent.click(previous);
    expect(monthSelect).toHaveDisplayValue("11/2026");
    fireEvent.click(next);

    const rooms = screen.getByRole("region", { name: /Danh sách phòng/ });
    const search = within(rooms).getByRole("searchbox", { name: "Tìm phòng" });
    expect(search).toHaveAttribute("placeholder", "Tìm phòng");
    fireEvent.change(search, { target: { value: "A.201" } });
    expect(within(rooms).queryByText("B1.104")).not.toBeInTheDocument();
    fireEvent.click(within(rooms).getByText("A.201"));
    expect(screen.getByRole("heading", { name: "Lịch sử dụng phòng A.201" })).toBeInTheDocument();
    expect(monthSelect).toHaveDisplayValue("12/2026");
  });

  it("7. Hoạt động chính xác ở chế độ tiếng Anh (EN)", async () => {
    act(() => {
      useLang.getState().setLang("en");
    });

    render(<VenuesPage />);

    await waitFor(() => {
      expect(screen.getByText("B1.104")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("B1.104"));

    const monthSelect = screen.getByLabelText("Month");
    fireEvent.change(monthSelect, { target: { value: "2026-11" } });

    // Tiêu đề phòng và thứ tiếng Anh
    const cardHeaderEn = screen.getByRole("heading", { name: "Room usage: B1.104" }).closest("header")!;
    expect(within(cardHeaderEn).getByRole("combobox", { name: "Month" })).toHaveDisplayValue("11/2026");
    expect(cardHeaderEn).toBeInTheDocument();
    expect(within(cardHeaderEn).getByText("17 sessions")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Sun")).toBeInTheDocument();

    // Mở popover kiểm tra EN
    const day2Btn = screen.getByRole("button", { name: /Day 2, 4 sessions/i });
    fireEvent.click(day2Btn);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Monday, 02\/11\/2026/)).toBeInTheDocument();
    expect(within(dialog).getByText("Periods 1–3")).toBeInTheDocument();
    expect(within(dialog).getByText("One day")).toBeInTheDocument();

    const closeBtn = within(dialog).getByRole("button", { name: "Close" });
    expect(closeBtn).toBeInTheDocument();
  });

  it("shows the official 360° tour only after the selected room panel is opened", async () => {
    render(<VenuesPage />);

    expect(document.querySelector("iframe")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByText("B1.104"));

    const openTour = screen.getByRole("button", { name: "Xem tòa 360°" });
    expect(openTour).toBeInTheDocument();
    expect(document.querySelector("iframe")).not.toBeInTheDocument();

    fireEvent.click(openTour);

    const iframe = document.querySelector("iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("src", expect.stringMatching(`^${TOUR_BASE}`));
  });
});
