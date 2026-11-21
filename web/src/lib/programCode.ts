/**
 * Mã lớp của sinh viên: K + 2 số khóa + 3 số mã CTĐT + hậu tố lớp (không bắt buộc).
 * Ví dụ: K23406E1 = khóa 23, CTĐT 406, hệ tiếng Anh, lớp thứ 1;
 *        K24416A = khóa 24, CTĐT 416, hệ chuẩn, lớp A; K23406H = lớp hợp tác doanh nghiệp (Coop).
 *
 * Bộ quy tắc hậu tố:
 *  - H: lớp hợp tác doanh nghiệp (Coop)
 *  - T: lớp cử nhân tài năng
 *  - E, E1, E2…: hệ tiếng Anh (số là thứ tự lớp)
 *  - A, B, C…: hệ chuẩn (chữ là thứ tự lớp)
 */
export type ClassKind = "coop" | "talent" | "english" | "standard" | "other";

export interface ParsedProgramCode {
  /** mã CTĐT dùng để lọc, vd "K23406" */
  programId: string;
  /** khóa, vd "K23" */
  cohort: string;
  /** mã CTĐT (3 số), vd "406" */
  major: string;
  /** hậu tố lớp, vd "E1", "A", "H" ("" nếu không có) */
  suffix: string;
  /** loại lớp suy ra từ hậu tố */
  kind: ClassKind;
  /** chương trình tiếng Anh (hậu tố bắt đầu bằng E) */
  english: boolean;
  /** chuỗi chuẩn hóa để lưu, vd "K23406E1" */
  normalized: string;
}

const PATTERN = /^K?(\d{2})(\d{3})([A-Z]\d*)?$/;

export function kindOfSuffix(suffix: string): ClassKind {
  const letter = suffix.charAt(0);
  if (letter === "H") return "coop";
  if (letter === "T") return "talent";
  if (letter === "E") return "english";
  if (letter === "A" || letter === "B" || letter === "C") return "standard";
  return suffix ? "other" : "standard";
}

/** Mô tả ngắn cho người dùng, vd "Khóa 23 · CTĐT 406 · hệ tiếng Anh · lớp E1". */
export function describeProgramCode(p: ParsedProgramCode): string {
  const kindText: Record<ClassKind, string> = {
    coop: "hợp tác doanh nghiệp (Coop)",
    talent: "cử nhân tài năng",
    english: "hệ tiếng Anh",
    standard: "hệ chuẩn",
    other: "lớp khác",
  };
  return `Khóa ${p.cohort.slice(1)} · CTĐT ${p.major} · ${kindText[p.kind]}${p.suffix ? ` · lớp ${p.suffix}` : ""}`;
}

export function parseProgramCode(input: string): ParsedProgramCode | null {
  const raw = input.trim().replace(/\s+/g, "").toUpperCase();
  const m = PATTERN.exec(raw);
  if (!m) return null;
  const [, year, major, suffix = ""] = m;
  const cohort = `K${year}`;
  const kind = kindOfSuffix(suffix);
  return {
    programId: `${cohort}${major}`,
    cohort,
    major,
    suffix,
    kind,
    english: kind === "english",
    normalized: `${cohort}${major}${suffix}`,
  };
}
