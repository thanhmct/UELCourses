import { formatFinalAssessment, type AssessmentItemLike } from "./finalAssessment";

export interface CreditsLineOptions {
  credits?: number | string | null;
  finalAssessment?: AssessmentItemLike[] | string | null;
  final_assessment?: string | null;
  faculty?: string | null;
  faculty_en?: string | null;
  department?: string | null;
  department_en?: string | null;
  type?: string | null;
}

/**
 * Định dạng số tín chỉ theo ngôn ngữ:
 * - VI: "3 TC"
 * - EN: "3 credits" (hoặc "1 credit")
 * Nếu không có số tín chỉ hoặc không hợp lệ -> "? TC" / "? credits".
 */
export function formatCredits(credits?: number | string | null, lang: "vi" | "en" = "vi"): string {
  if (credits === null || credits === undefined || credits === "") {
    return lang === "en" ? "? credits" : "? TC";
  }
  const n = Number(credits);
  if (lang === "en") {
    return Number.isFinite(n) ? `${credits} ${n === 1 ? "credit" : "credits"}` : `${credits} credits`;
  }
  return `${credits} TC`;
}

export function formatModuleType(type: string | null | undefined, lang: "vi" | "en"): string {
  const label = type?.trim() ?? "";
  if (lang === "en") {
    const normalized = label.normalize("NFC").toLowerCase();
    if (normalized === "lý thuyết") return "Theory";
    if (normalized === "thực hành") return "Practice";
  }
  return label;
}

/**
 * Định dạng dòng thông tin tín chỉ kèm hình thức thi cuối kỳ và khoa/đơn vị:
 * Ví dụ:
 * - VI: "3 TC · Thi viết · Khoa Kinh tế"
 * - EN: "3 credits · Written exam · Faculty of Economics"
 * Môn không có dữ liệu thi cuối kỳ thì bỏ trống phần đó (không hiện "—" hay "chưa rõ"):
 * - VI: "3 TC · Khoa Kinh tế"
 * - EN: "3 credits · Faculty of Economics"
 */
export function creditsLine(
  options?: CreditsLineOptions | null,
  lang: "vi" | "en" = "vi",
): string {
  if (!options) return "";

  const parts: string[] = [];

  // 1. Số tín chỉ
  parts.push(formatCredits(options.credits, lang));

  // 2. Hình thức thi cuối kỳ (rút gọn từ final_assessment / assessments đề cương)
  const examKind = formatFinalAssessment(options.finalAssessment ?? options.final_assessment, lang);
  if (examKind) {
    parts.push(examKind);
  }

  // 3. Khoa / đơn vị
  const faculty = lang === "en" ? (options.faculty_en || options.faculty) : options.faculty;
  if (faculty && faculty.trim()) {
    parts.push(faculty.trim());
  }

  // 4. Bộ môn
  const dept = lang === "en" ? (options.department_en || options.department) : options.department;
  if (dept && dept.trim()) {
    parts.push(dept.trim());
  }

  // 5. Loại học phần (nếu được truyền)
  const type = formatModuleType(options.type, lang);
  if (type) parts.push(type);

  return parts.join(" · ");
}

/**
 * Rút gọn chỉ gồm số tín chỉ và hình thức thi (dùng cho menu tìm kiếm):
 * Ví dụ: "3 TC · Thi viết" / EN "3 credits · Written exam"
 */
export function formatCreditsAndExam(
  credits?: number | string | null,
  finalAssessment?: AssessmentItemLike[] | string | null,
  lang: "vi" | "en" = "vi",
): string {
  return creditsLine({ credits, finalAssessment }, lang);
}
