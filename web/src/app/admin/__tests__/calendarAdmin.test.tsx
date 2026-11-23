import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import AdminCalendarPage from "../calendar/page";
import { adminApi } from "@/lib/adminApi";
import {
  mockAdminSemesters,
  mockCalendarEvents,
  mockCalendarKinds,
  mockCalendarYears,
} from "@/mocks/admin";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/admin/calendar",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Brief A5: Quản trị Lịch năm học & Học kỳ (/admin/calendar)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("1. Tab Sự kiện năm học (Events Tab)", () => {
    beforeEach(() => {
      vi.spyOn(adminApi, "getCalendarEvents").mockResolvedValue({
        items: mockCalendarEvents,
        total: mockCalendarEvents.length,
        page: 1,
        size: mockCalendarEvents.length,
        years: mockCalendarYears,
        kinds: mockCalendarKinds,
      });
      vi.spyOn(adminApi, "createCalendarEvent").mockImplementation(async (data) => ({
        id: 99,
        academic_year: data.academic_year || "2026-2027",
        kind: data.kind || "teaching",
        title: data.title || "",
        start_date: data.start_date || "2026-09-01",
        end_date: data.end_date ?? null,
        semester_id: data.semester_id ?? null,
        cohorts: data.cohorts || ["all"],
        note: data.note ?? null,
        verified: data.verified ?? true,
        source: data.source || "TB 223/TB-ĐHKTL-ĐT",
        updated_by: "admin_dev",
        updated_at: new Date().toISOString(),
      }));
      vi.spyOn(adminApi, "patchCalendarEvent").mockImplementation(async (id, data) => {
        const found = mockCalendarEvents.find((e) => e.id === id) || mockCalendarEvents[0];
        return {
          ...found,
          ...data,
          updated_by: "admin_dev",
          updated_at: new Date().toISOString(),
        };
      });
      vi.spyOn(adminApi, "deleteCalendarEvent").mockResolvedValue({ success: true, id: 1 });
    });

    it("hiển thị tiêu đề, các nút tab và bảng danh sách sự kiện năm học", async () => {
      render(<AdminCalendarPage />);
      expect(screen.getByText("Lịch năm học & Học kỳ")).toBeInTheDocument();

      // Kiểm tra 3 tab
      expect(screen.getByRole("button", { name: /Sự kiện năm học/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Danh sách học kỳ/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Nhập dữ liệu JSON/i })).toBeInTheDocument();

      // Kiểm tra các dòng bảng sự kiện
      expect(
        await screen.findByText(/Thời gian học tập Học kỳ 1 \(Khóa 23 trở về trước\)/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Công bố kết quả đăng ký chương trình đào tạo thứ hai/i)
      ).toBeInTheDocument();
    });

    it("chuyển sang chế độ xem Timeline: hiển thị các nhóm theo tháng", async () => {
      render(<AdminCalendarPage />);
      expect(
        await screen.findByText(/Thời gian học tập Học kỳ 1 \(Khóa 23 trở về trước\)/i)
      ).toBeInTheDocument();

      // Bấm nút xem Timeline
      const timelineBtn = screen.getByRole("button", { name: /Dòng thời gian/i });
      fireEvent.click(timelineBtn);

      // Kiểm tra nhóm tháng được hiển thị
      expect(await screen.findByText(/Tháng 8\/2026/i)).toBeInTheDocument();
      expect(screen.getByText(/Tháng 9\/2026/i)).toBeInTheDocument();
    });

    it("lọc sự kiện chưa kiểm chứng: gọi getCalendarEvents với verified=false", async () => {
      const getSpy = vi.spyOn(adminApi, "getCalendarEvents");
      render(<AdminCalendarPage />);
      expect(
        await screen.findByText(/Thời gian học tập Học kỳ 1 \(Khóa 23 trở về trước\)/i)
      ).toBeInTheDocument();

      // Bật checkbox "Chỉ chưa kiểm chứng"
      const checkbox = screen.getByRole("checkbox", { name: /Chỉ chưa kiểm chứng/i });
      fireEvent.click(checkbox);

      await waitFor(() => {
        expect(getSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            verified: false,
          })
        );
      });
    });

    it("bấm nút duyệt nhanh trên dòng sự kiện: gọi patchCalendarEvent với verified=true", async () => {
      render(<AdminCalendarPage />);
      expect(
        await screen.findByText(/Công bố kết quả đăng ký chương trình đào tạo thứ hai/i)
      ).toBeInTheDocument();

      // Tìm nút "Duyệt" trên dòng sự kiện chưa kiểm chứng
      const verifyButtons = screen.getAllByRole("button", { name: /Duyệt/i });
      expect(verifyButtons.length).toBeGreaterThan(0);
      fireEvent.click(verifyButtons[0]);

      await waitFor(() => {
        expect(adminApi.patchCalendarEvent).toHaveBeenCalledWith(
          5,
          expect.objectContaining({
            verified: true,
          })
        );
      });
    });

    it("mở drawer Thêm sự kiện, nhập form và lưu thành công", async () => {
      render(<AdminCalendarPage />);
      expect(
        await screen.findByText(/Thời gian học tập Học kỳ 1 \(Khóa 23 trở về trước\)/i)
      ).toBeInTheDocument();

      // Bấm nút "+ Thêm sự kiện"
      const addBtn = screen.getByRole("button", { name: /Thêm sự kiện/i });
      fireEvent.click(addBtn);

      // Drawer hiển thị tiêu đề thêm sự kiện
      expect(await screen.findByText("Thêm sự kiện năm học")).toBeInTheDocument();

      // Nhập Tên sự kiện
      const titleInput = screen.getByPlaceholderText(/Thời gian học tập Học kỳ 1.../i);
      fireEvent.change(titleInput, { target: { value: "Sự kiện kiểm tra mới" } });

      // Nhập Ngày bắt đầu
      const dateInputs = screen.getAllByDisplayValue("");
      // Tìm input date bằng change
      const allInputs = document.querySelectorAll('input[type="date"]');
      expect(allInputs.length).toBeGreaterThanOrEqual(2);
      fireEvent.change(allInputs[0], { target: { value: "2026-10-01" } });

      // Bấm Lưu sự kiện
      const saveBtn = screen.getByRole("button", { name: "Lưu sự kiện" });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(adminApi.createCalendarEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Sự kiện kiểm tra mới",
            start_date: "2026-10-01",
          })
        );
      });
    });

    it("mở drawer Sửa sự kiện, chỉnh sửa và lưu thành công", async () => {
      render(<AdminCalendarPage />);
      expect(
        await screen.findByText(/Thời gian học tập Học kỳ 1 \(Khóa 23 trở về trước\)/i)
      ).toBeInTheDocument();

      // Bấm nút Sửa trên dòng đầu tiên
      const editButtons = screen.getAllByRole("button", { name: /^Sửa$/i });
      fireEvent.click(editButtons[0]);

      // Drawer hiển thị tiêu đề chỉnh sửa
      expect(await screen.findByText("Chỉnh sửa sự kiện năm học")).toBeInTheDocument();

      // Sửa tên sự kiện
      const titleInput = screen.getByDisplayValue(
        "Thời gian học tập Học kỳ 1 (Khóa 23 trở về trước)"
      );
      fireEvent.change(titleInput, {
        target: { value: "Thời gian học tập Học kỳ 1 (Cập nhật tiêu đề)" },
      });

      // Bấm Lưu sự kiện
      const saveBtn = screen.getByRole("button", { name: "Lưu sự kiện" });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(adminApi.patchCalendarEvent).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            title: "Thời gian học tập Học kỳ 1 (Cập nhật tiêu đề)",
          })
        );
      });
    });

    it("xóa sự kiện qua xác nhận nội bộ (inline confirmation) trong drawer", async () => {
      render(<AdminCalendarPage />);
      expect(
        await screen.findByText(/Thời gian học tập Học kỳ 1 \(Khóa 23 trở về trước\)/i)
      ).toBeInTheDocument();

      // Bấm Sửa sự kiện
      const editButtons = screen.getAllByRole("button", { name: /^Sửa$/i });
      fireEvent.click(editButtons[0]);

      // Bấm nút "Xóa sự kiện" để mở hộp xác nhận nội bộ (không dùng window.confirm)
      const deleteBtn = await screen.findByRole("button", { name: /Xóa sự kiện/i });
      fireEvent.click(deleteBtn);

      // Hiển thị thông báo xác nhận xóa nội bộ
      expect(await screen.findByText("Xác nhận xóa sự kiện")).toBeInTheDocument();
      expect(
        screen.getByText(/Bạn có chắc muốn xóa vĩnh viễn sự kiện này khỏi lịch năm học\?/i)
      ).toBeInTheDocument();

      // Bấm "Xác nhận xóa"
      const confirmDeleteBtn = screen.getByRole("button", { name: "Xác nhận xóa" });
      fireEvent.click(confirmDeleteBtn);

      await waitFor(() => {
        expect(adminApi.deleteCalendarEvent).toHaveBeenCalledWith(1);
      });
    });
  });

  describe("2. Tab Học kỳ (Semesters Tab)", () => {
    beforeEach(() => {
      vi.spyOn(adminApi, "getAdminSemesters").mockResolvedValue(mockAdminSemesters);
      vi.spyOn(adminApi, "patchAdminSemester").mockImplementation(async (id, data) => ({
        ...mockAdminSemesters[0],
        id,
        ...data,
      }));
    });

    it("hiển thị danh sách học kỳ và badge Kỳ hiện tại", async () => {
      render(<AdminCalendarPage />);

      // Chuyển sang Tab Học kỳ
      const semTab = screen.getByRole("button", { name: /Danh sách học kỳ/i });
      fireEvent.click(semTab);

      // Kiểm tra các học kỳ hiển thị
      expect(await screen.findByText("2026-2027-1")).toBeInTheDocument();
      expect(screen.getByText("2026-2027-2")).toBeInTheDocument();
      expect(screen.getByText("2026-2027-3")).toBeInTheDocument();

      // Kiểm tra badge "Kỳ hiện tại"
      expect(screen.getByText("Kỳ hiện tại")).toBeInTheDocument();

      // Kiểm tra nút "Đặt làm kỳ hiện tại" cho các kỳ chưa phải hiện tại
      const setCurrentButtons = screen.getAllByRole("button", { name: /Đặt làm kỳ hiện tại/i });
      expect(setCurrentButtons.length).toBeGreaterThan(0);
    });

    it("bấm nút 'Đặt làm kỳ hiện tại': gọi patchAdminSemester với is_current=true", async () => {
      render(<AdminCalendarPage />);

      // Chuyển sang Tab Học kỳ
      const semTab = screen.getByRole("button", { name: /Danh sách học kỳ/i });
      fireEvent.click(semTab);

      expect(await screen.findByText("2026-2027-2")).toBeInTheDocument();

      const setCurrentButtons = screen.getAllByRole("button", { name: /Đặt làm kỳ hiện tại/i });
      fireEvent.click(setCurrentButtons[0]);

      await waitFor(() => {
        expect(adminApi.patchAdminSemester).toHaveBeenCalledWith(
          "2026-2027-2",
          expect.objectContaining({
            is_current: true,
          })
        );
      });
    });

    it("chỉnh sửa ngày học thực tế và bấm Lưu: gọi patchAdminSemester", async () => {
      render(<AdminCalendarPage />);

      // Chuyển sang Tab Học kỳ
      const semTab = screen.getByRole("button", { name: /Danh sách học kỳ/i });
      fireEvent.click(semTab);

      expect(await screen.findByText("2026-2027-1")).toBeInTheDocument();

      // Bấm nút Lưu của dòng học kỳ 1
      const saveButtons = screen.getAllByRole("button", { name: "Lưu" });
      fireEvent.click(saveButtons[0]);

      await waitFor(() => {
        expect(adminApi.patchAdminSemester).toHaveBeenCalledWith(
          "2026-2027-1",
          expect.objectContaining({
            teaching_start: "2026-08-24",
            teaching_end: "2026-11-19",
          })
        );
      });
    });
  });

  describe("3. Tab Nhập dữ liệu JSON (JSON Import Tab)", () => {
    beforeEach(() => {
      vi.spyOn(adminApi, "importCalendarEvents").mockResolvedValue({
        dry_run: true,
        total_incoming: 5,
        to_delete: 3,
        to_insert: 5,
        diff_summary: {
          years: ["2026-2027"],
          total_events_in_db_for_years: 3,
          new_events_count: 5,
        },
        sample_incoming: [
          {
            title: "Học kỳ 1 năm học 2026-2027",
            kind: "teaching",
            start_date: "2026-08-24",
          },
        ],
      });
    });

    it("nhập JSON không hợp lệ: hiển thị lỗi inline", async () => {
      render(<AdminCalendarPage />);

      // Chuyển sang Tab Nhập JSON
      const importTab = screen.getByRole("button", { name: /Nhập dữ liệu JSON/i });
      fireEvent.click(importTab);

      expect(await screen.findByText("Nạp dữ liệu lịch năm học từ JSON")).toBeInTheDocument();

      // Nhập JSON sai định dạng
      const textarea = screen.getByPlaceholderText(/Dán nội dung JSON danh sách sự kiện vào đây/i);
      fireEvent.change(textarea, { target: { value: "invalid json string" } });

      // Bấm nút xem trước khác biệt
      const previewBtn = screen.getByRole("button", { name: /Xem trước khác biệt \(Dry-run\)/i });
      fireEvent.click(previewBtn);

      // Hiển thị thông báo lỗi
      expect(await screen.findByText(/Định dạng JSON không hợp lệ/i)).toBeInTheDocument();
    });

    it("nhập JSON hợp lệ: bấm Xem trước khác biệt hiển thị thẻ tóm tắt và cho phép xác nhận nạp", async () => {
      const importSpy = vi.spyOn(adminApi, "importCalendarEvents");
      render(<AdminCalendarPage />);

      // Chuyển sang Tab Nhập JSON
      const importTab = screen.getByRole("button", { name: /Nhập dữ liệu JSON/i });
      fireEvent.click(importTab);

      const textarea = screen.getByPlaceholderText(/Dán nội dung JSON danh sách sự kiện vào đây/i);
      const sampleJson = JSON.stringify([
        {
          academic_year: "2026-2027",
          kind: "teaching",
          title: "Học kỳ 1 năm học 2026-2027",
          start_date: "2026-08-24",
          end_date: "2026-11-19",
          cohorts: ["all"],
          source: "TB 223/TB-ĐHKTL-ĐT",
          verified: true,
        },
      ]);
      fireEvent.change(textarea, { target: { value: sampleJson } });

      // Bấm nút xem trước khác biệt
      const previewBtn = screen.getByRole("button", { name: /Xem trước khác biệt \(Dry-run\)/i });
      fireEvent.click(previewBtn);

      await waitFor(() => {
        expect(importSpy).toHaveBeenCalledWith(expect.any(Array), true);
      });

      // Hiển thị khối tóm tắt khác biệt
      expect(await screen.findByText("Tóm tắt khác biệt (Dry-run)")).toBeInTheDocument();
      expect(screen.getByText("Sự kiện nạp vào")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("Sự kiện bị thay thế")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();

      // Nút xác nhận nạp thật xuất hiện
      const confirmBtn = screen.getByRole("button", { name: /Xác nhận nạp dữ liệu thật/i });
      expect(confirmBtn).toBeInTheDocument();

      // Bấm xác nhận nạp thật
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(importSpy).toHaveBeenCalledWith(expect.any(Array), false);
      });

      // Hiển thị thông báo thành công
      expect(await screen.findByText("Nạp dữ liệu lịch năm học thành công.")).toBeInTheDocument();
    });
  });
});
