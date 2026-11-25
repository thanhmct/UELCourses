import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import TodayPage from "../page";
import { useLang } from "@/i18n";

vi.mock("@/lib/api", () => ({
  api: {
    classes: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

vi.mock("@/lib/useMounted", () => ({
  useMounted: () => true,
}));

vi.mock("@/lib/store", () => ({
  useSettings: Object.assign(
    (selector: (s: { setDefaultShowMap: () => void }) => unknown) => selector({ setDefaultShowMap: () => {} }),
    { getState: () => ({ defaultShowMap: localStorage.getItem("uelpath.today.showMap") === "1" }) },
  ),
  useTimetable: () => ({
    semester: "HK1 2024-2025",
    bySemester: { "HK1 2024-2025": [] },
    info: {},
  }),
}));

describe("TodayPage component", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/today");
    vi.useRealTimers();
    vi.restoreAllMocks();
    useLang.setState({ lang: "vi" });
    localStorage.removeItem("uelcourses-lang");
    localStorage.removeItem("uelpath.today.showMap");
  });

  it("hiển thị dữ liệu mẫu mà không cần ghi vào thời khóa biểu", () => {
    window.history.replaceState({}, "", "/today?demo=1");

    render(<TodayPage />);

    expect(screen.getAllByText("Nguyên lý kế toán").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Phân tích tài chính").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("Tích hợp quy trình kinh doanh với hệ thống ERP").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Lớp 261/)).not.toBeInTheDocument();
    expect(screen.queryByText("Đang trong giờ học")).not.toBeInTheDocument();
    expect(screen.queryByText("● Đang diễn ra")).not.toBeInTheDocument();
    expect(screen.queryByText(/Bây giờ là/)).not.toBeInTheDocument();
  });

  it("dùng bản đồ SVG, kích hoạt đúng tòa B2 và sân thể thao", () => {
    localStorage.setItem("uelpath.today.showMap", "1");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 23, 8, 0, 0));
    window.history.replaceState({}, "", "/today?demo=1");

    const { container } = render(<TodayPage />);

    expect(container.querySelector("iframe")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tòa B2" })).toHaveAttribute(
      "aria-current",
      "true",
    );

    fireEvent.click(
      screen.getByRole("button", { name: /BFB4007.*Phân tích tài chính/i }),
    );
    expect(screen.getByRole("button", { name: "Tòa A" })).toHaveAttribute(
      "aria-current",
      "true",
    );

    fireEvent.click(
      screen.getByRole("button", { name: /BAA2028.*Nguyên lý kế toán/i }),
    );
    expect(screen.getByRole("button", { name: "Tòa B2" })).toHaveAttribute(
      "aria-current",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /MI71.*Giáo dục thể chất 1/i }));
    expect(screen.getByRole("button", { name: "Khu thể dục thể thao" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(container.querySelector("svg")).toHaveAttribute("data-zoomed", "true");
  });

  it("không hiển thị hàng tiêu đề và phụ đề của trang", () => {
    render(<TodayPage />);
    expect(screen.queryByText("Lịch học hôm nay")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Xem nhanh các tiết học trong ngày, phòng học và giảng viên phụ trách."),
    ).toBeNull();
  });

  it("tách vùng cuộn lịch khỏi bản đồ và cho phép focus bằng bàn phím", () => {
    localStorage.setItem("uelpath.today.showMap", "1");
    render(<TodayPage />);

    const schedule = screen.getByRole("region", { name: "Lịch học hôm nay" });
    expect(schedule).toHaveAttribute("tabindex", "0");
    expect(schedule).toHaveClass("lg:overflow-y-auto", "lg:overscroll-y-contain");
    expect(schedule).not.toContainElement(screen.getByRole("group", { name: "Bản đồ khuôn viên UEL" }));
  });

  it("khi hôm nay không có lịch học: ẩn nhãn 'Môn:' và hiển thị 'Chúc mừng bạn đã được nghỉ ngơi!' chữ trắng", () => {
    render(<TodayPage />);
    expect(screen.queryByText("Môn:")).not.toBeInTheDocument();
    const dayOffTexts = screen.getAllByText("Chúc mừng bạn đã được nghỉ ngơi!");
    expect(dayOffTexts.length).toBeGreaterThanOrEqual(1);
    expect(dayOffTexts[0]).toHaveClass("text-white");
    expect(dayOffTexts[0]).not.toHaveClass("text-brand-100");
  });

  it("khi có tiết học tiếp theo: vẫn hiển thị nhãn 'Môn:'", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 23, 8, 0, 0));
    window.history.replaceState({}, "", "/today?demo=1");

    render(<TodayPage />);
    expect(screen.getByText("Môn:")).toBeInTheDocument();
  });

  it("hiển thị các tab chuyển lịch và không hiển thị các nút mũi tên ← → kế bên nút Hiện bản đồ", () => {
    render(<TodayPage />);
    const todayTab = screen.getByRole("tab", { name: /Hôm nay/i });
    const nextWeekTab = screen.getByRole("tab", { name: /Tuần sau/i });
    expect(todayTab).toBeInTheDocument();
    expect(nextWeekTab).toBeInTheDocument();

    // Không còn các nút mũi tên ← →
    expect(screen.queryByRole("button", { name: "Xem tuần sau" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Xem hôm nay/i })).not.toBeInTheDocument();
    expect(screen.queryByText("←")).not.toBeInTheDocument();
    expect(screen.queryByText("→")).not.toBeInTheDocument();

    // Bấm chuyển sang tab tuần sau
    fireEvent.click(nextWeekTab);
    expect(nextWeekTab).toHaveAttribute("aria-selected", "true");

    // Mỗi ngày trống chỉ hiện một thông báo bên dưới, không lặp ở dòng ngày.
    expect(screen.getAllByText("Không phải lên UEL")).toHaveLength(7);
    expect(document.querySelector("#panel-schedule")?.children).toHaveLength(7);

    // Bấm quay lại tab hôm nay & mai
    fireEvent.click(todayTab);
    expect(nextWeekTab).toHaveAttribute("aria-selected", "false");
    expect(todayTab).toHaveAttribute("aria-selected", "true");
  });

  it("hiển thị đồng hồ thời gian chạy mỗi giây", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 21, 10, 0, 0));

    render(<TodayPage />);
    const clock = screen.getByLabelText("live-clock");
    expect(clock).toBeInTheDocument();
    // Đồng hồ có định dạng HH:mm:ss
    expect(clock.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(clock.textContent).toBe("10:00:00");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(clock.textContent).toBe("10:00:01");
  });
});
