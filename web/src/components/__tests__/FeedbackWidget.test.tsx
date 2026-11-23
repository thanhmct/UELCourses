import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackForm, FeedbackModal, FeedbackWidget, ReportErrorsButton, openFeedback } from "../FeedbackWidget";
import { SideNav } from "../Header";
import { RegulationsChatPopup } from "../regulations/RegulationsChatPopup";
import FeedbackPage from "@/app/feedback/page";
import { useLang } from "@/i18n";
import { api } from "@/lib/api";
import { useRegChat } from "@/lib/regChatStore";

let currentPath = "/today";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/useMounted", () => ({
  useMounted: () => true,
}));

vi.mock("@/lib/api", () => ({
  APP_VERSION: "0.1.0",
  api: {
    feedback: vi.fn().mockResolvedValue({ data: { ok: true }, mock: false }),
    ask: vi.fn().mockResolvedValue({ data: { answer: "Quy chế...", citations: [] } }),
  },
}));

describe("Brief W10: Bỏ nút Góp ý nổi ở góc dưới bên phải", () => {
  beforeEach(() => {
    currentPath = "/today";
    useLang.getState().setLang("vi");
    vi.clearAllMocks();
    act(() => {
      useRegChat.getState().closeChat();
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("1. Không còn nút nổi Góp ý ở layout / góc dưới màn hình", () => {
    it("FeedbackWidget khi mount không hiển thị bất kỳ nút nổi (FAB) nào", () => {
      const { container } = render(<FeedbackWidget />);

      // Hộp thoại ban đầu đóng
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      // TUYỆT ĐỐI không có nút nào rendered khi hộp thoại đóng (nút FAB nổi đã bị gỡ bỏ hoàn toàn)
      const buttons = container.querySelectorAll("button");
      expect(buttons.length).toBe(0);
      expect(screen.queryByText("Góp ý")).not.toBeInTheDocument();
    });

    it("khi kết hợp Layout với RegulationsChatPopup, góc dưới phải CHỈ CÒN nút chat pop-up Quy chế & AI", () => {
      render(
        <div>
          <FeedbackWidget />
          <RegulationsChatPopup />
        </div>,
      );

      // Nút FAB AI Quy chế vẫn hiển thị bình thường ở góc dưới phải
      const aiFab = screen.getByRole("button", { name: "Hỏi quy chế / AI" });
      expect(aiFab).toBeInTheDocument();

      // Không hề có nút nổi Góp ý nào ở góc dưới
      const allButtons = screen.getAllByRole("button");
      expect(allButtons).toHaveLength(1);
      expect(allButtons[0]).toBe(aiFab);
    });
  });

  describe("2. Mở Góp ý từ thanh menu (SideNav / openFeedback) hiển thị hộp thoại biểu mẫu", () => {
    it("bấm nút Góp ý trong SideNav mở FeedbackModal với đầy đủ các trường", () => {
      render(
        <div>
          <SideNav />
          <FeedbackWidget />
        </div>,
      );

      // Ban đầu modal chưa mở
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      // Bấm nút "Góp ý" trong menu SideNav
      const menuFeedbackBtn = screen.getByRole("button", { name: /Góp ý/i });
      expect(menuFeedbackBtn).toBeInTheDocument();
      fireEvent.click(menuFeedbackBtn);

      // Hộp thoại Góp ý xuất hiện
      const dialog = screen.getByRole("dialog", { name: "Góp ý cho UELPATH" });
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText("Góp ý cho UELPATH")).toBeInTheDocument();

      // Kiểm tra đầy đủ các thành phần biểu mẫu
      expect(screen.getByRole("radiogroup", { name: "Đánh giá 1 đến 5" })).toBeInTheDocument();
      expect(screen.getByLabelText("Loại góp ý")).toBeInTheDocument();
      expect(screen.getByLabelText("Nội dung")).toBeInTheDocument();
      expect(screen.getByLabelText("Liên hệ (không bắt buộc)")).toBeInTheDocument();

      // Nút gửi đang disabled vì chưa đánh giá sao và chưa nhập nội dung
      const submitBtn = screen.getByRole("button", { name: "Gửi góp ý" });
      expect(submitBtn).toBeDisabled();
    });

    it("gọi openFeedback() từ bất kỳ đâu cũng mở được hộp thoại góp ý", () => {
      render(<FeedbackWidget />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      act(() => {
        openFeedback();
      });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("3. Điền biểu mẫu và gửi thành công (mock API)", () => {
    it("báo lỗi gửi danh mục bug và trang phát sinh lỗi", async () => {
      currentPath = "/planner";
      render(<><ReportErrorsButton /><FeedbackWidget /></>);
      fireEvent.click(screen.getByRole("button", { name: "Báo lỗi" }));
      const dialog = within(screen.getByRole("dialog", { name: "Báo lỗi" }));
      expect(dialog.getByLabelText("Loại góp ý")).toHaveValue("bug");
      fireEvent.click(dialog.getAllByRole("radio")[2]);
      fireEvent.change(dialog.getByLabelText("Nội dung"), { target: { value: "Lỗi khi áp dụng lộ trình" } });
      fireEvent.click(dialog.getByRole("button", { name: "Gửi góp ý" }));
      await waitFor(() => expect(api.feedback).toHaveBeenCalledWith(expect.objectContaining({
        page: "/planner", category: "bug", message: "Lỗi khi áp dụng lộ trình",
      })));
    });

    it("nhập sao, danh mục, nội dung, liên hệ và gửi thành công", async () => {
      (api.feedback as any).mockResolvedValueOnce({ data: { ok: true }, mock: false });

      render(
        <div>
          <FeedbackWidget />
        </div>,
      );

      // Mở modal
      act(() => {
        openFeedback();
      });

      // Chọn 5 sao
      const star5 = screen.getByRole("radio", { name: /5 sao/i });
      fireEvent.click(star5);
      expect(star5).toHaveAttribute("aria-checked", "true");

      // Chọn loại góp ý "Báo lỗi"
      const categorySelect = screen.getByLabelText("Loại góp ý");
      fireEvent.change(categorySelect, { target: { value: "bug" } });

      // Nhập nội dung góp ý
      const messageInput = screen.getByLabelText("Nội dung");
      fireEvent.change(messageInput, { target: { value: "Lớp học phần EFF2045 bị hiển thị nhầm khoa." } });

      // Nhập thông tin liên hệ
      const contactInput = screen.getByLabelText("Liên hệ (không bắt buộc)");
      fireEvent.change(contactInput, { target: { value: "k22404@uel.edu.vn" } });

      // Bấm nút gửi
      const submitBtn = screen.getByRole("button", { name: "Gửi góp ý" });
      expect(submitBtn).toBeEnabled();
      fireEvent.click(submitBtn);

      // Chờ API được gọi đúng tham số
      await waitFor(() => {
        expect(api.feedback).toHaveBeenCalledWith({
          page: "/today",
          rating: 5,
          category: "bug",
          message: "Lớp học phần EFF2045 bị hiển thị nhầm khoa.",
          contact: "k22404@uel.edu.vn",
          app_version: "0.1.0",
        });
      });

      // Hiển thị thông báo cảm ơn
      expect(await screen.findByText("Cảm ơn bạn! Góp ý đã được gửi.")).toBeInTheDocument();

      // Bấm "Gửi góp ý khác" sẽ đặt lại form
      const anotherBtn = screen.getByRole("button", { name: "Gửi góp ý khác" });
      fireEvent.click(anotherBtn);
      expect(screen.getByRole("button", { name: "Gửi góp ý" })).toBeDisabled();
    });

    it("xử lý trường hợp máy chủ lưu tạm (mock / queued)", async () => {
      (api.feedback as any).mockResolvedValueOnce({ data: { ok: true }, mock: true });

      render(<FeedbackWidget />);
      act(() => {
        openFeedback();
      });

      fireEvent.click(screen.getByRole("radio", { name: /4 sao/i }));
      fireEvent.change(screen.getByLabelText("Nội dung"), { target: { value: "Cần thêm chế độ xem lịch tuần." } });
      fireEvent.click(screen.getByRole("button", { name: "Gửi góp ý" }));

      expect(
        await screen.findByText("Cảm ơn bạn! Máy chủ chưa phản hồi nên góp ý được lưu tạm trên trình duyệt."),
      ).toBeInTheDocument();
    });

    it("xử lý khi gửi gặp lỗi mạng / API throw", async () => {
      (api.feedback as any).mockRejectedValueOnce(new Error("Network Error"));

      render(<FeedbackWidget />);
      act(() => {
        openFeedback();
      });

      fireEvent.click(screen.getByRole("radio", { name: /3 sao/i }));
      fireEvent.change(screen.getByLabelText("Nội dung"), { target: { value: "Giao diện trên mobile bị tràn." } });
      fireEvent.click(screen.getByRole("button", { name: "Gửi góp ý" }));

      expect(await screen.findByText("Gửi thất bại, vui lòng kiểm tra nội dung.")).toBeInTheDocument();
    });
  });

  describe("4. Đóng hộp thoại góp ý (nút đóng, phím Escape, backdrop)", () => {
    it("bấm nút ✕ đóng hộp thoại", () => {
      render(<FeedbackWidget />);
      act(() => {
        openFeedback();
      });
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      const closeBtn = screen.getByRole("button", { name: "Đóng" });
      fireEvent.click(closeBtn);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("nhấn phím Escape đóng hộp thoại", () => {
      render(<FeedbackWidget />);
      act(() => {
        openFeedback();
      });
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("5. Trang độc lập /feedback", () => {
    it("trang /feedback hiển thị biểu mẫu và gửi được góp ý", async () => {
      (api.feedback as any).mockResolvedValueOnce({ data: { ok: true }, mock: false });

      render(<FeedbackPage />);

      // Có tiêu đề trang và nút quay lại
      expect(screen.getByRole("heading", { name: "Góp ý cho UELPATH" })).toBeInTheDocument();
      expect(screen.getByText("Quay lại")).toBeInTheDocument();

      // Form có sẵn trên trang
      expect(screen.getByRole("radiogroup", { name: "Đánh giá 1 đến 5" })).toBeInTheDocument();

      // Điền và gửi form
      fireEvent.click(screen.getByRole("radio", { name: /5 sao/i }));
      fireEvent.change(screen.getByLabelText("Nội dung"), { target: { value: "Tính năng xếp TKB quá tuyệt vời!" } });
      fireEvent.click(screen.getByRole("button", { name: "Gửi góp ý" }));

      await waitFor(() => {
        expect(api.feedback).toHaveBeenCalledWith(
          expect.objectContaining({
            page: "/feedback",
            rating: 5,
            message: "Tính năng xếp TKB quá tuyệt vời!",
          }),
        );
      });

      expect(await screen.findByText("Cảm ơn bạn! Góp ý đã được gửi.")).toBeInTheDocument();
    });
  });
});
