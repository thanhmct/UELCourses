export interface ModuleReview {
  id: string;
  module_code: string;
  author: string;
  cohort: string;
  rating: number; // 1-5 stars
  difficulty: number; // 1-5 (1: Rất dễ, 5: Rất khó)
  workload: number; // 1-5 (1: Rất nhẹ, 5: Rất nặng)
  lecturer?: string;
  semester?: string;
  comment: string;
  upvotes: number;
  created_at: string;
}

export interface ReviewStats {
  average_rating: number;
  average_difficulty: number;
  average_workload: number;
  total_reviews: number;
  rating_distribution: Record<number, number>; // 1: count, 2: count...
}

const STORAGE_KEY = "uelplan-module-reviews";
const UPVOTES_KEY = "uelplan-review-upvotes";

const INITIAL_MOCK_REVIEWS: ModuleReview[] = [
  {
    id: "rev-eco101-1",
    module_code: "ECO101",
    author: "Sinh viên K22",
    cohort: "K22",
    rating: 5,
    difficulty: 3,
    workload: 3,
    lecturer: "TS. Nguyễn Văn A",
    semester: "HK1 2023-2024",
    comment: "Môn cơ sở cốt lõi, thầy dạy rất cuốn và liên hệ thực tế nhiều vụ án kinh tế. Thi trắc nghiệm cuối kỳ cần bám sát slide và sách bài tập.",
    upvotes: 14,
    created_at: "2024-01-15T09:00:00Z",
  },
  {
    id: "rev-eco101-2",
    module_code: "ECO101",
    author: "Ẩn danh",
    cohort: "K23",
    rating: 4,
    difficulty: 4,
    workload: 4,
    lecturer: "ThS. Trần Thị B",
    semester: "HK2 2023-2024",
    comment: "Lý thuyết đồ thị cung cầu và độ co giãn ban đầu hơi ngợp. Khuyên các bạn nên làm bài tập nhóm sớm, đừng để dồn trước ngày thuyết trình.",
    upvotes: 8,
    created_at: "2024-05-20T14:30:00Z",
  },
  {
    id: "rev-mis5013-1",
    module_code: "MIS5013",
    author: "K22 HTTT",
    cohort: "K22",
    rating: 5,
    difficulty: 4,
    workload: 4,
    lecturer: "Thầy Hưng",
    semester: "HK1 2024-2025",
    comment: "Môn bắt buộc của ngành HTTT, học về mô hình hóa quy trình nghiệp vụ BPMN và thiết kế hệ thống. Dự án cuối kỳ rất thực chiến!",
    upvotes: 21,
    created_at: "2024-11-10T10:15:00Z",
  },
  {
    id: "rev-mat101-1",
    module_code: "MAT101",
    author: "Sinh viên K23",
    cohort: "K23",
    rating: 3,
    difficulty: 5,
    workload: 4,
    lecturer: "Bộ môn Toán",
    semester: "HK1 2023-2024",
    comment: "Toán cao cấp khá nặng nếu mất gốc đại số tuyến tính từ cấp 3. Chăm đi học và làm bài tập trên hệ thống thì vẫn qua điểm B+ được.",
    upvotes: 19,
    created_at: "2023-12-05T08:20:00Z",
  },
];

function getStoredReviews(): ModuleReview[] {
  if (typeof window === "undefined") return INITIAL_MOCK_REVIEWS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_MOCK_REVIEWS;
    const userReviews: ModuleReview[] = JSON.parse(raw);
    const set = new Set(userReviews.map((r) => r.id));
    const merged = [...userReviews, ...INITIAL_MOCK_REVIEWS.filter((r) => !set.has(r.id))];
    return merged;
  } catch {
    return INITIAL_MOCK_REVIEWS;
  }
}

export function getModuleReviews(code: string): ModuleReview[] {
  const norm = code.trim().toUpperCase();
  const all = getStoredReviews();
  return all.filter((r) => r.module_code.toUpperCase() === norm);
}

export function getReviewStats(reviews: ModuleReview[]): ReviewStats {
  if (reviews.length === 0) {
    return {
      average_rating: 0,
      average_difficulty: 0,
      average_workload: 0,
      total_reviews: 0,
      rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  let sumRating = 0;
  let sumDiff = 0;
  let sumWorkload = 0;
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const r of reviews) {
    sumRating += r.rating;
    sumDiff += r.difficulty;
    sumWorkload += r.workload;
    dist[r.rating] = (dist[r.rating] || 0) + 1;
  }

  const count = reviews.length;
  return {
    average_rating: Math.round((sumRating / count) * 10) / 10,
    average_difficulty: Math.round((sumDiff / count) * 10) / 10,
    average_workload: Math.round((sumWorkload / count) * 10) / 10,
    total_reviews: count,
    rating_distribution: dist,
  };
}

export function saveReview(input: Omit<ModuleReview, "id" | "upvotes" | "created_at">): ModuleReview {
  const newReview: ModuleReview = {
    ...input,
    id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    upvotes: 0,
    created_at: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list: ModuleReview[] = raw ? JSON.parse(raw) : [];
      list.unshift(newReview);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error("Failed to save review to localStorage", e);
    }
  }

  return newReview;
}

export function hasUpvotedReview(reviewId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(UPVOTES_KEY);
    const set = new Set(raw ? JSON.parse(raw) : []);
    return set.has(reviewId);
  } catch {
    return false;
  }
}

export function toggleUpvoteReview(reviewId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(UPVOTES_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const set = new Set(list);
    const added = !set.has(reviewId);
    if (added) {
      set.add(reviewId);
    } else {
      set.delete(reviewId);
    }
    localStorage.setItem(UPVOTES_KEY, JSON.stringify(Array.from(set)));
    return added;
  } catch {
    return false;
  }
}
