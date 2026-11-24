import { describe, expect, it } from "vitest";
import { extractOutline } from "@/lib/vault";

describe("extractOutline", () => {
  it("tạo key duy nhất khi số Điều bị lặp", () => {
    const outline = extractOutline([
      "## Điều 3. Phạm vi áp dụng",
      "## Điều 4. Trách nhiệm thi hành",
      "## Điều 3. Điều kiện chung",
    ].join("\n"));

    expect(outline.map(({ key, anchor }) => ({ key, anchor }))).toEqual([
      { key: "dieu-3", anchor: "dieu-3" },
      { key: "dieu-4", anchor: "dieu-4" },
      { key: "dieu-3-2", anchor: "dieu-3" },
    ]);
  });
});
