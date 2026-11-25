import type { Lang } from "./index";

/**
 * Tên học phần / khoa / bộ môn theo ngôn ngữ giao diện.
 * - Tên học phần tiếng Anh do API trả (`name_en`: đề cương > danh mục CTĐT > bảng đối chiếu). Thiếu thì dùng tên tiếng Việt, không tự dịch.
 * - Khoa / bộ môn: bảng ánh xạ cố định bên dưới (danh sách đóng, lấy từ dữ liệu) và trường `faculty_en`, `department_en` từ API.
 *   Không hiện "Chưa rõ khoa" khi có thể ánh xạ hoặc suy luận từ bộ môn / mã học phần.
 */

export {
  creditsLine,
  formatCredits,
  formatCreditsAndExam,
} from "@/lib/moduleFormat";
export {
  finalAssessmentKind,
  formatFinalAssessment,
  type FinalAssessmentKind,
} from "@/lib/finalAssessment";

/**
 * Mã học phần thuộc hệ tiếng Anh: bắt đầu bằng "E" (trừ nhóm ECO – Kinh tế, khớp với bộ lọc thời khóa biểu).
 * Với các mã này, hậu tố "(E)" trong tên và nhãn EN là thừa nên không hiển thị.
 */
export function isEnglishCode(code?: string | null): boolean {
  const c = (code ?? "").trim().toUpperCase();
  return c.startsWith("E") && !c.startsWith("ECO");
}

/** Bỏ hậu tố "(E)" cuối tên khi mã học phần đã là mã E. */
function stripEnglishSuffix(name: string): string {
  return name.replace(/\s*\(E\)\s*$/, "");
}

export function moduleName(m: { code?: string | null; name: string; name_en?: string | null }, lang: Lang): string {
  const raw = lang === "en" && m.name_en ? m.name_en : m.name;
  return isEnglishCode(m.code) ? stripEnglishSuffix(raw) : raw;
}

/**
 * Mô tả học phần theo ngôn ngữ giao diện: VI → `description`, EN → `description_en`.
 * Thiếu bản đúng ngôn ngữ thì dùng bản còn lại và đặt `fallback = true` để giao diện báo rõ (không tự dịch).
 * Khi lang === "en" và có description_en, KHÔNG rơi về tiếng Việt.
 */
export function moduleDescription(
  m: { description?: string | null; description_en?: string | null } | null | undefined,
  lang: Lang,
): { text: string | null; fallback: boolean } {
  if (!m) return { text: null, fallback: false };
  const vi = m.description?.trim() || null;
  const en = m.description_en?.trim() || null;
  const wanted = lang === "en" ? en : vi;
  const other = lang === "en" ? vi : en;
  if (wanted) return { text: wanted, fallback: false };
  return other ? { text: other, fallback: true } : { text: null, fallback: false };
}

/** Khóa so khớp: bỏ tiền tố chỉ định, gom khoảng trắng, chữ thường; "–" và "-" coi như nhau. */
function key(v: string, prefix: RegExp): string {
  return v
    .trim()
    .replace(prefix, "")
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/&/g, "and")
    .toLowerCase();
}

