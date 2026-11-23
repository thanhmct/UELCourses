import type {
  ActivityDailyItem,
  AdminAcademicEvent,
  AdminOverview,
  AdminSettingsData,
  AdminSystemInfo,
  AdminUser,
  AdminUserItem,
  AuditLogItem,
  BannedTerm,
  CalendarEventsResponse,
  FacultiesResponse,
  FacultyReviewResponse,
  ModerationQueueItem,
  ModuleComment,
  OutlineCoverageResponse,
  OutlineDriveLinkResponse,
  OutlineMissingResponse,
  OutlineOcrPendingResponse,
  SemesterAdminItem,
  TableStat,
  TrendClassItem,
  TrendConflictData,
  TrendModuleItem,
  TrendPairItem,
  TrendSearchItem,
  TrendSlotItem,
} from "@/lib/types";

export const mockAdminUser: AdminUser = {
  id: 1,
  email: "admin@uel.edu.vn",
  role: "admin",
  actor_type: "admin",
};

export const mockModeratorUser: AdminUser = {
  id: 2,
  email: "moderator@uel.edu.vn",
  role: "moderator",
  actor_type: "admin",
};

export const mockDataEditorUser: AdminUser = {
  id: 3,
  email: "editor@uel.edu.vn",
  role: "data_editor",
  actor_type: "admin",
};

export const mockActivity30d: ActivityDailyItem[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (29 - i));
  return {
    date: d.toISOString().split("T")[0],
    count: 120 + Math.floor(Math.sin(i / 3) * 60) + (i % 5) * 15,
  };
});

export const mockAdminOverview: AdminOverview = {
  active_anon_7d: 1240,
  active_anon_30d: 4890,
  timetable_adds_7d: 3520,
  planner_adds_7d: 1840,
  activity_30d: mockActivity30d,
  moderation_pending: 6,
  data_review_pending: 13,
  errors_24h: 0,
  last_import_at: "2026-11-21T18:30:00Z",
};

export const mockTrendModules: TrendModuleItem[] = [
  {
    module_code: "BIM5001",
    module_name: "Cơ sở dữ liệu",
    module_name_en: "Database Systems",
    timetable_adds: 480,
    planner_adds: 230,
    views: 1250,
    total_raw: 1960,
    trend_dir: "up",
    trend_pct: 18.5,
    anonymized: false,
  },
  {
    module_code: "TOA1001",
    module_name: "Toán cao cấp 1",
    module_name_en: "Advanced Mathematics 1",
    timetable_adds: 420,
    planner_adds: 190,
    views: 980,
    total_raw: 1590,
    trend_dir: "down",
    trend_pct: 5.2,
    anonymized: false,
  },
  {
    module_code: "KTE2001",
    module_name: "Kinh tế vi mô",
    module_name_en: "Microeconomics",
    timetable_adds: 390,
    planner_adds: 210,
    views: 920,
    total_raw: 1520,
    trend_dir: "up",
    trend_pct: 12.0,
    anonymized: false,
  },
  {
    module_code: "KTO2001",
    module_name: "Nguyên lý kế toán",
    module_name_en: "Principles of Accounting",
    timetable_adds: 350,
    planner_adds: 160,
    views: 840,
    total_raw: 1350,
    trend_dir: "same",
    trend_pct: 0.0,
    anonymized: false,
  },
  {
    module_code: "LAW1001",
    module_name: "Pháp luật đại cương",
    module_name_en: "General Law",
    timetable_adds: 310,
    planner_adds: 140,
    views: 790,
    total_raw: 1240,
    trend_dir: "up",
    trend_pct: 8.4,
    anonymized: false,
  },
  {
    module_code: "SPE9999",
    module_name: "Chuyên đề nâng cao hiếm",
    module_name_en: "Special Topic Rare",
    timetable_adds: "<5",
    planner_adds: "<5",
    views: "<5",
    total_raw: 8,
    trend_dir: "up",
    trend_pct: 100.0,
    anonymized: true,
  },
];

