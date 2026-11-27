import programIds from "@/data/program_ids.json";
import type { ValidProgramGroup } from "./types";

export interface ProgramGroupValidationResult {
  valid: boolean;
  error?: string;
  defaultClassCode?: string;
}

export function validateProgramGroup(
  parsed: ParsedProgramCode | null,
  validGroups: ValidProgramGroup[] | null | undefined,
  lang: "vi" | "en" = "vi",
): ProgramGroupValidationResult {
  if (!parsed) {
    return { valid: true };
  }
  // Bậc tiến sĩ chưa có dữ liệu chương trình đào tạo -> cho qua
  if (parsed.degree === "tien_si" || (parsed.degree === "thac_si" && !parsed.cohort)) {
    return { valid: true };
  }
  // Chưa có danh sách để xác thực mã lớp.
  if (!validGroups || validGroups.length === 0) {
    return { valid: true };
  }

  const isEn = lang === "en";
  const norm = parsed.normalized;

  if (
    validGroups.some(
      (g) =>
        g.code === norm ||
        (parsed.english &&
          g.cohort === parsed.cohort &&
          g.major === parsed.major &&
          g.kind === "english" &&
          g.code === `${parsed.cohort}${parsed.major}E` &&
          /^E\d+$/i.test(parsed.suffix)),
    )
  ) {
    return { valid: true };
  }

  // Với thạc sĩ: nếu khớp mã nhóm, program_id hoặc (cohort + major)
  if (parsed.degree === "thac_si") {
    if (
      validGroups.some(
        (g) =>
          g.program_id === parsed.programId ||
          g.code === norm ||
          (!parsed.branch && g.cohort === parsed.cohort && g.major === parsed.major),
      )
    ) {
      return { valid: true };
    }
    // Nếu trong validGroups chưa nạp mã nhóm thạc sĩ nào thì cho qua
    const hasAnyThacSi = validGroups.some(
      (g) => (g as { degree?: string }).degree === "thac_si" || g.cohort?.startsWith("C"),
    );
    if (!hasAnyThacSi) {
      return { valid: true };
    }
  }

  const defaultClassCode = `${parsed.programId}A`;
  if (!parsed.suffix && validGroups.some((g) => g.code === defaultClassCode)) {
    return { valid: true, defaultClassCode };
  }

  // Tìm các nhóm lớp cùng khóa và ngành
  const sameMajorGroups = validGroups.filter(
    (g) => g.cohort === parsed.cohort && g.major === parsed.major,
  );

  const cohortYear = parsed.cohort.replace(/\D/g, "");

  if (sameMajorGroups.length === 0) {
    const error = isEn
      ? `Major code ${parsed.major} not found in cohort ${cohortYear}`
      : `Không tìm thấy ngành mã ${parsed.major} ở khóa ${cohortYear}`;
    return { valid: false, error };
  }

  const validCodesList = Array.from(new Set(sameMajorGroups.map((g) => g.code))).sort();
  const validCodesStr = validCodesList.join(", ");

  const error = isEn
    ? `Class ${norm} not found. Valid codes for this major: ${validCodesStr}`
    : `Không tìm thấy lớp ${norm}. Các mã hợp lệ của ngành này: ${validCodesStr}`;

  return { valid: false, error };
}

/**
 * Bậc đào tạo nhận diện từ mã:
 *  - dai_hoc: K... hoặc B...
 *  - thac_si: C...
 *  - tien_si: N...
 */
export type Degree = "dai_hoc" | "thac_si" | "tien_si";

/**
 * Bảng ánh xạ mã chương trình cũ (-V2, -V3, LKT...) sang mã chính thức chuẩn (Brief W31).
 */
