import { describe, expect, it } from "vitest";
import {
  academicYearLabel,
  departmentName,
  facultyName,
  isEnglishCode,
  formatPlannerTerm,
  formatPlannerTermStats,
  moduleDescription,
  moduleName,
  plannerSemesterLabel,
  semesterButtonLabel,
  semesterFull,
  semesterName,
  semesterShort,
  semesterTerm,
} from "../names";
import type { ModuleDetail, ModuleSummary, Semester } from "@/lib/types";

describe("moduleName", () => {
  it("dùng name_en khi giao diện EN và có tên", () => {
    expect(moduleName({ name: "Kế toán quản trị 1", name_en: "Management Accounting 1" }, "en")).toBe("Management Accounting 1");
  });
  it("rơi về tên tiếng Việt khi chưa có name_en (null hoặc thiếu)", () => {
    expect(moduleName({ name: "Môn lạ", name_en: null }, "en")).toBe("Môn lạ");
    expect(moduleName({ name: "Môn lạ" }, "en")).toBe("Môn lạ");
  });
  it("giao diện VI luôn dùng tên tiếng Việt", () => {
    expect(moduleName({ name: "Kế toán quản trị 1", name_en: "Management Accounting 1" }, "vi")).toBe("Kế toán quản trị 1");
  });
});
describe("semesterName", () => {
  const sem1: Semester = {
    id: "2026_1",
    name: "Học kỳ 1 năm học 2026-2027",
    term: 1,
    year: "2026-2027",
    is_current: true,
  };

  const sem3: Semester = {
    id: "2025_3",
    name: "Học kỳ 3 năm học 2025-2026",
    term: 3,
    year: "2025-2026",
    is_current: false,
  };

  it("giữ nguyên tên gốc tiếng Việt khi lang === 'vi'", () => {
    expect(semesterName(sem1, "vi")).toBe("Học kỳ 1 năm học 2026-2027");
    expect(semesterName(sem3, "vi")).toBe("Học kỳ 3 năm học 2025-2026");
  });

  it("bỏ hậu tố (E) khi mã học phần bắt đầu bằng E, giữ nguyên với mã khác", () => {
    expect(moduleName({ code: "EBB1067", name: "Quản trị học (E)" }, "vi")).toBe("Quản trị học");
    expect(moduleName({ code: "EBB1067", name: "Quản trị học (E)", name_en: "Management (E)" }, "en")).toBe("Management");
    expect(moduleName({ code: "BAC1001", name: "Quản trị học (E)" }, "vi")).toBe("Quản trị học (E)");
    expect(moduleName({ code: "ECO1001", name: "Kinh tế học (E)" }, "vi")).toBe("Kinh tế học (E)");
    expect(isEnglishCode("EBB1067")).toBe(true);
    expect(isEnglishCode("ECO1001")).toBe(false);
    expect(isEnglishCode(undefined)).toBe(false);
  });

  it("chuyển sang định dạng tiếng Anh 'Semester {term}, {year}' khi lang === 'en'", () => {
    expect(semesterName(sem1, "en")).toBe("Semester 1, 2026-2027");
    expect(semesterName(sem3, "en")).toBe("Semester 3, 2025-2026");
  });

  it("dịch đúng cả khi chỉ có chuỗi name mà không có term/academic_year", () => {
    expect(semesterName("Học kỳ 2 năm học 2024-2025", "en")).toBe("Semester 2, 2024-2025");
    expect(semesterName("HK1 2026-2027", "en")).toBe("Semester 1, 2026-2027");
  });

  it("xử lý an toàn khi semester rỗng hoặc null", () => {
    expect(semesterName(null, "vi")).toBe("");
    expect(semesterName(undefined, "en")).toBe("");
  });
});