export const mockTrendPairs: TrendPairItem[] = [
  {
    semester_id: "2026-2027-1",
    module_a: "BIM5001",
    module_a_name: "Cơ sở dữ liệu",
    module_b: "BIM5002",
    module_b_name: "Lập trình hướng đối tượng",
    count: 320,
    count_raw: 320,
  },
  {
    semester_id: "2026-2027-1",
    module_a: "KTE2001",
    module_a_name: "Kinh tế vi mô",
    module_b: "TOA1001",
    module_b_name: "Toán cao cấp 1",
    count: 285,
    count_raw: 285,
  },
  {
    semester_id: "2026-2027-1",
    module_a: "KTO2001",
    module_a_name: "Nguyên lý kế toán",
    module_b: "LAW1001",
    module_b_name: "Pháp luật đại cương",
    count: 240,
    count_raw: 240,
  },
  {
    semester_id: "2026-2027-1",
    module_a: "BIM5001",
    module_a_name: "Cơ sở dữ liệu",
    module_b: "TOA1002",
    module_b_name: "Toán cao cấp 2",
    count: 190,
    count_raw: 190,
  },
  {
    semester_id: "2026-2027-1",
    module_a: "FIN3001",
    module_a_name: "Tài chính tiền tệ",
    module_b: "SPE9999",
    module_b_name: "Chuyên đề hiếm",
    count: "<5",
    count_raw: 3,
  },
];

// Bản đồ nhiệt 7 ngày (Thứ 2..Chủ nhật) × 16 tiết = 112 ô
export const mockTrendSlots: TrendSlotItem[] = [];
for (let wd = 2; wd <= 8; wd++) {
  for (let p = 1; p <= 16; p++) {
    // Sáng (tiết 1-5) và Chiều (tiết 7-11) các ngày Thứ 2-Thứ 6 đông nhất
    let count = 0;
    if (wd <= 6) {
      if ((p >= 1 && p <= 5) || (p >= 7 && p <= 10)) {
        count = 150 + Math.floor(Math.sin((wd * p) / 2) * 80) + (wd % 3) * 20;
      } else if (p === 6 || p === 11 || p === 12) {
        count = 30 + (p % 4) * 10;
      } else if (p >= 13) {
        count = p % 2 === 0 ? 15 : 0;
      }
    } else if (wd === 7) {
      count = p <= 5 ? 40 : 10;
    } else {
      count = p === 2 ? 3 : 0; // Chủ nhật < 5
    }

    const isAnon = count > 0 && count < 5;
    mockTrendSlots.push({
      weekday: wd,
      period: p,
      count: isAnon ? "<5" : count,
      count_raw: count,
      anonymized: isAnon,
    });
  }
}

export const mockTrendConflicts: TrendConflictData = {
  total_schedules: 850,
  conflicted_schedules: 42,
  conflict_rate_pct: 4.9,
  anonymized: false,
};

export const mockTrendSearches: TrendSearchItem[] = [
  { query: "machine learning", count: 85, count_raw: 85, anonymized: false },
  { query: "khoa học dữ liệu", count: 64, count_raw: 64, anonymized: false },
  { query: "blockchain", count: 42, count_raw: 42, anonymized: false },
  { query: "phân tích tài chính", count: 38, count_raw: 38, anonymized: false },
  { query: "deep learning", count: "<5", count_raw: 3, anonymized: true },
];

export const mockTrendClasses: TrendClassItem[] = [
  { class_code: "BIM5001_01", count: 95, count_raw: 95, anonymized: false },
  { class_code: "BIM5001_02", count: 88, count_raw: 88, anonymized: false },
  { class_code: "BIM5001_03", count: 72, count_raw: 72, anonymized: false },
  { class_code: "BIM5001_04", count: "<5", count_raw: 4, anonymized: true },
];

