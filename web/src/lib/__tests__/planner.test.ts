import { describe, expect, it } from "vitest";
import {
  applyStandardPlan,
  buildStandardPlan,
  groupBacklogByTerm,
  moveModule,
  prerequisiteWarnings,
  sortPlannerTermsChronologically,
  suggestReplacements,
  termCredits,
  type PlanState,
} from "../planner";
import type { ProgramDetail } from "../types";
import type { TermGroup } from "../programs";

const dummyProgram: ProgramDetail = {
  program: {
    program_id: "K24406",
    name: "Hệ thống thông tin quản lý",
    cohort: "K24",
    total_credits: 130,
  },
  blocks: [
    {
      name: "Kiến thức giáo dục đại cương",
      modules: [
        {
          code: "TOAN1",
          name: "Toán cao cấp 1",
          credits: 3,
          required: true,
          suggested_order: 1,
          suggested_term: 1,
        },
        {
          code: "TOAN2",
          name: "Toán cao cấp 2",
          credits: 3,
          required: true,
          suggested_order: 2,
          suggested_term: 2,
          prereq: ["TOAN1"],
        },
        {
          code: "GDQP",
          name: "Giáo dục quốc phòng",
          credits: 8,
          required: true,
          suggested_order: null, // Chưa phân học kỳ
        },
        {
          code: "TRIETHOC",
          name: "Triết học Mác - Lênin",
          credits: 3,
          required: true,
          suggested_order: 1,
        },
        {
          code: "TUCHON1",
          name: "Môn tự chọn đại cương",
          credits: 2,
          required: false, // Tự chọn, không bắt buộc
          suggested_order: 1,
        },
      ],
    },
  ],
};

