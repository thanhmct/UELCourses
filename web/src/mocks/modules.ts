// DỮ LIỆU MẪU — chỉ dùng để demo khi API chưa chạy. Không phải dữ liệu thật của UEL.
// Định dạng mô phỏng dữ liệu thật: mã môn "EIE3004" / "MI71", mã lớp "251EIE300401"
// (251 = năm học 2025, học kỳ 1; tiếp theo là mã môn và số thứ tự lớp).
import type { ClassSection, EquivalentItem, ModuleDetail, Semester } from "@/lib/types";
import { periodEndTime, periodStartTime } from "@/lib/periods";

export const mockSemesters: Semester[] = [
  { id: "251", name: "Học kỳ 1 năm học 2025–2026", year: 2025, term: 1, is_current: false },
  { id: "252", name: "Học kỳ 2 năm học 2025–2026", year: 2025, term: 2, is_current: false },
  { id: "261", name: "Học kỳ 1 năm học 2026–2027", year: 2026, term: 1, is_current: true },
];

type M = Omit<ModuleDetail, "has_equivalents" | "semesters"> & { semesters?: string[] };

const plan = (terms: number[], pct = 100) => [
  { academic_year: "2026-2027", terms, open_pct: pct },
];

const base: M[] = [
  { code: "KTE1001", name: "Kinh tế vi mô", credits: 3, type: "Bắt buộc", faculty: "Kinh tế", description: "Hành vi người tiêu dùng, doanh nghiệp và thị trường.", prerequisites: [], equivalents: [{ code: "KTE1001E", name: "Microeconomics", credits: 3 }], offering_plan: plan([1, 2]) },
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

export const mockModules: ModuleDetail[] = base.map((m) => ({
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

// [weekday, start, end] — morning 1–3 / 4–6, afternoon 7–9 / 10–12, evening 13–15
const slots: [number, number, number][] = [
  [2, 1, 3], [2, 4, 6], [2, 7, 9], [3, 1, 3], [3, 7, 9], [3, 10, 12], [4, 1, 3], [4, 4, 6],
  [4, 7, 9], [5, 1, 3], [5, 7, 9], [5, 13, 15], [6, 1, 3], [6, 4, 6], [6, 7, 9], [7, 1, 3], [7, 7, 9],
];

function buildSections(semesterId: string): ClassSection[] {
  const out: ClassSection[] = [];
  const yy = Number(semesterId.slice(0, 2));
  const term = Number(semesterId.slice(2));
  const year = 2000 + yy;
  const start = term === 1 ? `${year}-09-07` : `${year + 1}-02-08`;
  const end = term === 1 ? `${year}-12-27` : `${year + 1}-05-30`;
  mockModules.forEach((m, mi) => {
    const count = 2 + ((mi + term) % 2);
    for (let k = 0; k < count; k++) {
      const s1 = slots[(mi * 3 + k * 5 + term) % slots.length];
      const lessons = [L(s1[0], s1[1], s1[2], rooms[(mi + k) % rooms.length])];
      if (m.credits >= 3 && k % 2 === 0) {
        const s2 = slots[(mi * 3 + k * 5 + term + 8) % slots.length];
        if (s2[0] !== s1[0]) lessons.push(L(s2[0], s2[1], s2[1] + 1, rooms[(mi + k + 3) % rooms.length], "4-12"));
      }
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
        rooms: [...new Set(lessons.map((l) => l.room))],
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
  const id = mockSemesters.some((s) => s.id === semesterId) ? semesterId : mockSemesters[mockSemesters.length - 1].id;
  if (!sectionCache.has(id)) sectionCache.set(id, buildSections(id));
  return sectionCache.get(id)!;
}

export const mockEquivalents: EquivalentItem[] = mockModules
  .filter((m) => m.equivalents.length)
  .map((m) => ({ code: m.code, name: m.name, credits: m.credits, equivalents: m.equivalents }));