export const PROGRAM_ALIASES: Record<string, string> = {
  // 1. Công nghệ tài chính Coop (H)
  "K25414-V2": "K25414H",
  "K26414-V2": "K26414H",
  // 2. Kế toán hệ tiếng Anh (E)
  "K25405-V3": "K25405E",
  "K26405-V3": "K26405E",
  // 3. Thương mại điện tử hệ tiếng Anh (E)
  "K25411-V2": "K25411E",
  "K26411-V2": "K26411E",
  // 4. Kế toán và Phân tích dữ liệu (ngành riêng 422)
  "K25405-V2": "K25422",
  "K26405-V2": "K26422",
  // 5. Luật thương mại quốc tế (502) & Luật kinh doanh (501)
  "K25LKT-V2": "K25502",
  "K26LKT-V2": "K26502",
  "K25LKT": "K25501",
  "K26LKT": "K26501",
  // 6. Gộp bản trùng lặp vào mã chuẩn
  "K25409-V2": "K25409",
  "K26409-V2": "K26409",
  "K25418-V2": "K25418",
  "K26418-V2": "K26418",
};

export function resolveProgramAlias(code: string): string {
  if (!code) return "";
  const clean = code.trim().toUpperCase();
  return PROGRAM_ALIASES[clean] || clean;
}

export const MASTER_MAJORS: Record<string, string> = {
  "601": "Kinh tế chính trị",
  "602": "Kinh tế quốc tế",
  "603": "Kinh tế và Quản lý công",
  "604": "Tài chính - Ngân hàng",
  "605": "Kế toán",
  "607": "Quản trị kinh doanh",
  "609": "Luật dân sự và tố tụng dân sự",
  "610": "Luật kinh tế",
  "611": "Thương mại điện tử",
  "612": "Luật kinh tế",
  "614": "Công nghệ tài chính",
  "616": "Hệ thống thông tin quản lý",
  "618": "Quản lý công",
  "619": "Phân tích dữ liệu và AI trong kinh tế và kinh doanh",
  "657": "Luật",
};

// Published admissions codes may cover programmes whose internal code is unavailable.
// https://tuyensinh.uel.edu.vn/thong-bao-tuyen-sinh-trinh-do-thac-si-dot-1-nam-2026/
// https://tuyensinh.uel.edu.vn/thong-bao-tuyen-sinh-trinh-do-thac-si-dot-2-nam-2026/
export const MASTER_ADMISSION_MAJORS: Record<string, string> = {
  "8310101": "Kinh tế học",
  "8310102": "Kinh tế chính trị",
  "8310106": "Kinh tế quốc tế",
  "8310108": "Toán kinh tế",
  "8340101": "Quản trị kinh doanh",
  "8340122": "Thương mại điện tử",
  "8340201": "Tài chính - Ngân hàng",
  "8340301": "Kế toán",
  "8340403": "Quản lý công",
  "8380101": "Luật",
  "8380103": "Luật dân sự và tố tụng dân sự",
  "8380107": "Luật kinh tế",
};

// UEL publishes these admissions codes independently of the internal N… class codes.
// https://psdh.uel.edu.vn/dao-tao-tien-si/tien-si-2389
// https://tuyensinh.uel.edu.vn/thong-bao-tuyen-sinh-trinh-do-tien-si-dot-2-nam-2026/
export const DOCTORAL_MAJORS: Record<string, string> = {
  "9310101": "Kinh tế học",
  "9310102": "Kinh tế chính trị",
  "9340101": "Quản trị kinh doanh",
  "9340201": "Tài chính - Ngân hàng",
  "9340301": "Kế toán",
  "9380103": "Luật dân sự và tố tụng dân sự",
  "9380107": "Luật kinh tế",
};

