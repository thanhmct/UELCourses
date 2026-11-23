import { describe, expect, it } from "vitest";
import { requiredByTerm } from "@/lib/programs";
import type { ProgramDetail } from "@/lib/types";

const mod = (code: string, credits: number, required: boolean, order: number | null) => ({
  code, name: code, credits, required, suggested_order: order, suggested_semester: order ? `2024-2025-${order}` : null,
});

const prog = {
  program: { program_id: "K24404", name: "x", cohort: "K24", total_credits: 0, module_count: 0 },
  blocks: [
    { name: "Đại cương", modules: [mod("B2", 3, true, 2), mod("A1", 2, true, 1), mod("T1", 3, false, 1)] },
    { name: "Chuyên ngành", modules: [mod("C9", 4, true, null), mod("A0", 3, true, 1)] },
  ],
} as unknown as ProgramDetail;

describe("requiredByTerm", () => {
  const g = requiredByTerm(prog);
  it("chỉ lấy môn bắt buộc, nhóm theo kỳ, kỳ chưa phân ở cuối", () => {
    expect(g.map((x) => x.order)).toEqual([1, 2, null]);
    expect(g[0].modules.map((m) => m.code)).toEqual(["A0", "A1"]);
    expect(g.flatMap((x) => x.modules).some((m) => m.code === "T1")).toBe(false);
  });
  it("cộng tín chỉ từng kỳ", () => {
    expect(g.map((x) => x.credits)).toEqual([5, 3, 4]);
  });
});
