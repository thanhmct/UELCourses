import { describe, expect, it } from "vitest";
import { api } from "../api";
import { mockElectiveGroups } from "@/mocks/programs";

describe("api.electiveGroups and mockElectiveGroups", () => {
  it("trả về danh sách nhóm tự chọn cho CTĐT hợp lệ", async () => {
    const res = await api.electiveGroups("K23406");
    expect(res).toBeDefined();
    expect(Array.isArray(res.data)).toBe(true);

    if (res.data.length > 0) {
      const g = res.data[0];
      expect(g).toHaveProperty("block");
      expect(g).toHaveProperty("required_credits");
      expect(typeof g.required_credits).toBe("number");
      expect(g).toHaveProperty("available_credits");
      expect(Array.isArray(g.modules)).toBe(true);
      // All modules in an elective group are non-required
      for (const m of g.modules) {
        expect(m.required).toBe(false);
      }
    }
  });

  it("trả về mảng rỗng khi program_id không tồn tại", async () => {
    const res = await api.electiveGroups("UNKNOWN_PROG_XYZ");
    expect(res.data).toEqual([]);
    expect(mockElectiveGroups("NON_EXISTENT_ID")).toEqual([]);
  });

  it("mockElectiveGroups tính toán số tín chỉ khả dụng đúng theo tổng tín chỉ các môn", () => {
    const groups = mockElectiveGroups("K23406");
    for (const g of groups) {
      const sumCredits = g.modules.reduce((sum, m) => sum + (m.credits || 0), 0);
      expect(g.available_credits).toBe(sumCredits);
      expect(g.required_credits).toBeLessThanOrEqual(g.available_credits);
    }
  });
});
