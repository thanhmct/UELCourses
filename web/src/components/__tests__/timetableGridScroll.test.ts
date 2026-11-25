import { describe, expect, it } from "vitest";
import { scrollLeftForNow } from "../TimetableGrid";

// Layout: LABEL_W = 64, COL_W = 68; period n starts at 64 + (n - 1) * 68 px.
const at = (h: number, m: number) => new Date(2026, 10, 25, h, m);

describe("scrollLeftForNow: mở lưới TKB trên điện thoại đúng tiết hiện tại", () => {
  it("đang trong tiết 3 (08:40) thì cuộn tới cột tiết 3", () => {
    expect(scrollLeftForNow(at(8, 50))).toBe(64 + 2 * 68);
  });

  it("đúng giờ bắt đầu tiết 4 (09:45) thì cuộn tới tiết 4", () => {
    expect(scrollLeftForNow(at(9, 45))).toBe(64 + 3 * 68);
  });

  it("trước tiết 1 thì giữ ở đầu lưới", () => {
    expect(scrollLeftForNow(at(6, 0))).toBe(0);
  });

  it("sau tiết cuối thì giữ ở đầu lưới", () => {
    expect(scrollLeftForNow(at(23, 0))).toBe(0);
  });
});
