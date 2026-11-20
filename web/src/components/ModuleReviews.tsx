"use client";

import { useEffect, useMemo, useState } from "react";
import { COHORTS, useSettings } from "@/lib/store";
import {
  getModuleReviews,
  getReviewStats,
  hasUpvotedReview,
  saveReview,
  toggleUpvoteReview,
  type ModuleReview,
} from "@/lib/reviews";

interface Props {
  moduleCode: string;
  moduleName: string;
}

function StarRating({ rating, setRating }: { rating: number; setRating?: (r: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!setRating}
          onClick={() => setRating?.(star)}
          className={`text-lg transition-transform ${
            setRating ? "hover:scale-125 focus:outline-none" : "cursor-default"
          } ${star <= rating ? "text-amber-400" : "text-slate-300 dark:text-slate-600"}`}
          aria-label={`${star} sao`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Rất dễ",
  2: "Dễ",
  3: "Vừa phải",
  4: "Khá khó",
  5: "Rất khó",
};

const WORKLOAD_LABELS: Record<number, string> = {
  1: "Rất nhẹ",
  2: "Nhẹ",
  3: "Vừa sức",
  4: "Nặng",
  5: "Rất nặng",
};

export function ModuleReviews({ moduleCode, moduleName }: Props) {
  const currentCohort = useSettings((s) => s.cohort);
  const [reviews, setReviews] = useState<ModuleReview[]>([]);
  const [filterCohort, setFilterCohort] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "helpful">("helpful");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [difficulty, setDifficulty] = useState(3);
  const [workload, setWorkload] = useState(3);
  const [lecturer, setLecturer] = useState("");
  const [cohort, setCohort] = useState(currentCohort || "K24");
  const [comment, setComment] = useState("");
  const [author, setAuthor] = useState("");
  const [upvotesState, setUpvotesState] = useState<Record<string, { count: number; active: boolean }>>({});

  useEffect(() => {
    const list = getModuleReviews(moduleCode);
    setReviews(list);
    const upMap: Record<string, { count: number; active: boolean }> = {};
    for (const r of list) {
      upMap[r.id] = { count: r.upvotes, active: hasUpvotedReview(r.id) };
    }
    setUpvotesState(upMap);
  }, [moduleCode]);

  const stats = useMemo(() => getReviewStats(reviews), [reviews]);

  const filtered = useMemo(() => {
    let list = reviews;
    if (filterCohort !== "all") {
      list = list.filter((r) => r.cohort === filterCohort);
    }
    return list.slice().sort((a, b) => {
      if (sortBy === "helpful") {
        const uA = (upvotesState[a.id]?.count ?? a.upvotes);
        const uB = (upvotesState[b.id]?.count ?? b.upvotes);
        return uB - uA;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [reviews, filterCohort, sortBy, upvotesState]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    const saved = saveReview({
      module_code: moduleCode,
      author: author.trim() || `Sinh viên ${cohort}`,
      cohort,
      rating,
      difficulty,
      workload,
      lecturer: lecturer.trim() || undefined,
      comment: comment.trim(),
    });

    setReviews((prev) => [saved, ...prev]);
    setUpvotesState((prev) => ({ ...prev, [saved.id]: { count: 0, active: false } }));
    setComment("");
    setShowForm(false);
  };

  const handleUpvote = (id: string) => {
    const added = toggleUpvoteReview(id);
    setUpvotesState((prev) => {
      const cur = prev[id] ?? { count: 0, active: false };
      return {
        ...prev,
        [id]: {
          count: cur.count + (added ? 1 : -1),
          active: added,
        },
      };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Đánh giá từ sinh viên
          </h2>
          <p className="text-xs text-slate-500">
            Kinh nghiệm thực tế, lời khuyên và đánh giá độ khó của học phần {moduleCode}.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary text-sm"
        >
          {showForm ? "Đóng biểu mẫu" : "+ Viết đánh giá"}
        </button>
      </div>

      {/* Summary Scorecard */}
      <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex items-center gap-3 border-b pb-3 sm:border-b-0 sm:border-r sm:pb-0 dark:border-slate-800">
          <div className="text-3xl font-extrabold text-brand-700 dark:text-brand-300">
            {stats.average_rating > 0 ? stats.average_rating.toFixed(1) : "—"}
          </div>
          <div>
            <StarRating rating={Math.round(stats.average_rating)} />
            <span className="text-xs text-slate-500">
              Dựa trên {stats.total_reviews} lượt đánh giá
            </span>
          </div>
        </div>

        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Độ khó trung bình:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {stats.average_difficulty > 0 ? `${stats.average_difficulty.toFixed(1)} / 5.0 (${DIFFICULTY_LABELS[Math.round(stats.average_difficulty)]})` : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Khối lượng bài vở:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {stats.average_workload > 0 ? `${stats.average_workload.toFixed(1)} / 5.0 (${WORKLOAD_LABELS[Math.round(stats.average_workload)]})` : "—"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 text-xs">
          <select
            className="input text-xs py-1"
            value={filterCohort}
            onChange={(e) => setFilterCohort(e.target.value)}
          >
            <option value="all">Tất cả các khóa</option>
            {COHORTS.map((c) => (
              <option key={c} value={c}>Khóa {c}</option>
            ))}
          </select>
          <select
            className="input text-xs py-1"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "newest" | "helpful")}
          >
            <option value="helpful">Hữu ích nhất</option>
            <option value="newest">Mới nhất</option>
          </select>
        </div>
      </div>

      {/* Review Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4 border-brand-300 dark:border-brand-800">
          <h3 className="font-semibold text-slate-900 dark:text-white">
            Viết chia sẻ về học phần {moduleName}
          </h3>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Đánh giá chung (Sao)</label>
              <StarRating rating={rating} setRating={setRating} />
            </div>
            <div>
              <label className="label">Độ khó môn học</label>
              <select
                className="input text-xs"
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    {d} - {DIFFICULTY_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Khối lượng bài tập / thi</label>
              <select
                className="input text-xs"
                value={workload}
                onChange={(e) => setWorkload(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((w) => (
                  <option key={w} value={w}>
                    {w} - {WORKLOAD_LABELS[w]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Khóa của bạn</label>
              <select
                className="input text-xs"
                value={cohort}
                onChange={(e) => setCohort(e.target.value)}
              >
                {COHORTS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Giảng viên phụ trách (Tùy chọn)</label>
              <input
                className="input text-xs"
                placeholder="VD: TS. Nguyễn Văn A"
                value={lecturer}
                onChange={(e) => setLecturer(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Tên hiển thị (Tùy chọn)</label>
              <input
                className="input text-xs"
                placeholder="Mặc định: Sinh viên ẩn danh"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">Nội dung đánh giá & Lời khuyên</label>
            <textarea
              required
              rows={4}
              className="input text-sm"
              placeholder="Chia sẻ về phương pháp học, mẹo thi cử, bài tập lớn, hoặc phong cách chấm điểm..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="btn-outline text-xs"
            >
              Hủy
            </button>
            <button type="submit" className="btn-primary text-xs">
              Gửi đánh giá
            </button>
          </div>
        </form>
      )}

      {/* Review List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
            Chưa có đánh giá nào cho học phần này. Hãy là người đầu tiên chia sẻ kinh nghiệm!
          </div>
        ) : (
          filtered.map((rev) => {
            const upInfo = upvotesState[rev.id] ?? { count: rev.upvotes, active: false };
            return (
              <div
                key={rev.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {rev.author}
                    </span>
                    <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                      {rev.cohort}
                    </span>
                    {rev.lecturer && (
                      <span className="text-xs text-slate-500">
                        · GV: <strong>{rev.lecturer}</strong>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StarRating rating={rev.rating} />
                    <span className="text-xs text-slate-400">
                      {rev.created_at ? new Date(rev.created_at).toLocaleDateString("vi-VN") : ""}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {rev.comment}
                </p>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
                  <div className="flex items-center gap-4 text-slate-500">
                    <span>
                      Độ khó: <strong className="text-slate-700 dark:text-slate-200">{DIFFICULTY_LABELS[rev.difficulty]}</strong>
                    </span>
                    <span>
                      Khối lượng: <strong className="text-slate-700 dark:text-slate-200">{WORKLOAD_LABELS[rev.workload]}</strong>
                    </span>
                  </div>

                  <button
                    onClick={() => handleUpvote(rev.id)}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 transition ${
                      upInfo.active
                        ? "bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 font-semibold"
                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span>👍 Hữu ích</span>
                    <span className="font-mono text-xs">({upInfo.count})</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
