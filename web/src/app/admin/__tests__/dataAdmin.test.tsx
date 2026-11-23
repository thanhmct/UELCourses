import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import AdminDataPage from "../data/page";
import AdminOutlinesPage from "../outlines/page";
import { adminApi } from "@/lib/adminApi";
import {
  mockFaculties,
  mockFacultyReview,
  mockOutlinesCoverage,
  mockOutlinesDriveLinks,
  mockOutlinesMissing,
  mockOutlinesOcrPending,
} from "@/mocks/admin";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/admin/data",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Brief A4: Quản trị dữ liệu học phần và độ phủ đề cương", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("1. Trang Dữ liệu học phần (/admin/data)", () => {
    beforeEach(() => {
      vi.spyOn(adminApi, "getFaculties").mockResolvedValue(mockFaculties);
      vi.spyOn(adminApi, "getFacultyReview").mockResolvedValue({
        items: [
          {
            code: "BIM5001",
            name: "Cơ sở dữ liệu",
            credits: 3,
            faculty: "Phòng Đào tạo",
            department: null,
            faculty_source: null,
            suggestion: {
              faculty: "Khoa Hệ thống thông tin",
              source: "outline",
              confidence: "Đề cương",
            },
            reason: "cần duyệt: tên ghép khoa/bộ môn",
            open_classes_count: 8,
            program_count: 5,
          },
          {
            code: "KTE2001",
            name: "Kinh tế vi mô",
            credits: 3,
            faculty: "Khoa Kinh tế đối ngoại",
            department: "Bộ môn Kinh tế học",
            faculty_source: null,
            suggestion: {
              faculty: "Khoa Kinh tế",
              source: "prefix",
              confidence: "100.0%",
            },
            reason: "mâu thuẫn tiền tố: Khoa Kinh tế đối ngoại vs Khoa Kinh tế",
            open_classes_count: 12,
            program_count: 7,
          },
        ],
        total: 2,
        page: 1,
        size: 20,
        counts: {
          needs_review: 2,
          prefix_conflict: 1,
          no_source: 1,
          admin_modified: 0,
        },
      });
      vi.spyOn(adminApi, "patchModuleFaculty").mockResolvedValue({ success: true });
      vi.spyOn(adminApi, "bulkFacultyReview").mockResolvedValue({ success: true, updated_count: 2 });
    });

    it("hiển thị tiêu đề, các tab con và bảng danh sách học phần", async () => {
      render(<AdminDataPage />);
      expect(screen.getByText("Quản trị dữ liệu học phần")).toBeInTheDocument();

      // Kiểm tra 4 tab con
      expect(await screen.findByText(/Cần duyệt khoa/i)).toBeInTheDocument();
      expect(screen.getByText(/Xung đột tiền tố/i)).toBeInTheDocument();
      expect(screen.getByText(/Chưa có nguồn/i)).toBeInTheDocument();
      expect(screen.getByText(/Đã chỉnh tay/i)).toBeInTheDocument();

      // Kiểm tra các dòng bảng
      expect(await screen.findByText("BIM5001")).toBeInTheDocument();
      expect(screen.getByText("Cơ sở dữ liệu")).toBeInTheDocument();
      expect(screen.getByText("KTE2001")).toBeInTheDocument();
      expect(screen.getByText("Kinh tế vi mô")).toBeInTheDocument();

      // Kiểm tra link mở môn ở tab mới
      const link = screen.getByRole("link", { name: /BIM5001/i });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("href", "/modules/BIM5001");
    });

    it("chọn khoa và bấm Lưu: gọi patchModuleFaculty và kích hoạt hiệu ứng lưu thành công", async () => {
      render(<AdminDataPage />);
      expect(await screen.findByText("BIM5001")).toBeInTheDocument();

      // Tìm nút Lưu cho môn BIM5001
      const saveButtons = screen.getAllByRole("button", { name: /Lưu/i });
      fireEvent.click(saveButtons[0]);

      await waitFor(() => {
        expect(adminApi.patchModuleFaculty).toHaveBeenCalledWith(
          "BIM5001",
          expect.objectContaining({
            faculty: "Phòng Đào tạo",
          })
        );
      });

      // Hiển thị trạng thái đã lưu
      expect(await screen.findByText("Đã lưu")).toBeInTheDocument();
    });

    it("bấm nút Nhận đề xuất: tự động cập nhật khoa theo đề xuất chuẩn hóa", async () => {
      render(<AdminDataPage />);
      expect(await screen.findByText("BIM5001")).toBeInTheDocument();

      const acceptBtn = screen.getAllByRole("button", { name: /Nhận đề xuất/i })[0];
      fireEvent.click(acceptBtn);

      await waitFor(() => {
        expect(adminApi.patchModuleFaculty).toHaveBeenCalledWith(
          "BIM5001",
          expect.objectContaining({
            faculty: "Khoa Hệ thống thông tin",
          })
        );
      });
    });

    it("chọn nhiều môn và thực hiện thao tác hàng loạt (Bulk actions)", async () => {
      render(<AdminDataPage />);
      expect(await screen.findByText("BIM5001")).toBeInTheDocument();

      // Checkbox chọn tất cả
      const selectAllCheckbox = screen.getByLabelText("Chọn tất cả");
      fireEvent.click(selectAllCheckbox);

      // Thanh thao tác hàng loạt xuất hiện
      expect(await screen.findByText("Đã chọn 2 mục")).toBeInTheDocument();

      // Bấm nút Nhận đề xuất hàng loạt
      const bulkAcceptBtn = screen.getByRole("button", { name: /Nhận đề xuất \(2\)/i });
      fireEvent.click(bulkAcceptBtn);

      await waitFor(() => {
        expect(adminApi.bulkFacultyReview).toHaveBeenCalledWith({
          codes: ["BIM5001", "KTE2001"],
          action: "accept_suggestion",
        });
      });
    });

    it("tìm kiếm và lọc theo tiền tố mã", async () => {
      render(<AdminDataPage />);
      expect(await screen.findByText("BIM5001")).toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText(/Tìm theo mã môn/i);
      fireEvent.change(searchInput, { target: { value: "KTE" } });

      await waitFor(() => {
        expect(adminApi.getFacultyReview).toHaveBeenCalledWith(
          expect.objectContaining({
            q: "KTE",
          })
        );
      });
    });
  });

  describe("2. Trang Độ phủ đề cương (/admin/outlines)", () => {
    beforeEach(() => {
      vi.spyOn(adminApi, "getOutlinesCoverage").mockResolvedValue(mockOutlinesCoverage);
      vi.spyOn(adminApi, "getOutlinesMissing").mockResolvedValue(mockOutlinesMissing);
      vi.spyOn(adminApi, "getOutlinesOcrPending").mockResolvedValue(mockOutlinesOcrPending);
      vi.spyOn(adminApi, "getOutlinesDriveLinks").mockResolvedValue(mockOutlinesDriveLinks);
    });

    it("hiển thị thẻ thống kê tổng quan độ phủ và thanh ngang SVG theo khoa", async () => {
      render(<AdminOutlinesPage />);
      expect(screen.getByText("Độ phủ đề cương học phần")).toBeInTheDocument();

      // Thẻ KPI tổng
      expect(await screen.findByText("1486")).toBeInTheDocument();
      expect(screen.getByText("450")).toBeInTheDocument();
      expect(screen.getAllByText("30.3%").length).toBeGreaterThan(0);

      // Độ phủ theo khoa
      expect(screen.getByText("Độ phủ đề cương theo từng khoa")).toBeInTheDocument();
      const facultyCoverageSection = screen.getByTestId("faculty-coverage-section");
      expect(within(facultyCoverageSection).getByText("Khoa Hệ thống thông tin")).toBeInTheDocument();
      expect(within(facultyCoverageSection).getByText("Khoa Quản trị kinh doanh")).toBeInTheDocument();
    });

    it("hiển thị danh sách học phần thiếu đề cương kèm số lớp mở và bản tương ứng", async () => {
      render(<AdminOutlinesPage />);
      expect(await screen.findByText("Danh sách học phần còn thiếu đề cương")).toBeInTheDocument();

      // Học phần thiếu
      expect(screen.getByText("BBU4025")).toBeInTheDocument();
      expect(screen.getByText("Khởi nghiệp kinh doanh")).toBeInTheDocument();
      expect(screen.getByText("14 lớp")).toBeInTheDocument();

      // Bản tương ứng có đề cương
      expect(screen.getByText("EBBU4025")).toBeInTheDocument();
      expect(screen.getByText("Đã có đề cương")).toBeInTheDocument();
    });

    it("hiển thị tài liệu scan chờ OCR và danh sách link Drive kèm ghi chú an toàn", async () => {
      render(<AdminOutlinesPage />);
      // OCR pending
      expect(await screen.findByText(/Tài liệu scan chờ chạy OCR/i)).toBeInTheDocument();
      expect(screen.getByText("DeCuong_Scan_KhoaLuat_2023.pdf")).toBeInTheDocument();

      // Drive links
      expect(screen.getByText(/Liên kết Google Drive \/ Docs chờ đồng ý/i)).toBeInTheDocument();
      expect(screen.getByText(/Cần chủ dự án đồng ý trước khi tải/i)).toBeInTheDocument();
      expect(screen.getByText("Đề cương HTTT Quản lý")).toBeInTheDocument();
    });
  });
});