// ---------- Moderation Mocks (Brief A3) ----------
export const mockModerationQueue: ModerationQueueItem[] = [
  {
    id: "comment_1",
    item_id: 1,
    type: "comment",
    module_code: "BIM5001",
    title: "Bình luận môn BIM5001",
    content: "Môn này học khá hay, bài tập nhóm vừa sức, thầy cô hướng dẫn tận tình.",
    rating: 5,
    author: "Sinh viên ẩn danh",
    status: "pending",
    flag_reasons: [],
    created_at: "2026-11-22T10:30:00Z",
  },
  {
    id: "comment_2",
    item_id: 2,
    type: "comment",
    module_code: "TOA1001",
    title: "Bình luận môn TOA1001",
    content: "Đề thi khó quá, cần tham khảo tài liệu tại https://example-tailieu.com",
    rating: 3,
    author: "Sinh viên ẩn danh",
    status: "pending",
    flag_reasons: ["link"],
    created_at: "2026-11-22T09:15:00Z",
  },
  {
    id: "feedback_1",
    item_id: 1,
    type: "feedback",
    page: "/timetable",
    category: "Giao diện",
    title: "Góp ý: Giao diện (/timetable)",
    content: "Giao diện thời khóa biểu mới rất mượt và dễ xem, cảm ơn team phát triển!",
    rating: 5,
    author: "sv22@st.uel.edu.vn",
    status: "pending",
    flag_reasons: [],
    created_at: "2026-11-22T08:45:00Z",
  },
  {
    id: "feedback_2",
    item_id: 2,
    type: "feedback",
    page: "/planner",
    category: "Lỗi dữ liệu",
    title: "Góp ý: Lỗi dữ liệu (/planner)",
    content: "Liên hệ 0901234567 để mình gửi ảnh chụp lỗi xếp môn nhé",
    rating: 2,
    author: "Sinh viên ẩn danh",
    status: "pending",
    flag_reasons: ["contact_info"],
    created_at: "2026-11-21T18:20:00Z",
  },
  {
    id: "comment_3",
    item_id: 3,
    type: "comment",
    module_code: "ECO2001",
    title: "Bình luận môn ECO2001",
    content: "Giảng viên nhiệt tình, slide rõ ràng.",
    rating: 4,
    author: "Sinh viên ẩn danh",
    status: "approved",
    flag_reasons: [],
    created_at: "2026-11-21T14:10:00Z",
  },
];

export const mockBannedTerms: BannedTerm[] = [
  { id: 1, term: "blockword", severity: "block", created_at: "2026-11-20T08:00:00Z" },
  { id: 2, term: "tucam_block", severity: "block", created_at: "2026-11-20T08:00:00Z" },
  { id: 3, term: "flagword", severity: "flag", created_at: "2026-11-20T08:00:00Z" },
  { id: 4, term: "tucam_flag", severity: "flag", created_at: "2026-11-20T08:00:00Z" },
  { id: 5, term: "vay tien", severity: "flag", created_at: "2026-11-21T09:30:00Z" },
];

export const mockModuleComments: Record<string, ModuleComment[]> = {
  BIM5001: [
    {
      id: 101,
      module_code: "BIM5001",
      body: "Môn học cơ sở rất quan trọng, thầy giảng rất kỹ phần SQL và chuẩn hóa dữ liệu.",
      rating: 5,
      author_name: "Sinh viên ẩn danh",
      status: "approved",
      created_at: "2026-11-21T15:00:00Z",
    },
    {
      id: 102,
      module_code: "BIM5001",
      body: "Nên làm bài tập lớn từ sớm để không bị dồn hạn cuối kỳ.",
      rating: 4,
      author_name: "Sinh viên ẩn danh",
      status: "approved",
      created_at: "2026-11-20T11:20:00Z",
    },
  ],
};