describe("Brief W19: Helper tên và nhãn học kỳ thống nhất (academicYearLabel, semesterTerm, semesterShort, semesterFull, semesterButtonLabel)", () => {
  const sem1: Semester = {
    id: "2026-2027-1",
    name: "Học kỳ 1 năm học 2026-2027",
    term: 1,
    year: "2026-2027",
    is_current: true,
  };

  const sem2: Semester = {
    id: "2026-2027-2",
    name: "Học kỳ 2, năm học 2026–2027",
    term: 2,
    year: "2026–2027",
    is_current: false,
  };

  it("academicYearLabel: chuẩn hóa nhãn năm học luôn dùng dấu gạch nối dài (–)", () => {
    expect(academicYearLabel("2026-2027")).toBe("2026–2027");
    expect(academicYearLabel("2026–2027")).toBe("2026–2027");
    expect(academicYearLabel("2026-2027-1")).toBe("2026–2027");
    expect(academicYearLabel(sem1)).toBe("2026–2027");
    expect(academicYearLabel(sem2)).toBe("2026–2027");
    expect(academicYearLabel(null)).toBe("");
  });

  it("semesterTerm: trích xuất số kỳ (1, 2, 3) từ object hoặc chuỗi", () => {
    expect(semesterTerm(sem1)).toBe(1);
    expect(semesterTerm(sem2)).toBe(2);
    expect(semesterTerm("2026-2027-3")).toBe(3);
    expect(semesterTerm("Học kỳ 2, 2025-2026")).toBe(2);
    expect(semesterTerm("HK1")).toBe(1);
    expect(semesterTerm(null)).toBeNull();
  });

  it("semesterShort: trả về 'Kỳ {n}' (VI) và 'Term {n}' (EN)", () => {
    expect(semesterShort(sem1, "vi")).toBe("Kỳ 1");
    expect(semesterShort(sem1, "en")).toBe("Term 1");
    expect(semesterShort({ term: 2 }, "vi")).toBe("Kỳ 2");
    expect(semesterShort({ term: 3 }, "en")).toBe("Term 3");
  });

  it("semesterFull: trả về tên đầy đủ 'Học kỳ {t}, năm học {y}' (VI) và 'Semester {t}, academic year {y}' (EN)", () => {
    expect(semesterFull(sem1, "vi")).toBe("Học kỳ 1, năm học 2026–2027");
    expect(semesterFull(sem1, "en")).toBe("Semester 1, academic year 2026–2027");
    expect(semesterFull(sem2, "vi")).toBe("Học kỳ 2, năm học 2026–2027");
    expect(semesterFull(sem2, "en")).toBe("Semester 2, academic year 2026–2027");
  });

  it("semesterButtonLabel: hiển thị dạng gọn 'Kỳ {t} · {y}' (VI) và 'Term {t} · {y}' (EN)", () => {
    expect(semesterButtonLabel(sem1, "vi")).toBe("Kỳ 1 · 2026–2027");
    expect(semesterButtonLabel(sem1, "en")).toBe("Term 1 · 2026–2027");
    expect(semesterButtonLabel(sem2, "vi")).toBe("Kỳ 2 · 2026–2027");
    expect(semesterButtonLabel(sem2, "en")).toBe("Term 2 · 2026–2027");
  });
});