const FACULTY_EN: Record<string, string> = {
  "khác / chưa rõ khoa": "Other / Unknown faculty",
  "phòng hành chính": "Department of Administration",
  "phòng nhân sự": "Department of Human Resources",
  "phòng bảo đảm chất lượng": "Department of Quality Assurance",
  "bảo đảm chất lượng": "Department of Quality Assurance",
  "phòng tuyển sinh và công tác sinh viên": "Department of Admissions and Student Affairs",
  "phòng tuyển sinh and công tác sinh viên": "Department of Admissions and Student Affairs",
  "phòng đào tạo": "Department of Academic Affairs",
  "đào tạo": "Department of Academic Affairs",
  "phòng khoa học và công nghệ": "Department of Science and Technology",
  "phòng khoa học and công nghệ": "Department of Science and Technology",
  "phòng hợp tác phát triển": "Department of Cooperation and Development",
  "phòng quản trị tài sản": "Department of Asset Management",
  "phòng tài chính": "Department of Finance",
  "phòng công nghệ thông tin": "Department of Information Technology",
  "phòng truyền thông": "Department of Communication",
  "phòng pháp chế": "Department of Legal Affairs",
  "quản trị kinh doanh": "Faculty of Business Administration",
  "hệ thống thông tin": "Faculty of Information Systems",
  "tài chính - ngân hàng": "Faculty of Finance and Banking",
  "tài chính and ngân hàng": "Faculty of Finance and Banking",
  "kinh tế": "Faculty of Economics",
  "toán kinh tế": "Faculty of Economic Mathematics",
  "kinh tế đối ngoại": "Faculty of International Economic Relations",
  "kế toán - kiểm toán": "Faculty of Accounting and Auditing",
  "kế toán and kiểm toán": "Faculty of Accounting and Auditing",
  "luật": "Faculty of Law",
  "luật kinh tế": "Faculty of Economic Law",
  "trường đại học kinh tế - luật": "University of Economics and Law",
  "viện quốc tế uel": "The International Institute of UEL",
  "thư viện": "Library",
  "viện nghiên cứu phát triển công nghệ ngân hàng đhqg-hcm": "Institute for Development and Research in Banking Technology VNUHCM",
  "viện pháp luật quốc tế và so sánh": "Institute of International and Comparative Law",
  "viện pháp luật quốc tế and so sánh": "Institute of International and Comparative Law",
  "công ty tnhh mtv kinh tế - luật": "Economics and Law Co., Ltd",
  "công đoàn": "Trade Union",
  "đoàn thanh niên - hội sinh viên": "Youth Union",
  "trung tâm ngoại ngữ - tin học": "Center for Foreign Languages and Informatics",
  "bộ môn ngoại ngữ": "Department of Foreign Languages",
  "ngoại ngữ": "Department of Foreign Languages",
  "lý luận chính trị": "Department of Political Theory",
  "giáo dục thể chất": "Department of Physical Education",
};

const LEGACY_UNIT_EN: Record<string, string> = {
  "academic affairs office": "Department of Academic Affairs",
  "quality assurance office": "Department of Quality Assurance",
  "quality assurance and testing center": "Department of Quality Assurance",
  "faculty of business law": "Faculty of Economic Law",
  "faculty of mathematical economics": "Faculty of Economic Mathematics",
  "uel international institute": "The International Institute of UEL",
};

function canonicalEnglishUnitName(value: string): string {
  const trimmed = value.trim();
  return LEGACY_UNIT_EN[trimmed.toLowerCase()] ?? trimmed;
}

const DEPARTMENT_EN: Record<string, string> = {
  "tài chính": "Department of Finance",
  "marketing": "Department of Marketing",
  "quản trị": "Department of Management",
  "quản lý công": "Department of Public Management",
  "phân tích dữ liệu": "Department of Data Analytics",
  "hệ thống thông tin quản lý": "Department of Management Information Systems",
  "thương mại điện tử": "Department of E-Commerce",
  "kiểm toán": "Department of Auditing",
  "kinh tế học": "Department of Economics",
  "kinh doanh quốc tế": "Department of International Business",
  "kinh tế và quản lý công": "Department of Economics and Public Management",
  "kinh tế and quản lý công": "Department of Economics and Public Management",
  "kinh tế quốc tế": "Department of International Economics",
  "ngân hàng": "Department of Banking",
  "toán kinh tế": "Department of Mathematical Economics",
  "luật thương mại quốc tế": "Department of International Commercial Law",
  "kế toán": "Department of Accounting",
  "luật tài chính - ngân hàng": "Department of Financial and Banking Law",
  "luật tài chính and ngân hàng": "Department of Financial and Banking Law",
  "luật kinh doanh": "Department of Business Law",
  "luật dân sự": "Department of Civil Law",
  "luật hành chính - nhà nước": "Department of Administrative and State Law",
  "ngoại ngữ": "Department of Foreign Languages",
  "lý luận chính trị": "Department of Political Theory",
  "giáo dục thể chất": "Department of Physical Education",
};

