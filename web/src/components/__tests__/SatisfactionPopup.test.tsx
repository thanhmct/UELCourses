import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SatisfactionPopup, resetSatisfactionPopupCache } from "../SatisfactionPopup";
import { useLang } from "@/i18n";
import { api } from "@/lib/api";

vi.mock("next/navigation", () => ({
  usePathname: () => "/timetable",
}));

vi.mock("@/lib/api", () => ({
  APP_VERSION: "0.1.0",
  api: {
    feedback: vi.fn().mockResolvedValue({ data: { ok: true }, mock: false }),
    feedbackSatisfactionStatus: vi.fn().mockResolvedValue({ data: { already_rated: false }, mock: false }),
  },
}));

describe("SatisfactionPopup gating & behavior", () => {
  beforeEach(() => {
    useLang.getState().setLang("vi");
    sessionStorage.clear();
    resetSatisfactionPopupCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("không hiện khi backend báo already_rated=true", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    vi.mocked(api.feedbackSatisfactionStatus).mockResolvedValueOnce({
      data: { already_rated: true },
      mock: false,
    });

    render(<SatisfactionPopup delayMs={1000} />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("không hiện khi roll ngẫu nhiên không trúng (>= 1/8) và ghi sessionStorage để không roll lại cùng phiên", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.mocked(api.feedbackSatisfactionStatus).mockResolvedValue({
      data: { already_rated: false },
      mock: false,
    });

    const { unmount } = render(<SatisfactionPopup delayMs={1000} />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.feedbackSatisfactionStatus).toHaveBeenCalledTimes(1);

    // Remount trong cùng phiên trình duyệt: không gọi API / không hiện lại
    unmount();
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    render(<SatisfactionPopup delayMs={1000} />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(api.feedbackSatisfactionStatus).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hiện popup khi already_rated=false và roll trúng (< 1/8); đóng bằng nút ✕ không gửi feedback", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    vi.mocked(api.feedbackSatisfactionStatus).mockResolvedValueOnce({
      data: { already_rated: false },
      mock: false,
    });

    render(<SatisfactionPopup delayMs={1500} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    const dialog = screen.getByRole("dialog", { name: "Mức độ hài lòng" });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Đóng hộp đánh giá" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.feedback).not.toHaveBeenCalled();
  });

  it("đánh giá 5 sao trong popup gửi quick_rating=true và tự đóng sau ~2.5s", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    vi.mocked(api.feedbackSatisfactionStatus).mockResolvedValueOnce({
      data: { already_rated: false },
      mock: false,
    });

    render(<SatisfactionPopup delayMs={1000} />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: /4 sao/i }));
      await Promise.resolve();
    });

    expect(api.feedback).toHaveBeenCalledWith({
      page: "/timetable",
      rating: 4,
      category: "other",
      message: "",
      quick_rating: true,
      app_version: "0.1.0",
    });
    expect(screen.getByText("UELPath xin cảm ơn bạn! <3")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2600);
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
