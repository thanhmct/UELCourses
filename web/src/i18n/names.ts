import type { Lang } from "./index";

/**
 * Tên học phần / khoa / bộ môn theo ngôn ngữ giao diện.
 * - Tên học phần tiếng Anh do API trả (`name_en`: đề cương > danh mục CTĐT > bảng đối chiếu). Thiếu thì dùng tên tiếng Việt, không tự dịch.
 * - Khoa / bộ môn: bảng ánh xạ cố định bên dưới (danh sách đóng, lấy từ dữ liệu). Tên tiếng Anh là cách gọi thông dụng,
 *   KHÔNG phải bản dịch chính thức của trường; giá trị chưa có trong bảng giữ nguyên tiếng Việt.
 */

export function moduleName(m: { name: string; name_en?: string | null }, lang: Lang): string {
  return lang === "en" && m.name_en ? m.name_en : m.name;
}

/** Khóa so khớp: bỏ tiền tố "Khoa ", gom khoảng trắng, chữ thường; "–" và "-" coi như nhau. */
function key(v: string, prefix: RegExp): string {
  return v.trim().replace(prefix, "").replace(/\s+/g, " ").replace(/[–—]/g, "-").toLowerCase();
}

const FACULTY_EN: Record<string, string> = {
  "quản trị kinh doanh": "Faculty of Business Administration",
  "hệ thống thông tin": "Faculty of Information Systems",
  "tài chính - ngân hàng": "Faculty of Finance and Banking",
  "kinh tế": "Faculty of Economics",
  "toán kinh tế": "Faculty of Mathematical Economics",
  "kinh tế đối ngoại": "Faculty of International Economic Relations",
  "kế toán - kiểm toán": "Faculty of Accounting and Auditing",
  "luật": "Faculty of Law",
  "luật kinh tế": "Faculty of Business Law",
  "trường đại học kinh tế - luật": "University of Economics and Law",
  "phòng đào tạo": "Academic Affairs Office",
  "viện quốc tế uel": "UEL International Institute",
  "trung tâm ngoại ngữ - tin học": "Center for Foreign Languages and Informatics",
  "bộ môn ngoại ngữ": "Department of Foreign Languages",
};

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
  "kinh tế quốc tế": "Department of International Economics",
  "ngân hàng": "Department of Banking",
  "toán kinh tế": "Department of Mathematical Economics",
  "luật thương mại quốc tế": "Department of International Commercial Law",
  "kế toán": "Department of Accounting",
  "luật tài chính - ngân hàng": "Department of Financial and Banking Law",
  "luật kinh doanh": "Department of Business Law",
  "luật dân sự": "Department of Civil Law",
  "luật hành chính - nhà nước": "Department of Administrative and State Law",
  "ngoại ngữ": "Department of Foreign Languages",
};

/** Khoa: "Khoa Kinh tế" và "Kinh tế" cho cùng một kết quả. */
export function facultyName(v: string | null | undefined, lang: Lang): string {
  if (!v) return "";
  if (lang !== "en") return v;
  return FACULTY_EN[key(v, /^khoa\s+/i)] ?? v;
}

/** Bộ môn: "Bộ môn Tài chính" -> "Department of Finance". Đơn vị không phải bộ môn (Phòng Đào tạo, Viện…) dùng bảng khoa/đơn vị. */
export function departmentName(v: string | null | undefined, lang: Lang): string {
  if (!v) return "";
  if (lang !== "en") return v;
  const k = key(v, /^bộ môn\s+/i);
  return DEPARTMENT_EN[k] ?? FACULTY_EN[key(v, /^khoa\s+/i)] ?? v;
}
