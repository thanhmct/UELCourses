import { describe, expect, it } from "vitest";
import { parseYearInput } from "../plannerYearInput";

const NOW = 2026;

describe("parseYearInput", () => {
  it.each<[string, { admission?: number; graduation?: number }]>([
    ["K26 TN 2029", { admission: 2026, graduation: 2029 }],
    ["khóa 26 tốt nghiệp 2030", { admission: 2026, graduation: 2030 }],
    ["NK 2025 ra trường 2029", { admission: 2025, graduation: 2029 }],
    ["adm 2025 gr 2029", { admission: 2025, graduation: 2029 }],
    ["ENR 2024 GRAD 2028", { admission: 2024, graduation: 2028 }],
    ["2025-2029", { admission: 2025, graduation: 2029 }],
    ["2025–2029", { admission: 2025, graduation: 2029 }],
    ["năm 2", { admission: 2025 }],
    ["Y1", { admission: 2026 }],
    ["year 3", { admission: 2024 }],
    ["năm nay", { graduation: 2026 }],
    ["năm sau", { graduation: 2027 }],
    ["next year", { graduation: 2027 }],
    ["+3", { graduation: 2029 }],
    ["in 4 years", { graduation: 2030 }],
    ["sau 3 năm", { graduation: 2029 }],
  ])("reads %j", (input, expected) => {
    const parsed = parseYearInput(input, NOW);
    expect(parsed.admission).toBe(expected.admission);
    expect(parsed.graduation).toBe(expected.graduation);
    expect(parsed.unknown).toEqual([]);
  });

  it("keeps text it cannot read in unknown", () => {
    const parsed = parseYearInput("K26 abc TN 2029", NOW);
    expect(parsed.admission).toBe(2026);
    expect(parsed.graduation).toBe(2029);
    expect(parsed.unknown).toEqual(["abc"]);
  });

  it("ignores years far outside the planner range", () => {
    const parsed = parseYearInput("TN 1990", NOW);
    expect(parsed.graduation).toBeUndefined();
    expect(parsed.unknown).toEqual(["1990"]);
  });

  it("returns nothing for empty input", () => {
    expect(parseYearInput("   ", NOW)).toEqual({ unknown: [] });
  });
});