const DEPT_TO_FACULTY: Record<string, string> = {
  "tài chính": "Khoa Tài chính - Ngân hàng",
  "ngân hàng": "Khoa Tài chính - Ngân hàng",
  "luật tài chính - ngân hàng": "Khoa Luật Kinh tế",
  "luật tài chính and ngân hàng": "Khoa Luật Kinh tế",
  "quản trị": "Khoa Quản trị kinh doanh",
  "marketing": "Khoa Quản trị kinh doanh",
  "quản lý công": "Khoa Quản trị kinh doanh",
  "hệ thống thông tin quản lý": "Khoa Hệ thống thông tin",
  "thương mại điện tử": "Khoa Hệ thống thông tin",
  "kế toán": "Khoa Kế toán - Kiểm toán",
  "kiểm toán": "Khoa Kế toán - Kiểm toán",
  "kinh tế học": "Khoa Kinh tế",
  "kinh tế quốc tế": "Khoa Kinh tế",
  "kinh tế và quản lý công": "Khoa Kinh tế",
  "kinh tế and quản lý công": "Khoa Kinh tế",
  "toán kinh tế": "Khoa Toán kinh tế",
  "phân tích dữ liệu": "Khoa Toán kinh tế",
  "kinh doanh quốc tế": "Khoa Kinh tế đối ngoại",
  "luật kinh doanh": "Khoa Luật Kinh tế",
  "luật thương mại quốc tế": "Khoa Luật",
  "luật dân sự": "Khoa Luật",
  "luật hành chính - nhà nước": "Khoa Luật",
  "ngoại ngữ": "Bộ môn Ngoại ngữ",
  "lý luận chính trị": "Lý luận chính trị",
  "giáo dục thể chất": "Giáo dục thể chất",
};

const CODE_PREFIX_TO_FACULTY: [RegExp, string][] = [
  [/^(BAC|BAA|BAM|BAB|BBA)/i, "Khoa Quản trị kinh doanh"],
  [/^(IS|BIS|BIM)/i, "Khoa Hệ thống thông tin"],
  [/^(FB|BFN|FIN|BAN)/i, "Khoa Tài chính - Ngân hàng"],
  [/^(EC|BEC|ECO|KTE)/i, "Khoa Kinh tế"],
  [/^(ME|BME|MAT|TOA|TKE|KTL)/i, "Khoa Toán kinh tế"],
  [/^(IB|BIB|INR|EIE)/i, "Khoa Kinh tế đối ngoại"],
  [/^(AC|ACC|AUD|KET)/i, "Khoa Kế toán - Kiểm toán"],
  [/^(LAW|BLA|LUA|LDS)/i, "Khoa Luật"],
  [/^(EL|BEL)/i, "Khoa Luật Kinh tế"],
  [/^(ENG|BEN|FL)/i, "Bộ môn Ngoại ngữ"],
  [/^(HTT)/i, "Khoa Hệ thống thông tin"],
  [/^(MKT)/i, "Khoa Quản trị kinh doanh"],
  [/^(TCH)/i, "Khoa Tài chính - Ngân hàng"],
  [/^(TRI)/i, "Lý luận chính trị"],
  [/^(MI)/i, "Giáo dục thể chất"],
];

/**
 * Suy luận tên khoa tiếng Việt từ bộ môn hoặc tiền tố mã môn học khi trường khoa bị trống hoặc ghi "Chưa rõ khoa".
 */
export function inferFaculty(
  faculty: string | null | undefined,
  department?: string | null,
  code?: string | null,
): string {
  const f = faculty?.trim();
  if (f && !/^(chưa rõ|chưa rõ khoa|unknown)$/i.test(f)) {
    return f;
  }
  // Thử suy luận từ bộ môn
  if (department) {
    const dKey = key(department, /^bộ môn\s+/i);
    const mapped = DEPT_TO_FACULTY[dKey];
    if (mapped) return mapped;
  }
  // Thử suy luận từ tiền tố mã học phần
  if (code) {
    for (const [regex, fac] of CODE_PREFIX_TO_FACULTY) {
      if (regex.test(code)) return fac;
    }
  }
  return "";
}

/**
 * Khoa: "Khoa Kinh tế" và "Kinh tế" cho cùng một kết quả.
 * Hỗ trợ truyền ModuleSummary / ModuleDetail để dùng trực tiếp `faculty_en` do API trả về,
 * hoặc suy luận từ bộ môn / mã học phần khi khoa trống hoặc "Chưa rõ khoa".
 */