// =============================================================================
// Mock Data Admin & Outlines (Brief A4)
// =============================================================================
export const mockFaculties: FacultiesResponse = {
  canonical_faculties: [
    "Khoa Quản trị kinh doanh",
    "Khoa Tài chính - Ngân hàng",
    "Khoa Kế toán - Kiểm toán",
    "Khoa Hệ thống thông tin",
    "Khoa Kinh tế",
    "Khoa Kinh tế đối ngoại",
    "Khoa Toán kinh tế",
    "Khoa Luật",
    "Khoa Luật Kinh tế",
    "Phòng Đào tạo",
  ],
  faculties: [
    {
      name: "Khoa Quản trị kinh doanh",
      departments: ["Bộ môn Quản trị", "Bộ môn Marketing", "Bộ môn Quản lý công"],
    },
    {
      name: "Khoa Tài chính - Ngân hàng",
      departments: ["Bộ môn Tài chính", "Bộ môn Ngân hàng"],
    },
    {
      name: "Khoa Kế toán - Kiểm toán",
      departments: ["Bộ môn Kế toán", "Bộ môn Kiểm toán"],
    },
    {
      name: "Khoa Hệ thống thông tin",
      departments: [
        "Bộ môn Hệ thống thông tin quản lý",
        "Bộ môn Thương mại điện tử",
        "Bộ môn Phân tích dữ liệu",
      ],
    },
    {
      name: "Khoa Kinh tế",
      departments: ["Bộ môn Kinh tế học", "Bộ môn Kinh tế và Quản lý công"],
    },
    {
      name: "Khoa Kinh tế đối ngoại",
      departments: ["Bộ môn Kinh doanh quốc tế", "Bộ môn Kinh tế quốc tế"],
    },
    {
      name: "Khoa Toán kinh tế",
      departments: ["Bộ môn Toán kinh tế"],
    },
    {
      name: "Khoa Luật",
      departments: ["Bộ môn Luật Dân sự", "Bộ môn Luật Hành chính - Nhà nước"],
    },
    {
      name: "Khoa Luật Kinh tế",
      departments: [
        "Bộ môn Luật Kinh doanh",
        "Bộ môn Luật Tài chính - Ngân hàng",
        "Bộ môn Luật Thương mại quốc tế",
      ],
    },
    {
      name: "Phòng Đào tạo",
      departments: ["Bộ môn Ngoại ngữ"],
    },
  ],
  all_departments: [
    "Bộ môn Dân sự",
    "Bộ môn Hệ thống thông tin quản lý",
    "Bộ môn Kế toán",
    "Bộ môn Kiểm toán",
    "Bộ môn Kinh doanh quốc tế",
    "Bộ môn Kinh tế học",
    "Bộ môn Kinh tế quốc tế",
    "Bộ môn Kinh tế và Quản lý công",
    "Bộ môn Luật Dân sự",
    "Bộ môn Luật Hành chính - Nhà nước",
    "Bộ môn Luật Kinh doanh",
    "Bộ môn Luật Tài chính - Ngân hàng",
    "Bộ môn Luật Thương mại quốc tế",
    "Bộ môn Marketing",
    "Bộ môn Ngân hàng",
    "Bộ môn Ngoại ngữ",
    "Bộ môn Phân tích dữ liệu",
    "Bộ môn Quản lý công",
    "Bộ môn Quản trị",
    "Bộ môn Tài chính",
    "Bộ môn Thương mại điện tử",
    "Bộ môn Toán kinh tế",
  ],
};

