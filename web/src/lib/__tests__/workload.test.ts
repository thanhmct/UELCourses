import { describe, expect, it } from "vitest";
import { calculateWorkload, formatWorkloadString } from "../workload";

describe("workload calculation", () => {
  it("calculates standard 3-credit lecture workload", () => {
    const w = calculateWorkload(3, "Bắt buộc");
    expect(w.lecture).toBe(3);
    expect(w.total_hours).toBe(9);
    expect(formatWorkloadString(w)).toContain("9h/tuần");
  });

  it("handles practical / lab modules", () => {
    const w = calculateWorkload(2, "Thực hành");
    expect(w.practical).toBe(4);
    expect(w.total_hours).toBeGreaterThan(5);
  });

  it("handles 0 credits safely", () => {
    const w = calculateWorkload(0);
    expect(w.total_hours).toBe(0);
  });
});