export function facultyName(
  v:
    | {
        faculty?: string | null;
        faculty_en?: string | null;
        department?: string | null;
        department_en?: string | null;
        code?: string | null;
      }
    | string
    | null
    | undefined,
  lang: Lang,
  faculty_en?: string | null,
): string {
  if (!v) return "";
  let fac: string | null | undefined;
  let facEn: string | null | undefined = faculty_en;
  let dept: string | null | undefined;
  let code: string | null | undefined;

  if (typeof v === "object") {
    fac = v.faculty;
    if (!facEn) facEn = v.faculty_en;
    dept = v.department;
    code = v.code;
  } else {
    fac = v;
  }

  // Ánh xạ / suy luận tên khoa nếu bị trống hoặc "Chưa rõ khoa"
  const inferred = inferFaculty(fac, dept, code);
  fac = inferred || fac || "";

  if (lang !== "en") {
    if (!fac || /^(chưa rõ|chưa rõ khoa|unknown)$/i.test(fac)) return "";
    return fac;
  }

  // Khi giao diện EN:
  // 1. Ưu tiên faculty_en do API trả về nếu có
  if (facEn && facEn.trim() && !/^(unknown|unknown faculty)$/i.test(facEn.trim())) {
    return canonicalEnglishUnitName(facEn);
  }

  if (!fac || /^(chưa rõ|chưa rõ khoa|unknown)$/i.test(fac)) {
    return "";
  }

  // 2. Tra cứu trong bảng ánh xạ FACULTY_EN / DEPARTMENT_EN
  const k = key(fac, /^khoa\s+/i);
  return canonicalEnglishUnitName(FACULTY_EN[k] ?? DEPARTMENT_EN[k] ?? fac);
}

/**
 * Bộ môn: "Bộ môn Tài chính" -> "Department of Finance".
 * Hỗ trợ nhận object hoặc department_en trực tiếp từ API.
 */
export function departmentName(
  v:
    | {
        department?: string | null;
        department_en?: string | null;
      }
    | string
    | null
    | undefined,
  lang: Lang,
  department_en?: string | null,
): string {
  if (!v) return "";
  let dept: string | null | undefined;
  let deptEn: string | null | undefined = department_en;

  if (typeof v === "object") {
    dept = v.department;
    if (!deptEn) deptEn = v.department_en;
  } else {
    dept = v;
  }

  if (!dept) return "";
  if (lang !== "en") return dept;

  // Khi EN:
  if (deptEn && deptEn.trim() && !/^(unknown|unknown department)$/i.test(deptEn.trim())) {
    return canonicalEnglishUnitName(deptEn);
  }

  const k = key(dept, /^bộ môn\s+/i);
  return canonicalEnglishUnitName(DEPARTMENT_EN[k] ?? FACULTY_EN[key(dept, /^khoa\s+/i)] ?? dept);
}

/**
 * Nhãn năm học thống nhất, luôn dùng dấu gạch nối dài (–):
 * "2026-2027" -> "2026–2027"
 */
export function academicYearLabel(
  sem: { year?: number | string; id?: string; name?: string | null } | string | null | undefined,
): string {
  if (!sem) return "";
  if (typeof sem === "string") {
    const m = /(\d{4})[-–](\d{4})/.exec(sem);
    if (m) return `${m[1]}–${m[2]}`;
    return sem.replace(/[-–]/g, "–").trim();
  }
  if (sem.year) {
    const s = String(sem.year).trim();
    const m = /(\d{4})[-–](\d{4})/.exec(s);
    if (m) return `${m[1]}–${m[2]}`;
    return s.replace(/[-–]/g, "–");
  }
  if (sem.id) {
    const m = /(\d{4})[-–](\d{4})/.exec(sem.id);
    if (m) return `${m[1]}–${m[2]}`;
  }
  if (sem.name) {
    const m = /(\d{4})[-–](\d{4})/.exec(sem.name);
    if (m) return `${m[1]}–${m[2]}`;
  }
  return "";
}

/**
 * Lấy số học kỳ (1, 2, 3) từ đối tượng hoặc chuỗi học kỳ.
 */
