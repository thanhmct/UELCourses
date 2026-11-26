import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import AdminModerationPage from "../moderation/page";
import { ModuleReviews } from "@/components/ModuleReviews";
import { adminApi, AdminApiError } from "@/lib/adminApi";
import { api } from "@/lib/api";
import { mockBannedTerms, mockModerationQueue } from "@/mocks/admin";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/admin/moderation",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Brief A3: Kiểm duyệt nội dung & Đánh giá bình luận học phần", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("1. Khối Đánh giá & bình luận trên trang chi tiết môn học (ModuleReviews)", () => {
    beforeEach(() => {
      vi.spyOn(api, "moduleComments").mockResolvedValue({
        data: {
          items: [
            {
              id: 1,
              module_code: "BIM5001",
              body: "Môn học hay, thầy cô nhiệt tình",
              rating: 5,
              author_name: "Sinh viên ẩn danh",
              status: "approved",
              created_at: "2026-11-22T08:00:00Z",
            },
          ],
          total: 1,
          page: 1,
          size: 20,
          average_rating: 5.0,
        },
        mock: true,
      });
    });

    it("hiển thị đầy đủ mặc định (không có nút thu gọn/mở rộng)", async () => {
      render(<ModuleReviews moduleCode="BIM5001" />);
      expect(screen.getByText("Đánh giá và bình luận")).toBeInTheDocument();
      // Hiển thị nội dung bình luận đã duyệt ngay, không cần bấm mở rộng
      expect(await screen.findByText("Môn học hay, thầy cô nhiệt tình")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Xem bình luận/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Thu gọn bình luận/i })).not.toBeInTheDocument();
    });

    it("hiển thị danh sách bình luận đã duyệt và form gửi bình luận ngay khi tải", async () => {
      render(<ModuleReviews moduleCode="BIM5001" />);

      // Hiển thị nội dung bình luận đã duyệt
      expect(await screen.findByText("Môn học hay, thầy cô nhiệt tình")).toBeInTheDocument();
      expect(screen.getByText("Sinh viên ẩn danh")).toBeInTheDocument();

      // Hiển thị textarea và nút gửi
      expect(screen.getByLabelText("Nội dung bình luận")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Gửi bình luận" })).toBeInTheDocument();
    });

    it("gửi bình luận thành công hiển thị thông báo inline trong form (không toast lớn)", async () => {
      const postSpy = vi.spyOn(api, "postModuleComment").mockResolvedValue({
        id: 2,
        module_code: "BIM5001",
        body: "Bình luận mới gửi thành công",
        rating: 4,
        author_name: "Sinh viên ẩn danh",
        status: "pending",
        created_at: "2026-11-22T09:00:00Z",
      });

      render(<ModuleReviews moduleCode="BIM5001" />);

      const textarea = await screen.findByLabelText("Nội dung bình luận");
      fireEvent.change(textarea, { target: { value: "Bình luận mới gửi thành công" } });

      // Chọn 4 sao
      const star4 = screen.getByRole("button", { name: "4 sao" });
      fireEvent.click(star4);

      const submitBtn = screen.getByRole("button", { name: "Gửi bình luận" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith("BIM5001", expect.objectContaining({
          body: "Bình luận mới gửi thành công",
          rating: 4,
        }));
      });

      // Thông báo inline hiển thị trong form
      expect(await screen.findByText("Bình luận đã gửi, sẽ hiển thị sau khi được duyệt")).toBeInTheDocument();
    });

    it("lỗi 422 hiển thị thông báo inline trong form", async () => {
      vi.spyOn(api, "postModuleComment").mockRejectedValue({
        data: { detail: "Nội dung chưa phù hợp" },
      });

      render(<ModuleReviews moduleCode="BIM5001" />);

      const textarea = await screen.findByLabelText("Nội dung bình luận");
      fireEvent.change(textarea, { target: { value: "Bình luận có từ cấm không phù hợp" } });

      const submitBtn = screen.getByRole("button", { name: "Gửi bình luận" });
      fireEvent.click(submitBtn);

      expect(await screen.findByText("Nội dung chưa phù hợp")).toBeInTheDocument();
    });
  });

  describe("2. Trang Quản trị kiểm duyệt (/admin/moderation)", () => {
    beforeEach(() => {
      vi.spyOn(adminApi, "getModerationQueue").mockResolvedValue({
        items: [...mockModerationQueue],
        total: mockModerationQueue.length,
        page: 1,
        size: 20,
        counts: {
          all: mockModerationQueue.length,
          feedback: 2,
          comment: 3,
          book: 0,
        },
      });

      vi.spyOn(adminApi, "getBannedTerms").mockResolvedValue([...mockBannedTerms]);
    });

    it("hiển thị đầy đủ 4 tab con: Góp ý, Bình luận, Giáo trình, Từ cấm", async () => {
      render(<AdminModerationPage />);
      expect(await screen.findByRole("button", { name: /Góp ý/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Bình luận học phần/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Bài đăng giáo trình/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Từ cấm/i })).toBeInTheDocument();
    });

    it("hiển thị bảng hàng chờ và panel chi tiết bên phải (không đổi trang)", async () => {
      render(<AdminModerationPage />);
      // Panel chi tiết
      expect(await screen.findByText(/Chi tiết kiểm duyệt/i)).toBeInTheDocument();

      // Kiểm tra các nút thao tác có phím tắt [A], [R], [H]
      expect(screen.getByRole("button", { name: /Duyệt/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Từ chối/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Ẩn/i })).toBeInTheDocument();
      expect(screen.getByText(/\[A\] Duyệt · \[R\] Từ chối · \[H\] Ẩn/i)).toBeInTheDocument();
    });

    it("bấm nút Duyệt gọi adminApi.moderateItem và cập nhật danh sách", async () => {
      const moderateSpy = vi.spyOn(adminApi, "moderateItem").mockResolvedValue({
        success: true,
        type: "comment",
        id: 1,
        status: "approved",
      });

      render(<AdminModerationPage />);
      const approveBtn = await screen.findByRole("button", { name: /Duyệt/i });
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(moderateSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Number),
          "approve",
          ""
        );
      });
    });

    it("phím tắt bàn phím 'a' kích hoạt thao tác Duyệt", async () => {
      const moderateSpy = vi.spyOn(adminApi, "moderateItem").mockResolvedValue({
        success: true,
        type: "comment",
        id: 1,
        status: "approved",
      });

      render(<AdminModerationPage />);
      await screen.findByText(/Chi tiết kiểm duyệt/i);

      // Nhấn phím 'a'
      fireEvent.keyDown(window, { key: "a", code: "KeyA" });

      await waitFor(() => {
        expect(moderateSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Number),
          "approve",
          ""
        );
      });
    });

    it("chọn nhiều mục và thực hiện thao tác hàng loạt (Bulk moderation)", async () => {
      const bulkSpy = vi.spyOn(adminApi, "bulkModerate").mockResolvedValue({
        success: true,
        updated_count: 2,
      });

      render(<AdminModerationPage />);
      await screen.findByText(/Chi tiết kiểm duyệt/i);

      // Bấm chọn tất cả checkbox
      const selectAllCheckbox = screen.getByRole("checkbox", { name: /Chọn tất cả/i });
      fireEvent.click(selectAllCheckbox);

      // Thanh thao tác hàng loạt xuất hiện
      const bulkApproveBtn = await screen.findByRole("button", { name: /Duyệt đã chọn/i });
      expect(bulkApproveBtn).toBeInTheDocument();

      fireEvent.click(bulkApproveBtn);

      await waitFor(() => {
        expect(bulkSpy).toHaveBeenCalledWith(expect.objectContaining({
          action: "approve",
        }));
      });
    });

    it("tab 'Bài đăng giáo trình' hiển thị thông báo chờ giai đoạn A7", async () => {
      render(<AdminModerationPage />);
      const bookTab = await screen.findByRole("button", { name: /Bài đăng giáo trình/i });
      fireEvent.click(bookTab);

      expect(await screen.findByText(/Chợ giáo trình sẽ khả dụng ở giai đoạn A7/i)).toBeInTheDocument();
    });

    it("tab 'Từ cấm' hiển thị danh sách từ cấm và form thêm từ mới", async () => {
      const addTermSpy = vi.spyOn(adminApi, "addBannedTerm").mockResolvedValue({
        id: 99,
        term: "test_new_term",
        severity: "block",
        created_at: "2026-11-22T10:00:00Z",
      });

      render(<AdminModerationPage />);
      const bannedTermsTab = await screen.findByRole("button", { name: /Từ cấm/i });
      fireEvent.click(bannedTermsTab);

      // Kiểm tra bảng từ cấm
      expect(await screen.findByText("blockword")).toBeInTheDocument();
      expect(screen.getByText("flagword")).toBeInTheDocument();

      // Nhập từ cấm mới
      const termInput = screen.getByLabelText(/Từ khóa/i);
      fireEvent.change(termInput, { target: { value: "test_new_term" } });

      const severitySelect = screen.getByLabelText(/Mức độ ưu tiên/i);
      fireEvent.change(severitySelect, { target: { value: "block" } });

      const addBtn = screen.getByRole("button", { name: "Thêm từ cấm" });
      fireEvent.click(addBtn);

      await waitFor(() => {
        expect(addTermSpy).toHaveBeenCalledWith("test_new_term", "block");
      });
    });
  });
});
