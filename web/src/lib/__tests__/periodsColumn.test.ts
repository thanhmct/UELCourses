import { describe, expect, it } from "vitest";
import { timeToColumn } from "../periods";

describe("timeToColumn", () => {
  it("tiết nguyên nằm đúng cột", () => {
    expect(timeToColumn("07:00")).toBe(0);
    expect(timeToColumn("07:50")).toBe(1);
    expect(timeToColumn("09:30")).toBe(3);
  });
  it("giờ nằm giữa tiết cho ra vị trí thập phân (tiết nửa)", () => {
    expect(timeToColumn("07:25")).toBeCloseTo(0.5);
    expect(timeToColumn("09:10")).toBeCloseTo(2.6);
  });
  it("giờ trong giờ nghỉ dính về tiết kế tiếp (đầu) hoặc tiết trước (cuối)", () => {
    expect(timeToColumn("09:40")).toBe(3);
  });
  it("chuỗi không hợp lệ trả null", () => {
    expect(timeToColumn("abc")).toBeNull();
  });
});