/**
 * Mã lớp của sinh viên: K + 2 số khóa + 3 số mã CTĐT + hậu tố lớp (không bắt buộc).
 * Ví dụ: K23406E1 = khóa 23, CTĐT 406, hệ tiếng Anh, lớp thứ 1;
 *        K24416A = khóa 24, CTĐT 416, hệ chuẩn, lớp A; K23406H = lớp hợp tác doanh nghiệp (Coop).
 *
 * Sau đại học (Brief D8):
 *  - C24601, C25603-2-UD: Thạc sĩ
 *  - N25701-1: Tiến sĩ
 *  - B24501BDTH: Đại học (liên thông / VB2)
 *
 * Bộ quy tắc hậu tố:
 *  - H: lớp hợp tác doanh nghiệp (Coop)
 *  - T: lớp cử nhân tài năng
 *  - E, E1, E2…: hệ tiếng Anh (số là thứ tự lớp)
 *  - A, B, C…: hệ chuẩn (chữ là thứ tự lớp)
 */
export type ClassKind = "coop" | "talent" | "english" | "standard" | "research" | "applied" | "other";

export interface ParsedProgramCode {
  /** mã CTĐT cơ sở, vd "K23406", "M601" */
  programId: string;
  /** mã CTĐT theo ngữ cảnh hệ đào tạo: "K23406E", "K25414H", "M601NC"... */
  contextualProgramId: string;
  /** khóa, vd "K23", "C24", "N25", "B24" */
  cohort: string;
  /** mã CTĐT (3 số), vd "406", "601", "701" */
  major: string;
  /** hậu tố lớp, vd "E1", "A", "H" ("" nếu không có) */
  suffix: string;
  /** loại lớp suy ra từ hậu tố */
  kind: ClassKind;
  /** chương trình tiếng Anh (hậu tố bắt đầu bằng E) */
  english: boolean;
  /** bậc đào tạo: dai_hoc | thac_si | tien_si */
  degree: Degree;
  /** nhánh đào tạo thạc sĩ nếu có (NC, UD) */
  branch?: string;
  /** chuỗi chuẩn hóa để lưu, vd "K23406E1", "C24601" */
  normalized: string;
}

const catalogProgramIds = new Set(programIds);
const knownMajors = new Set(programIds.map((programId) => programId.slice(3)));
const knownCohorts = new Set(["K19", "K20", "K21", "K22", "K23", "K24", "K25", "K26"]);

export function isProgramInCatalog(p: ParsedProgramCode): boolean {
  if (p.degree === "tien_si") return p.major.length === 3 || !!DOCTORAL_MAJORS[p.major];
  if (p.degree === "thac_si") {
    if (catalogProgramIds.has(p.programId)) return true;
    if (MASTER_MAJORS[p.major] || MASTER_ADMISSION_MAJORS[p.major]) return true;
    return false;
  }
  if (catalogProgramIds.has(p.programId)) return true;
  return knownCohorts.has(p.cohort) && knownMajors.has(p.major);
}

export function isDuplicateTrack(a: ParsedProgramCode, b: ParsedProgramCode): boolean {
  return a.contextualProgramId === b.contextualProgramId;
}

export function kindOfSuffix(suffix: string): ClassKind {
  const s = suffix.toUpperCase();
  if (s.startsWith("NC")) return "research";
  if (s.startsWith("UD")) return "applied";
  const letter = s.charAt(0);
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
    research: "hướng nghiên cứu",
    applied: "hướng ứng dụng",
    other: "lớp khác",
  };
  return `Khóa ${p.cohort.slice(1)} · CTĐT ${p.major} · ${kindText[p.kind]}${p.suffix ? ` · lớp ${p.suffix}` : ""}`;
}

