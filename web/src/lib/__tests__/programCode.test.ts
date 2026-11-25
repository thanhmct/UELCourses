import { describe, expect, it } from "vitest";
import {
  cleanMajorName,
  describeProgramCode,
  describeProgramCodeFull,
  formatCohortYear,
  formatFilterBannerText,
  kindOfSuffix,
  parseProgramCode,
} from "../programCode";

describe("programCode helpers", () => {
  it("formats cohort 2-digit to 4-digit year", () => {
    expect(formatCohortYear("K25")).toBe("2025");
    expect(formatCohortYear("K19")).toBe("2019");
    expect(formatCohortYear("K24")).toBe("2024");
    expect(formatCohortYear("2025")).toBe("2025");
  });

  it("cleans major names by stripping trailing Khóa/Khoá and extra suffixes", () => {
    expect(cleanMajorName("Kế toán Khoá 24")).toBe("Kế toán");
    expect(cleanMajorName("Kế toán Khóa 25")).toBe("Kế toán");
    expect(cleanMajorName("Kinh tế học Khóa 19")).toBe("Kinh tế học");
    expect(cleanMajorName("Hệ thống thông tin quản lý (Hệ tiếng Anh)")).toBe(
      "Hệ thống thông tin quản lý",
    );
    expect(cleanMajorName("KDTMHQ Khóa 26")).toBe("Kinh doanh thương mại Hàn Quốc");
    expect(cleanMajorName(null)).toBe("");
    expect(cleanMajorName(undefined)).toBe("");
  });

  it("determines class kind from suffix correctly", () => {
    expect(kindOfSuffix("A")).toBe("standard");
    expect(kindOfSuffix("B")).toBe("standard");
    expect(kindOfSuffix("C")).toBe("standard");
    expect(kindOfSuffix("E")).toBe("english");
    expect(kindOfSuffix("E1")).toBe("english");
    expect(kindOfSuffix("E2")).toBe("english");
    expect(kindOfSuffix("T")).toBe("talent");
    expect(kindOfSuffix("H")).toBe("coop");
    expect(kindOfSuffix("")).toBe("standard");
    expect(kindOfSuffix("X")).toBe("other");
  });

  it("parses valid class codes", () => {
    const p1 = parseProgramCode("K25405A");
    expect(p1).not.toBeNull();
    expect(p1?.cohort).toBe("K25");
    expect(p1?.major).toBe("405");
    expect(p1?.suffix).toBe("A");
    expect(p1?.kind).toBe("standard");
    expect(p1?.english).toBe(false);

    const p2 = parseProgramCode("K23406E1");
    expect(p2).not.toBeNull();
    expect(p2?.cohort).toBe("K23");
    expect(p2?.major).toBe("406");
    expect(p2?.suffix).toBe("E1");
    expect(p2?.kind).toBe("english");
    expect(p2?.english).toBe(true);

    const p3 = parseProgramCode("K24416H");
    expect(p3).not.toBeNull();
    expect(p3?.kind).toBe("coop");

    const p4 = parseProgramCode("K25405T");
    expect(p4).not.toBeNull();
    expect(p4?.kind).toBe("talent");
  });

  it("keeps original describeProgramCode behavior intact", () => {
    const p = parseProgramCode("K23406E1")!;
    expect(describeProgramCode(p)).toBe("Khóa 23 · CTĐT 406 · hệ tiếng Anh · lớp E1");
  });
});

