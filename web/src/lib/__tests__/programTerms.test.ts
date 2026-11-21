import { describe, expect, it } from "vitest";
import { migratePlannerState, PROGRAM_TERMS } from "../store";

describe("học kỳ trong Planner", () => {
  it("HK3 là học kỳ chính thức, không có nhãn hè", () => {
    expect(PROGRAM_TERMS).toHaveLength(12);
    expect(PROGRAM_TERMS.slice(0, 4).map((t) => t.name)).toEqual(["Năm 1 – HK1", "Năm 1 – HK2", "Năm 1 – HK3", "Năm 2 – HK1"]);
    expect(PROGRAM_TERMS.some((t) => /hè/i.test(t.name))).toBe(false);
    expect(PROGRAM_TERMS[11].name).toBe("Năm 4 – HK3");
  });

  it("chuyển bản lưu cũ: HKhè -> HK3, giữ nguyên tên người dùng tự đặt và học phần", () => {
    const old = { terms: [{ id: "t3", name: "Năm 1 – HKhè", modules: ["A1"] }, { id: "x", name: "Kỳ của tôi", modules: [] }], completed: ["Z"] };
    const out = migratePlannerState(old, 0) as typeof old;
    expect(out.terms.map((t) => t.name)).toEqual(["Năm 1 – HK3", "Kỳ của tôi"]);
    expect(out.terms[0].modules).toEqual(["A1"]);
    expect(out.completed).toEqual(["Z"]);
  });

  it("không đụng vào bản đã ở phiên bản mới hoặc dữ liệu lạ", () => {
    const cur = { terms: [{ id: "t3", name: "Năm 1 – HKhè", modules: [] }] };
    expect(migratePlannerState(cur, 1)).toBe(cur);
    expect(migratePlannerState(null, 0)).toBeNull();
    expect(migratePlannerState({ terms: "lạ" }, 0)).toEqual({ terms: "lạ" });
  });
});
