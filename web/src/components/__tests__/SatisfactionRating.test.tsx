import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SatisfactionRating } from "../SatisfactionRating";
import { useLang } from "@/i18n";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  APP_VERSION: "0.1.0",
  api: {
    feedback: vi.fn().mockResolvedValue({ data: { ok: true }, mock: false }),
  },
}));

describe("SatisfactionRating", () => {
  beforeEach(() => {
    useLang.getState().setLang("vi");
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("chỉ hiển thị 5 sao ban đầu, không hiện form nhập", () => {
    render(<SatisfactionRating page="/today" />);

    expect(screen.getByRole("radiogroup", { name: "Đánh giá 1 đến 5" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.queryByLabelText("Loại góp ý")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nội dung")).not.toBeInTheDocument();
  });

  it("happy path (4-5 sao): gửi ngay, hiện lời cảm ơn + pháo hoa và gọi onDone sau ~2.5s", async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<SatisfactionRating page="/today" onDone={onDone} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: /5 sao/i }));
    });

    expect(api.feedback).toHaveBeenCalledWith({
      page: "/today",
      rating: 5,
      category: "other",
      message: "",
      quick_rating: true,
      app_version: "0.1.0",
    });
    expect(screen.getByText("UELPath xin cảm ơn bạn! <3")).toBeInTheDocument();
    expect(screen.getByTestId("fireworks-overlay")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2600);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("fireworks-overlay")).not.toBeInTheDocument();
  });

  it("sad path (1-3 sao): hiện form, bấm Nhấn nhầm á >.< thì hủy và không gửi", () => {
    const onDone = vi.fn();
    render(<SatisfactionRating page="/planner" onDone={onDone} />);

    fireEvent.click(screen.getByRole("radio", { name: /2 sao/i }));

    expect(api.feedback).not.toHaveBeenCalled();
    expect(screen.getByText("UELPath pùn quá, bạn có đóng góp gì để tui tốt hơn hem?! :(")).toBeInTheDocument();
    expect(screen.getByLabelText("Loại góp ý")).toBeInTheDocument();
    expect(screen.getByLabelText("Nội dung")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GỬI!" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Nhấn nhầm á >.<" }));

    expect(api.feedback).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nội dung")).not.toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });

  it("sad path (1-3 sao): nhập nội dung và bấm GỬI! gửi đúng quick_rating=true và gọi onDone", async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<SatisfactionRating page="/modules" onDone={onDone} />);

    fireEvent.click(screen.getByRole("radio", { name: /1 sao/i }));
    fireEvent.change(screen.getByLabelText("Loại góp ý"), { target: { value: "ux" } });
    fireEvent.change(screen.getByLabelText("Nội dung"), { target: { value: "Chữ trên điện thoại hơi nhỏ" } });

    const sendBtn = screen.getByRole("button", { name: "GỬI!" });
    expect(sendBtn).toBeEnabled();
    await act(async () => {
      fireEvent.click(sendBtn);
      await Promise.resolve();
    });

    expect(api.feedback).toHaveBeenCalledWith({
      page: "/modules",
      rating: 1,
      category: "ux",
      message: "Chữ trên điện thoại hơi nhỏ",
      quick_rating: true,
      app_version: "0.1.0",
    });

    expect(screen.getByText("Cảm ơn bạn! Góp ý đã được gửi.")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1900);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
