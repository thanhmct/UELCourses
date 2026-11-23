"use client";
import { useMemo } from "react";
import { useSettings } from "./store";
import { parseProgramCode, type ParsedProgramCode } from "./programCode";

export interface ProgramProfile {
  primaryCode: string;
  secondaryCode: string;
  primaryParsed: ParsedProgramCode | null;
  secondaryParsed: ParsedProgramCode | null;
  degree: "dai_hoc" | "thac_si" | "tien_si";
  /** Mã CTĐT theo ngữ cảnh (có đuôi E nếu học hệ tiếng Anh), vd K26409E */
  primaryProgramId: string;
  /** Mã CTĐT ngành 2 theo ngữ cảnh, vd K24406 hoặc K24406E */
  secondaryProgramId: string;
  /** Mã CTĐT cơ sở, vd K26409 */
  basePrimaryProgramId: string;
  /** Mã CTĐT cơ sở ngành 2, vd K24406 */
  baseSecondaryProgramId: string;
  /** Danh sách mã CTĐT theo ngữ cảnh để lọc [primaryProgramId, secondaryProgramId].filter(Boolean) */
  programIds: string[];
  /** Danh sách mã CTĐT cơ sở */
  baseProgramIds: string[];
  isEnglishPrimary: boolean;
  isEnglishSecondary: boolean;
  hasSecondary: boolean;
}

/**
 * Mã CTĐT của người dùng theo ngữ cảnh (có đuôi E nếu hệ tiếng Anh), vd "K26409E" hoặc "K24406".
 * Dùng để lọc toàn hệ thống: thời khóa biểu, học phần, kế hoạch, CTĐT.
 */
export function useMyProgramId(): string {
  const code = useSettings((s) => s.programCode);
  const pCode = code.includes("+") ? code.split("+")[0].trim() : code;
  const parsed = parseProgramCode(pCode);
  return parsed?.contextualProgramId ?? "";
}

/**
 * Danh sách mã CTĐT của người dùng theo ngữ cảnh (ngành chính + ngành 2 nếu có).
 */
export function useMyProgramIds(): string[] {
  const primaryCode = useSettings((s) => s.programCode);
  const secondaryCode = useSettings((s) => s.secondaryProgramCode);
  return useMemo(() => {
    const rawCodes = primaryCode.includes("+")
      ? [...primaryCode.split("+"), secondaryCode]
      : [primaryCode, secondaryCode];
    const ids: string[] = [];
    for (const c of rawCodes) {
      if (!c) continue;
      const p = parseProgramCode(c.trim())?.contextualProgramId;
      if (p && !ids.includes(p)) ids.push(p);
    }
    return ids;
  }, [primaryCode, secondaryCode]);
}

/**
 * Hồ sơ CTĐT đầy đủ của người dùng (ngành chính và ngành 2).
 */
export function useProgramProfile(): ProgramProfile {
  const primaryCode = useSettings((s) => s.programCode);
  const secondaryCode = useSettings((s) => s.secondaryProgramCode);

  return useMemo(() => {
    let pCode = primaryCode;
    let sCode = secondaryCode;
    if (primaryCode && primaryCode.includes("+")) {
      const parts = primaryCode.split("+").map((s) => s.trim());
      pCode = parts[0] || "";
      if (parts[1]) sCode = parts[1];
    }

    const primaryParsed = parseProgramCode(pCode);
    const secondaryParsed = parseProgramCode(sCode);

    const primaryProgramId = primaryParsed?.contextualProgramId ?? "";
    const secondaryProgramId = secondaryParsed?.contextualProgramId ?? "";
    const basePrimaryProgramId = primaryParsed?.programId ?? "";
    const baseSecondaryProgramId = secondaryParsed?.programId ?? "";

    const programIds: string[] = [];
    if (primaryProgramId) programIds.push(primaryProgramId);
    if (secondaryProgramId && secondaryProgramId !== primaryProgramId) programIds.push(secondaryProgramId);

    const baseProgramIds: string[] = [];
    if (basePrimaryProgramId) baseProgramIds.push(basePrimaryProgramId);
    if (baseSecondaryProgramId && baseSecondaryProgramId !== basePrimaryProgramId) baseProgramIds.push(baseSecondaryProgramId);

    return {
      primaryCode: pCode,
      secondaryCode: sCode,
      primaryParsed,
      secondaryParsed,
      degree: primaryParsed?.degree ?? "dai_hoc",
      primaryProgramId,
      secondaryProgramId,
      basePrimaryProgramId,
      baseSecondaryProgramId,
      programIds,
      baseProgramIds,
      isEnglishPrimary: primaryParsed?.english ?? false,
      isEnglishSecondary: secondaryParsed?.english ?? false,
      hasSecondary: !!secondaryProgramId,
    };
  }, [primaryCode, secondaryCode]);
}
