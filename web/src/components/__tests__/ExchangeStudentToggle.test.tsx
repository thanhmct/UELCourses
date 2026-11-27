import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExchangeStudentToggle } from "@/components/ExchangeStudentToggle";
import { ExchangeStatBadge } from "@/components/ExchangeStatBadge";
import { canOfferExchangeTick, isExchangeViewActive } from "@/lib/exchangeStats";
import { useLang } from "@/i18n";
import { useSettings } from "@/lib/store";

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("exchange student gating", () => {
  it("offers the option in English UI regardless of the program", () => {
    expect(canOfferExchangeTick("en")).toBe(true);
    expect(canOfferExchangeTick("vi")).toBe(false);
  });

  it("activates the statistics when English UI and the option is on", () => {
    expect(isExchangeViewActive("en", true)).toBe(true);
    expect(isExchangeViewActive("en", false)).toBe(false);
    expect(isExchangeViewActive("vi", true)).toBe(false);
  });
});

describe("ExchangeStudentToggle and ExchangeStatBadge", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    useLang.setState({ lang: "en" });
    useSettings.setState({ programCode: "K23406E", exchangeStudent: false });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
  });

  it("shows the tick in English and syncs with the store", () => {
    render(<ExchangeStudentToggle />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(useSettings.getState().exchangeStudent).toBe(true);
  });

  it("shows the tick even when no program is selected or the program is not English", () => {
    useSettings.setState({ programCode: "" });
    const { container, rerender } = render(<ExchangeStudentToggle />);
    expect(container.querySelector("input")).not.toBeNull();
    useSettings.setState({ programCode: "K23406" });
    rerender(<ExchangeStudentToggle />);
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("button variant toggles the store flag and exposes aria-pressed", () => {
    useSettings.setState({ programCode: "", exchangeStudent: false });
    render(<ExchangeStudentToggle variant="button" />);
    const btn = screen.getByRole("button", { name: "I am an exchange student at UEL" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect(useSettings.getState().exchangeStudent).toBe(true);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(btn);
    expect(useSettings.getState().exchangeStudent).toBe(false);
  });

  it("button variant is hidden in Vietnamese UI", () => {
    useLang.setState({ lang: "vi" });
    const { container } = render(<ExchangeStudentToggle variant="button" />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("hides the tick in Vietnamese UI", () => {
    useLang.setState({ lang: "vi" });
    const { container } = render(<ExchangeStudentToggle />);
    expect(container.querySelector("input")).toBeNull();
  });

  it("renders the count in English and nothing without data", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("role") === "tooltip") return makeRect(0, 0, 200, 60);
      if (this.tagName === "BUTTON") return makeRect(10, 10, 20, 20);
      return makeRect(0, 0, 0, 0);
    });
    const { rerender, container } = render(
      <ExchangeStatBadge stat={{ module_code: "ELB1048", total: 3, by_semester: [{ semester_id: "2025-2026-1", students: 2 }, { semester_id: "2026-2027-1", students: 1 }] }} />,
    );
    fireEvent.click(container.querySelector("button")!);
    expect(screen.getByRole("tooltip").textContent).toBe("3 exchange students took this module in earlier semesters");
    rerender(<ExchangeStatBadge stat={{ module_code: "ELB1048", total: 1, by_semester: [{ semester_id: "2025-2026-1", students: 1 }] }} />);
    expect(screen.getByRole("tooltip").textContent).toBe("1 exchange student took this module in earlier semesters");
    rerender(<ExchangeStatBadge stat={undefined} />);
    expect(container.querySelector("[data-testid='exchange-stat']")).toBeNull();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shifts the tooltip inside the viewport and updates after resizing", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("role") === "tooltip") return makeRect(0, 0, 200, 60);
      if (this.tagName === "BUTTON") return makeRect(300, 100, 20, 20);
      return makeRect(0, 0, 0, 0);
    });

    const { container } = render(
      <ExchangeStatBadge
        stat={{ module_code: "ELB1048", total: 3, by_semester: [] }}
      />,
    );
    fireEvent.click(container.querySelector("button")!);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.style.left).toBe("188px");

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    fireEvent(window, new Event("resize"));
    expect(tooltip.style.left).toBe("108px");
  });

  it("flips above the button when the tooltip would not fit below", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("role") === "tooltip") return makeRect(0, 0, 200, 60);
      if (this.tagName === "BUTTON") return makeRect(100, 740, 20, 20);
      return makeRect(0, 0, 0, 0);
    });

    const { container } = render(
      <ExchangeStatBadge
        stat={{ module_code: "ELB1048", total: 3, by_semester: [] }}
      />,
    );
    fireEvent.click(container.querySelector("button")!);
    expect(screen.getByRole("tooltip").style.top).toBe("672px");
  });
});
