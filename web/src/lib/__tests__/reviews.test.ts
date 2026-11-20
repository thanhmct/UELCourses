import { describe, expect, it } from "vitest";
import { getModuleReviews, getReviewStats, type ModuleReview } from "../reviews";

describe("reviews service", () => {
  it("fetches mock reviews for ECO101", () => {
    const list = getModuleReviews("ECO101");
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].module_code).toBe("ECO101");
  });

  it("calculates review statistics accurately", () => {
    const mockList: ModuleReview[] = [
      { id: "1", module_code: "ABC", author: "A", cohort: "K22", rating: 5, difficulty: 4, workload: 3, comment: "", upvotes: 2, created_at: "" },
      { id: "2", module_code: "ABC", author: "B", cohort: "K23", rating: 3, difficulty: 2, workload: 3, comment: "", upvotes: 1, created_at: "" },
    ];
    const stats = getReviewStats(mockList);
    expect(stats.total_reviews).toBe(2);
    expect(stats.average_rating).toBe(4.0);
    expect(stats.average_difficulty).toBe(3.0);
    expect(stats.average_workload).toBe(3.0);
  });
});