export const mockFacultyReview: FacultyReviewResponse = {
  items: [
    {
      code: "BIM5001",
      name: "Cơ sở dữ liệu",
      credits: 3,
      faculty: "Phòng Đào tạo",
      department: null,
      faculty_source: null,
      suggestion: {
        faculty: "Khoa Hệ thống thông tin",
        source: "outline",
        confidence: "Đề cương",
      },
      reason: "cần duyệt: tên ghép khoa/bộ môn",
      open_classes_count: 8,
      program_count: 5,
    },
    {
      code: "KTE2001",
      name: "Kinh tế vi mô",
      credits: 3,
      faculty: "Khoa Kinh tế đối ngoại",
      department: "Bộ môn Kinh tế học",
      faculty_source: null,
      suggestion: {
        faculty: "Khoa Kinh tế",
        source: "prefix",
        confidence: "100.0%",
      },
      reason: "mâu thuẫn tiền tố: Khoa Kinh tế đối ngoại vs Khoa Kinh tế (EE)",
      open_classes_count: 12,
      program_count: 7,
    },
    {
      code: "TOA1001",
      name: "Toán cao cấp 1",
      credits: 3,
      faculty: null,
      department: null,
      faculty_source: null,
      suggestion: {
        faculty: "Khoa Toán kinh tế",
        source: "prefix",
        confidence: "100.0%",
      },
      reason: "không có đề cương – điền theo tiền tố MA",
      open_classes_count: 10,
      program_count: 6,
    },
    {
      code: "LAW3001",
      name: "Luật so sánh",
      credits: 2,
      faculty: "Khoa Luật",
      department: "Bộ môn Luật Dân sự",
      faculty_source: "admin",
      suggestion: null,
      reason: "nguồn admin (đã chỉnh tay)",
      open_classes_count: 4,
      program_count: 2,
    },
  ],
  total: 4,
  page: 1,
  size: 20,
  counts: {
    needs_review: 1,
    prefix_conflict: 1,
    no_source: 1,
    admin_modified: 1,
  },
};

export const mockOutlinesCoverage: OutlineCoverageResponse = {
  total_modules: 1486,
  modules_with_outline: 450,
  coverage_pct: 30.3,
  by_faculty: [
    { faculty: "Khoa Hệ thống thông tin", total_modules: 120, with_outline: 65, coverage_pct: 54.2 },
    { faculty: "Khoa Quản trị kinh doanh", total_modules: 180, with_outline: 78, coverage_pct: 43.3 },
    { faculty: "Khoa Tài chính - Ngân hàng", total_modules: 160, with_outline: 56, coverage_pct: 35.0 },
    { faculty: "Khoa Kế toán - Kiểm toán", total_modules: 140, with_outline: 42, coverage_pct: 30.0 },
    { faculty: "Khoa Luật", total_modules: 150, with_outline: 40, coverage_pct: 26.7 },
    { faculty: "Khoa Luật Kinh tế", total_modules: 130, with_outline: 38, coverage_pct: 29.2 },
    { faculty: "Khoa Kinh tế", total_modules: 110, with_outline: 35, coverage_pct: 31.8 },
    { faculty: "Khoa Kinh tế đối ngoại", total_modules: 125, with_outline: 41, coverage_pct: 32.8 },
    { faculty: "Khoa Toán kinh tế", total_modules: 95, with_outline: 28, coverage_pct: 29.5 },
    { faculty: "Phòng Đào tạo", total_modules: 276, with_outline: 27, coverage_pct: 9.8 },
  ],
  by_semester: [
    { semester_id: "2026-2027-1", semester_name: "Học kỳ 1 · 2026-2027", total_modules: 620, with_outline: 285, coverage_pct: 46.0 },
    { semester_id: "2025-2026-3", semester_name: "Học kỳ 3 · 2025-2026", total_modules: 210, with_outline: 98, coverage_pct: 46.7 },
    { semester_id: "2025-2026-2", semester_name: "Học kỳ 2 · 2025-2026", total_modules: 590, with_outline: 260, coverage_pct: 44.1 },
    { semester_id: "2025-2026-1", semester_name: "Học kỳ 1 · 2025-2026", total_modules: 610, with_outline: 255, coverage_pct: 41.8 },
  ],
};

