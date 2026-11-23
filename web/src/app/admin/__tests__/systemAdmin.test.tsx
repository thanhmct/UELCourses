import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import AdminSystemPage from "../system/page";
import AdminAuditPage from "../audit/page";
import AdminUsersPage from "../users/page";
import AdminSettingsPage from "../settings/page";
import { adminApi } from "@/lib/adminApi";
import {
  mockAdminSettings,
  mockAdminUsers,
  mockAuditLogs,
  mockSystemInfo,
} from "@/mocks/admin";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/admin/system",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Brief A6: Hệ thống, Nhật ký, Tài khoản & Cài đặt quản trị", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("1. Trang Trạng thái hệ thống (/admin/system)", () => {
    beforeEach(() => {
      vi.spyOn(adminApi, "getSystemInfo").mockResolvedValue(mockSystemInfo);
    });

    it("hiển thị đầy đủ các thẻ KPI trạng thái hệ thống từ API mock", async () => {
      render(<AdminSystemPage />);

      expect(await screen.findByText("Cơ sở dữ liệu")).toBeInTheDocument();
      expect(screen.getByText("Alembic Head / Rev")).toBeInTheDocument();
      expect(screen.getByText("Lần nạp dữ liệu")).toBeInTheDocument();
      expect(screen.getByText("Lỗi hệ thống 24h")).toBeInTheDocument();

      // Kiểm tra giá trị
      expect(screen.getByText("0021")).toBeInTheDocument();
      expect(screen.getByText(/v0.1.0/i)).toBeInTheDocument();
      expect(screen.getByText("modules")).toBeInTheDocument();
      expect(screen.getByText("1.420")).toBeInTheDocument();
    });

    it("cho phép lọc tìm kiếm tên bảng trong bảng thống kê dung lượng", async () => {
      render(<AdminSystemPage />);

      await screen.findByText("modules");
      expect(screen.getByText("lessons")).toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText(/Lọc tên bảng/i);
      fireEvent.change(searchInput, { target: { value: "analytic" } });

      expect(screen.getByText("analytics_events")).toBeInTheDocument();
      expect(screen.queryByText("modules")).not.toBeInTheDocument();
    });
  });

  describe("2. Trang Nhật ký thao tác quản trị (/admin/audit)", () => {
    beforeEach(() => {
      vi.spyOn(adminApi, "getAuditLogs").mockResolvedValue({
        items: mockAuditLogs,
        total: mockAuditLogs.length,
        page: 1,
        page_size: 50,
        total_pages: 1,
      });
    });

    it("hiển thị danh sách nhật ký thao tác và mở hộp thoại So sánh JSON (diff)", async () => {
      render(<AdminAuditPage />);

      expect(await screen.findByText("update_faculty")).toBeInTheDocument();
      expect(screen.getAllByText("admin@uel.edu.vn")[0]).toBeInTheDocument();
      expect(screen.getByText("create_user")).toBeInTheDocument();

      // Bấm nút "So sánh JSON"
      const diffButtons = screen.getAllByRole("button", { name: /So sánh JSON/i });
      fireEvent.click(diffButtons[0]);

      // Mở modal so sánh
      expect(await screen.findByText("Chi tiết thay đổi dữ liệu (Before / After)")).toBeInTheDocument();
      expect(screen.getByText(/Dữ liệu trước thay đổi/i)).toBeInTheDocument();
      expect(screen.getByText(/Dữ liệu sau thay đổi/i)).toBeInTheDocument();
      expect(screen.getByText(/Khoa Hệ thống thông tin/i)).toBeInTheDocument();

      // Bấm Đóng modal
      fireEvent.click(screen.getByRole("button", { name: /^Đóng$/i }));
      await waitFor(() => {
        expect(screen.queryByText("Chi tiết thay đổi dữ liệu (Before / After)")).not.toBeInTheDocument();
      });
    });
  });

  describe("3. Trang Tài khoản quản trị & Phân quyền (/admin/users)", () => {
    beforeEach(() => {
      vi.spyOn(adminApi, "getUsers").mockResolvedValue(mockAdminUsers);
    });

    it("hiển thị danh sách tài khoản quản trị viên và các vai trò", async () => {
      render(<AdminUsersPage />);

      expect(await screen.findByText("admin@uel.edu.vn")).toBeInTheDocument();
      expect(screen.getByText("moderator@uel.edu.vn")).toBeInTheDocument();
      expect(screen.getByText("editor@uel.edu.vn")).toBeInTheDocument();
    });

    it("tạo tài khoản mới hiển thị hộp MẬT KHẨU TẠM THỜI MỘT LẦN duy nhất kèm cảnh báo", async () => {
      const mockNewUser = {
        id: 99,
        email: "tester@uel.edu.vn",
        role: "moderator" as const,
        is_active: true,
        failed_attempts: 0,
        locked_until: null,
        last_login_at: null,
        created_at: new Date().toISOString(),
      };
      vi.spyOn(adminApi, "createUser").mockResolvedValueOnce({
        user: mockNewUser,
        temporary_password: "TempPass9988!@#$",
        message: "Tài khoản đã được tạo thành công.",
      });

      render(<AdminUsersPage />);
      await screen.findByText("admin@uel.edu.vn");

      // Mở modal thêm tài khoản
      fireEvent.click(screen.getByRole("button", { name: /\+ Thêm tài khoản quản trị/i }));
      expect(screen.getByText("Thêm tài khoản quản trị mới")).toBeInTheDocument();

      // Nhập form
      fireEvent.change(screen.getByPlaceholderText("admin@uel.edu.vn"), {
        target: { value: "tester@uel.edu.vn" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Tạo tài khoản" }));

      // Kiểm tra hộp hiển thị mật khẩu tạm một lần
      expect(await screen.findByText(/MẬT KHẨU TẠM THỜI/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Mật khẩu này CHỈ HIỂN THỊ MỘT LẦN DUY NHẤT này/i)
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue("TempPass9988!@#$")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Sao chép/i })).toBeInTheDocument();
    });

    it("đặt lại mật khẩu của người dùng hiển thị mật khẩu tạm mới", async () => {
      vi.spyOn(adminApi, "resetPassword").mockResolvedValueOnce({
        user_id: 2,
        temporary_password: "ResetTempPass4321!",
        message: "Mật khẩu tạm đã được tạo.",
      });

      render(<AdminUsersPage />);
      await screen.findByText("moderator@uel.edu.vn");

      const resetBtns = screen.getAllByRole("button", { name: "Đặt lại mật khẩu" });
      fireEvent.click(resetBtns[1]); // User thứ 2

      expect(await screen.findByText(/MẬT KHẨU TẠM THỜI/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue("ResetTempPass4321!")).toBeInTheDocument();
    });

    it("khối đổi mật khẩu của tôi báo lỗi nếu mật khẩu xác nhận không khớp", async () => {
      render(<AdminUsersPage />);
      await screen.findByText("admin@uel.edu.vn");

      const currentInput = screen.getByLabelText(/Mật khẩu hiện tại/i);
      const newInput = screen.getByLabelText(/^Mật khẩu mới/i);
      const confirmInput = screen.getByLabelText(/Xác nhận mật khẩu mới/i);

      fireEvent.change(currentInput, { target: { value: "oldpass123" } });
      fireEvent.change(newInput, { target: { value: "newsecret456!" } });
      fireEvent.change(confirmInput, { target: { value: "mismatchsecret789!" } });

      fireEvent.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));

      const alertMsg = await screen.findByRole("alert");
      expect(alertMsg).toHaveTextContent(/không khớp/i);
    });
  });

  describe("4. Trang Cài đặt quản trị (/admin/settings)", () => {
    beforeEach(() => {
      vi.spyOn(adminApi, "getSettings").mockResolvedValue(mockAdminSettings);
      vi.spyOn(adminApi, "updateSettings").mockResolvedValue({
        ...mockAdminSettings,
        moderation_mode: "post",
        analytics_retention_days: 90,
      });
    });

    it("hiển thị cài đặt từ mock và lưu thành công với thông báo inline", async () => {
      render(<AdminSettingsPage />);

      expect(await screen.findByText("Chế độ kiểm duyệt nội dung")).toBeInTheDocument();
      expect(screen.getByText("Thu thập dữ liệu phân tích xu hướng ẩn danh")).toBeInTheDocument();
      expect(screen.getByDisplayValue("180")).toBeInTheDocument();

      // Đổi sang post-moderation
      const postRadio = screen.getByLabelText(/Kiểm duyệt sau/i);
      fireEvent.click(postRadio);

      // Đổi ngày retention
      const retentionInput = screen.getByDisplayValue("180");
      fireEvent.change(retentionInput, { target: { value: "90" } });

      // Lưu cài đặt
      fireEvent.click(screen.getByRole("button", { name: "Lưu cài đặt" }));

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Đã lưu cài đặt quản trị thành công."
      );
    });
  });
});
