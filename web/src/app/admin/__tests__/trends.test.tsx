import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import AdminTrendsPage from "../trends/page";
import { adminApi } from "@/lib/adminApi";
import {
  mockAdminOverview,
  mockTrendClasses,
  mockTrendConflicts,
  mockTrendModules,
  mockTrendPairs,
  mockTrendSearches,
  mockTrendSlots,
} from "@/mocks/admin";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/admin/trends",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock useSemesters
vi.mock("@/lib/semesters", () => ({
  useSemesters: () => ({
    data: [
      { id: "2026-2027-1", name: "Học kỳ 1 năm học 2026-2027", is_current: true },
      { id: "2025-2026-2", name: "Học kỳ 2 năm học 2025-2026", is_current: false },
    ],
    current: { id: "2026-2027-1", name: "Học kỳ 1 năm học 2026-2027", is_current: true },
  }),
}));

describe("Brief A2: Admin Trends Page (/admin/trends)", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "getTrendsModules").mockResolvedValue({ modules: mockTrendModules });
    vi.spyOn(adminApi, "getTrendsPairs").mockResolvedValue({ pairs: mockTrendPairs });
    vi.spyOn(adminApi, "getTrendsSlots").mockResolvedValue({ slots: mockTrendSlots });
    vi.spyOn(adminApi, "getTrendsConflicts").mockResolvedValue(mockTrendConflicts);
    vi.spyOn(adminApi, "getTrendsSearch").mockResolvedValue({ searches: mockTrendSearches });
    vi.spyOn(adminApi, "getTrendsClasses").mockResolvedValue({
      module_code: "BIM5001",
      classes: mockTrendClasses,
    });
    vi.spyOn(adminApi, "getOverview").mockResolvedValue(mockAdminOverview);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("hiển thị đầy đủ tiêu đề, bộ lọc và các khối số liệu từ mock API", async () => {
    render(<AdminTrendsPage />);

    // Kiểm tra tiêu đề chính
    expect(screen.getByText(/Xu hướng chọn môn/i)).toBeInTheDocument();

    // Chờ dữ liệu tải xong
    await waitFor(() => {
      expect(screen.getAllByText("BIM5001")[0]).toBeInTheDocument();
      expect(screen.getAllByText("Cơ sở dữ liệu")[0]).toBeInTheDocument();
    });

    // Khối Top môn
    expect(screen.getAllByText("Toán cao cấp 1")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Kinh tế vi mô")[0]).toBeInTheDocument();

    // Khối xung đột TKB
    expect(screen.getByText("4.9%")).toBeInTheDocument();

    // Khối từ khóa không ra kết quả
    expect(screen.getByText("machine learning")).toBeInTheDocument();
    expect(screen.getByText("khoa học dữ liệu")).toBeInTheDocument();
  });

  it("bản đồ nhiệt Thứ × Tiết vẽ đúng 112 ô tương ứng 7 ngày × 16 tiết", async () => {
    const { container } = render(<AdminTrendsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("BIM5001")[0]).toBeInTheDocument();
    });

    // 7 ngày (Thứ 2 đến Chủ nhật) × 16 tiết = 112 rect ô học
    const heatmapSvg = screen.getByRole("img", { name: /Bản đồ nhiệt phân bổ lịch học/i });
    expect(heatmapSvg).toBeInTheDocument();

    const rects = heatmapSvg.querySelectorAll("rect");
    expect(rects.length).toBe(112);
  });

  it("bấm 'Xem lớp' hiển thị danh sách lớp chi tiết của môn đó", async () => {
    render(<AdminTrendsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("BIM5001")[0]).toBeInTheDocument();
    });

    const viewClassButtons = screen.getAllByRole("button", { name: /Xem lớp/i });
    expect(viewClassButtons.length).toBeGreaterThan(0);

    // Bấm xem lớp môn đầu tiên (BIM5001)
    await act(async () => {
      fireEvent.click(viewClassButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText("BIM5001_01")).toBeInTheDocument();
      expect(screen.getByText("BIM5001_02")).toBeInTheDocument();
    });
  });

  it("thay đổi khoảng thời gian lọc (7, 30, 90 ngày) kích hoạt tải lại dữ liệu", async () => {
    render(<AdminTrendsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("BIM5001")[0]).toBeInTheDocument();
    });

    const btn7d = screen.getByRole("button", { name: /7 ngày qua/i });
    await act(async () => {
      fireEvent.click(btn7d);
    });

    expect(adminApi.getTrendsModules).toHaveBeenCalledWith(
      expect.objectContaining({
        range: 7,
      })
    );
  });
});