export function parseProgramCode(input: string): ParsedProgramCode | null {
  if (!input) return null;
  const rawClean = input.trim().replace(/\s+/g, "").toUpperCase();
  const raw = resolveProgramAlias(rawClean);

  const master = /^(?:M(\d{3})(NC|UD)?|(8\d{6}))$/.exec(raw);
  const doctorate = /^(?:N(\d{3})|(9\d{6}))$/.exec(raw);
  if (master || doctorate) {
    const major = master?.[1] || master?.[3] || doctorate?.[1] || doctorate?.[2] || "";
    const branch = master?.[2];
    return {
      programId: raw,
      contextualProgramId: raw,
      cohort: "",
      major,
      suffix: branch ?? "",
      kind: branch === "NC" ? "research" : branch === "UD" ? "applied" : master ? "standard" : "other",
      english: false,
      degree: master ? "thac_si" : "tien_si",
      branch,
      normalized: raw,
    };
  }

  // 1. Thạc sĩ: C + 2 số khóa + 3 số ngành (6xx) + tùy chọn [-đợt] + tùy chọn [-NC|-UD]
  const mC = /^C(\d{2})(\d{3})(?:-(\d+))?(?:-(NC|UD))?$/.exec(raw) || /^C(\d{2})(\d{3})(.*)$/.exec(raw);
  if (mC) {
    const year = mC[1];
    const major = mC[2];
    const rest = mC[3] || "";
    let branch = "";
    if (mC[4]) {
      branch = mC[4];
    } else if (rest.includes("NC")) {
      branch = "NC";
    } else if (rest.includes("UD")) {
      branch = "UD";
    }
    const cohort = `C${year}`;
    const kind: ClassKind = branch === "NC" ? "research" : (branch === "UD" ? "applied" : "standard");
    const programId = `M${major}${branch}`;
    return {
      programId,
      contextualProgramId: programId,
      cohort,
      major,
      suffix: rest,
      kind,
      english: false,
      degree: "thac_si",
      branch: branch || undefined,
      normalized: raw,
    };
  }

  // 2. Tiến sĩ: N + 2 số khóa + 3 số ngành (7xx) + tùy chọn [-đợt/hậu tố]
  const mN = /^N(\d{2})(\d{3})(?:-(.+))?$/.exec(raw);
  if (mN) {
    const [, year, major, suffix = ""] = mN;
    const cohort = `N${year}`;
    return {
      programId: `N${major}`,
      contextualProgramId: `N${major}`,
      cohort,
      major,
      suffix,
      kind: "other",
      english: false,
      degree: "tien_si",
      normalized: raw,
    };
  }

  // 3. Đại học B: B + 2 số khóa + 3 số ngành (50x) + hậu tố
  const mB = /^B(\d{2})(\d{3})([A-Z\d]*)$/.exec(raw);
  if (mB) {
    const [, year, major, suffix = ""] = mB;
    const cohort = `B${year}`;
    const baseId = `K${year}${major}`;
    return {
      programId: baseId,
      contextualProgramId: baseId,
      cohort,
      major,
      suffix,
      kind: "standard",
      english: false,
      degree: "dai_hoc",
      normalized: raw,
    };
  }

  // 4. Đại học K: K + 2 số khóa + 3 số ngành + hậu tố
  const mK = /^K?(\d{2})(\d{3})([A-Z][A-Z\d]*)?$/.exec(raw);
  const named = /^K(\d{2})([A-Z]{3,})$/.exec(raw);
  if (named) {
    return {
      programId: raw, contextualProgramId: raw, cohort: `K${named[1]}`, major: named[2],
      suffix: "", kind: "standard", english: false, degree: "dai_hoc", normalized: raw,
    };
  }
  if (!mK) return null;
  const [, year, major, suffix = ""] = mK;
  const cohort = `K${year}`;
  const kind = kindOfSuffix(suffix);
  const english = kind === "english" || (kind === "talent" && suffix.startsWith("TE"));
  const baseId = `${cohort}${major}`;

  let contextualProgramId = baseId;
  if (kind === "english") {
    contextualProgramId = `${baseId}E`;
  } else if (kind === "coop") {
    contextualProgramId = `${baseId}H`;
  } else if (kind === "talent" && suffix.startsWith("TE")) {
    contextualProgramId = `${baseId}TE`;
  } else if (kind === "talent") {
    contextualProgramId = `${baseId}T`;
  }

  return {
    programId: baseId,
    contextualProgramId,
    cohort,
    major,
    suffix,
    kind,
    english,
    degree: "dai_hoc",
    normalized: `${cohort}${major}${suffix}`,
  };
}

