import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import AdminFeedbackPage from "../feedback/page";
import { Sidebar } from "@/components/admin/Sidebar";
import { adminApi } from "@/lib/adminApi";
import type { AdminFeedbackDetail, AdminFeedbackSummaryResponse } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/admin/feedback",
  useSearchParams: () => new URLSearchParams(),
}));

const mockSummary: AdminFeedbackSummaryResponse = {
  feedback_stats: {
    total: 10,
    average_rating: 4.3,
    rating_distribution: { "1": 0, "2": 1, "3": 1, "4": 2, "5": 6 },
  },
  reviews_stats: {
    total: 5,
    average_rating: 4.4,
    by_module: [
      {
        module_code: "BIM5001",
        module_name: "Cơ sở dữ liệu",
        count: 3,
        average_rating: 4.67,
      },
      {
        module_code: "ACC1001",
        module_name: "Nguyên lý kế toán",
        count: 2,
        average_rating: 4.0,
      },
    ],
  },
  items: [
    {
      id: 101,
      page: "/search",
      category: "ux",
      rating: 5,
      message: "Trang tìm kiếm rất mượt, lọc học phần nhanh chóng và chính xác.",
      created_at: "2026-11-25T10:00:00Z",
      app_version: "1.4.0",
      status: "pending",
    },
    {
      id: 102,
      page: "/timetable",
      category: "bug",
      rating: 2,
      message: "Khi chọn nhiều lớp cùng lúc đôi khi bị trễ nhẹ.",
      created_at: "2026-11-24T09:00:00Z",
      app_version: "1.3.9",
      status: "approved",
    },
  ],
  total: 2,
  page: 1,
  size: 20,
};

const mockDetail: AdminFeedbackDetail = {
  ...mockSummary.items[0],
  contact: "sinhvien@uel.edu.vn",
  is_quick_rating: false,
};

describe("Admin Feedback & Star Ratings Page (/admin/feedback)", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "getFeedbackSummary").mockResolvedValue(mockSummary);
    vi.spyOn(adminApi, "getFeedbackDetail").mockResolvedValue(mockDetail);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("hiển thị mục Góp ý và đánh giá sao trong Sidebar", () => {
    render(<Sidebar role="admin" />);
    const link = screen.getByRole("link", { name: /Góp ý và đánh giá sao/i });
    expect(link).toHaveAttribute("href", "/admin/feedback");
  });

  it("hiển thị KPI sao cộng dồn, phân bố 1-5 sao và bảng góp ý văn bản", async () => {
    render(<AdminFeedbackPage />);

    expect(screen.getByRole("heading", { name: /Góp ý và đánh giá sao/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("4.30 ★")).toBeInTheDocument();
      expect(screen.getByText("4.40 ★")).toBeInTheDocument();
    });

    expect(screen.getByText(/Tổng số lượt đánh giá \(10 lượt\)/i)).toBeInTheDocument();
    expect(screen.getByText("/search")).toBeInTheDocument();
    expect(screen.getByText(/Trang tìm kiếm rất mượt/i)).toBeInTheDocument();
  });

  it("lọc theo sao gọi lại API với tham số rating", async () => {
    render(<AdminFeedbackPage />);

    await waitFor(() => {
      expect(screen.getByText("/search")).toBeInTheDocument();
    });

    const fiveStarBtn = screen.getByRole("button", { name: "5 sao" });
    await act(async () => {
      fireEvent.click(fiveStarBtn);
    });

    await waitFor(() => {
      expect(adminApi.getFeedbackSummary).toHaveBeenCalledWith({
        page: 1,
        size: 20,
        rating: 5,
      });
    });
  });

  it("chuyển sang tab Đánh giá theo học phần hiển thị danh sách học phần", async () => {
    render(<AdminFeedbackPage />);

    await waitFor(() => {
      expect(screen.getByText("/search")).toBeInTheDocument();
    });

    const modulesTab = screen.getByRole("button", { name: /Đánh giá theo học phần/i });
    fireEvent.click(modulesTab);

    await waitFor(() => {
      expect(screen.getByText("BIM5001")).toBeInTheDocument();
      expect(screen.getByText("Cơ sở dữ liệu")).toBeInTheDocument();
      expect(screen.getByText("4.67")).toBeInTheDocument();
    });
  });

  it("bấm vào dòng góp ý mở modal chi tiết hiển thị đầy đủ nội dung", async () => {
    render(<AdminFeedbackPage />);

    const msgButton = await screen.findByRole("button", {
      name: /Trang tìm kiếm rất mượt/i,
    });

    await act(async () => {
      fireEvent.click(msgButton);
    });

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    await waitFor(() => {
      expect(adminApi.getFeedbackDetail).toHaveBeenCalledWith(101);
      expect(screen.getByText("sinhvien@uel.edu.vn")).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole("button", { name: "Đóng" });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
