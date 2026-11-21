import { describe, expect, it } from "vitest";
import { moduleDescription } from "../names";

describe("moduleDescription — mô tả học phần theo ngôn ngữ giao diện", () => {
  const both = { description: "Mô tả tiếng Việt", description_en: "English description" };

  it("giao diện VI dùng bản tiếng Việt, giao diện EN dùng bản tiếng Anh", () => {
    expect(moduleDescription(both, "vi")).toEqual({ text: "Mô tả tiếng Việt", fallback: false });
    expect(moduleDescription(both, "en")).toEqual({ text: "English description", fallback: false });
  });

  it("thiếu bản đúng ngôn ngữ thì dùng bản còn lại và báo fallback (không tự dịch)", () => {
    expect(moduleDescription({ description: "Chỉ có tiếng Việt" }, "en")).toEqual({ text: "Chỉ có tiếng Việt", fallback: true });
    expect(moduleDescription({ description_en: "English only" }, "vi")).toEqual({ text: "English only", fallback: true });
  });

  it("không có bản nào / chuỗi rỗng -> null, không fallback", () => {
    expect(moduleDescription({}, "vi")).toEqual({ text: null, fallback: false });
    expect(moduleDescription({ description: "  ", description_en: null }, "en")).toEqual({ text: null, fallback: false });
  });

  it("cắt khoảng trắng đầu/cuối", () => {
    expect(moduleDescription({ description_en: "  hello  " }, "en").text).toBe("hello");
  });
});