export function semesterTerm(
  sem: { term?: number | string; id?: string; name?: string | null } | string | null | undefined,
): number | null {
  if (!sem) return null;
  if (typeof sem === "object" && sem.term !== undefined && sem.term !== null && sem.term !== "") {
    const sTerm = String(sem.term).trim();
    const mTerm = /(?:Học\s*kỳ|HK|Kỳ|Term|Semester)*\s*0*([1-9]\d*)/i.exec(sTerm);
    if (mTerm && mTerm[1]) {
      const n = Number(mTerm[1]);
      if (!isNaN(n) && n > 0 && n <= 10) return n;
    }
    const n = Number(sem.term);
    if (!isNaN(n) && n > 0) return n;
  }
  const str = typeof sem === "string" ? sem : sem.id || sem.name || "";
  const mWord = /(?:Học\s*kỳ|HK|Kỳ|Term|Semester)+\s*0*([1-9]\d*)/i.exec(str);
  if (mWord && mWord[1]) return Number(mWord[1]);
  const mEnd = /[-_](\d+)$/.exec(str);
  if (mEnd) {
    const val = Number(mEnd[1]);
    if (val <= 10) return val;
  }
  return null;
}

/**
 * Tên rút gọn của học kỳ:
 * VI: "Kỳ 1", "Kỳ 2", "Kỳ 3"
 * EN: "Term 1", "Term 2", "Term 3"
 */
export function semesterShort(
  sem: { term?: number | string; id?: string; name?: string | null } | string | null | undefined,
  lang: Lang,
): string {
  const t = semesterTerm(sem);
  if (t) return lang === "en" ? `Term ${t}` : `Kỳ ${t}`;
  return "";
}

/**
 * Tên đầy đủ của học kỳ cho tiêu đề và tooltip:
 * VI: "Học kỳ 1, năm học 2026–2027"
 * EN: "Semester 1, academic year 2026–2027"
 */
export function semesterFull(
  sem: { term?: number | string; year?: number | string; id?: string; name?: string | null } | string | null | undefined,
  lang: Lang,
): string {
  const t = semesterTerm(sem);
  const y = academicYearLabel(sem);
  if (t && y) {
    return lang === "en" ? `Semester ${t}, academic year ${y}` : `Học kỳ ${t}, năm học ${y}`;
  }
  if (t) {
    return lang === "en" ? `Semester ${t}` : `Học kỳ ${t}`;
  }
  if (y) {
    return lang === "en" ? `Academic year ${y}` : `Năm học ${y}`;
  }
  return semesterName(sem, lang);
}

/**
 * Nhãn ngắn gọn hiển thị trên nút mở bộ chọn:
 * VI: "Kỳ 1 · 2026–2027"
 * EN: "Term 1 · 2026–2027"
 */
export function semesterButtonLabel(
  sem: { term?: number | string; year?: number | string; id?: string; name?: string | null } | string | null | undefined,
  lang: Lang,
): string {
  const s = semesterShort(sem, lang);
  const y = academicYearLabel(sem);
  if (s && y) return `${s} · ${y}`;
  if (s) return s;
  if (y) return y;
  return semesterName(sem, lang);
}

/**
 * Tên học kỳ theo ngôn ngữ giao diện:
 * "Học kỳ 1 năm học 2026-2027" -> "Semester 1, 2026-2027" khi lang === "en".
 */
export function semesterName(
  s: { name?: string | null; term?: number | string; year?: number | string } | string | null | undefined,
  lang: Lang,
): string {
  if (!s) return "";
  if (typeof s === "string") {
    const cleaned = s.replace(/(?:HK\s*)+HK/gi, "HK");
    if (lang !== "en") return cleaned;
    return cleaned
      .replace(/(?:Học kỳ|HK)\s*(\d+)(?:,?\s*năm học\s*|\s*,\s*|\s*[-–]\s*|\s+)(\d{4}[-–]\d{4})/gi, "Semester $1, $2")
      .replace(/(?:Học kỳ|HK)\s*(\d+)/gi, "Semester $1")
      .replace(/năm học (\d{4}[-–]\d{4})/gi, "Academic year $1")
      .replace(/–/g, "-");
  }
  if (lang === "en") {
    if (s.term && s.year) {
      return `Semester ${s.term}, ${String(s.year).replace("–", "-")}`;
    }
    if (s.name) {
      return semesterName(s.name, lang);
    }
  }
  return s.name ? s.name.replace(/(?:HK\s*)+HK/gi, "HK") : (s.term && s.year ? `Học kỳ ${s.term}, ${s.year}` : "");
}

