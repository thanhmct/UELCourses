// DỮ LIỆU ĐỒNG BỘ: Kết hợp dữ liệu chuẩn từ CTĐT (programs_catalog.json),
// danh sách lớp học phần UIS thực tế (courses.json) và các môn mẫu.
import type { ClassSection, EquivalentItem, ModuleDetail, Semester } from "@/lib/types";
import { periodEndTime, periodStartTime } from "@/lib/periods";
import catalog from "@/data/programs_catalog.json";
import rawCourses from "@/data/courses.json";
import plannedCourses from "@/data/courses_2026_2027_planned.json";
import { parseSchedules } from "@/lib/schedule";

export const mockSemesters: Semester[] = [
  {
    id: "2026-2027-1",
    name: "Học kỳ 1 năm học 2026–2027",
    year: "2026-2027",
    term: 1,
    is_current: true,
    start_date: "2026-09-07",
    end_date: "2026-11-15",
    teaching_start: "2026-09-07",
    teaching_end: "2026-11-15",
  },
  {
    id: "2026-2027-2",
    name: "Học kỳ 2 năm học 2026–2027",
    year: "2026-2027",
    term: 2,
    is_current: false,
    start_date: "2026-12-14",
    end_date: "2027-03-27",
    teaching_start: "2026-12-14",
    teaching_end: "2027-03-27",
  },
  {
    id: "2026-2027-3",
    name: "Học kỳ 3 năm học 2026–2027",
    year: "2026-2027",
    term: 3,
    is_current: false,
    start_date: "2027-04-12",
    end_date: "2027-07-10",
    teaching_start: "2027-04-12",
    teaching_end: "2027-07-10",
  },
  { id: "251", name: "Học kỳ 1 năm học 2025–2026", year: "2025-2026", term: 1, is_current: false },
  { id: "252", name: "Học kỳ 2 năm học 2025–2026", year: "2025-2026", term: 2, is_current: false },
  { id: "261", name: "Học kỳ 1 năm học 2026–2027 (Mẫu)", year: "2026-2027", term: 1, is_current: false },
];

type M = Omit<ModuleDetail, "has_equivalents" | "semesters"> & { semesters?: string[] };

const plan = (terms: number[], pct = 100) => [
  { academic_year: "2025-2026", terms, open_pct: pct },
  { academic_year: "2026-2027", terms, open_pct: pct },
];