export const mockOutlinesMissing: OutlineMissingResponse = {
  items: [
    {
      code: "BBU4025",
      name: "Khởi nghiệp kinh doanh",
      credits: 3,
      faculty: "Khoa Quản trị kinh doanh",
      department: "Bộ môn Quản trị",
      open_classes_count: 14,
      counterpart_code: "EBBU4025",
      counterpart_has_outline: true,
    },
    {
      code: "FFB3012",
      name: "Thị trường tài chính",
      credits: 3,
      faculty: "Khoa Tài chính - Ngân hàng",
      department: "Bộ môn Tài chính",
      open_classes_count: 11,
      counterpart_code: null,
      counterpart_has_outline: false,
    },
    {
      code: "IEB2005",
      name: "Lập trình Web căn bản",
      credits: 3,
      faculty: "Khoa Hệ thống thông tin",
      department: "Bộ môn Thương mại điện tử",
      open_classes_count: 9,
      counterpart_code: "EIEB2005",
      counterpart_has_outline: false,
    },
  ],
  total: 3,
  page: 1,
  size: 20,
};

export const mockOutlinesOcrPending: OutlineOcrPendingResponse = {
  items: [
    {
      id: 1,
      file_name: "DeCuong_Scan_KhoaLuat_2023.pdf",
      rel_path: "scans/DeCuong_Scan_KhoaLuat_2023.pdf",
      size_bytes: 8452100,
      page_count: 12,
      ocr_engine: "tesseract vie+eng psm4 300dpi",
      text_chars: 0,
      extracted_at: "2026-11-20T10:00:00Z",
      related_modules: ["LAW2001", "LAW2002"],
    },
    {
      id: 2,
      file_name: "DeCuong_ToanCaoCap_Scan.pdf",
      rel_path: "scans/DeCuong_ToanCaoCap_Scan.pdf",
      size_bytes: 4120300,
      page_count: 6,
      ocr_engine: "tesseract vie+eng psm4 300dpi",
      text_chars: 0,
      extracted_at: "2026-11-21T14:30:00Z",
      related_modules: ["TOA1001"],
    },
  ],
  total: 2,
  page: 1,
  size: 20,
};

export const mockOutlinesDriveLinks: OutlineDriveLinkResponse = {
  items: [
    {
      id: "RES_001",
      url: "https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit",
      kind: "Link đề cương hiện tại (chuẩn)",
      label: "Đề cương HTTT Quản lý",
      status: "no_url",
      failure_reason: null,
      entry_id: "ENTRY_404_01",
      module_codes: ["BIM5001"],
    },
    {
      id: "RES_002",
      url: "https://drive.google.com/file/d/1Fk65Dfg-kLmNoPqrSTUVWXYZ/view",
      kind: "Link đề cương tham khảo",
      label: "Đề cương Quản trị học 2025",
      status: "no_url",
      failure_reason: null,
      entry_id: "ENTRY_402_02",
      module_codes: ["BBU1001", "EBBU1001"],
    },
  ],
  total: 2,
  page: 1,
  size: 20,
};

// =============================================================================
// Mock Calendar & Semesters Admin (Brief A5)
// =============================================================================
export const mockCalendarYears: string[] = ["2026-2027", "2025-2026"];

export const mockCalendarKinds: string[] = [
  "teaching",
  "midterm_exam",
  "final_exam",
  "holiday",
  "online_study",
  "makeup_day",
  "second_program",
  "registration",
  "academic_review",
  "graduation_review",
];

