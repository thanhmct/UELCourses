import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ExchangeStudentToggle } from "@/components/ExchangeStudentToggle";
import { ExchangeStatBadge } from "@/components/ExchangeStatBadge";
import { canOfferExchangeTick, isExchangeViewActive } from "@/lib/exchangeStats";
import { useLang } from "@/i18n";
import { useSettings } from "@/lib/store";

describe("exchange student gating", () => {
  it("offers the tick only in English UI with an English program", () => {
    expect(canOfferExchangeTick("en", "K23406E")).toBe(true);
    expect(canOfferExchangeTick("vi", "K23406E")).toBe(false);
    expect(canOfferExchangeTick("en", "K23406")).toBe(false);
    expect(canOfferExchangeTick("en", "")).toBe(false);
  });

  it("activates the statistics only when ticked and eligible", () => {
    expect(isExchangeViewActive("en", "K23406E", true)).toBe(true);
    expect(isExchangeViewActive("en", "K23406E", false)).toBe(false);
    expect(isExchangeViewActive("vi", "K23406E", true)).toBe(false);
    expect(isExchangeViewActive("en", "K23406", true)).toBe(false);
  });
});

describe("ExchangeStudentToggle and ExchangeStatBadge", () => {
  beforeEach(() => {
    useLang.setState({ lang: "en" });
    useSettings.setState({ programCode: "K23406E", exchangeStudent: false });
  });

  it("shows the tick in English with an English program and syncs with the store", () => {
    render(<ExchangeStudentToggle />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(useSettings.getState().exchangeStudent).toBe(true);
  });

  it("hides the tick when the program is not English", () => {
    useSettings.setState({ programCode: "K23406" });
    const { container } = render(<ExchangeStudentToggle />);
    expect(container.querySelector("input")).toBeNull();
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