/**
 * Làm sạch tên ngành từ dữ liệu chương trình:
 * Bỏ phần "Khoá 24" / "Khóa 25" ở cuối tên, bỏ "(Hệ tiếng Anh)", "(E)", "– DLG…" nếu có, trả về tên ngành chuẩn hóa NFC.
 */
export function cleanMajorName(name: string | null | undefined): string {
  if (!name) return "";
  let s = name.normalize("NFC").trim();
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s
      .replace(/\s*[-–—]\s*dlg\b.*$/iu, "")
      .replace(/\s*\((?:hệ tiếng anh|tiếng anh|hệ chuẩn|e)\)$/iu, "")
      .replace(/\s+(?:khóa|khoá|khoa)\s*\d+$/iu, "")
      .replace(/\s*[-–—]\s*(?:hệ tiếng anh|tiếng anh|hệ chuẩn|tiếng việt|co-?op|cử nhân tài năng(?: tiếng anh)?|thạc sĩ(?: nghiên cứu| ứng dụng)?|tiến sĩ)$/iu, "")
      .replace(/\s*\((?:co-?op|cử nhân tài năng(?: tiếng anh)?|hướng (?:nghiên cứu|ứng dụng))\)$/iu, "")
      .replace(/\s*\((?:hệ tiếng anh|tiếng anh|hệ chuẩn|e)\)$/iu, "")
      .trim();
  }
  if (s.toUpperCase() === "KDTMHQ") return "Kinh doanh thương mại Hàn Quốc";
  return s;
}

/**
 * Chuyển mã khóa Kxx thành năm 4 số theo quy ước D3 (vd K25 -> "2025", K19 -> "2019").
 */
export function formatCohortYear(cohort: string): string {
  const digits = cohort.replace(/\D/g, "");
  if (digits.length === 2) return `20${digits}`;
  if (digits.length === 4) return digits;
  return digits || cohort;
}

export const MAJOR_EN: Record<string, string> = {
  "kế toán": "Accounting",
  "kiểm toán": "Auditing",
  "kế toán và phân tích dữ liệu": "Accounting and Data Analytics",
  "tài chính": "Finance",
  "tài chính - ngân hàng": "Finance - Banking",
  "tài chính – ngân hàng": "Finance - Banking",
  "ngân hàng": "Banking",
  "kinh tế học": "Economics",
  "kinh tế": "Economics",
  "kinh tế chính trị": "Political Economy",
  "kinh tế quốc tế": "International Economics",
  "kinh tế đối ngoại": "International Economic Relations",
  "kinh doanh quốc tế": "International Business",
  "kinh tế và quản lý công": "Economics and Public Management",
  "quản lý công": "Public Management",
  "quản trị kinh doanh": "Business Administration",
  "marketing": "Marketing",
  "digital marketing": "Digital Marketing",
  "hệ thống thông tin quản lý": "Management Information Systems",
  "thương mại điện tử": "E-Commerce",
  "công nghệ tài chính": "Financial Technology",
  "kinh doanh số và trí tuệ nhân tạo": "Digital Business and Artificial Intelligence",
  "phân tích dữ liệu": "Data Analytics",
  "phân tích dữ liệu và ai trong kinh tế và kinh doanh": "Data Analytics and AI in Economics and Business",
  "toán ứng dụng trong kinh tế, quản trị và tài chính": "Applied Mathematics in Economics, Management and Finance",
  "toán kinh tế": "Mathematical Economics",
  "quản trị du lịch và lữ hành": "Tourism and Travel Management",
  "luật": "Law",
  "luật kinh doanh": "Business Law",
  "luật và chính sách công": "Law and Public Policy",
  "luật và công nghệ": "Law and Technology",
  "kinh tế số": "Digital Economics",
  "quản lý chuỗi cung ứng và logistics quốc tế": "Supply Chain Management and International Logistics",
  "kinh doanh nông nghiệp số": "Digital Agribusiness",
  "kinh tế đất đai": "Land Economics",
  "tài chính công": "Public Finance",
  "kinh doanh thương mại": "Commercial Business",
  "luật kinh tế": "Economic Law",
  "luật tài chính - ngân hàng": "Financial and Banking Law",
  "luật thương mại quốc tế": "International Trade Law",
  "luật dân sự": "Civil Law",
  "luật dân sự và tố tụng dân sự": "Civil Law and Civil Procedure",
};

