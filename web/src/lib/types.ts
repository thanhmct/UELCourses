// Types mirroring the REST contract in ARCHITECTURE.md

export interface Semester {
  id: string;
  name: string;
  year: number | string;
  term: number | string;
  is_current: boolean;
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

export interface ModuleSummary extends ModuleRef {
  grading_basis?: string;
  final_assessment?: string;
  type: string;
  faculty?: string;
  /** mô tả học phần (từ DB hoặc đề cương) */
  description?: string | null;
  /** link Drive (PDF) đề cương của học phần */
  outline_url?: string | null;
  has_equivalents: boolean;
  /** taught in English */
  is_english?: boolean;
  offering_plan?: OfferingPlan[];
  department?: string;
  /** 'en' | 'vi' (from API) */
  language_track?: 'en' | 'vi';
  is_talent_program?: boolean;
  /** code of the counterpart module (EN <-> VI) */
  counterpart_code?: string | null;
  /** semesters with open classes, e.g. 2026-2027-1 */
  open_semesters?: { semester: string; classes: number }[];
  has_outline?: boolean;
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
}

export interface ModuleDetail extends ModuleSummary {
  description?: string;
  prerequisites?: string[];
  equivalents: ModuleRef[];
  semesters: string[];
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
  applies_to_cohorts: string[];
  source_url?: string | null;
  file: string;
  /** optional vault metadata */
  topic?: string;
  issuer_level?: string;
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
  article: string;
  clause?: string | null;
  quote: string;
  effective_from?: string;
  effective_to?: string | null;
  status?: RegulationStatus;
  metadata_verified?: boolean;
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
  warnings: string[];
  mode: "extractive" | "llm";
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
  total_credits: number;
}

export interface ProgramModule {
  code: string;
  name: string;
  name_en?: string | null;
  credits: number;
  required: boolean;
  suggested_term?: number | null;
  prereq?: string[];
  previous?: string[];
  coreq?: string[];
  equivalents?: string[];
}

export interface ProgramBlock {
  name: string;
  parent?: string | null;
  required_credits?: number | null;
  modules: ProgramModule[];
}

export interface ProgramDetail {
  program: ProgramSummary;
  blocks: ProgramBlock[];
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
