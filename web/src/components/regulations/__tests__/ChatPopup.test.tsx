import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegulationsChatPopup } from "../RegulationsChatPopup";
import { useRegChat } from "@/lib/regChatStore";
import { useLang } from "@/i18n";

let currentPathname = "/today";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/useMounted", () => ({
  useMounted: () => true,
}));

vi.mock("@/lib/api", () => ({
  api: {
    ask: vi.fn().mockResolvedValue({
      data: {
        answer: "Sinh viên được đăng ký tối đa 25 tín chỉ trong một học kỳ chính.",
        mode: "extractive",
        warnings: [],
        citations: [
          {
            doc_id: "qd-2022",
            decision_no: "123/QĐ-ĐHKTL",
            article: "Điều 5",
            clause: "2",
            quote: "Sinh viên có học lực bình thường được đăng ký tối đa 25 tín chỉ.",
          },
        ],
      },
    }),
  },
}));

describe("W9: Cửa sổ chat pop-up Quy chế & Hỏi đáp AI", () => {
  beforeEach(() => {
    currentPathname = "/today";
    useLang.getState().setLang("vi");
    act(() => {
      useRegChat.getState().closeChat();
      useRegChat.getState().clearMessages();
      useRegChat.getState().setCohort("");
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("hiển thị nút nổi (FAB) ở trang thông thường (/today)", () => {
    currentPathname = "/today";
    render(<RegulationsChatPopup />);

    const fab = screen.getByRole("button", { name: "Hỏi quy chế / AI" });
    expect(fab).toBeInTheDocument();
  });

  it("TUYỆT ĐỐI KHÔNG hiển thị FAB ở trang hỏi đáp toàn màn hình (/regulations)", () => {
    currentPathname = "/regulations";
    render(<RegulationsChatPopup />);

    const fab = screen.queryByRole("button", { name: "Hỏi quy chế / AI" });
    expect(fab).not.toBeInTheDocument();
  });

  it("bấm FAB mở cửa sổ chat nhỏ với tiêu đề, chọn khóa, phóng to, thu nhỏ, đóng", () => {
    currentPathname = "/timetable";
    render(<RegulationsChatPopup />);

    const fab = screen.getByRole("button", { name: "Hỏi quy chế / AI" });
    fireEvent.click(fab);

    // Dialog appears
    const dialog = screen.getByRole("dialog", { name: "Hỏi đáp Quy chế & AI" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Hỏi đáp Quy chế & AI")).toBeInTheDocument();

    // Controls in header
    expect(screen.getByRole("button", { name: "Phóng to" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thu nhỏ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đóng" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mở trang đầy đủ" })).toBeInTheDocument();
  });

  it("phóng to và thu nhỏ giữ nguyên hội thoại", async () => {
    currentPathname = "/modules";
    render(<RegulationsChatPopup />);

    // Open popup
    fireEvent.click(screen.getByRole("button", { name: "Hỏi quy chế / AI" }));

    // Ask a question
    const input = screen.getByPlaceholderText(/Đặt câu hỏi…/i);
    fireEvent.change(input, { target: { value: "Tối đa bao nhiêu tín chỉ?" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    await waitFor(() => {
      expect(screen.getByText("Tối đa bao nhiêu tín chỉ?")).toBeInTheDocument();
      expect(
        screen.getByText("Sinh viên được đăng ký tối đa 25 tín chỉ trong một học kỳ chính."),
      ).toBeInTheDocument();
    });

    // Click Maximize
    const maxBtn = screen.getByRole("button", { name: "Phóng to" });
    fireEvent.click(maxBtn);

    expect(useRegChat.getState().status).toBe("maximized");
    // Messages must still be visible in maximized state
    expect(screen.getByText("Tối đa bao nhiêu tín chỉ?")).toBeInTheDocument();
    expect(
      screen.getByText("Sinh viên được đăng ký tối đa 25 tín chỉ trong một học kỳ chính."),
    ).toBeInTheDocument();

    // Click Restore
    const restoreBtn = screen.getByRole("button", { name: "Thu nhỏ kích thước" });
    fireEvent.click(restoreBtn);

    expect(useRegChat.getState().status).toBe("popup");
    expect(screen.getByText("Tối đa bao nhiêu tín chỉ?")).toBeInTheDocument();
  });

  it("phím Escape đóng popup khi đang mở", () => {
    currentPathname = "/today";
    render(<RegulationsChatPopup />);

    // Open popup
    fireEvent.click(screen.getByRole("button", { name: "Hỏi quy chế / AI" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(window, { key: "Escape" });

    // Popup closed, FAB returns
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hỏi quy chế / AI" })).toBeInTheDocument();
  });
});