/**
 * Mô tả mã lớp đầy đủ, tự nhiên theo yêu cầu Brief W5 và D8.
 * @param parsed Kết quả phân tích từ parseProgramCode
 * @param programName Tên chương trình/ngành đào tạo (nếu có), ví dụ "Kế toán" hoặc "Kế toán Khóa 25"
 * @param lang Ngôn ngữ hiển thị ("vi" hoặc "en"), mặc định "vi"
 * @param coopOfficialName Tên chính thức của chương trình Coop nếu có trong dữ liệu (vd từ api.programs())
 */
export function describeProgramCodeFull(
  parsed: ParsedProgramCode,
  programName?: string | null,
  lang: "vi" | "en" | string = "vi",
  coopOfficialName?: string | null,
): string {
  const isEn = lang === "en";
  const yearStr = formatCohortYear(parsed.cohort);

  if (parsed.degree === "tien_si") {
    const name = cleanMajorName(programName) || DOCTORAL_MAJORS[parsed.major];
    return isEn
      ? `Doctoral programme in ${name ? MAJOR_EN[name.toLowerCase()] ?? name : `major code ${parsed.major}`}.`
      : `Chương trình tiến sĩ ngành ${name || `mã ${parsed.major}`}.`;
  }

  if (parsed.degree === "thac_si") {
    const cleaned = cleanMajorName(programName) || MASTER_MAJORS[parsed.major] || MASTER_ADMISSION_MAJORS[parsed.major] || "";
    let majorPart: string;
    if (cleaned) {
      if (isEn) {
        const enName = MAJOR_EN[cleaned.toLowerCase()] ?? cleaned;
        majorPart = `Master's programme in ${enName}`;
      } else {
        majorPart = `Chương trình thạc sĩ ngành ${cleaned}`;
      }
    } else {
      majorPart = isEn
        ? `Master's programme in major code ${parsed.major}`
        : `Chương trình thạc sĩ ngành mã ${parsed.major}`;
    }

    let branchText = "";
    if (parsed.kind === "applied" || parsed.branch === "UD") {
      branchText = isEn ? ", applied track" : ", hướng ứng dụng";
    } else if (parsed.kind === "research" || parsed.branch === "NC") {
      branchText = isEn ? ", research track" : ", hướng nghiên cứu";
    }

    return `${majorPart}${branchText}.`;
  }

  const part1 = isEn ? `Cohort ${yearStr}` : `Khóa ${yearStr}`;
  const cleaned = cleanMajorName(programName);
  if (parsed.kind === "coop") {
    const baseMajor = cleaned?.replace(/\s*[-–—]?\s*(?:Co-?op|Hợp tác doanh nghiệp)\s*$/i, "").trim();
    const major = baseMajor && isEn ? MAJOR_EN[baseMajor.toLowerCase()] ?? baseMajor : baseMajor;
    return isEn
      ? `${part1}, ${major ? `${major} major` : `major code ${parsed.major}`}, Corporate Partnership programme.`
      : `${part1}, ${major ? `ngành ${major}` : `mã ngành ${parsed.major}`}, chương trình Hợp tác doanh nghiệp.`;
  }
  let part2: string;
  if (cleaned) {
    if (isEn) {
      const enName = MAJOR_EN[cleaned.toLowerCase()] ?? cleaned;
      part2 = `undergraduate programme in ${enName}`;
    } else {
      part2 = `chương trình đào tạo ngành ${cleaned}`;
    }
  } else {
    if (isEn) {
      part2 = `undergraduate programme in major code ${parsed.major}`;
    } else {
      part2 = `chương trình đào tạo mã ngành ${parsed.major}`;
    }
  }

  let part3: string;
  switch (parsed.kind) {
    case "english":
      part3 = isEn ? "English-language programme" : "chương trình tiếng Anh";
      break;
    case "talent":
      part3 = parsed.english
        ? (isEn ? "English-language Talent Bachelor programme" : "chương trình Cử nhân tài năng tiếng Anh")
        : (isEn ? "Talent Bachelor programme" : "chương trình Cử nhân tài năng");
      break;
    case "standard":
      part3 = isEn ? "Vietnamese-language programme" : "chương trình tiếng Việt";
      break;
    default:
      part3 = isEn ? "other programme" : "chương trình khác";
      break;
  }

  return `${part1}, ${part2}, ${part3}.`;
}