describe("moduleDescription", () => {
  const modWithBoth: Partial<ModuleDetail> = {
    code: "TOA1001",
    name: "Toán cao cấp 1",
    name_en: "Advanced Mathematics 1",
    description: "Nội dung học phần giải tích toán học dành cho khối kinh tế.",
    description_en: "Mathematical calculus module designed for economics students.",
  };

  const modOnlyVi: Partial<ModuleDetail> = {
    code: "TOA1002",
    name: "Toán cao cấp 2",
    description: "Nội dung đại số tuyến tính.",
    description_en: null,
  };

  const modOnlyEn: Partial<ModuleDetail> = {
    code: "ENG1001",
    name: "Tiếng Anh chuyên ngành",
    description: undefined,
    description_en: "English for specific purposes.",
  };

  it("ưu tiên description_en khi ở chế độ EN và có bản tiếng Anh (không rơi về tiếng Việt)", () => {
    const desc = moduleDescription(modWithBoth as ModuleDetail, "en");
    expect(desc.text).toBe("Mathematical calculus module designed for economics students.");
    expect(desc.fallback).toBe(false);
  });

  it("dùng description tiếng Việt khi ở chế độ VI", () => {
    const desc = moduleDescription(modWithBoth as ModuleDetail, "vi");
    expect(desc.text).toBe("Nội dung học phần giải tích toán học dành cho khối kinh tế.");
    expect(desc.fallback).toBe(false);
  });

  it("rơi về tiếng Việt khi ở chế độ EN nhưng học phần chưa có bản tiếng Anh", () => {
    const desc = moduleDescription(modOnlyVi as ModuleDetail, "en");
    expect(desc.text).toBe("Nội dung đại số tuyến tính.");
    expect(desc.fallback).toBe(true);
  });

  it("Brief D7: chế độ EN thiếu description_en thì trả về mô tả tiếng Việt với fallback=true (không để trống)", () => {
    const mod: Partial<ModuleDetail> = {
      code: "EAU4003",
      description: "Mô tả tiếng Việt của học phần.",
      description_en: null,
    };
    const desc = moduleDescription(mod as ModuleDetail, "en");
    expect(desc.text).toBe("Mô tả tiếng Việt của học phần.");
    expect(desc.fallback).toBe(true);
  });

  it("rơi về tiếng Anh khi ở chế độ VI nhưng học phần chỉ có bản tiếng Anh", () => {
    const desc = moduleDescription(modOnlyEn as ModuleDetail, "vi");
    expect(desc.text).toBe("English for specific purposes.");
    expect(desc.fallback).toBe(true);
  });

  it("trả về chuỗi rỗng khi không có mô tả nào", () => {
    const desc = moduleDescription({ code: "TEST" } as ModuleDetail, "en");
    expect(desc.text).toBeNull();
    expect(desc.fallback).toBe(false);
  });
});