describe("planner - applyStandardPlan (hàm tạo lộ trình chuẩn)", () => {
  it("đưa các môn bắt buộc vào đúng học kỳ gợi ý của CTĐT", () => {
    const initialState: PlanState = {
      terms: [
        { id: "t1", name: "Năm 1 – HK1", modules: [] },
        { id: "t2", name: "Năm 1 – HK2", modules: [] },
      ],
      backlog: [],
      completed: [],
      catalog: {},
    };

    const nextState = applyStandardPlan(initialState, dummyProgram);

    // TOAN1 và TRIETHOC có order = 1 => vào t1
    expect(nextState.terms[0].modules).toContain("TOAN1");
    expect(nextState.terms[0].modules).toContain("TRIETHOC");

    // TOAN2 có order = 2 => vào t2
    expect(nextState.terms[1].modules).toContain("TOAN2");

    // TUCHON1 không bắt buộc (required: false) => không đưa vào term
    expect(nextState.terms[0].modules).not.toContain("TUCHON1");

    // Catalog được cập nhật
    expect(nextState.catalog["TOAN1"]).toBeDefined();
    expect(nextState.catalog["TOAN1"].credits).toBe(3);
  });

  it("loại môn đã đạt (completed): không đưa vào học kỳ và không để trong backlog", () => {
    const initialState: PlanState = {
      terms: [
        { id: "t1", name: "Năm 1 – HK1", modules: [] },
        { id: "t2", name: "Năm 1 – HK2", modules: [] },
      ],
      backlog: ["TOAN1"],
      completed: ["TOAN1"], // Đã đạt TOAN1
      catalog: {},
    };

    const nextState = applyStandardPlan(initialState, dummyProgram);

    // TOAN1 đã đạt => không đưa vào t1
    expect(nextState.terms[0].modules).not.toContain("TOAN1");
    // TRIETHOC chưa đạt => vẫn vào t1
    expect(nextState.terms[0].modules).toContain("TRIETHOC");
    // TOAN1 cũng bị loại khỏi backlog
    expect(nextState.backlog).not.toContain("TOAN1");
  });

  it("không ghi đè môn người dùng đã xếp tay: giữ nguyên vị trí môn đã xếp ở kỳ khác", () => {
    const initialState: PlanState = {
      terms: [
        { id: "t1", name: "Năm 1 – HK1", modules: [] },
        { id: "t2", name: "Năm 1 – HK2", modules: ["TOAN1"] }, // Người dùng xếp tay TOAN1 vào HK2
      ],
      backlog: [],
      completed: [],
      catalog: {},
    };

    const nextState = applyStandardPlan(initialState, dummyProgram);

    // TOAN1 vẫn ở t2 (nơi người dùng đã xếp tay), KHÔNG bị chuyển về t1
    expect(nextState.terms[1].modules).toContain("TOAN1");
    expect(nextState.terms[0].modules).not.toContain("TOAN1");
    // TOAN2 có order = 2 => được thêm vào t2 cùng với TOAN1
    expect(nextState.terms[1].modules).toContain("TOAN2");
  });

  it("không ghi đè môn người dùng đã xếp tay: giữ nguyên các môn khác đã có sẵn trong kỳ đích", () => {
    const initialState: PlanState = {
      terms: [
        { id: "t1", name: "Năm 1 – HK1", modules: ["CUSTOM_MOD"] }, // Môn tự thêm
        { id: "t2", name: "Năm 1 – HK2", modules: [] },
      ],
      backlog: [],
      completed: [],
      catalog: { CUSTOM_MOD: { code: "CUSTOM_MOD", name: "Môn tùy biến", credits: 3 } },
    };

    const nextState = applyStandardPlan(initialState, dummyProgram);

    // CUSTOM_MOD không bị ghi đè hay mất đi trong t1
    expect(nextState.terms[0].modules).toContain("CUSTOM_MOD");
    expect(nextState.terms[0].modules).toContain("TOAN1");
    expect(nextState.terms[0].modules).toContain("TRIETHOC");
  });

  it("không tự đưa môn chưa phân kỳ vào kỳ học hoặc danh sách chờ", () => {
    const initialState: PlanState = {
      terms: [
        { id: "t1", name: "Năm 1 – HK1", modules: [] },
        { id: "t2", name: "Năm 1 – HK2", modules: [] },
      ],
      backlog: ["EXTRA_MOD"], // Môn có sẵn trong backlog
      completed: [],
      catalog: {},
    };

    const nextState = applyStandardPlan(initialState, dummyProgram);

    // GDQP có order = null => không xếp vào bất kỳ kỳ nào
    for (const t of nextState.terms) {
      expect(t.modules).not.toContain("GDQP");
    }

    expect(nextState.backlog).not.toContain("GDQP");
    // Môn có sẵn trong backlog (EXTRA_MOD) vẫn được giữ
    expect(nextState.backlog).toContain("EXTRA_MOD");
    // Môn đã xếp vào kỳ (TOAN1, TRIETHOC, TOAN2) không nằm trong backlog
    expect(nextState.backlog).not.toContain("TOAN1");
    expect(nextState.backlog).not.toContain("TOAN2");
  });

  it("hỗ trợ nhận TermGroup[] trực tiếp và export alias buildStandardPlan", () => {
    const termGroups: TermGroup[] = [
      {
        order: 1,
        semester: "2024-2025-1",
        modules: [{ code: "M101", name: "Môn 101", credits: 3, required: true, block: "Cơ sở" }],
        credits: 3,
      },
      {
        order: null,
        semester: null,
        modules: [{ code: "M_UNASSIGNED", name: "Môn chưa phân", credits: 2, required: true, block: "Cơ sở" }],
        credits: 2,
      },
    ];

    const initialState: PlanState = {
      terms: [{ id: "t1", name: "HK1", modules: [] }],
      backlog: [],
      completed: [],
      catalog: {},
    };

    const nextState = buildStandardPlan(initialState, termGroups);
    expect(nextState.terms[0].modules).toContain("M101");
    expect(nextState.backlog).toEqual([]);
  });

  it("khôi phục kỳ chuẩn đã xóa mà không tạo ID trùng hoặc mất môn đã xếp", () => {
    const state: PlanState = {
      terms: [{ id: "t2", name: "HK2", modules: ["MANUAL"] }, { id: "custom", name: "Kỳ riêng", modules: [] }],
      backlog: ["GDQP"],
      completed: [],
      catalog: {},
    };
    const result = applyStandardPlan(state, dummyProgram);
    expect(result.terms.map(({ id }) => id)).toEqual([
      ...Array.from({ length: 12 }, (_, index) => `t${index + 1}`), "custom",
    ]);
    expect(result.terms[0].modules).toContain("TOAN1");
    expect(result.terms[1].modules).toEqual(["MANUAL", "TOAN2"]);
    expect(result.backlog).toEqual(["GDQP"]);
    expect(applyStandardPlan(result, dummyProgram)).toEqual(result);
  });
});