export const mockCalendarEvents: AdminAcademicEvent[] = [
  {
    id: 1,
    academic_year: "2026-2027",
    kind: "teaching",
    title: "Thời gian học tập Học kỳ 1 (Khóa 23 trở về trước)",
    start_date: "2026-08-24",
    end_date: "2026-11-19",
    semester_id: "2026-2027-1",
    cohorts: ["K23"],
    note: "11 tuần học, 04 ngày học bù và 01 tuần dự trữ",
    verified: true,
    source: "TB 223/TB-ĐHKTL-ĐT",
    updated_by: "admin@uelcourses.local",
    updated_at: "2026-11-21T18:00:00Z",
  },
  {
    id: 2,
    academic_year: "2026-2027",
    kind: "teaching",
    title: "Thời gian học tập Học kỳ 1 (Khóa 24, 25)",
    start_date: "2026-09-03",
    end_date: "2026-11-19",
    semester_id: "2026-2027-1",
    cohorts: ["K24", "K25"],
    note: "10 tuần học, 04 ngày học bù và 01 tuần dự trữ",
    verified: true,
    source: "TB 223/TB-ĐHKTL-ĐT",
    updated_by: "admin@uelcourses.local",
    updated_at: "2026-11-21T18:00:00Z",
  },
  {
    id: 3,
    academic_year: "2026-2027",
    kind: "holiday",
    title: "Nghỉ lễ Quốc khánh 2/9",
    start_date: "2026-08-31",
    end_date: "2026-09-02",
    semester_id: "2026-2027-1",
    cohorts: ["all"],
    note: "Nghỉ 03 ngày từ 31/8/2026 đến 02/9/2026; dạy và học bù vào các ngày 09, 10, 11/11/2026",
    verified: true,
    source: "TB 223/TB-ĐHKTL-ĐT",
    updated_by: null,
    updated_at: null,
  },
  {
    id: 4,
    academic_year: "2026-2027",
    kind: "midterm_exam",
    title: "Thi giữa kỳ Học kỳ 1 (Khóa 24, 25, 26)",
    start_date: "2026-09-28",
    end_date: "2026-10-04",
    semester_id: "2026-2027-1",
    cohorts: ["K24", "K25", "K26"],
    note: null,
    verified: true,
    source: "TB 223/TB-ĐHKTL-ĐT",
    updated_by: null,
    updated_at: null,
  },
  {
    id: 5,
    academic_year: "2026-2027",
    kind: "second_program",
    title: "Công bố kết quả đăng ký chương trình đào tạo thứ hai",
    start_date: "2026-08-20",
    end_date: null,
    semester_id: null,
    cohorts: ["all"],
    note: "Văn bản ghi 'Trước ngày 21/8/2026', ngày công bố cụ thể chưa ấn định",
    verified: false,
    source: "TB 223/TB-ĐHKTL-ĐT",
    updated_by: null,
    updated_at: null,
  },
  {
    id: 6,
    academic_year: "2026-2027",
    kind: "final_exam",
    title: "Thi cuối kỳ Học kỳ 1 (Khóa 24, 25, 26)",
    start_date: "2026-11-20",
    end_date: "2026-12-01",
    semester_id: "2026-2027-1",
    cohorts: ["K24", "K25", "K26"],
    note: null,
    verified: true,
    source: "TB 223/TB-ĐHKTL-ĐT",
    updated_by: null,
    updated_at: null,
  },
];

export const mockAdminSemesters: SemesterAdminItem[] = [
  {
    id: "2026-2027-1",
    name: "Học kỳ 1 năm học 2026-2027",
    year: "2026-2027",
    term: 1,
    is_current: true,
    start_date: "2026-08-24",
    end_date: "2026-12-01",
    teaching_start: "2026-08-24",
    teaching_end: "2026-11-19",
    is_current_override: true,
  },
  {
    id: "2026-2027-2",
    name: "Học kỳ 2 năm học 2026-2027",
    year: "2026-2027",
    term: 2,
    is_current: false,
    start_date: "2026-12-14",
    end_date: "2027-03-27",
    teaching_start: "2026-12-14",
    teaching_end: "2027-03-13",
    is_current_override: false,
  },
  {
    id: "2026-2027-3",
    name: "Học kỳ 3 năm học 2026-2027",
    year: "2026-2027",
    term: 3,
    is_current: false,
    start_date: "2027-04-12",
    end_date: "2027-07-24",
    teaching_start: "2027-04-12",
    teaching_end: "2027-07-10",
    is_current_override: false,
  },
  {
    id: "2025-2026-3",
    name: "Học kỳ 3 năm học 2025-2026",
    year: "2025-2026",
    term: 3,
    is_current: false,
    start_date: "2026-04-13",
    end_date: "2026-07-25",
    teaching_start: "2026-04-13",
    teaching_end: "2026-07-11",
    is_current_override: null,
  },
];