describe("facultyName / departmentName", () => {
  it("'Khoa X' và 'X' cho cùng kết quả", () => {
    expect(facultyName("Khoa Kinh tế", "en")).toBe("Faculty of Economics");
    expect(facultyName("Kinh tế", "en")).toBe("Faculty of Economics");
    expect(facultyName("Khoa Tài chính – Ngân hàng", "en")).toBe("Faculty of Finance and Banking");
  });
  it("Luật khác Luật Kinh tế", () => {
    expect(facultyName("Khoa Luật", "en")).toBe("Faculty of Law");
    expect(facultyName("Luật Kinh tế", "en")).toBe("Faculty of Economic Law");
  });
  it("bộ môn và đơn vị không phải bộ môn", () => {
    expect(departmentName("Bộ môn Tài chính", "en")).toBe("Department of Finance");
    expect(departmentName("Phòng Đào tạo", "en")).toBe("Department of Academic Affairs");
    expect(facultyName("Phòng Bảo đảm chất lượng", "en")).toBe("Department of Quality Assurance");
  });

  it.each([
    ["Phòng Hành chính", "Department of Administration"],
    ["Phòng Nhân sự", "Department of Human Resources"],
    ["Phòng Bảo đảm chất lượng", "Department of Quality Assurance"],
    ["Phòng Tuyển sinh và Công tác sinh viên", "Department of Admissions and Student Affairs"],
    ["Phòng Đào tạo", "Department of Academic Affairs"],
    ["Phòng Khoa học và Công nghệ", "Department of Science and Technology"],
    ["Phòng Hợp tác phát triển", "Department of Cooperation and Development"],
    ["Phòng Quản trị tài sản", "Department of Asset Management"],
    ["Phòng Tài chính", "Department of Finance"],
    ["Phòng Công nghệ thông tin", "Department of Information Technology"],
    ["Phòng Truyền thông", "Department of Communication"],
    ["Phòng Pháp chế", "Department of Legal Affairs"],
    ["Khoa Kinh tế", "Faculty of Economics"],
    ["Khoa Kinh tế đối ngoại", "Faculty of International Economic Relations"],
    ["Khoa Tài chính - Ngân hàng", "Faculty of Finance and Banking"],
    ["Khoa Kế toán - Kiểm toán", "Faculty of Accounting and Auditing"],
    ["Khoa Hệ thống thông tin", "Faculty of Information Systems"],
    ["Khoa Quản trị kinh doanh", "Faculty of Business Administration"],
    ["Khoa Luật", "Faculty of Law"],
    ["Khoa Luật Kinh tế", "Faculty of Economic Law"],
    ["Khoa Toán kinh tế", "Faculty of Economic Mathematics"],
    ["Viện Quốc tế UEL", "The International Institute of UEL"],
    ["Thư viện", "Library"],
    ["Viện Nghiên cứu phát triển công nghệ ngân hàng ĐHQG-HCM", "Institute for Development and Research in Banking Technology VNUHCM"],
    ["Viện Pháp luật Quốc tế và so sánh", "Institute of International and Comparative Law"],
    ["Công ty TNHH MTV Kinh tế – Luật", "Economics and Law Co., Ltd"],
    ["Công đoàn", "Trade Union"],
    ["Đoàn Thanh niên - Hội Sinh viên", "Youth Union"],
  ])("dùng tên tiếng Anh chính thức UEL: %s", (vi, en) => {
    expect(facultyName(vi, "en")).toBe(en);
  });

  it.each([
    ["Academic Affairs Office", "Department of Academic Affairs"],
    ["Quality Assurance Office", "Department of Quality Assurance"],
    ["Faculty of Business Law", "Faculty of Economic Law"],
    ["Faculty of Mathematical Economics", "Faculty of Economic Mathematics"],
    ["UEL International Institute", "The International Institute of UEL"],
  ])("chuẩn hóa faculty_en cũ ở đầu vào: %s", (legacy, official) => {
    expect(facultyName({ faculty: "Đơn vị", faculty_en: legacy }, "en")).toBe(official);
    expect(facultyName(legacy, "en")).toBe(official);
  });
  it("giá trị lạ và giao diện VI giữ nguyên; rỗng trả chuỗi rỗng", () => {
    expect(facultyName("Khoa Chưa Biết", "en")).toBe("Khoa Chưa Biết");
    expect(departmentName("Bộ môn Tài chính", "vi")).toBe("Bộ môn Tài chính");
    expect(facultyName(null, "en")).toBe("");
  });

  it("dùng faculty_en nếu có trên đối tượng học phần", () => {
    const mod: Partial<ModuleSummary> = {
      code: "BIM5001",
      faculty: "Khoa Hệ thống thông tin",
      faculty_en: "Faculty of Information Systems (Custom)",
    };
    expect(facultyName(mod as ModuleSummary, "en")).toBe("Faculty of Information Systems (Custom)");
  });

  it("suy luận khoa từ tiền tố mã môn khi khoa bị thiếu hoặc 'Chưa rõ khoa'", () => {
    const modMissingFaculty: Partial<ModuleSummary> = {
      code: "IS2101",
      faculty: "Chưa rõ khoa",
    };
    expect(facultyName(modMissingFaculty as ModuleSummary, "vi")).toBe("Khoa Hệ thống thông tin");
    expect(facultyName(modMissingFaculty as ModuleSummary, "en")).toBe("Faculty of Information Systems");
  });

  it("suy luận khoa từ bộ môn khi khoa chưa xác định", () => {
    const modWithDept: Partial<ModuleSummary> = {
      code: "XXX9999",
      faculty: "",
      department: "Bộ môn Toán kinh tế",
    };
    expect(facultyName(modWithDept as ModuleSummary, "vi")).toBe("Khoa Toán kinh tế");
    expect(facultyName(modWithDept as ModuleSummary, "en")).toBe("Faculty of Economic Mathematics");
  });
});