/**
 * Mô tả banner lọc chương trình đào tạo theo yêu cầu Brief W11 và D8.
 * Ví dụ:
 *  - Hệ chuẩn: "Chương trình đào tạo ngành Công nghệ tài chính khóa 24"
 *  - E: "Chương trình đào tạo ngành Tài chính - Ngân hàng khóa 25, chương trình tiếng Anh"
 *  - T: "Chương trình đào tạo ngành Tài chính - Ngân hàng khóa 25, chương trình Cử nhân tài năng"
 *  - H: "Chương trình đào tạo ngành Hệ thống thông tin quản lý khóa 23, chương trình Coop (hợp tác doanh nghiệp)"
 *  - Thạc sĩ: "Chương trình thạc sĩ ngành Kinh tế chính trị khóa 24"
 *  - Tiến sĩ: "Chương trình tiến sĩ mã ngành 701 khóa 25"
 *  - Chưa có tên ngành: "Chương trình đào tạo mã ngành 414 khóa 24"
 *  - EN: "Undergraduate programme in Financial Technology, cohort 24"
 */
export function formatFilterBannerText(
  code: string | ParsedProgramCode,
  programName?: string | null,
  lang: "vi" | "en" | string = "vi",
  coopOfficialName?: string | null,
): string {
  const parsed = typeof code === "string" ? parseProgramCode(code) : code;
  if (!parsed) return typeof code === "string" ? code : "";

  const isEn = lang === "en";
  const cohortNum = parsed.cohort.replace(/\D/g, "").slice(-2);

  if (parsed.degree !== "dai_hoc") {
    return describeProgramCodeFull(parsed, programName, lang).replace(/\.$/, "");
  }

  const cleaned = cleanMajorName(programName);

  let mainText: string;
  if (cleaned) {
    if (isEn) {
      const enName = MAJOR_EN[cleaned.toLowerCase()] ?? cleaned;
      mainText = `Undergraduate programme in ${enName}, cohort ${cohortNum}`;
    } else {
      mainText = `Chương trình đào tạo ngành ${cleaned} khóa ${cohortNum}`;
    }
  } else {
    if (isEn) {
      mainText = `Undergraduate programme in major code ${parsed.major}, cohort ${cohortNum}`;
    } else {
      mainText = `Chương trình đào tạo mã ngành ${parsed.major} khóa ${cohortNum}`;
    }
  }

  switch (parsed.kind) {
    case "english":
      mainText += isEn ? ", English-language programme" : ", chương trình tiếng Anh";
      break;
    case "talent":
      mainText += parsed.english
        ? (isEn ? ", English-language Talent Bachelor programme" : ", chương trình Cử nhân tài năng tiếng Anh")
        : (isEn ? ", Talent Bachelor programme" : ", chương trình Cử nhân tài năng");
      break;
    case "coop": {
      mainText += isEn ? `, Co-op Cohort ${cohortNum}` : `, Coop Khóa ${cohortNum}`;
      break;
    }
    case "standard":
    default:
      break;
  }

  return mainText;
}
