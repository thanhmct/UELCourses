"use client";
import { useSettings } from "./store";
import { parseProgramCode } from "./programCode";

/**
 * Mã CTĐT của người dùng dạng "K23406" (rỗng nếu chưa nhập mã).
 * Dùng để lọc toàn hệ thống: thời khóa biểu, học phần, kế hoạch, CTĐT.
 */
export function useMyProgramId(): string {
  const code = useSettings((s) => s.programCode);
  return parseProgramCode(code)?.programId ?? "";
}
