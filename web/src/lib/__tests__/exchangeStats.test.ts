import { describe, expect, it } from "vitest";
import { canOfferExchangeTick, isExchangeViewActive } from "@/lib/exchangeStats";

describe("exchange stats gating helpers", () => {
  it("offers the exchange option in English UI only, without needing a program", () => {
    expect(canOfferExchangeTick("en")).toBe(true);
    expect(canOfferExchangeTick("vi")).toBe(false);
  });

  it("activates the statistics when English UI and the option is on", () => {
    expect(isExchangeViewActive("en", true)).toBe(true);
    expect(isExchangeViewActive("en", false)).toBe(false);
    expect(isExchangeViewActive("vi", true)).toBe(false);
  });
});
