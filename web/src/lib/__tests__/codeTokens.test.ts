import { describe, expect, it } from "vitest";
import { activeToken, finishedCodes, rankSuggestions, replaceActiveToken } from "../codeTokens";

describe("activeToken", () => {
  it("là đoạn cuối sau dấu phẩy", () => {
    expect(activeToken("BIM5011, BFF").token).toBe("BFF");
    expect(activeToken("BIM5011,BFF").token).toBe("BFF");
  });
  it("rỗng khi vừa gõ dấu ngăn", () => {
    expect(activeToken("BIM5011, ").token).toBe("");
    expect(activeToken("BIM5011,").token).toBe("");
    expect(activeToken("").token).toBe("");
  });
  it("xuống dòng và chấm phẩy cũng bắt đầu mã mới", () => {
    expect(activeToken("A1\nBFF4").token).toBe("BFF4");
    expect(activeToken("A1; BF").token).toBe("BF");
  });
});

describe("replaceActiveToken", () => {
  it("thay mã dở bằng mã chọn rồi thêm dấu phẩy để gõ tiếp", () => {
    expect(replaceActiveToken("BIM5011, BFF", "BFF4002")).toBe("BIM5011, BFF4002, ");
    expect(replaceActiveToken("BFF", "BFF4002")).toBe("BFF4002, ");
  });
});

describe("finishedCodes / rankSuggestions", () => {
  it("chỉ lấy các mã đã gõ xong, viết hoa, bỏ trùng", () => {
    expect(finishedCodes("bim5011, bim5011, BFF")).toEqual(["BIM5011"]);
    expect(finishedCodes("BFF")).toEqual([]);
  });
  it("bỏ mã đã có và đưa mã bắt đầu bằng phần đang gõ lên trước", () => {
    const items = [{ code: "XBFF1" }, { code: "BFF4002" }, { code: "BFF3010" }, { code: "BIM5011" }];
    expect(rankSuggestions(items, "bff", ["BFF4002"]).map((m) => m.code)).toEqual(["BFF3010", "BIM5011", "XBFF1"]); // mã bắt đầu bằng "BFF" trước, còn lại theo thứ tự mã
  });
});
