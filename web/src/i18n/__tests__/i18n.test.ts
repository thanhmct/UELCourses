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
});