describe("planner - groupBacklogByTerm (danh sách chờ theo nhóm kỳ)", () => {
  it("nhóm các môn trong backlog theo thứ tự kỳ gợi ý và tính tín chỉ", () => {
    const backlog = ["TOAN1", "TOAN2", "GDQP", "EXTRA"];
    const catalog = {
      TOAN1: { code: "TOAN1", name: "Toán 1", credits: 3, suggested_order: 1 },
      TOAN2: { code: "TOAN2", name: "Toán 2", credits: 3, suggested_order: 2 },
      GDQP: { code: "GDQP", name: "GDQP", credits: 8, suggested_order: null },
      EXTRA: { code: "EXTRA", name: "Môn khác", credits: 2 }, // Không có suggested_order
    };

    const groups = groupBacklogByTerm(backlog, catalog);

    expect(groups.length).toBe(3); // Kỳ 1, Kỳ 2, Chưa phân học kỳ
    expect(groups[0].order).toBe(1);
    expect(groups[0].modules).toEqual(["TOAN1"]);
    expect(groups[0].credits).toBe(3);

    expect(groups[1].order).toBe(2);
    expect(groups[1].modules).toEqual(["TOAN2"]);
    expect(groups[1].credits).toBe(3);

    const unassigned = groups.find((g) => g.order === null);
    expect(unassigned).toBeDefined();
    expect(unassigned?.modules).toContain("GDQP");
    expect(unassigned?.modules).toContain("EXTRA");
    expect(unassigned?.credits).toBe(10);
  });
});

describe("planner - pure helpers", () => {
  it("sắp xếp học kỳ theo năm rồi đến HK, không theo thời điểm thêm", () => {
    const terms = [
      { id: "y4t3", name: "Năm 4 · Học kỳ 3", modules: [] },
      { id: "y3t2b", name: "năm 3 kỳ 2", modules: [] },
      { id: "y1t2", name: "Năm 1 – HK2", modules: [] },
      { id: "y3t1", name: "Năm 3 · Học kỳ 1", modules: [] },
      { id: "y3t2a", name: "Năm 3 – HK2", modules: [] },
    ];

    expect(sortPlannerTermsChronologically(terms).map(({ id }) => id)).toEqual([
      "y1t2",
      "y3t1",
      "y3t2b",
      "y3t2a",
      "y4t3",
    ]);
  });

  it("moveModule chuyển môn giữa backlog và học kỳ", () => {
    const s0: PlanState = {
      terms: [{ id: "t1", name: "HK1", modules: ["A"] }],
      backlog: ["B"],
      completed: [],
      catalog: {},
    };

    const s1 = moveModule(s0, "A", "backlog");
    expect(s1.terms[0].modules).toEqual([]);
    expect(s1.backlog).toEqual(["B", "A"]);

    const s2 = moveModule(s1, "B", "t1");
    expect(s2.terms[0].modules).toEqual(["B"]);
    expect(s2.backlog).toEqual(["A"]);
  });

  it("termCredits tính tổng tín chỉ của học kỳ", () => {
    const s: PlanState = {
      terms: [{ id: "t1", name: "HK1", modules: ["A", "B"] }],
      backlog: [],
      completed: [],
      catalog: {
        A: { code: "A", name: "A", credits: 3 },
        B: { code: "B", name: "B", credits: 4 },
      },
    };
    expect(termCredits(s, "t1")).toBe(7);
    expect(termCredits(s, "non-existent")).toBe(0);
  });

  it("prerequisiteWarnings cảnh báo môn xếp trước môn tiên quyết", () => {
    const s: PlanState = {
      terms: [
        { id: "t1", name: "HK1", modules: ["TOAN2"] },
        { id: "t2", name: "HK2", modules: ["TOAN1"] },
      ],
      backlog: [],
      completed: [],
      catalog: {
        TOAN1: { code: "TOAN1", name: "Toán 1", credits: 3 },
        TOAN2: { code: "TOAN2", name: "Toán 2", credits: 3, prerequisites: ["TOAN1"] },
      },
    };
    const warnings = prerequisiteWarnings(s);
    expect(warnings.length).toBe(1);
    expect(warnings[0].code).toBe("TOAN2");
    expect(warnings[0].missing).toEqual(["TOAN1"]);
  });

  it("suggestReplacements gợi ý các môn tương đương chưa có trong kế hoạch", () => {
    const s: PlanState = {
      terms: [{ id: "t1", name: "HK1", modules: ["A"] }],
      backlog: [],
      completed: [],
      catalog: {
        A: {
          code: "A",
          name: "A",
          credits: 3,
          equivalents: [
            { code: "A_EQ1", name: "A Tương đương 1", credits: 3 },
            { code: "A_EQ2", name: "A Tương đương 2", credits: 3 },
          ],
        },
      },
    };
    const repls = suggestReplacements(s, "A");
    expect(repls.map((r) => r.code)).toEqual(["A_EQ1", "A_EQ2"]);
  });
});