/**
 * Chuẩn hóa nhãn học kỳ trong Kế hoạch học tập (Brief W28):
 * - Nhận dạng và loại bỏ tiền tố trùng lặp "HKHK" -> "HK".
 * - Lấy số kỳ từ mã: HK01 -> 1, HK02 -> 2, HK03 -> 3.
 * - Năm học định dạng YYYY-YYYY: 2024-2025.
 * - Kết quả:
 *   VI: "Học kỳ 1 · 2024-2025"
 *   EN: "Semester 1 · 2024-2025"
 * - Với năm học thứ tự, chấp nhận cách viết linh hoạt như "năm 4 kỳ 3",
 *   "N4 HK3", "HK3 năm 4" và chuẩn hóa thành "Năm 4 · Học kỳ 3".
 * - Hỗ trợ cả hai tham số (term, year, lang) hoặc đối tượng / chuỗi đơn.
 */
export function formatPlannerTerm(
  termOrSem?: unknown,
  yearOrLang?: unknown,
  langFallback: Lang = "vi",
): string {
  if (!termOrSem) return "";

  let lang: Lang = "vi";
  let explicitYear: string | null = null;

  // Xác định lang và explicitYear từ các tham số
  if (typeof yearOrLang === "string") {
    if (yearOrLang === "vi" || yearOrLang === "en") {
      lang = yearOrLang as Lang;
    } else {
      explicitYear = yearOrLang;
      if (langFallback === "vi" || langFallback === "en") {
        lang = langFallback;
      }
    }
  }

  let str = "";
  let objTerm: unknown = undefined;
  let objYear: unknown = undefined;

  if (typeof termOrSem === "object" && termOrSem !== null) {
    const o = termOrSem as Record<string, unknown>;
    objTerm = o.term;
    objYear = o.year;
    str = String(o.name || o.id || "");
    if (!str && objTerm !== undefined) {
      str = String(objTerm);
    }
  } else {
    str = String(termOrSem);
  }

  const normalizeForMatching = (value: unknown) => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

  const normalizedStr = normalizeForMatching(str);
  const extractStudyYear = (value: unknown): number | null => {
    const normalized = normalizeForMatching(value);
    const match = /(?:^|[^a-z0-9])(?:nam|year|n|y)\s*(?:thu\s*)?[:.#-]?\s*0*([1-9]\d*)(?=$|[^0-9])/i.exec(normalized);
    if (!match) return null;
    const valueAsNumber = Number(match[1]);
    return valueAsNumber >= 1 && valueAsNumber <= 10 ? valueAsNumber : null;
  };

  const extractTermNumber = (value: unknown): number | null => {
    const normalized = normalizeForMatching(value);
    const match = /(?:hoc\s*(?:ky|ki)|hk|ky|ki|term|semester|sem)\s*(?:thu\s*)?[:.#-]?\s*0*([1-9]\d*)/i.exec(normalized);
    return match ? Number(match[1]) : null;
  };

  // 1. Trích xuất số học kỳ (1, 2, 3...)
  let termNum: number | null = null;
  if (objTerm !== undefined && objTerm !== null && objTerm !== "") {
    const labelledTerm = extractTermNumber(objTerm);
    if (labelledTerm !== null) {
      termNum = labelledTerm;
    } else {
      const n = Number(objTerm);
      if (!isNaN(n) && n > 0 && n <= 10) termNum = n;
    }
  }

  if (termNum === null && str) {
    // Xử lý chuỗi có thể chứa HKHK, HK, Học kỳ...
    const labelledTerm = extractTermNumber(str);
    if (labelledTerm !== null) {
      termNum = labelledTerm;
    } else {
      const mEnd = /[-_](\d+)$/.exec(str);
      if (mEnd) {
        const val = Number(mEnd[1]);
        if (val <= 10) termNum = val;
      }
    }
  }

  // Dạng rút gọn thuần số "4/3" hoặc "4-3" được hiểu là năm 4, học kỳ 3.
  const compactYearTerm = /^\s*0*([1-9]\d*)\s*[/.–-]\s*0*([1-9]\d*)\s*$/.exec(normalizedStr);
  let studyYear = extractStudyYear(str);
  if (studyYear === null) studyYear = extractStudyYear(explicitYear);
  if (studyYear === null) studyYear = extractStudyYear(objYear);
  if (compactYearTerm) {
    const compactYear = Number(compactYearTerm[1]);
    if (compactYear <= 10) {
      studyYear = compactYear;
      if (termNum === null) termNum = Number(compactYearTerm[2]);
    }
  }

  // Khi year được truyền riêng dưới dạng số nhỏ, đó là năm học thứ tự, không phải niên khóa.
  const rawOrdinalYear = explicitYear ?? objYear;
  if (studyYear === null && rawOrdinalYear !== null && rawOrdinalYear !== undefined) {
    const numericYear = Number(rawOrdinalYear);
    if (Number.isInteger(numericYear) && numericYear >= 1 && numericYear <= 10) {
      studyYear = numericYear;
    }
  }

  // 2. Trích xuất năm học dạng 2024-2025
  let yearStr: string | null = null;
  const rawYear = explicitYear || objYear || str;
  if (rawYear) {
    const mYear = /(\d{4})[-–](\d{4})/.exec(String(rawYear));
    if (mYear) {
      yearStr = `${mYear[1]}-${mYear[2]}`;
    }
  }

  // 3. Nếu có cả năm học thứ tự và học kỳ, luôn giữ đủ hai phần dù người dùng nhập theo thứ tự nào.
  if (termNum !== null && studyYear !== null) {
    const ordinalLabel = lang === "en"
      ? `Year ${studyYear} · Semester ${termNum}`
      : `Năm ${studyYear} · Học kỳ ${termNum}`;
    return yearStr ? `${ordinalLabel} · ${yearStr}` : ordinalLabel;
  }

  // 4. Nếu có cả term và niên khóa: chuẩn hóa thành "Học kỳ X · YYYY-YYYY" (VI) hoặc "Semester X · YYYY-YYYY" (EN)
  if (termNum !== null && yearStr) {
    return lang === "en" ? `Semester ${termNum} · ${yearStr}` : `Học kỳ ${termNum} · ${yearStr}`;
  }

  // 5. Nếu có term nhưng không có year
  if (termNum !== null) {
    return lang === "en" ? `Semester ${termNum}` : `Học kỳ ${termNum}`;
  }

  if (studyYear !== null) {
    return lang === "en" ? `Year ${studyYear}` : `Năm ${studyYear}`;
  }

  // 6. Nếu chuỗi có "HKHK" thì làm sạch chuỗi
  let cleaned = str.replace(/(?:HK\s*)+HK/gi, "HK").trim();
  if (lang === "en") {
    cleaned = cleaned
      .replace(/Học\s*kỳ/gi, "Semester")
      .replace(/năm\s*học/gi, "academic year")
      .replace(/Năm\s*(\d+)/gi, "Year $1");
  }
  return cleaned;
}

/** Nhãn rút gọn cho màn hình hẹp: "Kỳ 1 · 26 - 27" (VI) / "Sem 1 · 26 - 27" (EN). */
export function formatPlannerTermShort(termOrSem?: unknown, lang: Lang = "vi"): string {
  const full = formatPlannerTerm(termOrSem, lang);
  const unit = lang === "en" ? "Sem" : "Kỳ";
  const withYear = /(?:Học kỳ|Semester)\s+(\d+)\s*·\s*(\d{4})-(\d{4})/.exec(full);
  if (withYear) return `${unit} ${withYear[1]} · ${withYear[2].slice(2)} - ${withYear[3].slice(2)}`;
  return full.replace(/Học kỳ/g, "Kỳ").replace(/Semester/g, "Sem");
}

export const plannerSemesterLabel = formatPlannerTerm;
export const formatSemesterLabel = formatPlannerTerm;
export const formatPlannerTermName = formatPlannerTerm;

/**
 * Định dạng dòng thống kê môn và tín chỉ cho thẻ học kỳ (Brief W28):
 * VI: "5 môn · 14 TC"
 * EN: "5 courses · 14 credits"
 */
export function formatPlannerTermStats(
  modulesCount: number,
  creditsCount: number,
  lang: Lang = "vi",
): string {
  if (lang === "en") {
    const crUnit = creditsCount === 1 ? "credit" : "credits";
    const courseUnit = modulesCount === 1 ? "course" : "courses";
    return `${modulesCount} ${courseUnit} · ${creditsCount} ${crUnit}`;
  }
  return `${modulesCount} môn · ${creditsCount} TC`;
}
