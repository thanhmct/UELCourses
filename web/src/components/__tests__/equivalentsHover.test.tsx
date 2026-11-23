import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import { EquivalentsHover } from "../EquivalentsHover";
import { api, type ApiResult } from "@/lib/api";
import type { EquivalentItem } from "@/lib/types";

const mockEquivalentData: ApiResult<EquivalentItem | null> = {
  data: {
    code: "TOA1001",
    name: "Toán cao cấp",
    name_en: "Advanced Mathematics",
    credits: 3,
    equivalents: [
      {
        code: "TOA1002",
        name: "Toán cho các nhà kinh tế",
        name_en: "Mathematics for Economists",
        credits: 3,
      },
    ],
  },
  mock: false,
};

describe("EquivalentsHover", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("không gọi API trước khi hover", () => {
    const spy = vi.spyOn(api, "equivalent").mockResolvedValue(mockEquivalentData);
    render(<EquivalentsHover code="TOA1001" />);

    expect(screen.getByRole("button", { name: /có tương đương/i })).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hover → hiện tên/mã tương đương và gọi API đúng 1 lần dù hover nhiều lần", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(api, "equivalent").mockResolvedValue(mockEquivalentData);
    const { container } = render(<EquivalentsHover code="TOA1001" />);

    const chip = screen.getByRole("button", { name: /có tương đương/i });
    const wrapper = container.firstChild as HTMLElement;

    // Rê chuột vào chip
    fireEvent.mouseEnter(chip);
    expect(spy).not.toHaveBeenCalled();

    // Chờ trễ ~150ms
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("TOA1001");

    // Đợi cập nhật promise trong state
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("TOA1002")).toBeInTheDocument();
    expect(screen.getByText("Toán cho các nhà kinh tế")).toBeInTheDocument();
    expect(screen.getByText("3 TC")).toBeInTheDocument();

    // Rời chuột
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Rê chuột vào lại
    fireEvent.mouseEnter(chip);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Dialog mở lại nhưng API vẫn chỉ được gọi đúng 1 lần
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("TOA1002")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("nhấn Esc đóng popover", async () => {
    vi.useFakeTimers();
    vi.spyOn(api, "equivalent").mockResolvedValue(mockEquivalentData);
    render(<EquivalentsHover code="TOA1001" />);

    const chip = screen.getByRole("button", { name: /có tương đương/i });

    // Rê chuột mở popover
    fireEvent.mouseEnter(chip);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Nhấn Esc trên window
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("bấm chip bật và tắt popover (màn hình cảm ứng)", async () => {
    vi.spyOn(api, "equivalent").mockResolvedValue(mockEquivalentData);
    render(<EquivalentsHover code="TOA1001" />);

    const chip = screen.getByRole("button", { name: /có tương đương/i });

    // Bấm để mở
    fireEvent.click(chip);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("TOA1002")).toBeInTheDocument();
    });

    // Bấm lại để đóng
    fireEvent.click(chip);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hiển thị thông báo khi không có dữ liệu tương đương", async () => {
    const emptyData: ApiResult<EquivalentItem | null> = {
      data: {
        code: "TOA1001",
        name: "Toán cao cấp",
        credits: 3,
        equivalents: [],
      },
      mock: false,
    };
    vi.spyOn(api, "equivalent").mockResolvedValue(emptyData);
    render(<EquivalentsHover code="TOA1001" />);

    const chip = screen.getByRole("button", { name: /có tương đương/i });
    fireEvent.click(chip);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Không có dữ liệu tương đương")).toBeInTheDocument();
    });
  });
});