const base: M[] = [
  {
    code: "BKB4060",
    name: "Luật sở hữu trí tuệ",
    name_en: "Intellectual Property Law",
    credits: 3,
    type: "Bắt buộc",
    faculty: "Luật",
    description: "Pháp luật về quyền tác giả, quyền sở hữu công nghiệp và quyền đối với giống cây trồng.",
    prerequisites: ["LUA1001"],
    equivalents: [],
    offering_plan: plan([1, 2]),
    has_outline: true,
    outline_url: "https://drive.google.com/file/d/1DUmavTFNn-Hh3VC2TDY2pDo18VKnaPMF/view?usp=sharing",
    outline_url_en: "https://drive.google.com/file/d/1aJ0fWojSP3_np7ZgAouLXMJnvm6unRPR/view?usp=sharing",
    outline_links: [
      { kind: "Link đề cương hiện tại (chuẩn)", url: "https://drive.google.com/file/d/1DUmavTFNn-Hh3VC2TDY2pDo18VKnaPMF/view?usp=sharing" },
      { kind: "Link đề cương hiện tại (E)", url: "https://drive.google.com/file/d/1aJ0fWojSP3_np7ZgAouLXMJnvm6unRPR/view?usp=sharing" },
    ],
  },
  {
    code: "KTE1001",
    name: "Kinh tế vi mô",
    credits: 3,
    type: "Bắt buộc",
    faculty: "Kinh tế",
    description: "Hành vi người tiêu dùng, doanh nghiệp và thị trường.",
    prerequisites: [],
    equivalents: [{ code: "KTE1001E", name: "Microeconomics", credits: 3 }],
    offering_plan: plan([1, 2]),
    outline_url: "https://drive.google.com/file/d/kte1001-vi/view",
    outline_url_en: "https://drive.google.com/file/d/kte1001-en/view",
    outline_links: [
      { kind: "Link đề cương hiện tại (chuẩn)", url: "https://drive.google.com/file/d/kte1001-vi/view" },
      { kind: "Link đề cương hiện tại (E)", url: "https://drive.google.com/file/d/kte1001-en/view" },
    ],
  },
  { code: "KTE1001E", name: "Microeconomics", credits: 3, type: "Bắt buộc", faculty: "Kinh tế", is_english: true, description: "Microeconomics taught in English.", prerequisites: [], equivalents: [{ code: "KTE1001", name: "Kinh tế vi mô", credits: 3 }], offering_plan: plan([1]) },
  { code: "KTE1002", name: "Kinh tế vĩ mô", credits: 3, type: "Bắt buộc", faculty: "Kinh tế", description: "Tổng cầu, tăng trưởng, lạm phát, thất nghiệp.", prerequisites: ["KTE1001"], equivalents: [], offering_plan: plan([2, 3]) },
  { code: "TOA1001", name: "Toán cao cấp", credits: 3, type: "Bắt buộc", faculty: "Toán kinh tế", description: "Giải tích và đại số tuyến tính cho kinh tế.", prerequisites: [], equivalents: [], offering_plan: plan([1]) },
  { code: "TKE2001", name: "Lý thuyết xác suất và thống kê", credits: 3, type: "Bắt buộc", faculty: "Toán kinh tế", description: "Biến ngẫu nhiên, ước lượng, kiểm định.", prerequisites: ["TOA1001"], equivalents: [{ code: "TKE2001E", name: "Probability and Statistics", credits: 3 }], offering_plan: plan([2]) },
  { code: "KTL3001", name: "Kinh tế lượng", credits: 3, type: "Bắt buộc", faculty: "Toán kinh tế", description: "Hồi quy tuyến tính và ứng dụng.", prerequisites: ["TKE2001", "KTE1001"], equivalents: [], offering_plan: plan([1, 3], 80) },
  { code: "LUA1001", name: "Pháp luật đại cương", credits: 2, type: "Bắt buộc", faculty: "Luật", description: "Kiến thức cơ bản về nhà nước và pháp luật.", prerequisites: [], equivalents: [{ code: "LUA1000", name: "Lý luận nhà nước và pháp luật", credits: 3 }], offering_plan: plan([1, 2, 3]) },
  { code: "LDS2001", name: "Luật dân sự", credits: 3, type: "Tự chọn", faculty: "Luật", description: "Tài sản, quyền sở hữu, nghĩa vụ và hợp đồng.", prerequisites: ["LUA1001"], equivalents: [], offering_plan: plan([2]) },
  { code: "KET2001", name: "Nguyên lý kế toán", credits: 3, type: "Bắt buộc", faculty: "Kế toán – Kiểm toán", description: "Phương trình kế toán, tài khoản, báo cáo tài chính.", prerequisites: [], equivalents: [{ code: "KET2001E", name: "Principles of Accounting", credits: 3 }], offering_plan: plan([1, 2]) },
  { code: "TCH3001", name: "Tài chính doanh nghiệp", credits: 3, type: "Bắt buộc", faculty: "Tài chính – Ngân hàng", description: "Giá trị thời gian của tiền, cơ cấu vốn.", prerequisites: ["KET2001"], equivalents: [], offering_plan: plan([1]) },
  { code: "MKT2001", name: "Marketing căn bản", credits: 3, type: "Tự chọn", faculty: "Quản trị kinh doanh", description: "Thị trường mục tiêu, 4P, hành vi khách hàng.", prerequisites: [], equivalents: [{ code: "MKT2001E", name: "Principles of Marketing", credits: 3 }], offering_plan: plan([1, 3]) },
  { code: "EIE3004", name: "International Business", credits: 3, type: "Tự chọn", faculty: "Kinh tế đối ngoại", is_english: true, description: "Global trade, FDI and multinational strategy (taught in English).", prerequisites: ["KTE1002"], equivalents: [], offering_plan: plan([1, 3], 60) },
  { code: "HTT1001", name: "Tin học ứng dụng", credits: 3, type: "Bắt buộc", faculty: "Hệ thống thông tin", description: "Bảng tính, cơ sở dữ liệu cơ bản.", prerequisites: [], equivalents: [], offering_plan: plan([1, 2, 3]) },
  { code: "ENG2001", name: "Tiếng Anh tổng quát 1", credits: 3, type: "Bắt buộc", faculty: "Ngoại ngữ", is_english: true, description: "Kỹ năng nghe nói đọc viết trình độ B1.", prerequisites: [], equivalents: [], offering_plan: plan([1, 2]) },
  { code: "TRI1001", name: "Triết học Mác – Lênin", credits: 3, type: "Bắt buộc", faculty: "Lý luận chính trị", description: "Chủ nghĩa duy vật biện chứng và lịch sử.", prerequisites: [], equivalents: [], offering_plan: plan([1, 2]) },
  { code: "MI71", name: "Giáo dục thể chất 1", credits: 1, type: "Điều kiện", faculty: "Giáo dục thể chất", description: "Học phần điều kiện, không tính vào điểm trung bình.", prerequisites: [], equivalents: [], offering_plan: plan([1, 2, 3]) },
];