export const mockSystemInfo: AdminSystemInfo = {
  app_version: "0.1.0",
  env: "development",
  alembic_current: "0021",
  alembic_head: "0021",
  alembic_match: true,
  table_stats: [
    { name: "modules", count: 1420, size_bytes: 1048576 },
    { name: "class_sections", count: 850, size_bytes: 524288 },
    { name: "lessons", count: 8232, size_bytes: 3145728 },
    { name: "outline_documents", count: 926, size_bytes: 4194304 },
    { name: "analytics_events", count: 28400, size_bytes: 8388608 },
    { name: "audit_log", count: 342, size_bytes: 262144 },
    { name: "admin_users", count: 3, size_bytes: 32768 },
  ],
  last_import_at: "2026-11-21T18:30:00Z",
  errors_24h: 0,
  safe_config: {
    env: "development",
    cors_origins: "http://localhost:3000",
    llm_provider: "extractive",
    analytics_enabled: true,
    analytics_retention_days: 180,
    auto_seed: false,
  },
};

export const mockAuditLogs: AuditLogItem[] = [
  {
    id: 101,
    actor_type: "admin",
    actor_id: "admin@uel.edu.vn",
    action: "update_faculty",
    entity_type: "module",
    entity_id: "BIM5001",
    before: { faculty: null, department: null },
    after: { faculty: "Khoa Hệ thống thông tin", department: "Bộ môn Hệ thống thông tin" },
    created_at: "2026-11-22T10:15:30Z",
  },
  {
    id: 102,
    actor_type: "admin",
    actor_id: "admin@uel.edu.vn",
    action: "create_user",
    entity_type: "admin_user",
    entity_id: "4",
    before: null,
    after: { email: "newstaff@uel.edu.vn", role: "data_editor", is_active: true },
    created_at: "2026-11-22T09:40:12Z",
  },
  {
    id: 103,
    actor_type: "dev",
    actor_id: "dev@uelcourses.local",
    action: "update_settings",
    entity_type: "admin_settings",
    entity_id: "system",
    before: { moderation_mode: "pre", analytics_retention_days: 180 },
    after: { moderation_mode: "post", analytics_retention_days: 90 },
    created_at: "2026-11-21T17:22:05Z",
  },
];

export const mockAdminUsers: AdminUserItem[] = [
  {
    id: 1,
    email: "admin@uel.edu.vn",
    role: "admin",
    is_active: true,
    failed_attempts: 0,
    locked_until: null,
    last_login_at: "2026-11-22T08:00:00Z",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-22T08:00:00Z",
  },
  {
    id: 2,
    email: "moderator@uel.edu.vn",
    role: "moderator",
    is_active: true,
    failed_attempts: 0,
    locked_until: null,
    last_login_at: "2026-11-21T14:30:00Z",
    created_at: "2026-11-05T00:00:00Z",
    updated_at: null,
  },
  {
    id: 3,
    email: "editor@uel.edu.vn",
    role: "data_editor",
    is_active: true,
    failed_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: "2026-11-10T00:00:00Z",
    updated_at: null,
  },
];

export const mockAdminSettings: AdminSettingsData = {
  moderation_mode: "pre",
  analytics_enabled: true,
  analytics_retention_days: 180,
  updated_by: "admin@uel.edu.vn",
  updated_at: "2026-11-22T08:30:00Z",
};




