// Types mirroring the REST contract in ARCHITECTURE.md

export interface Semester {
  id: string;
  name: string;
  year: number | string;
  term: number | string;
  is_current: boolean;
  /** ISO yyyy-mm-dd: ngày bắt đầu/kết thúc học kỳ (để xem phòng theo tháng) */
  start_date?: string | null;
  end_date?: string | null;
  /** ISO yyyy-mm-dd: thời gian học thực tế (chuẩn hóa từ lịch năm học hoặc min/max buổi học) */
  teaching_start?: string | null;
  teaching_end?: string | null;
}

export interface ModuleRef {
  code: string;
  name: string;
  /** tên tiếng Anh (null/thiếu nếu chưa có nguồn) — hiển thị khi giao diện ở chế độ EN */
  name_en?: string | null;
  credits: number;
}

export interface OfferingPlan {
  /** e.g. "2026-2027" */
  academic_year: string;
  terms: number[];
  open_pct?: number;
}

export interface OutlineLink {
  kind?: string | null;
  url: string;
}

export interface ModuleSummary extends ModuleRef {
  grading_basis?: string;
  final_assessment?: string;
  type: string;
  faculty?: string;
  faculty_en?: string | null;
  /** mô tả học phần (từ DB hoặc đề cương) */
  description?: string | null;
  /** mô tả học phần bằng tiếng Anh (null/thiếu nếu chưa có) — giao diện EN dùng trường này, giao diện VI dùng `description` */
  description_en?: string | null;
  /** link Drive (PDF) đề cương của học phần (ưu tiên bản tiếng Việt/chuẩn) */
  outline_url?: string | null;
  /** link Drive (PDF) đề cương bản tiếng Anh */
  outline_url_en?: string | null;
  /** danh sách link đề cương kèm loại */
  outline_links?: OutlineLink[];
  has_equivalents: boolean;
  /** taught in English */
  is_english?: boolean;
  offering_plan?: OfferingPlan[];
  department?: string;
  department_en?: string | null;
  /** 'en' | 'vi' (from API) */
  language_track?: 'en' | 'vi';
  is_talent_program?: boolean;
  /** code of the counterpart module (EN <-> VI) */
  counterpart_code?: string | null;
  /** semesters with open classes, e.g. 2026-2027-1 */
  open_semesters?: { semester: string; classes: number }[];
  has_outline?: boolean;
  outline_year?: number | null;
  outline_year_fallback?: boolean;
  degree?: "dai_hoc" | "thac_si" | "tien_si" | string;
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface ModuleFacets {
  total: number;
  language: FacetCount[];
  talent: FacetCount[];
  credits: FacetCount[];
  faculty: FacetCount[];
  department: FacetCount[];
  type: FacetCount[];
  semester: FacetCount[];
  has_outline: FacetCount[];
  final_assessment?: FacetCount[];
}

export interface ModuleDetail extends ModuleSummary {
  description?: string;
  description_en?: string | null;
  prerequisites?: string[];
  equivalents: ModuleRef[];
  semesters: string[];
  required_in_programs?: { program_id: string; required: boolean }[];
  is_required_any?: boolean;
  required?: boolean | null;
  assessment?: ModuleAssessment | null;
  textbooks?: ModuleTextbook[];
}

export type ModuleAssessment = {
  [stage in "process" | "midterm" | "final" | "advanced" as `${stage}_ratio`]?: number | null;
} & {
  [stage in "process" | "midterm" | "final" | "advanced" as `${stage}_form`]?: string | null;
} & {
  /** loại thi, ví dụ "Thi giấy" / "Thi máy" */
  exam_type?: string | null;
  /** thời lượng thi, ví dụ "60'" */
  exam_duration?: string | null;
};

export interface ModuleTextbook {
  name?: string | null;
  url?: string | null;
  /** mã tài liệu (hiển thị CTĐT) */
  document_code?: string | null;
  /** ghi chú về tài liệu */
  note?: string | null;
  is_main: boolean;
}

export interface Lesson {
  /** 2 = Thứ 2 ... 7 = Thứ 7, 8 = Chủ nhật */
  weekday: number;
  start_period: number;
  end_period: number;
  start_time: string;
  end_time: string;
  room?: string;
  weeks?: string;
  /** ISO date of the first session */
  date_start?: string | null;
  /** ISO date of the last session; equal to date_start = one-off session */
  date_end?: string | null;
}

export interface ClassSection {
  class_code: string;
  module_code: string;
  lecturer?: string;
  quota?: number;
  start_date?: string;
  end_date?: string;
  lessons: Lesson[];
  /** student classes, e.g. "K24404E" */
  student_groups?: string[];
  quota_min?: number;
  quota_max?: number;
  registered?: number;
  available?: number;
  rooms?: string[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page?: number;
  size?: number;
}

export interface EquivalentItem extends ModuleRef {
  equivalents: ModuleRef[];
}

export interface VenueSession {
  weekday: number;
  start_period: number;
  end_period: number;
  start_time?: string;
  end_time?: string;
  module_code?: string;
  module_name?: string;
  class_code?: string;
  weeks?: string;
  /** ISO yyyy-mm-dd: ngày đầu/cuối của buổi (để xem theo tuần) */
  date_start?: string | null;
  date_end?: string | null;
}

export interface Venue {
  room: string;
  sessions: VenueSession[];
}

export type RegulationStatus = "active" | "expired" | "superseded" | "upcoming";

export interface RegulationClause {
  clause: string;
  text: string;
}

export interface RegulationArticle {
  article: string;
  title?: string;
  text?: string;
  clauses?: RegulationClause[];
}

export interface RegulationDoc {
  doc_id: string;
  title: string;
  decision_no: string;
  issued_date: string;
  effective_from: string;
  effective_to?: string | null;
  status: RegulationStatus;
  superseded_by?: string | null;
  supersedes?: string[];
  applies_to_cohorts: string[];
  source_url?: string | null;
  file: string;
  /** optional vault metadata */
  topic?: string;
  topics?: string[];
  is_sample?: boolean;
  indexed?: boolean;
  issuer_level?: string;
  issuer?: string | null;
  verified?: boolean | null;
  metadata_unverified?: boolean;
  metadata_verified?: boolean;
}

export interface RegulationMarkdown {
  doc_id: string;
  frontmatter: RegulationDoc;
  markdown: string;
}

export interface Backlink {
  from_doc_id: string;
  from_anchor: string;
  context_snippet: string;
}

export type GraphEdgeType = "supersedes" | "amends" | "references" | "guides";

export interface GraphNode {
  id: string;
  label: string;
  type: "doc" | "article";
  status?: RegulationStatus;
  cohorts?: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
  type: GraphEdgeType;
}

export interface RegulationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface RegulationDocDetail extends RegulationDoc {
  articles: RegulationArticle[];
}

export interface Citation {
  doc_id: string;
  decision_no: string;
  title?: string;
  article: string | null;
  clause?: string | null;
  anchor?: string | null;
  quote: string;
  label?: string;
  source_label?: string;
  page?: number | null;
  effective_from?: string;
  effective_to?: string | null;
  status?: RegulationStatus;
  metadata_verified?: boolean;
  source_url?: string | null;
}

export interface AskResponse {
  answer: string;
  found?: boolean;
  citations: Citation[];
  answer_id?: string;
  warnings: string[];
  mode: "extractive" | "llm" | "clarify" | "context" | "intro";
  workspace_summary?: string;
  /** The assistant asks back before answering (unknown cohort or an ambiguous question). */
  clarify?: { kind: "cohort" | "question"; question: string; options: string[] };
  abstained?: boolean;
}

export type AskScope = "regulations" | "modules";

export interface ModuleAskResponse {
  answer: string;
  found: boolean;
  mode: "structured" | "extractive" | "llm";
  reason: "planner" | "missing" | "scope" | null;
  warnings: string[];
  answer_id?: string;
  citations: {
    code: string;
    kind: "catalog" | "objectives" | "clos" | "assessment" | "schedule" | "materials" | "description";
    quote: string;
    ctdt_year: number | null;
    href: string;
  }[];
}

export interface CompareRow {
  cohort: string;
  doc: string;
  article: string;
  quote: string;
}

export interface CompareResponse {
  rows: CompareRow[];
  differences: string[];
}

// ---------- Training programs (CTĐT) ----------
export interface ProgramSummary {
  program_id: string;
  name: string;
  cohort: string;
  faculty?: string;
  degree?: "dai_hoc" | "thac_si" | "tien_si" | string;
  total_credits: number;
  module_count?: number;
  track_source?: "official" | "derived" | null;
}

export interface ValidProgramGroup {
  code: string;
  cohort: string;
  major: string;
  suffix: string;
  kind: "standard" | "english" | "coop" | "talent" | "other" | string;
  program_id: string;
  source: "class_sections" | "catalog" | string;
  degree?: "dai_hoc" | "thac_si" | "tien_si" | string;
}

export interface ProgramModule {
  code: string;
  name: string;
  name_en?: string | null;
  credits: number;
  required: boolean;
  suggested_term?: number | null;
  /** "2024-2025-1" — học kỳ gợi ý theo CTĐT (null = chưa phân học kỳ). */
  suggested_semester?: string | null;
  /** Thứ tự học kỳ trong CTĐT (1 = kỳ đầu). */
  suggested_order?: number | null;
  prereq?: string[];
  previous?: string[];
  coreq?: string[];
  equivalents?: string[];
  is_vietnamese_track?: boolean;
}

export interface ProgramBlock {
  name: string;
  parent?: string | null;
  required_credits?: number | null;
  modules: ProgramModule[];
}

export interface ElectiveGroup {
  block: string;
  required_credits: number;
  available_credits: number;
  modules: ProgramModule[];
}

export interface ProgramDetail {
  program: ProgramSummary;
  blocks: ProgramBlock[];
  track_source?: "official" | "derived" | null;
}

export type RelationType = "prereq" | "previous" | "coreq" | "equivalent";

export interface ProgramGraphNode {
  code: string;
  name: string;
  name_en?: string | null;
  credits: number;
  required: boolean;
  suggested_term?: number | null;
  block?: string;
}

export interface ProgramGraph {
  nodes: ProgramGraphNode[];
  edges: { source: string; target: string; type: RelationType }[];
  track_source?: "official" | "derived" | null;
}

/** Recursive tree; "and"/"or" nodes group children, other types are modules. */
export interface ModuleTreeNode {
  code: string;
  name: string;
  name_en?: string | null;
  type: string;
  children: ModuleTreeNode[];
}

export interface CheckResult {
  eligible_now: string[];
  blocked: { code: string; missing: { code: string; type: string }[] }[];
  warnings: string[];
  rule_refs: { doc_id: string; anchor: string }[];
}

export interface FeedbackPayload {
  page: string;
  rating: number;
  category: string;
  message: string;
  contact?: string;
  app_version: string;
}

export interface ModuleFilter {
  q?: string;
  faculty?: string;
  faculty_in?: string[];
  department?: string;
  credits?: number | string;
  credits_in?: (number | string)[] | string;
  type?: string;
  type_in?: string[] | string;
  language?: string;
  is_english?: boolean;
  talent?: string;
  has_outline?: string;
  program_id?: string;
  program_ids?: string[];
  semester?: string;
  page?: number;
  size?: number;
}

export type AdminRole = "admin" | "moderator" | "data_editor";

export interface AdminUser {
  id: number;
  email: string;
  role: AdminRole;
  actor_type?: string;
}

export interface ActivityDailyItem {
  date: string;
  count: number;
}

export interface AdminOverview {
  active_anon_7d: number;
  active_anon_30d: number;
  timetable_adds_7d: number;
  planner_adds_7d: number;
  activity_30d?: ActivityDailyItem[];
  moderation_pending: number;
  data_review_pending: number;
  errors_24h: number;
  last_import_at: string | null;
}

// ---------- Analytics & Trends (Brief A2) ----------
export interface TrendModuleItem {
  module_code: string;
  module_name: string;
  module_name_en?: string | null;
  timetable_adds: number | string;
  planner_adds: number | string;
  views: number | string;
  total_raw: number;
  trend_dir: "up" | "down" | "same";
  trend_pct: number;
  anonymized: boolean;
}

export interface TrendPairItem {
  semester_id: string;
  module_a: string;
  module_a_name: string;
  module_b: string;
  module_b_name: string;
  count: number | string;
  count_raw: number;
}

export interface TrendSlotItem {
  weekday: number;
  period: number;
  count: number | string;
  count_raw: number;
  anonymized: boolean;
}

export interface TrendConflictData {
  total_schedules: number | string;
  conflicted_schedules: number | string;
  conflict_rate_pct: number;
  anonymized: boolean;
}

export interface TrendChatTopic {
  scope: AskScope;
  target: string | null;
  title: string | null;
  count: number | "<5";
}

export interface TrendSearchItem {
  query: string;
  count: number | string;
  count_raw: number;
  anonymized: boolean;
}

export interface TrendClassItem {
  class_code: string;
  count: number | string;
  count_raw: number;
  anonymized: boolean;
}

// ---------- Moderation & Comments (Brief A3) ----------
export interface ModuleComment {
  id: number;
  module_code: string;
  body: string;
  rating?: number | null;
  author_name: string;
  status: "pending" | "approved" | "rejected" | "hidden";
  created_at: string;
}

export interface ModuleCommentListResponse {
  items: ModuleComment[];
  total: number;
  page: number;
  size: number;
  average_rating?: number | null;
}

export interface ModerationQueueItem {
  id: string;
  item_id: number;
  type: "feedback" | "comment" | "book";
  title: string;
  content: string;
  rating?: number | null;
  author: string;
  status: "pending" | "approved" | "rejected" | "hidden";
  flag_reasons: string[];
  created_at: string;
  moderated_by?: string | null;
  moderated_at?: string | null;
  moderation_note?: string | null;
  module_code?: string | null;
  page?: string | null;
  category?: string | null;
}

export interface ModerationQueueResponse {
  items: ModerationQueueItem[];
  total: number;
  page: number;
  size: number;
  counts: {
    all: number;
    feedback: number;
    comment: number;
    book: number;
  };
}

export interface BannedTerm {
  id: number;
  term: string;
  severity: "flag" | "block";
  created_at: string;
}

export interface BulkModerationRequest {
  items: { type: "feedback" | "comment" | "book"; id: number }[];
  action: "approve" | "reject" | "hide";
  note?: string;
}

// ---------- Data Admin & Outlines (Brief A4) ----------
export interface FacultyReviewSuggestion {
  faculty: string | null;
  source: string | null;
  confidence: string | null;
}

export interface FacultyReviewItem {
  code: string;
  name: string;
  credits?: number | null;
  faculty?: string | null;
  department?: string | null;
  faculty_source?: string | null;
  suggestion?: FacultyReviewSuggestion | null;
  reason?: string | null;
  open_classes_count: number;
  program_count: number;
}

export interface FacultyReviewResponse {
  items: FacultyReviewItem[];
  total: number;
  page: number;
  size: number;
  counts: {
    needs_review: number;
    prefix_conflict: number;
    no_source: number;
    admin_modified: number;
  };
}

export interface FacultyDepartmentInfo {
  name: string;
  departments: string[];
}

export interface FacultiesResponse {
  faculties: FacultyDepartmentInfo[];
  canonical_faculties: string[];
  all_departments: string[];
}

export interface FacultyCoverageItem {
  faculty: string;
  total_modules: number;
  with_outline: number;
  coverage_pct: number;
}

export interface SemesterCoverageItem {
  semester_id: string;
  semester_name: string;
  total_modules: number;
  with_outline: number;
  coverage_pct: number;
}

export interface OutlineCoverageResponse {
  total_modules: number;
  modules_with_outline: number;
  coverage_pct: number;
  by_faculty: FacultyCoverageItem[];
  by_semester: SemesterCoverageItem[];
}

export interface OutlineMissingItem {
  code: string;
  name: string;
  credits?: number | null;
  faculty?: string | null;
  department?: string | null;
  open_classes_count: number;
  counterpart_code?: string | null;
  counterpart_has_outline: boolean;
}

export interface OutlineMissingResponse {
  items: OutlineMissingItem[];
  total: number;
  page: number;
  size: number;
}

export interface OutlineOcrPendingItem {
  id: number;
  file_name: string;
  rel_path: string;
  size_bytes: number;
  page_count?: number | null;
  ocr_engine?: string | null;
  text_chars?: number | null;
  extracted_at?: string | null;
  related_modules: string[];
}

export interface OutlineOcrPendingResponse {
  items: OutlineOcrPendingItem[];
  total: number;
  page: number;
  size: number;
}

export interface OutlineDriveLinkItem {
  id: string;
  url: string | null;
  kind?: string | null;
  label?: string | null;
  status: string;
  failure_reason?: string | null;
  entry_id: string;
  module_codes: string[];
}

export interface OutlineDriveLinkResponse {
  items: OutlineDriveLinkItem[];
  total: number;
  page: number;
  size: number;
}

// ---------- Calendar & Semester Admin (Brief A5) ----------
export interface AdminAcademicEvent {
  id: number;
  academic_year: string;
  kind: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  semester_id?: string | null;
  cohorts: string[];
  note?: string | null;
  verified: boolean;
  source: string;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface CalendarEventsResponse {
  items: AdminAcademicEvent[];
  total: number;
  page: number;
  size: number;
  years: string[];
  kinds: string[];
}

export interface CalendarImportDryRunResult {
  status: string;
  dry_run: boolean;
  success: boolean;
  total_incoming: number;
  to_add: number;
  to_update: number;
  to_delete: number;
  sample_incoming: any[];
  diff_summary: {
    years?: string[];
    sources?: string[];
    existing_events_replaced?: number;
    [key: string]: any;
  };
}

export interface SemesterAdminItem {
  id: string;
  name: string;
  year: string;
  term: number;
  is_current: boolean;
  start_date?: string | null;
  end_date?: string | null;
  teaching_start?: string | null;
  teaching_end?: string | null;
  is_current_override?: boolean | null;
}

// ---------- System, Audit, Users & Settings Admin (Brief A6) ----------
export interface TableStat {
  name: string;
  count: number;
  size_bytes?: number | null;
}

export interface AdminSystemInfo {
  app_version: string;
  env: string;
  alembic_current?: string | null;
  alembic_head: string;
  alembic_match: boolean;
  table_stats: TableStat[];
  last_import_at?: string | null;
  errors_24h: number;
  safe_config: Record<string, any>;
}

export interface AuditLogItem {
  id: number;
  actor_type: string;
  actor_id?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  before?: any | null;
  after?: any | null;
  created_at: string;
}

export interface AuditLogResponse {
  items: AuditLogItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AdminUserItem {
  id: number;
  email: string;
  role: AdminRole;
  is_active: boolean;
  failed_attempts: number;
  locked_until?: string | null;
  last_login_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface CreateAdminUserResponse {
  user: AdminUserItem;
  temporary_password: string;
  message: string;
}

export interface AdminPasswordResetResponse {
  user_id: number;
  temporary_password: string;
  message: string;
}

export interface AdminSettingsData {
  moderation_mode: "pre" | "post";
  analytics_enabled: boolean;
  analytics_retention_days: number;
  updated_by?: string | null;
  updated_at?: string | null;
}
