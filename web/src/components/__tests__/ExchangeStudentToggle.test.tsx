import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ExchangeStudentToggle } from "@/components/ExchangeStudentToggle";
import { ExchangeStatBadge } from "@/components/ExchangeStatBadge";
import { canOfferExchangeTick, isExchangeViewActive } from "@/lib/exchangeStats";
import { useLang } from "@/i18n";
import { useSettings } from "@/lib/store";

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
  beforeEach(() => {
    useLang.setState({ lang: "en" });
    useSettings.setState({ programCode: "K23406E", exchangeStudent: false });
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
    const { rerender, container } = render(
      <ExchangeStatBadge stat={{ module_code: "ELB1048", total: 3, by_semester: [{ semester_id: "2025-2026-1", students: 2 }, { semester_id: "2026-2027-1", students: 1 }] }} />,
    );
    expect(screen.getByTestId("exchange-stat").textContent).toBe("3 exchange students took this module in earlier semesters");
    rerender(<ExchangeStatBadge stat={{ module_code: "ELB1048", total: 1, by_semester: [{ semester_id: "2025-2026-1", students: 1 }] }} />);
    expect(screen.getByTestId("exchange-stat").textContent).toBe("1 exchange student took this module in earlier semesters");
    rerender(<ExchangeStatBadge stat={undefined} />);
    expect(container.querySelector("[data-testid='exchange-stat']")).toBeNull();
  });
});
