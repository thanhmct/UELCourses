import { describe, expect, it } from "vitest";
import { canOfferExchangeTick, isExchangeViewActive } from "@/lib/exchangeStats";

describe("exchange stats gating helpers", () => {
  it("requires English UI and an English program for the tick", () => {
    expect(canOfferExchangeTick("en", "K23406E")).toBe(true);
    expect(canOfferExchangeTick("vi", "K23406E")).toBe(false);
    expect(canOfferExchangeTick("en", "K23406")).toBe(false);
  });

  it("requires the tick as well for the statistics", () => {
    expect(isExchangeViewActive("en", "K23406E", true)).toBe(true);
    expect(isExchangeViewActive("en", "K23406E", false)).toBe(false);
  });
});
