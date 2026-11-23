import { describe, expect, it } from "vitest";
import { formatLecturerName } from "../lecturers";

describe("formatLecturerName", () => {
  it("giữ nguyên học hàm và học vị ở giao diện tiếng Việt", () => {
    expect(formatLecturerName("PGS.TS. Võ Thị Lan", "vi")).toBe("PGS.TS. Võ Thị Lan");
  });

  it("đổi học hàm tiến sĩ sang tiếng Anh", () => {
    expect(formatLecturerName("PGS.TS. Võ Thị Lan", "en")).toBe("Assoc. Prof. Dr. Võ Thị Lan");
    expect(formatLecturerName("TS. Lê Thanh Hà", "en")).toBe("Dr. Lê Thanh Hà");
  });

  it("dùng Mr. hoặc Ms. cho giảng viên có học vị thạc sĩ khi xác định được", () => {
    expect(formatLecturerName("ThS. Trần Hoài Nam", "en")).toBe("Mr. Trần Hoài Nam");
    expect(formatLecturerName("ThS. Phạm Gia Hân", "en")).toBe("Ms. Phạm Gia Hân");
  });
});