interface RawCourseItem {
  CurriculumID?: string;
  ScheduleStudyUnitAlias?: string;
  ScheduleStudyUnitName?: string;
  Credits?: number;
  StudyUnitTypeName?: string;
  ProfessorName?: string;
  StudentQuotas?: number;
  BeginDate?: string;
  EndDate?: string;
  Schedules?: string;
  Faculty?: string;
  ClassStudent?: string;
  MinStudentQuotas?: number;
  RegisteredStudents?: number;
  AvailableSeats?: number;
  Rooms?: string;
}

// Trích xuất toàn bộ học phần từ catalog.details (86 CTĐT)
const realModulesMap = new Map<string, M>();
const details = (catalog as unknown as {
  details: Record<
    string,
    {
      program?: { faculty?: string };
      blocks?: Array<{
        modules?: Array<{
          code: string;
          name: string;
          credits: number;
          required: boolean;
          prereq?: string[];
          equivalents?: string[];
        }>;
      }>;
    }
  >;
}).details || {};

for (const det of Object.values(details)) {
  const fac = det.program?.faculty;
  for (const block of det.blocks || []) {
    for (const m of block.modules || []) {
      if (!m.code || realModulesMap.has(m.code)) continue;
      realModulesMap.set(m.code, {
        code: m.code,
        name: m.name || m.code,
        credits: m.credits || 0,
        type: m.required ? "Bắt buộc" : "Tự chọn",
        faculty: fac,
        prerequisites: m.prereq || [],
        equivalents: (m.equivalents || []).map((eq) => ({ code: eq, name: eq, credits: m.credits || 0 })),
        is_english: m.code.endsWith("E") || m.name.includes("(E)"),
        offering_plan: plan([1, 2]),
      });
    }
  }
}

// Bổ sung các môn từ danh sách lớp nếu chưa có trong catalog
const typedRawCourses = (rawCourses as RawCourseItem[]) || [];
for (const c of typedRawCourses) {
  if (c.CurriculumID && !realModulesMap.has(c.CurriculumID)) {
    realModulesMap.set(c.CurriculumID, {
      code: c.CurriculumID,
      name: c.ScheduleStudyUnitName || c.CurriculumID,
      credits: c.Credits || 0,
      type: c.StudyUnitTypeName || "Lý thuyết",
      faculty: c.Faculty || "Đào tạo",
      prerequisites: [],
      equivalents: [],
      is_english: c.CurriculumID.endsWith("E") || (c.ScheduleStudyUnitName || "").includes("(E)"),
      offering_plan: plan([1]),
    });
  }
}

const existingCodes = new Set(base.map((m) => m.code));
const allModulesList: M[] = [...base];
for (const [code, m] of realModulesMap.entries()) {
  if (!existingCodes.has(code)) {
    allModulesList.push(m);
  }
}

export const mockModules: ModuleDetail[] = allModulesList.map((m) => ({
  ...m,
  has_equivalents: m.equivalents.length > 0,
  semesters: m.semesters ?? mockSemesters.map((s) => s.id),
}));

function L(weekday: number, start: number, end: number, room: string, weeks?: string) {
  return {
    weekday,
    start_period: start,
    end_period: end,
    start_time: periodStartTime(start),
    end_time: periodEndTime(end),
    room,
    ...(weeks ? { weeks } : {}),
  };
}

const lecturers = ["TS. Nguyễn Văn A", "ThS. Trần Thị B", "TS. Lê Văn C", "PGS.TS. Phạm Thị D", "ThS. Võ Văn E"];
const rooms = ["A.101", "A.205", "B.203", "B.302", "C.105", "C.401", "D.201"];

const slots: [number, number, number][] = [
  [2, 1, 3], [2, 4, 6], [2, 7, 9], [3, 1, 3], [3, 7, 9], [3, 10, 12], [4, 1, 3], [4, 4, 6],
  [4, 7, 9], [5, 1, 3], [5, 7, 9], [5, 13, 15], [6, 1, 3], [6, 4, 6], [6, 7, 9], [7, 1, 3], [7, 7, 9],
];

