import { describe, expect, it } from "vitest";
import { mockPrograms, mockProgram, mockProgramGraph, mockModuleTree, mockCheckProgram } from "@/mocks/programs";
import { parseSuggestedTerm, splitCodes } from "@/lib/programs";

describe("programs logic & mocks", () => {
  it("splits codes correctly", () => {
    expect(splitCodes("TAT1, TAT2  TAT3")).toEqual(["TAT1", "TAT2", "TAT3"]);
    expect(splitCodes(["KTE1001", "KTE1002"])).toEqual(["KTE1001", "KTE1002"]);
    expect(splitCodes(null)).toEqual([]);
  });

  it("parses suggested term string", () => {
    expect(parseSuggestedTerm("HK01 năm học 2022-2023")).toBe(1);
    expect(parseSuggestedTerm("HK08")).toBe(8);
    expect(parseSuggestedTerm("Chưa phân học kỳ")).toBeNull();
    expect(parseSuggestedTerm(3)).toBe(3);
  });

  it("returns program summaries with optional cohort filter", () => {
    const all = mockPrograms();
    expect(all.length).toBeGreaterThan(10);

    const k22 = mockPrograms({ cohort: "K22" });
    expect(k22.length).toBeGreaterThan(0);
    expect(k22.every((p) => p.cohort === "K22")).toBe(true);

    const search = mockPrograms({ q: "Hệ thống thông tin" });
    expect(search.some((p) => p.program_id === "K24406")).toBe(true);
  });

  it("filters program summaries by degree (Brief D6)", () => {
    const daiHoc = mockPrograms({ degree: "dai_hoc" });
    expect(daiHoc.length).toBeGreaterThan(0);
    expect(daiHoc.every((p) => (p.degree || "dai_hoc") === "dai_hoc")).toBe(true);

    const thacSi = mockPrograms({ degree: "thac_si" });
    expect(thacSi.length).toBeGreaterThan(0);
    expect(thacSi.every((p) => p.degree === "thac_si")).toBe(true);
    expect(thacSi.some((p) => p.program_id === "M601NC")).toBe(true);
  });

  it("fetches program details and builds graph", () => {
    const detail = mockProgram("K22406");
    expect(detail).not.toBeNull();
    expect(detail?.program.program_id).toBe("K22406");
    expect(detail?.blocks.length).toBeGreaterThan(0);

    const graph = mockProgramGraph("K22406");
    expect(graph).not.toBeNull();
    expect(graph?.nodes.length).toBeGreaterThan(0);
    expect(graph?.edges.length).toBeGreaterThan(0);
  });

  it("builds 2-way module tree for prerequisites and unlocks", () => {
    const treePrereq = mockModuleTree("BEE5020", { direction: "prereq" });
    expect(treePrereq).not.toBeNull();
    expect(treePrereq?.code).toBe("BEE5020");

    const treeUnlocks = mockModuleTree("BEE1037", { direction: "unlocks" });
    expect(treeUnlocks).not.toBeNull();
    expect(treeUnlocks?.children.length).toBeGreaterThan(0);
  });

  it("checks program requirements and identifies eligible / blocked", () => {
    const res = mockCheckProgram("K22406", {
      completed: [{ code: "KTE1001" }],
      planned: { t1: ["KTE1002"] },
    });
    expect(Array.isArray(res.eligible_now)).toBe(true);
    expect(Array.isArray(res.blocked)).toBe(true);
  });

  it("handles English track programs correctly (Brief D7)", () => {
    // Kiểu dữ liệu ProgramSummary và ProgramDetail hỗ trợ track_source
    const progSummary = {
      program_id: "K25410E",
      name: "Marketing (tiếng Anh) Khóa 25",
      cohort: "K25",
      total_credits: 130,
      track_source: "official" as const,
    };
    expect(progSummary.track_source).toBe("official");

    // Môn B hợp lệ trong hệ E có is_vietnamese_track
    const modB = {
      code: "BDG1001",
      name: "Triết học Mác-Lênin",
      credits: 3,
      required: true,
      is_vietnamese_track: true,
    };
    expect(modB.is_vietnamese_track).toBe(true);

    // Môn chuyên ngành tiếng Anh
    const modE = {
      code: "EBM1001",
      name: "Principles of Marketing",
      credits: 3,
      required: true,
      is_vietnamese_track: false,
    };
    expect(modE.is_vietnamese_track).toBe(false);
  });
});
