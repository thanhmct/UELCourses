import { describe, expect, it } from "vitest";
import { appliesToCohort, articleAnchor, citationHref, effectiveBadge, normalizeArticles } from "../regulations";
import { mockAsk, mockCompare } from "@/mocks/regulations";

const now = new Date("2026-11-20T10:00:00");

describe("effectiveBadge", () => {
  it("handles each status", () => {
    expect(effectiveBadge({ status: "active", effective_from: "2022-09-01" }, now)).toBe("active");
    expect(effectiveBadge({ status: "active", effective_from: "2022-09-01", effective_to: "2027-01-10" }, now)).toBe("expiring");
    expect(effectiveBadge({ status: "active", effective_from: "2022-09-01", effective_to: "2026-01-01" }, now)).toBe("expired");
    expect(effectiveBadge({ status: "superseded", effective_from: "2019-09-01" }, now)).toBe("superseded");
    expect(effectiveBadge({ status: "active", effective_from: "2027-09-01" }, now)).toBe("upcoming");
  });
});

describe("cohort filtering & anchors", () => {
  it("matches cohorts and 'all'", () => {
    expect(appliesToCohort({ applies_to_cohorts: ["K22", "K23"] }, "K22")).toBe(true);
    expect(appliesToCohort({ applies_to_cohorts: ["K22"] }, "K25")).toBe(false);
    expect(appliesToCohort({ applies_to_cohorts: ["all"] }, "K25")).toBe(true);
    expect(appliesToCohort({ applies_to_cohorts: ["K22"] }, "")).toBe(true);
  });
  it("builds article anchors and links", () => {
    expect(articleAnchor("Điều 12")).toBe("dieu-12");
    expect(citationHref("qc-1268-2022", "Điều 9")).toBe("/regulations?doc=qc-1268-2022#dieu-9");
    expect(citationHref("qc-1268-2022", "Điều 9", "2")).toBe("/regulations?doc=qc-1268-2022#dieu-9-khoan-2");
  });
  it("normalizes loosely shaped articles", () => {
    const r = normalizeArticles([{ number: 5, title: "X", clauses: ["a", { number: 2, content: "b" }] }, null, { foo: 1 }]);
    expect(r).toEqual([{ article: "Điều 5", title: "X", text: undefined, clauses: [{ clause: "1", text: "a" }, { clause: "2", text: "b" }] }]);
    expect(normalizeArticles("nope")).toEqual([]);
  });
});

describe("mock RAG", () => {
  it("returns verbatim citations filtered by cohort", () => {
    const r = mockAsk("tối đa bao nhiêu tín chỉ một học kỳ", "K22");
    expect(r.mode).toBe("extractive");
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.citations[0].decision_no).toBe("1268/QĐ-ĐHKTL");
    expect(r.answer).toContain(r.citations[0].quote);
  });
  it("refuses without sources", () => {
    expect(mockAsk("zzzz qqqq").citations).toEqual([]);
  });
  it("compares cohorts", () => {
    const c = mockCompare("tín chỉ tối đa học kỳ", ["K22", "K25"]);
    expect(c.rows.map((r) => r.doc)).toEqual(["1268/QĐ-ĐHKTL", "2261/QĐ-ĐHKTL"]);
    expect(c.differences.length).toBe(1);
  });
});
