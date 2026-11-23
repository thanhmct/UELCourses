export type FinalAssessmentKind =
  | "Thi viết"
  | "Thi trắc nghiệm"
  | "Vấn đáp"
  | "Đồ án"
  | "Tiểu luận"
  | "Thi"
  | "Khác";

export interface AssessmentItemLike {
  component?: string | null;
  item_code?: string | null;
  item_name?: string | null;
  criteria?: string | null;
  weight_pct?: number | null;
}

/**
 * Pure function: xác định dạng bài cuối kỳ từ danh sách bài đánh giá (assessments) của đề cương
 * hoặc từ chuỗi văn bản (final_assessment).
 *
 * 1. Nếu là mảng, lọc các bài đánh giá có mã A3.*, hoặc thành phần/tên/tiêu chí chứa 'cuối kỳ' / 'final'.
 * 2. Nhận diện từ khóa theo thứ tự ưu tiên:
 *    - "Đồ án": đồ án, project, tiểu luận lớn, dự án, capstone
 *    - "Tiểu luận": tiểu luận, essay, report, báo cáo
 *    - "Thi trắc nghiệm": trắc nghiệm, multiple choice, mcq
 *    - "Vấn đáp": vấn đáp, oral
 *    - "Thi viết": thi viết, tự luận, written, bút thi
 *    - "Thi": exam, test, bài thi, hình thức thi, thi kết thúc (thi chung, không suy đoán)
 * 3. Nếu không có bài cuối kỳ (hoặc rỗng / không có đề cương): trả về null.
 */
export function finalAssessmentKind(
  source?: AssessmentItemLike[] | string | null,
): FinalAssessmentKind | null {
  if (!source) {
    return null;
  }

  let text = "";
  if (typeof source === "string") {
    text = source.trim().toLowerCase();
    if (!text) return null;
  } else if (Array.isArray(source)) {
    if (source.length === 0) return null;

    // Lọc các bài đánh giá cuối kỳ
    const finalItems = source.filter((item) => {
      const code = (item.item_code || "").trim();
      const comp = (item.component || "").trim().toLowerCase();
      const name = (item.item_name || "").trim().toLowerCase();
      const crit = (item.criteria || "").trim().toLowerCase();

      // Mã A3, A3.1, A3.2...
      if (/^A3(\.|$)/i.test(code)) return true;
      if (comp.includes("cuối kỳ") || comp.includes("cuoi ky") || comp.includes("final")) return true;
      if (name.includes("cuối kỳ") || name.includes("cuoi ky") || name.includes("final")) return true;
      if (crit.includes("cuối kỳ") || crit.includes("cuoi ky") || crit.includes("final")) return true;
      return false;
    });

    if (finalItems.length === 0) {
      return null;
    }

    // Gộp toàn bộ văn bản của các bài cuối kỳ để quét từ khóa
    text = finalItems
      .map(
        (item) =>
          `${item.component || ""} ${item.item_code || ""} ${item.item_name || ""} ${item.criteria || ""}`.toLowerCase(),
      )
      .join(" ");
  } else {
    return null;
  }

  // 1. "Đồ án": đồ án, project, tiểu luận lớn, dự án, capstone
  if (
    text.includes("tiểu luận lớn") ||
    text.includes("tieu luan lon") ||
    text.includes("đồ án") ||
    text.includes("do an") ||
    text.includes("project") ||
    text.includes("dự án") ||
    text.includes("du an") ||
    text.includes("capstone")
  ) {
    return "Đồ án";
  }

  // 2. "Tiểu luận": tiểu luận, essay, report, báo cáo
  if (
    text.includes("tiểu luận") ||
    text.includes("tieu luan") ||
    text.includes("essay") ||
    text.includes("report") ||
    text.includes("báo cáo") ||
    text.includes("bao cao")
  ) {
    return "Tiểu luận";
  }

  // 3. "Thi trắc nghiệm": trắc nghiệm, multiple choice, mcq
  if (
    text.includes("trắc nghiệm") ||
    text.includes("trac nghiem") ||
    text.includes("multiple choice") ||
    text.includes("multiple-choice") ||
    text.includes("mcq")
  ) {
    return "Thi trắc nghiệm";
  }

  // 4. "Vấn đáp": vấn đáp, oral exam
  if (
    text.includes("vấn đáp") ||
    text.includes("van dap") ||
    text.includes("oral") ||
    text.includes("phỏng vấn")
  ) {
    return "Vấn đáp";
  }

  // 5. "Thi viết": tự luận, thi viết, written, bút thi
  if (
    text.includes("tự luận") ||
    text.includes("tu luan") ||
    text.includes("thi viết") ||
    text.includes("thi viet") ||
    text.includes("written") ||
    text.includes("bút thi")
  ) {
    return "Thi viết";
  }

  // 6. Generic "Thi": thi, exam, test, bài thi, hình thức thi
  if (
    text.includes("exam") ||
    text.includes("test") ||
    /\bthi\b/i.test(text) ||
    text.includes("bài thi") ||
    text.includes("hình thức thi") ||
    text.includes("thi kết thúc")
  ) {
    return "Thi";
  }

  return "Khác";
}

/**
 * Định dạng hình thức thi cuối kỳ rút gọn theo ngôn ngữ:
 * - VI: "Thi viết" | "Thi trắc nghiệm" | "Vấn đáp" | "Đồ án" | "Tiểu luận" | "Thi"
 * - EN: "Written exam" | "Multiple-choice exam" | "Oral exam" | "Project" | "Essay" | "Exam"
 * Nếu không có dữ liệu (null/Khác) trả về null.
 */
export function formatFinalAssessment(
  source?: AssessmentItemLike[] | string | null,
  lang: "vi" | "en" = "vi",
): string | null {
  if (!source) return null;

  const kind =
    typeof source === "string" &&
    [
      "Thi viết",
      "Thi trắc nghiệm",
      "Vấn đáp",
      "Đồ án",
      "Tiểu luận",
      "Thi",
      "Khác",
    ].includes(source)
      ? (source as FinalAssessmentKind)
      : finalAssessmentKind(source);

  if (!kind || kind === "Khác") return null;

  if (lang === "en") {
    switch (kind) {
      case "Thi viết":
        return "Written exam";
      case "Thi":
        return "Exam";
      case "Thi trắc nghiệm":
        return "Multiple-choice exam";
      case "Vấn đáp":
        return "Oral exam";
      case "Đồ án":
        return "Project";
      case "Tiểu luận":
        return "Essay";
      default:
        return null;
    }
  }

  switch (kind) {
    case "Thi viết":
      return "Thi viết";
    case "Thi":
      return "Thi";
    case "Thi trắc nghiệm":
      return "Thi trắc nghiệm";
    case "Vấn đáp":
      return "Vấn đáp";
    case "Đồ án":
      return "Đồ án";
    case "Tiểu luận":
      return "Tiểu luận";
    default:
      return null;
  }
}

// In-memory cache theo mã môn
const assessmentKindCache = new Map<string, FinalAssessmentKind | null>();

export function getCachedFinalAssessmentKind(code: string): FinalAssessmentKind | null | undefined {
  return assessmentKindCache.get(code);
}

export function setCachedFinalAssessmentKind(code: string, kind: FinalAssessmentKind | null): void {
  assessmentKindCache.set(code, kind);
}

export function clearFinalAssessmentCache(): void {
  assessmentKindCache.clear();
}