describe("describeProgramCodeFull (Brief W5 requirements)", () => {
  it("describes suffix A with standard track in Vietnamese", () => {
    const parsed = parseProgramCode("K25405A")!;
    const desc = describeProgramCodeFull(parsed, "Kế toán", "vi");
    expect(desc).toBe(
      "Khóa 2025, chương trình đào tạo ngành Kế toán, chương trình tiếng Việt.",
    );
  });

  it("describes suffix B with standard track in Vietnamese", () => {
    const parsed = parseProgramCode("K25405B")!;
    const desc = describeProgramCodeFull(parsed, "Kế toán", "vi");
    expect(desc).toBe(
      "Khóa 2025, chương trình đào tạo ngành Kế toán, chương trình tiếng Việt.",
    );
  });

  it("describes suffix C with standard track in Vietnamese", () => {
    const parsed = parseProgramCode("K25405C")!;
    const desc = describeProgramCodeFull(parsed, "Kế toán", "vi");
    expect(desc).toBe(
      "Khóa 2025, chương trình đào tạo ngành Kế toán, chương trình tiếng Việt.",
    );
  });

  it("describes suffix E with English track in Vietnamese", () => {
    const parsed = parseProgramCode("K25405E")!;
    const desc = describeProgramCodeFull(parsed, "Kế toán", "vi");
    expect(desc).toBe(
      "Khóa 2025, chương trình đào tạo ngành Kế toán, chương trình tiếng Anh.",
    );
  });

  it("describes suffix E1 with English track in Vietnamese", () => {
    const parsed = parseProgramCode("K25405E1")!;
    const desc = describeProgramCodeFull(parsed, "Kế toán", "vi");
    expect(desc).toBe(
      "Khóa 2025, chương trình đào tạo ngành Kế toán, chương trình tiếng Anh.",
    );
  });

  it("describes suffix T with Talent Bachelor track in Vietnamese", () => {
    const parsed = parseProgramCode("K25405T")!;
    const desc = describeProgramCodeFull(parsed, "Kế toán", "vi");
    expect(desc).toBe(
      "Khóa 2025, chương trình đào tạo ngành Kế toán, chương trình Cử nhân tài năng.",
    );
  });

  it("describes suffix H (Coop) without official name in data in Vietnamese", () => {
    const parsed = parseProgramCode("K25405H")!;
    const desc = describeProgramCodeFull(parsed, "Kế toán", "vi");
    expect(desc).toBe(
      "Khóa 2025, chương trình đào tạo ngành Kế toán, Coop Khóa 25.",
    );
  });

  it("describes suffix H (Coop) with official name in data in Vietnamese", () => {
    const parsed = parseProgramCode("K25405H")!;
    const desc = describeProgramCodeFull(
      parsed,
      "Kế toán",
      "vi",
      "Chương trình đào tạo Coop Kế toán",
    );
    expect(desc).toBe(
      "Khóa 2025, chương trình đào tạo ngành Kế toán, Coop Khóa 25.",
    );
  });

  it("describes suffix H (Coop) when programName contains Coop", () => {
    const parsed = parseProgramCode("K25405H")!;
    const desc = describeProgramCodeFull(parsed, "Kế toán Coop", "vi");
    expect(desc).toBe(
      "Khóa 2025, chương trình đào tạo ngành Kế toán Coop, Coop Khóa 25.",
    );
  });

  it("describes codes without program name using major code fallback in Vietnamese", () => {
    const parsed = parseProgramCode("K25405A")!;
    const desc = describeProgramCodeFull(parsed, null, "vi");
    expect(desc).toBe(
      "Khóa 2025, chương trình đào tạo mã ngành 405, chương trình tiếng Việt.",
    );
  });

  it("cleans raw program names from data (e.g. stripping 'Khoá 24')", () => {
    const parsed = parseProgramCode("K25405A")!;
    const desc = describeProgramCodeFull(parsed, "Kế toán Khoá 24", "vi");
    expect(desc).toBe(
      "Khóa 2025, chương trình đào tạo ngành Kế toán, chương trình tiếng Việt.",
    );
  });

  describe("English language (EN) outputs", () => {
    it("describes standard track in English", () => {
      const parsed = parseProgramCode("K25405A")!;
      const desc = describeProgramCodeFull(parsed, "Accounting", "en");
      expect(desc).toBe(
        "Cohort 2025, undergraduate programme in Accounting, Vietnamese-language programme.",
      );
    });

    it("translates Vietnamese major name when in English mode", () => {
      const parsed = parseProgramCode("K25405A")!;
      const desc = describeProgramCodeFull(parsed, "Kế toán", "en");
      expect(desc).toBe(
        "Cohort 2025, undergraduate programme in Accounting, Vietnamese-language programme.",
      );
    });

    it("describes English track in English", () => {
      const parsed = parseProgramCode("K25405E1")!;
      const desc = describeProgramCodeFull(parsed, "Accounting", "en");
      expect(desc).toBe(
        "Cohort 2025, undergraduate programme in Accounting, English-language programme.",
      );
    });

    it("describes Talent track in English", () => {
      const parsed = parseProgramCode("K25405T")!;
      const desc = describeProgramCodeFull(parsed, "Accounting", "en");
      expect(desc).toBe(
        "Cohort 2025, undergraduate programme in Accounting, Talent Bachelor programme.",
      );
    });

    it("describes Coop track without official name in English", () => {
      const parsed = parseProgramCode("K25405H")!;
      const desc = describeProgramCodeFull(parsed, "Accounting", "en");
      expect(desc).toBe(
        "Cohort 2025, undergraduate programme in Accounting, Co-op Cohort 25.",
      );
    });

    it("describes Coop track with official name in English", () => {
      const parsed = parseProgramCode("K25405H")!;
      const desc = describeProgramCodeFull(
        parsed,
        "Accounting",
        "en",
        "Enterprise Accounting Co-op",
      );
      expect(desc).toBe(
        "Cohort 2025, undergraduate programme in Accounting, Co-op Cohort 25.",
      );
    });

    it("describes code without major name in English", () => {
      const parsed = parseProgramCode("K25405A")!;
      const desc = describeProgramCodeFull(parsed, null, "en");
      expect(desc).toBe(
        "Cohort 2025, undergraduate programme in major code 405, Vietnamese-language programme.",
      );
    });
  });

  describe("formatFilterBannerText (Brief W11 requirements)", () => {
    it("formats standard track in Vietnamese with 2-digit cohort", () => {
      // Ví dụ trong đề bài: "Chương trình đào tạo ngành Công nghệ tài chính khóa 24"
      const res = formatFilterBannerText("K24414", "Công nghệ tài chính Khóa 24", "vi");
      expect(res).toBe("Chương trình đào tạo ngành Công nghệ tài chính khóa 24");
    });

    it("formats standard track with suffix A/B/C without adding suffix", () => {
      const res = formatFilterBannerText("K24416A", "Kinh doanh số và Trí tuệ nhân tạo Khóa 24", "vi");
      expect(res).toBe("Chương trình đào tạo ngành Kinh doanh số và Trí tuệ nhân tạo khóa 24");
    });

    it("formats English track (E) in Vietnamese", () => {
      // Ví dụ trong đề bài: "Chương trình đào tạo ngành Tài chính - Ngân hàng khóa 25, chương trình tiếng Anh"
      const res = formatFilterBannerText("K25404E", "Tài chính - Ngân hàng Khóa 25", "vi");
      expect(res).toBe("Chương trình đào tạo ngành Tài chính - Ngân hàng khóa 25, chương trình tiếng Anh");

      const res2 = formatFilterBannerText("K23406E1", "Hệ thống thông tin quản lý Khóa 23", "vi");
      expect(res2).toBe("Chương trình đào tạo ngành Hệ thống thông tin quản lý khóa 23, chương trình tiếng Anh");
    });

    it("formats Talent track (T) in Vietnamese", () => {
      const res = formatFilterBannerText("K24404T", "Tài chính - Ngân hàng Khóa 24", "vi");
      expect(res).toBe("Chương trình đào tạo ngành Tài chính - Ngân hàng khóa 24, chương trình Cử nhân tài năng");
    });

    it("formats Coop track (H) without official name in Vietnamese", () => {
      const res = formatFilterBannerText("K23406H", "Hệ thống thông tin quản lý Khóa 23", "vi");
      expect(res).toBe("Chương trình đào tạo ngành Hệ thống thông tin quản lý khóa 23, Coop Khóa 23");
    });

    it("formats Coop track (H) with official name in Vietnamese", () => {
      const res = formatFilterBannerText(
        "K23406H",
        "Hệ thống thông tin quản lý Khóa 23",
        "vi",
        "Chương trình Coop Logistics",
      );
      expect(res).toBe("Chương trình đào tạo ngành Hệ thống thông tin quản lý khóa 23, Coop Khóa 23");
    });

    it("formats fallback when major name has not loaded yet in Vietnamese", () => {
      // Ví dụ trong đề bài: "Chương trình đào tạo mã ngành 414 khóa 24"
      const res = formatFilterBannerText("K24414", null, "vi");
      expect(res).toBe("Chương trình đào tạo mã ngành 414 khóa 24");

      const resE = formatFilterBannerText("K25404E", null, "vi");
      expect(resE).toBe("Chương trình đào tạo mã ngành 404 khóa 25, chương trình tiếng Anh");

      const resT = formatFilterBannerText("K24404T", null, "vi");
      expect(resT).toBe("Chương trình đào tạo mã ngành 404 khóa 24, chương trình Cử nhân tài năng");
    });

    it("formats standard track in English", () => {
      // Ví dụ trong đề bài: "Undergraduate programme in Financial Technology, cohort 24"
      const res = formatFilterBannerText("K24414", "Công nghệ tài chính Khóa 24", "en");
      expect(res).toBe("Undergraduate programme in Financial Technology, cohort 24");
    });

    it("formats English track (E) in English", () => {
      const res = formatFilterBannerText("K25404E", "Tài chính - Ngân hàng Khóa 25", "en");
      expect(res).toBe("Undergraduate programme in Finance - Banking, cohort 25, English-language programme");
    });

    it("formats Talent track (T) in English", () => {
      const res = formatFilterBannerText("K24404T", "Tài chính - Ngân hàng Khóa 24", "en");
      expect(res).toBe("Undergraduate programme in Finance - Banking, cohort 24, Talent Bachelor programme");
    });

    it("formats Coop track (H) in English", () => {
      const res = formatFilterBannerText("K23406H", "Hệ thống thông tin quản lý Khóa 23", "en");
      expect(res).toBe("Undergraduate programme in Management Information Systems, cohort 23, Co-op Cohort 23");
    });

    it("formats fallback when major name has not loaded yet in English", () => {
      const res = formatFilterBannerText("K24414", null, "en");
      expect(res).toBe("Undergraduate programme in major code 414, cohort 24");

      const resE = formatFilterBannerText("K25404E", null, "en");
      expect(resE).toBe("Undergraduate programme in major code 404, cohort 25, English-language programme");
    });
  });

  describe("Brief W31 & D8: Program aliases, master/doctoral class codes", () => {
    it("resolves old program aliases (-V2, -V3, LKT) to canonical codes", () => {
      expect(parseProgramCode("K25414-V2")?.normalized).toBe("K25414H");
      expect(parseProgramCode("K25414-V2")?.programId).toBe("K25414");
      expect(parseProgramCode("K25414-V2")?.contextualProgramId).toBe("K25414H");
      expect(parseProgramCode("K25414-V2")?.kind).toBe("coop");

      expect(parseProgramCode("K26414-V2")?.normalized).toBe("K26414H");
      expect(parseProgramCode("K25405-V3")?.normalized).toBe("K25405E");
      expect(parseProgramCode("K25405-V3")?.english).toBe(true);

      expect(parseProgramCode("K25405-V2")?.normalized).toBe("K25422");
      expect(parseProgramCode("K25405-V2")?.major).toBe("422");

      expect(parseProgramCode("K25LKT-V2")?.normalized).toBe("K25502");
      expect(parseProgramCode("K25LKT-V2")?.major).toBe("502");

      expect(parseProgramCode("K25LKT")?.normalized).toBe("K25501");
      expect(parseProgramCode("K25LKT")?.major).toBe("501");

      expect(parseProgramCode("K25409-V2")?.normalized).toBe("K25409");
      expect(parseProgramCode("K25418-V2")?.normalized).toBe("K25418");
    });

    it("parses master's class codes (prefix C) with degree=thac_si", () => {
      const c1 = parseProgramCode("C24601");
      expect(c1).not.toBeNull();
      expect(c1?.degree).toBe("thac_si");
      expect(c1?.cohort).toBe("C24");
      expect(c1?.major).toBe("601");
      expect(c1?.programId).toBe("M601");
      expect(c1?.kind).toBe("standard");

      const c2 = parseProgramCode("C25603-2-UD");
      expect(c2).not.toBeNull();
      expect(c2?.degree).toBe("thac_si");
      expect(c2?.cohort).toBe("C25");
      expect(c2?.major).toBe("603");
      expect(c2?.branch).toBe("UD");
      expect(c2?.programId).toBe("M603UD");
      expect(c2?.kind).toBe("applied");

      const c3 = parseProgramCode("C26657-1-UD");
      expect(c3).not.toBeNull();
      expect(c3?.degree).toBe("thac_si");
      expect(c3?.cohort).toBe("C26");
      expect(c3?.major).toBe("657");
      expect(c3?.branch).toBe("UD");
      expect(c3?.programId).toBe("M657UD");
      expect(c3?.kind).toBe("applied");
    });

    it("parses doctoral class codes (prefix N) with degree=tien_si", () => {
      const n1 = parseProgramCode("N25701-1");
      expect(n1).not.toBeNull();
      expect(n1?.degree).toBe("tien_si");
      expect(n1?.cohort).toBe("N25");
      expect(n1?.major).toBe("701");
      expect(n1?.programId).toBe("N701");

      const n2 = parseProgramCode("N25704-DB");
      expect(n2).not.toBeNull();
      expect(n2?.degree).toBe("tien_si");
      expect(n2?.cohort).toBe("N25");
      expect(n2?.major).toBe("704");
    });

    it("parses prefix B as undergraduate degree=dai_hoc", () => {
      const b1 = parseProgramCode("B24501BDTH");
      expect(b1).not.toBeNull();
      expect(b1?.degree).toBe("dai_hoc");
      expect(b1?.cohort).toBe("B24");
      expect(b1?.major).toBe("501");
    });

    it("describes master's program codes in VI and EN", () => {
      const c1 = parseProgramCode("C24601")!;
      expect(describeProgramCodeFull(c1, "Kinh tế chính trị", "vi")).toBe(
        "Chương trình thạc sĩ ngành Kinh tế chính trị.",
      );
      expect(describeProgramCodeFull(c1, "Kinh tế chính trị", "en")).toBe(
        "Master's programme in Political Economy.",
      );

      const c2 = parseProgramCode("C25603-2-UD")!;
      expect(describeProgramCodeFull(c2, "Kinh tế và Quản lý công", "vi")).toBe(
        "Chương trình thạc sĩ ngành Kinh tế và Quản lý công, hướng ứng dụng.",
      );
      expect(describeProgramCodeFull(c2, "Kinh tế và Quản lý công", "en")).toBe(
        "Master's programme in Economics and Public Management, applied track.",
      );
    });

    it("describes doctoral program codes without enrollment cohorts in VI and EN", () => {
      const n1 = parseProgramCode("N25701-1")!;
      expect(describeProgramCodeFull(n1, null, "vi")).toBe(
        "Chương trình tiến sĩ ngành mã 701.",
      );
      expect(describeProgramCodeFull(n1, null, "en")).toBe(
        "Doctoral programme in major code 701.",
      );
    });
  });
});
