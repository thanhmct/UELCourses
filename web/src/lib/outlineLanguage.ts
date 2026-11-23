import type { Lang } from "@/i18n";

function replaceAllPhrases(value: string, phrases: ReadonlyArray<readonly [RegExp, string]>): string {
  return phrases.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

const ASSESSMENT_PHRASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/Trắc nghiệm và\/hoặc Tự luận/giu, "Multiple-choice test and/or essay"],
  [/Trắc nghiệm\s*\+\s*Tự luận\s*\+\s*Thuyết trình nhóm/giu, "Multiple-choice test + essay + group presentation"],
  [/Thuyết trình nhóm/giu, "Group presentation"],
  [/Bài tập nhóm/giu, "Group assignment"],
  [/Làm việc nhóm/giu, "Group work"],
  [/Thi trên máy tính/giu, "Computer-based exam"],
  [/Thi máy/giu, "Computer-based exam"],
  [/Thi giấy/giu, "Written exam"],
  [/Trắc nghiệm/giu, "Multiple-choice test"],
  [/Tự luận/giu, "Essay"],
  [/Thuyết trình/giu, "Presentation"],
  [/Tiểu luận/giu, "Term paper"],
  [/Bài tập/giu, "Assignment"],
  [/Chuyên cần/giu, "Attendance"],
  [/Thực hành/giu, "Practical work"],
  [/Vấn đáp/giu, "Oral exam"],
  [/và\/hoặc/giu, "and/or"],
  [/ hoặc /giu, " or "],
  [/ và /giu, " and "],
];

const MATERIAL_PHRASES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /Các văn bản pháp quy về kế toán \(Luật kế toán, Chuẩn mực kế toán, Chế độ kế toán\); thuế và các văn bản pháp quy khác có liên quan\.?/giu,
    "Accounting regulations (Law on Accounting, accounting standards and accounting regimes), tax regulations, and other relevant legislation.",
  ],
  [/Sách tham khảo Bài tập Nguyên lý kế toán/giu, "Accounting Principles Exercises"],
  [/Giáo trình Nguyên lý kế toán/giu, "Principles of Accounting Textbook"],
  [/Giáo trình Kế toán tài chính/giu, "Financial Accounting Textbook"],
  [/Bài giảng của Giảng viên/giu, "Lecturer's course materials"],
  [/Trường Đại học Kinh tế\s*[-–]\s*Luật/giu, "University of Economics and Law"],
  [/Trường Đại học Kinh tế TP\.?HCM/giu, "University of Economics Ho Chi Minh City"],
  [/NXB ĐHQG TP\.?HCM/giu, "VNU-HCM Press"],
  [/NXB Đại học Quốc gia TP\.?\s*HCM/giu, "VNU-HCM Press"],
  [/NXB Kinh tế,?\s*TP\.?HCM/giu, "Economics Publishing House, Ho Chi Minh City"],
  [/NXB Thống kê/giu, "Statistical Publishing House"],
  [/Nhà xuất bản/giu, "Publishing House"],
  [/Sách tham khảo/giu, "Reference book"],
  [/Giáo trình/giu, "Textbook"],
  [/Bài tập/giu, "Exercises"],
  [/Nguyên lý kế toán/giu, "Principles of Accounting"],
  [/Kế toán tài chính/giu, "Financial Accounting"],
  [/Kế toán/giu, "Accounting"],
  [/Luật kế toán/giu, "Law on Accounting"],
  [/Chuẩn mực kế toán/giu, "accounting standards"],
  [/Chế độ kế toán/giu, "accounting regimes"],
  [/chủ biên/giu, "editor"],
  [/Link thư viện/giu, "Library link"],
  [/PGS\.?\s*TS\.?/giu, "Assoc. Prof. Dr."],
  [/ThS\.?/gu, "MSc."],
  [/TS\.?/gu, "Dr."],
];

/** Translate the controlled assessment vocabulary returned by UEL's source data. */
export function formatOutlineAssessment(value: string, lang: Lang): string {
  if (lang !== "en") return value;
  return replaceAllPhrases(value.trim(), ASSESSMENT_PHRASES);
}

/**
 * Translate descriptive bibliography fragments while preserving author names and
 * published titles that do not have an official English version. Raw library URLs
 * embedded in parentheses are removed because the syllabus link is already shown
 * separately when available.
 */
export function formatOutlineMaterial(value: string, lang: Lang): string {
  if (lang !== "en") return value;
  const withoutInlineLibraryUrl = value.replace(
    /\s*\((?:Link thư viện|Library link)\s*:?\s*https?:\/\/[^)]*\)/giu,
    "",
  );
  return replaceAllPhrases(withoutInlineLibraryUrl.trim(), MATERIAL_PHRASES);
}
