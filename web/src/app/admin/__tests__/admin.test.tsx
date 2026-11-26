import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import AdminLoginPage from "../login/page";
import AdminOverviewPage from "../page";
import { AdminLayoutClient } from "@/components/admin/AdminLayoutClient";
import { Sidebar } from "@/components/admin/Sidebar";
import SettingsPage from "@/app/settings/page";
import { adminApi, AdminApiError } from "@/lib/adminApi";
import { mockAdminOverview, mockAdminUser, mockModeratorUser } from "@/mocks/admin";

// Mock next/navigation
const mockPush = vi.fn();
let mockPathname = "/admin";
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/lib/useMounted", () => ({
  useMounted: () => true,
}));

describe("Brief A1 & PLAN_ADMIN Mục 8: Admin Shell, Login, Layout & Overview", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockPush.mockClear();
    mockPathname = "/admin";
    mockSearchParams = new URLSearchParams();
  });

  describe("1. Trang đăng nhập quản trị (/admin/login)", () => {
    beforeEach(() => {
      mockPathname = "/admin/login";
    });

    it("hiển thị form đầy đủ trường email, mật khẩu và nút hiện/ẩn mật khẩu", () => {
      render(<AdminLoginPage />);
      expect(screen.getByLabelText(/Email quản trị/i)).toBeInTheDocument();
      const pwdInput = screen.getByLabelText(/^Mật khẩu$/i) as HTMLInputElement;
      expect(pwdInput).toBeInTheDocument();
      expect(pwdInput.type).toBe("password");

      const toggleBtn = screen.getByRole("button", { name: /Hiện mật khẩu/i });
      fireEvent.click(toggleBtn);
      expect(pwdInput.type).toBe("text");
      expect(screen.getByRole("button", { name: /Ẩn mật khẩu/i })).toBeInTheDocument();
    });

    it("login lỗi hiển thị thông báo inline trong form (không toast lớn)", async () => {
      vi.spyOn(adminApi, "login").mockRejectedValueOnce(
        new AdminApiError("Email hoặc mật khẩu không chính xác", 401)
      );

      render(<AdminLoginPage />);
      fireEvent.change(screen.getByLabelText(/Email quản trị/i), {
        target: { value: "wrong@uel.edu.vn" },
      });
      fireEvent.change(screen.getByLabelText(/^Mật khẩu$/i), {
        target: { value: "wrongpass" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Đăng nhập/i }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Email hoặc mật khẩu không chính xác");
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("login thành công chuyển hướng tới trang đích next hoặc /admin", async () => {
      mockSearchParams = new URLSearchParams("next=/admin/trends");
      vi.spyOn(adminApi, "login").mockResolvedValueOnce({
        user: mockAdminUser,
        csrf_token: "csrf-test",
      });

      render(<AdminLoginPage />);
      fireEvent.change(screen.getByLabelText(/Email quản trị/i), {
        target: { value: "admin@uel.edu.vn" },
      });
      fireEvent.change(screen.getByLabelText(/^Mật khẩu$/i), {
        target: { value: "correctpassword" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Đăng nhập/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/admin/trends");
      });
    });
  });

  describe("2. Sidebar & Phân quyền vai trò", () => {
    it("hiển thị đầy đủ 9 mục bao gồm 'Tài khoản quản trị' cho vai trò admin", () => {
      render(<Sidebar role="admin" />);
      expect(screen.getByText("Tổng quan")).toBeInTheDocument();
      expect(screen.getByText("Xu hướng chọn môn")).toBeInTheDocument();
      expect(screen.getByText("Kiểm duyệt")).toBeInTheDocument();
      expect(screen.getByText("Dữ liệu học phần")).toBeInTheDocument();
      expect(screen.getByText("Đề cương")).toBeInTheDocument();
      expect(screen.getByText("Lịch năm học & học kỳ")).toBeInTheDocument();
      expect(screen.getByText("Hệ thống & nhật ký")).toBeInTheDocument();
      expect(screen.getByText("Tài khoản quản trị")).toBeInTheDocument();
      expect(screen.getByText("Cài đặt quản trị")).toBeInTheDocument();
    });

    it("ẩn mục 'Tài khoản quản trị' đối với vai trò moderator", () => {
      render(<Sidebar role="moderator" />);
      expect(screen.getByText("Tổng quan")).toBeInTheDocument();
      expect(screen.queryByText("Tài khoản quản trị")).not.toBeInTheDocument();
      expect(screen.getByText("Kiểm duyệt")).toBeInTheDocument();
    });
  });

  describe("3. Layout Quản trị & Cơ chế Dev Mode / Bảo vệ Route", () => {
    it("hiển thị dải nhỏ cố định 'Chế độ phát triển — chưa có đăng nhập'", async () => {
      vi.spyOn(adminApi, "getMe").mockResolvedValueOnce(mockAdminUser);

      render(
        <AdminLayoutClient>
          <div data-testid="admin-content">Nội dung quản trị</div>
        </AdminLayoutClient>
      );

      expect(screen.getByText(/Chế độ phát triển — chưa có đăng nhập/i)).toBeInTheDocument();
      expect(await screen.findByTestId("admin-content")).toBeInTheDocument();
    });

    it("chuyển hướng sang /admin/login khi API trả về 404 (không có phiên đăng nhập)", async () => {
      vi.spyOn(adminApi, "getMe").mockRejectedValueOnce(
        new AdminApiError("Not Found", 404)
      );

      render(
        <AdminLayoutClient>
          <div data-testid="admin-content">Nội dung</div>
        </AdminLayoutClient>
      );

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/admin/login?next=%2Fadmin");
      });
      expect(screen.queryByText("Khu vực quản trị chưa bật")).not.toBeInTheDocument();
    });

    it("chuyển hướng sang /admin/login khi API trả về 401", async () => {
      vi.spyOn(adminApi, "getMe").mockRejectedValueOnce(
        new AdminApiError("Unauthorized", 401)
      );

      render(
        <AdminLayoutClient>
          <div data-testid="admin-content">Nội dung</div>
        </AdminLayoutClient>
      );

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("/admin/login"));
      });
    });
  });

  describe("4. Trang Tổng quan (/admin)", () => {
    it("hiển thị 6 thẻ KPI từ dữ liệu API/mock", async () => {
      vi.spyOn(adminApi, "getOverview").mockResolvedValueOnce(mockAdminOverview);

      render(<AdminOverviewPage />);

      expect(await screen.findByText("Người dùng ẩn danh (7 ngày)")).toBeInTheDocument();
      expect(screen.getByText("Người dùng ẩn danh (30 ngày)")).toBeInTheDocument();
      expect(screen.getByText("Lượt thêm TKB (7 ngày)")).toBeInTheDocument();
      expect(screen.getByText("Lượt thêm kế hoạch (7 ngày)")).toBeInTheDocument();
      expect(screen.getByText("Chờ kiểm duyệt")).toBeInTheDocument();
      expect(screen.getByText("Cần duyệt dữ liệu")).toBeInTheDocument();

      // Kiểm tra giá trị định dạng số
      expect(screen.getByText("1.240")).toBeInTheDocument();
      expect(screen.getByText("4.890")).toBeInTheDocument();
    });

    it("hiển thị danh sách việc cần làm liên kết tới mục tương ứng khi số liệu > 0", async () => {
      vi.spyOn(adminApi, "getOverview").mockResolvedValueOnce({
        ...mockAdminOverview,
        moderation_pending: 4,
        data_review_pending: 13,
      });

      render(<AdminOverviewPage />);

      expect(await screen.findByText(/Nội dung đang chờ kiểm duyệt \(4\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Học phần cần rà soát thông tin khoa \/ bộ môn \(13\)/i)).toBeInTheDocument();

      const modLink = screen.getByRole("link", { name: /Xử lý ngay →/i });
      expect(modLink).toHaveAttribute("href", "/admin/moderation");

      const dataLink = screen.getByRole("link", { name: /Rà soát →/i });
      expect(dataLink).toHaveAttribute("href", "/admin/data");
    });
  });

  describe("5. Lối vào tại trang Cài đặt (/settings)", () => {
    it("chỉ hiển thị liên kết nhỏ 'Quản trị' khi API quản trị phản hồi thành công (200)", async () => {
      vi.spyOn(adminApi, "checkAdminAvailability").mockResolvedValueOnce(true);

      render(<SettingsPage />);

      const adminLink = await screen.findByRole("link", { name: "Quản trị" });
      expect(adminLink).toBeInTheDocument();
      expect(adminLink).toHaveAttribute("href", "http://localhost:3100/admin");
    });

    it("ẩn liên kết 'Quản trị' khi API quản trị trả về lỗi hoặc 404", async () => {
      vi.spyOn(adminApi, "checkAdminAvailability").mockResolvedValueOnce(false);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByRole("link", { name: "Quản trị" })).not.toBeInTheDocument();
      });
    });
  });
});
