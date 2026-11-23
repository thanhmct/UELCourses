import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import TodayPage from "../page";
import { sceneForPlace, tourUrl } from "@/lib/campusTour";

vi.mock("@/lib/api", () => ({
  api: {
    classes: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

vi.mock("@/lib/useMounted", () => ({
  useMounted: () => true,
}));

vi.mock("@/lib/store", () => ({
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
  });

  it("hiển thị dữ liệu mẫu mà không cần ghi vào thời khóa biểu", () => {
    window.history.replaceState({}, "", "/today?demo=1");

    render(<TodayPage />);

    expect(screen.getByText("Dữ liệu mẫu")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thoát xem thử" })).toHaveAttribute("href", "/today");
    expect(screen.getAllByText("Nguyên lý kế toán").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Phân tích tài chính")).toBeInTheDocument();
    expect(
      screen.getAllByText("Tích hợp quy trình kinh doanh với hệ thống ERP").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Lớp 261/)).not.toBeInTheDocument();
    expect(screen.queryByText("Đang trong giờ học")).not.toBeInTheDocument();
    expect(screen.queryByText("● Đang diễn ra")).not.toBeInTheDocument();
    expect(screen.queryByText(/Bây giờ là/)).not.toBeInTheDocument();
  });

  it("dùng bản đồ SVG, kích hoạt đúng tòa B2 và sân thể thao", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 23, 8, 0, 0));
    window.history.replaceState({}, "", "/today?demo=1");

    const { container } = render(<TodayPage />);

    expect(container.querySelector("iframe")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tòa nhà B2" })).toHaveAttribute(
      "aria-current",
      "true",
    );

    fireEvent.click(
      screen.getByRole("button", { name: /BFB4007.*Phân tích tài chính/i }),
    );
    expect(screen.getByRole("button", { name: "Tòa nhà A" })).toHaveAttribute(
      "aria-current",
      "true",
    );

    fireEvent.click(
      screen.getByRole("button", { name: /BAA2028.*Nguyên lý kế toán/i }),
    );
    expect(screen.getByRole("button", { name: "Tòa nhà B2" })).toHaveAttribute(
      "aria-current",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /MI71.*Giáo dục thể chất 1/i }));
    expect(screen.getByRole("button", { name: "Sân thể thao" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(container.querySelector("svg")).toHaveAttribute("data-zoomed", "true");
    expect(screen.getByRole("link", { name: "Xem 360°" })).toHaveAttribute(
      "href",
      tourUrl(sceneForPlace("sports")),
    );
  });

  it("hiển thị tiêu đề trang và KHÔNG hiển thị phụ đề (today.subtitle)", () => {
    render(<TodayPage />);
    expect(screen.getByText("Lịch học hôm nay")).toBeInTheDocument();
    expect(
      screen.queryByText("Xem nhanh các tiết học trong ngày, phòng học và giảng viên phụ trách."),
    ).toBeNull();
  });

  it("khi hôm nay không có lịch học: hiển thị 'Chúc mừng bạn đã được nghỉ ngơi!'", () => {
    render(<TodayPage />);
    // Xuất hiện trong banner tiếp theo và/hoặc danh sách rỗng
    const dayOffTexts = screen.getAllByText("Chúc mừng bạn đã được nghỉ ngơi!");
    expect(dayOffTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("hiển thị các tab và các mũi tên chuyển tab bên phải", () => {
    render(<TodayPage />);
    // Tab tuần sau luôn có
    const nextWeekTab = screen.getByRole("tab", { name: /Tuần sau/i });
    expect(nextWeekTab).toBeInTheDocument();

    // Mũi tên chuyển tab
    const nextArrow = screen.getByRole("button", { name: "Xem tuần sau" });
    expect(nextArrow).toBeInTheDocument();

    // Bấm chuyển sang tab tuần sau
    fireEvent.click(nextWeekTab);
    expect(nextWeekTab).toHaveAttribute("aria-selected", "true");

    // Ngày không có lớp được ẩn hoàn toàn, không còn khung trạng thái rỗng.
    expect(screen.queryByText("Không phải lên UEL")).not.toBeInTheDocument();
    expect(document.querySelector("#panel-schedule")?.children).toHaveLength(0);

    // Mũi tên quay lại tab hôm nay & mai
    const prevArrow = screen.getByRole("button", { name: /Xem hôm nay/i });
    expect(prevArrow).toBeInTheDocument();
    expect(prevArrow).not.toBeDisabled();
    fireEvent.click(prevArrow);
    expect(nextWeekTab).toHaveAttribute("aria-selected", "false");
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
