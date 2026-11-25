import { beforeEach, describe, expect, it } from "vitest";
import {
  pickReviewSemesters,
  readSubmitted,
  saveSubmitted,
  submittedKey,
  uniqueCourseCodes,
} from "../courseReviews";
import type { Semester } from "@/lib/types";

const sem = (id: string, year: string, term: number, is_current = false): Semester => ({
  id,
  name: id,
  year,
  term,
  is_current,
});

describe("pickReviewSemesters", () => {
  it("chọn học kỳ trước và học kỳ hiện tại theo thứ tự thời gian", () => {
    const list = [
      sem("2025-2026-1", "2025-2026", 1),
      sem("2025-2026-2", "2025-2026", 2),
      sem("2026-2027-1", "2026-2027", 1, true),
      sem("2026-2027-2", "2026-2027", 2),
    ];
    expect(pickReviewSemesters(list).map((s) => s.id)).toEqual(["2025-2026-2", "2026-2027-1"]);
  });

  it("chỉ có học kỳ hiện tại khi nó là học kỳ đầu tiên", () => {
    const list = [sem("2026-2027-1", "2026-2027", 1, true)];
    expect(pickReviewSemesters(list).map((s) => s.id)).toEqual(["2026-2027-1"]);
  });

  it("không có cờ hiện tại thì coi học kỳ cuối là học kỳ hiện tại", () => {
    const list = [sem("2025-2026-2", "2025-2026", 2), sem("2026-2027-1", "2026-2027", 1)];
    expect(pickReviewSemesters(list).map((s) => s.id)).toEqual(["2025-2026-2", "2026-2027-1"]);
  });

  it("danh sách rỗng trả về rỗng", () => {
    expect(pickReviewSemesters([])).toEqual([]);
  });
});

describe("uniqueCourseCodes", () => {
  it("bỏ mã trùng, cắt khoảng trắng, giữ thứ tự xuất hiện", () => {
    const entries = [{ code: "IS1128" }, { code: " IS4228 " }, { code: "IS1128" }, { code: "  " }];
    expect(uniqueCourseCodes(entries)).toEqual(["IS1128", "IS4228"]);
  });
});

describe("trạng thái góp ý đã gửi", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("lưu và đọc lại theo khóa học kỳ + mã môn", () => {
    saveSubmitted(submittedKey("2026-2027-1", "IS4228"), "pending");
    expect(readSubmitted()).toEqual({ "2026-2027-1::IS4228": "pending" });
  });

  it("dữ liệu localStorage hỏng thì coi như chưa gửi gì", () => {
    localStorage.setItem("uelcourses-course-reviews", "{không phải json");
    expect(readSubmitted()).toEqual({});
  });
});
