import { describe, expect, it } from "vitest";
import { en } from "../en";
import { vi } from "../vi";
import { translate } from "../index";

describe("từ điển i18n", () => {
  it("mọi khóa tiếng Việt đều có bản tiếng Anh", () => {
    const missing = Object.keys(vi).filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  it("không có khóa tiếng Anh thừa", () => {
    const extra = Object.keys(en).filter((k) => !(k in vi));
    expect(extra).toEqual([]);
  });

  it("thay biến {n} trong cả hai ngôn ngữ", () => {
    expect(translate("vi", "mod.found", { n: 12 })).toBe("12 học phần tìm thấy");
    expect(translate("en", "mod.found", { n: 12 })).toBe("12 modules found");
  });

  it("khóa lạ trả về chính khóa đó", () => {
    expect(translate("en", "khong.co.khoa")).toBe("khong.co.khoa");
  });

  it("định nghĩa đúng nhãn buổi học một ngày (Một ngày / One day)", () => {
    expect(translate("vi", "tt.oneTime")).toBe("Một ngày");
    expect(translate("en", "tt.oneTime")).toBe("One day");
  });

  it("dùng tên thứ viết gọn bằng chữ ở giao diện tiếng Việt", () => {
    expect([2, 3, 4, 5, 6, 7, 8].map((day) => translate("vi", `wd.short.${day}`)))
      .toEqual(["Hai", "Ba", "Tư", "Năm", "Sáu", "Bảy", "CN"]);
  });

  it("dịch đầy đủ tab, biểu mẫu thêm môn và câu mô phỏng GPA ở giao diện EN", () => {
    expect(translate("en", "pl.tabBoard")).toBe("Semester roadmap");
    expect(translate("en", "pl.tabGpa")).toBe("GPA");
    expect(translate("en", "gpa.add.title")).toBe("Add modules to grades");
    expect(translate("en", "gpa.sim.required", { gpa: 3.2, letter: "B+", credits: 135 }))
      .toBe("You need an average GPA of 3.2/4.0 (approximately a B+) across all 135 remaining credits.");
  });
});