describe("Brief W28: Chuẩn hóa nhãn học kỳ trong Kế hoạch (formatPlannerTerm, formatPlannerTermStats)", () => {
  it("hàm nhãn học kỳ (HK01 + 2024-2025 -> 'Học kỳ 1 · 2024-2025'; EN: 'Semester 1 · 2024-2025')", () => {
    expect(formatPlannerTerm("HK01", "2024-2025")).toBe("Học kỳ 1 · 2024-2025");
    expect(formatPlannerTerm("HK01", "2024-2025", "vi")).toBe("Học kỳ 1 · 2024-2025");
    expect(formatPlannerTerm("HK01", "2024-2025", "en")).toBe("Semester 1 · 2024-2025");
    expect(plannerSemesterLabel("HK01", "2024-2025", "en")).toBe("Semester 1 · 2024-2025");
  });

  it("trích xuất số kỳ từ mã (HK01 -> 1, HK02 -> 2, HK03 -> 3)", () => {
    expect(formatPlannerTerm("HK01", "2024-2025")).toBe("Học kỳ 1 · 2024-2025");
    expect(formatPlannerTerm("HK02", "2024-2025")).toBe("Học kỳ 2 · 2024-2025");
    expect(formatPlannerTerm("HK03", "2024-2025")).toBe("Học kỳ 3 · 2024-2025");
    expect(formatPlannerTerm("HK02", "2024-2025", "en")).toBe("Semester 2 · 2024-2025");
    expect(formatPlannerTerm("HK03", "2024-2025", "en")).toBe("Semester 3 · 2024-2025");
  });

  it("loại bỏ hoàn toàn chuỗi tiền tố lặp 'HKHK'", () => {
    expect(formatPlannerTerm("HKHK01", "2024-2025")).toBe("Học kỳ 1 · 2024-2025");
    expect(formatPlannerTerm("HKHK01 năm học 2024-2025")).toBe("Học kỳ 1 · 2024-2025");
    expect(formatPlannerTerm("HKHK01 năm học 2024-2025", "en")).toBe("Semester 1 · 2024-2025");
    expect(formatPlannerTerm("HKHK02 năm học 2024-2025")).toBe("Học kỳ 2 · 2024-2025");
    expect(formatPlannerTerm("HKHK01 năm học 2024-2025")).not.toContain("HKHK");
  });

  it("hỗ trợ nhận đối tượng Semester hoặc chuỗi định danh", () => {
    expect(formatPlannerTerm({ term: "HK01", year: "2024-2025" })).toBe("Học kỳ 1 · 2024-2025");
    expect(formatPlannerTerm({ term: "HK01", year: "2024-2025" }, "en")).toBe("Semester 1 · 2024-2025");
    expect(formatPlannerTerm({ name: "HK01 năm học 2024-2025" })).toBe("Học kỳ 1 · 2024-2025");
    expect(formatPlannerTerm({ id: "2024-2025-1" })).toBe("Học kỳ 1 · 2024-2025");
    expect(formatPlannerTerm({ id: "2024-2025-1" }, "en")).toBe("Semester 1 · 2024-2025");
  });

  it.each([
    "năm 4 kỳ 3",
    "Năm 4 - HK3",
    "HK3 năm 4",
    "nam 4 hoc ky 3",
    "N4 HK3",
    "N4HK3",
    "năm thứ 4 học kỳ thứ 3",
    "4/3",
  ])("giữ đủ năm và học kỳ khi nhập linh hoạt: %s", (input) => {
    expect(formatPlannerTerm(input)).toBe("Năm 4 · Học kỳ 3");
    expect(formatPlannerTerm(input, "en")).toBe("Year 4 · Semester 3");
  });

  it.each(["Year 4 Term 3", "Semester 3 Year 4", "Y4 Sem3"])(
    "chuẩn hóa cách nhập tiếng Anh: %s",
    (input) => {
      expect(formatPlannerTerm(input)).toBe("Năm 4 · Học kỳ 3");
      expect(formatPlannerTerm(input, "en")).toBe("Year 4 · Semester 3");
    },
  );

  it("phân biệt năm học thứ tự với niên khóa", () => {
    expect(formatPlannerTerm("HK3", "4")).toBe("Năm 4 · Học kỳ 3");
    expect(formatPlannerTerm({ term: 3, year: 4 }, "en")).toBe("Year 4 · Semester 3");
    expect(formatPlannerTerm("HK3 năm 4, năm học 2026-2027")).toBe("Năm 4 · Học kỳ 3 · 2026-2027");
    expect(formatPlannerTerm("HK3 năm học 2026-2027")).toBe("Học kỳ 3 · 2026-2027");
  });

  it("formatPlannerTermStats: định dạng số môn và số tín chỉ", () => {
    expect(formatPlannerTermStats(5, 14, "vi")).toBe("5 môn · 14 TC");
    expect(formatPlannerTermStats(5, 14, "en")).toBe("5 courses · 14 credits");
    expect(formatPlannerTermStats(1, 1, "en")).toBe("1 course · 1 credit");
    expect(formatPlannerTermStats(0, 0, "vi")).toBe("0 môn · 0 TC");
  });
});