// Tạo các lớp học phần thực tế từ courses.json
const realSections: ClassSection[] = typedRawCourses.map((c) => {
  const code = c.CurriculumID || "";
  const alias = c.ScheduleStudyUnitAlias || "";
  const rawSchedules = c.Schedules || "";
  const parsed = parseSchedules(rawSchedules);
  return {
    class_code: alias,
    module_code: code,
    lecturer: c.ProfessorName || undefined,
    quota: c.StudentQuotas,
    quota_min: c.MinStudentQuotas,
    quota_max: c.StudentQuotas,
    registered: c.RegisteredStudents,
    available: c.AvailableSeats,
    student_groups: c.ClassStudent ? c.ClassStudent.split(",").map((s) => s.trim()) : undefined,
    rooms: c.Rooms ? [c.Rooms] : undefined,
    start_date: c.BeginDate ? c.BeginDate.split("T")[0] : undefined,
    end_date: c.EndDate ? c.EndDate.split("T")[0] : undefined,
    lessons: parsed,
  };
});

interface PlannedCourseItem {
  CurriculumID?: string;
  ScheduleStudyUnitAlias?: string;
  ScheduleStudyUnitName?: string;
  Credits?: number;
  SemesterID?: string;
  Term?: number;
  StudentGroups?: string;
  Cohorts?: string[];
}

const typedPlanned = (plannedCourses as PlannedCourseItem[]) || [];

function buildSections(semesterId: string): ClassSection[] {
  if (semesterId.startsWith("2026-2027")) {
    const plannedForSem = typedPlanned.filter((p) => p.SemesterID === semesterId);
    if (plannedForSem.length > 0) {
      return plannedForSem.map((p) => ({
        class_code: p.ScheduleStudyUnitAlias || "",
        module_code: p.CurriculumID || "",
        student_groups: p.StudentGroups ? p.StudentGroups.split(",").map((s) => s.trim()) : undefined,
        lessons: [],
      }));
    }
  }
  const out: ClassSection[] = [...realSections];
  const yy = Number(semesterId.slice(0, 2)) || 25;
  const term = Number(semesterId.slice(2)) || 1;
  const year = 2000 + yy;
  const start = term === 1 ? `${year}-09-07` : `${year + 1}-02-08`;
  const end = term === 1 ? `${year}-12-27` : `${year + 1}-05-30`;

  // Chỉ bổ sung lớp tự sinh cho các môn base nếu chưa có trong realSections
  const coveredCodes = new Set(realSections.map((s) => s.module_code));
  base.forEach((m, mi) => {
    if (coveredCodes.has(m.code)) return;
    const count = 2;
    for (let k = 0; k < count; k++) {
      const s1 = slots[(mi * 3 + k * 5 + term) % slots.length];
      const lessons = [L(s1[0], s1[1], s1[2], rooms[(mi + k) % rooms.length])];
      const quotaMax = 60 + ((mi * 7 + k * 13) % 4) * 20;
      const registered = Math.min(quotaMax, (mi * 17 + k * 29 + term * 11) % (quotaMax + 10));
      out.push({
        class_code: `${semesterId}${m.code}${String(k + 1).padStart(2, "0")}`,
        module_code: m.code,
        lecturer: lecturers[(mi + k) % lecturers.length],
        quota: quotaMax,
        quota_min: 30,
        quota_max: quotaMax,
        registered,
        available: quotaMax - registered,
        student_groups: [`K${yy - 1}40${(mi + k) % 9 + 1}${m.is_english ? "E" : ""}`],
        rooms: [...new Set(lessons.map((l) => l.room).filter((r): r is string => Boolean(r)))],
        start_date: start,
        end_date: end,
        lessons,
      });
    }
  });
  return out;
}

const sectionCache = new Map<string, ClassSection[]>();
export function mockSections(semesterId: string): ClassSection[] {
  const id = mockSemesters.some((s) => s.id === semesterId) ? semesterId : mockSemesters[0].id;
  if (!sectionCache.has(id)) sectionCache.set(id, buildSections(id));
  return sectionCache.get(id)!;
}

export const mockEquivalents: EquivalentItem[] = mockModules
  .filter((m) => m.equivalents.length)
  .map((m) => ({ code: m.code, name: m.name, credits: m.credits, equivalents: m.equivalents }));
