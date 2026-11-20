// DỮ LIỆU MẪU — văn bản quy chế minh họa, KHÔNG phải văn bản thật của UEL.
// Số hiệu văn bản (789, 1268, 2261) theo quy ước của nhóm dự án; NỘI DUNG Điều/Khoản chỉ là minh họa,
// không trích từ văn bản gốc. Văn bản thật nằm ở regulations/ và được backend nạp.
import type {
  AskResponse,
  Backlink,
  CompareResponse,
  RegulationDoc,
  RegulationDocDetail,
  RegulationGraph,
  RegulationMarkdown,
} from "@/lib/types";
import { appliesToCohort, effectiveBadge } from "@/lib/regulations";
import { articleClauseAnchor, computeBacklinks, docToMarkdown, parseWikilinks, stripWikilinks } from "@/lib/vault";

function isoOffset(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function mockRegulationDocs(): RegulationDocDetail[] {
  return [
    {
      doc_id: "qc-789-2019",
      title: "Quy chế đào tạo trình độ đại học 2019 (nội dung minh họa)",
      decision_no: "789/QĐ-ĐHKTL",
      issued_date: "2019-08-01",
      effective_from: "2019-09-01",
      effective_to: "2022-08-31",
      status: "superseded",
      superseded_by: "qc-1268-2022",
      applies_to_cohorts: ["K19", "K20", "K21"],
      topic: "Quy chế đào tạo",
      issuer_level: "Cấp Trường",
      metadata_verified: false,
      file: "mau/qc-789.pdf",
      articles: [
        { article: "Điều 10", title: "Đăng ký khối lượng học tập", clauses: [
          { clause: "1", text: "Khối lượng học tập tối thiểu mỗi học kỳ chính là 14 tín chỉ, trừ học kỳ cuối khóa." },
          { clause: "2", text: "Khối lượng học tập tối đa mỗi học kỳ chính là 25 tín chỉ." },
        ] },
        { article: "Điều 16", title: "Cảnh báo học tập", clauses: [
          { clause: "1", text: "Sinh viên bị cảnh báo học tập nếu điểm trung bình học kỳ đạt dưới 1,0 (thang 4)." },
        ] },
      ],
    },
    {
      doc_id: "qc-1268-2022",
      title: "Quy chế đào tạo trình độ đại học 2022 (nội dung minh họa)",
      decision_no: "1268/QĐ-ĐHKTL",
      issued_date: "2022-07-15",
      effective_from: "2022-09-01",
      effective_to: null,
      status: "active",
      applies_to_cohorts: ["K22", "K23", "K24"],
      topic: "Quy chế đào tạo",
      issuer_level: "Cấp Trường",
      metadata_verified: false,
      file: "mau/qc-1268.pdf",
      articles: [
        { article: "Điều 1", title: "Phạm vi điều chỉnh", clauses: [
          { clause: "1", text: "Quy chế này thay thế [[qc-789-2019|QĐ 789/QĐ-ĐHKTL]] đối với sinh viên tuyển sinh từ năm 2022." },
        ] },
        { article: "Điều 9", title: "Đăng ký khối lượng học tập", clauses: [
          { clause: "1", text: "Khối lượng học tập tối thiểu mỗi học kỳ chính là 12 tín chỉ, trừ học kỳ cuối khóa." },
          { clause: "2", text: "Khối lượng học tập tối đa mỗi học kỳ chính là 28 tín chỉ; sinh viên bị cảnh báo học tập theo [[qc-1268-2022#dieu-15-khoan-1|Khoản 1 Điều 15]] chỉ được đăng ký tối đa 16 tín chỉ." },
        ] },
        { article: "Điều 12", title: "Học phần tương đương và thay thế", clauses: [
          { clause: "1", text: "Học phần tương đương là học phần được phép tích lũy thay cho một học phần trong chương trình đào tạo." },
          { clause: "2", text: "Danh sách học phần tương đương do Trưởng khoa đề xuất và Hiệu trưởng phê duyệt." },
        ] },
        { article: "Điều 15", title: "Cảnh báo kết quả học tập, buộc thôi học", clauses: [
          { clause: "1", text: "Sinh viên bị cảnh báo học tập nếu điểm trung bình học kỳ đạt dưới 0,8 đối với học kỳ đầu, dưới 1,0 đối với các học kỳ tiếp theo." },
          { clause: "2", text: "Sinh viên bị buộc thôi học nếu bị cảnh báo học tập hai lần liên tiếp." },
        ] },
      ],
    },
    {
      doc_id: "qc-2261-2025",
      title: "Quy chế đào tạo trình độ đại học 2025 (nội dung minh họa)",
      decision_no: "2261/QĐ-ĐHKTL",
      issued_date: "2025-07-20",
      effective_from: "2025-09-01",
      effective_to: null,
      status: "active",
      applies_to_cohorts: ["K25", "K26"],
      topic: "Quy chế đào tạo",
      issuer_level: "Cấp Trường",
      metadata_verified: false,
      file: "mau/qc-2261.pdf",
      articles: [
        { article: "Điều 1", title: "Phạm vi điều chỉnh", clauses: [
          { clause: "1", text: "Quy chế này thay thế [[qc-1268-2022|QĐ 1268/QĐ-ĐHKTL]] đối với sinh viên tuyển sinh từ năm 2025; sinh viên K22–K24 tiếp tục áp dụng [[qc-1268-2022#dieu-9|Điều 9 QĐ 1268]]." },
        ] },
        { article: "Điều 9", title: "Đăng ký khối lượng học tập", clauses: [
          { clause: "1", text: "Khối lượng học tập tối thiểu mỗi học kỳ chính là 14 tín chỉ, trừ học kỳ cuối khóa." },
          { clause: "2", text: "Khối lượng học tập tối đa mỗi học kỳ chính là 30 tín chỉ; sinh viên bị cảnh báo học tập chỉ được đăng ký tối đa 18 tín chỉ." },
        ] },
        { article: "Điều 12", title: "Học phần tương đương và thay thế", clauses: [
          { clause: "1", text: "Việc công nhận học phần tương đương thực hiện như [[qc-1268-2022#dieu-12-khoan-1|Khoản 1 Điều 12 QĐ 1268]], bổ sung học phần giảng dạy bằng tiếng Anh." },
        ] },
        { article: "Điều 15", title: "Cảnh báo kết quả học tập, buộc thôi học", clauses: [
          { clause: "1", text: "Sinh viên bị cảnh báo học tập nếu điểm trung bình học kỳ đạt dưới 1,0 hoặc tổng số tín chỉ không đạt trong học kỳ vượt quá 50% khối lượng đã đăng ký." },
          { clause: "2", text: "Sinh viên bị buộc thôi học nếu số lần cảnh báo học tập vượt quá 2 lần liên tiếp." },
        ] },
      ],
    },
    {
      doc_id: "hd-hoc-phi-2026",
      title: "Hướng dẫn thu học phí theo tín chỉ (văn bản mẫu)",
      decision_no: "MẪU-03/HD-ĐHKTL",
      issued_date: "2025-12-20",
      effective_from: "2026-01-01",
      effective_to: isoOffset(45),
      status: "active",
      applies_to_cohorts: ["all"],
      topic: "Học phí",
      issuer_level: "Phòng ban",
      metadata_verified: false,
      file: "mau/hd-hoc-phi.pdf",
      articles: [
        { article: "Điều 3", title: "Thời hạn đóng học phí", clauses: [
          { clause: "1", text: "Sinh viên đóng học phí trong vòng 30 ngày kể từ ngày bắt đầu học kỳ." },
          { clause: "2", text: "Sinh viên không đóng học phí đúng hạn sẽ bị hủy kết quả đăng ký học phần theo [[qc-2261-2025#dieu-9|Điều 9 QĐ 2261]] và [[qc-1268-2022#dieu-9|Điều 9 QĐ 1268]]." },
        ] },
      ],
    },
    {
      doc_id: "qd-chuan-ngoai-ngu",
      title: "Quy định chuẩn đầu ra ngoại ngữ (văn bản mẫu)",
      decision_no: "MẪU-04/QĐ-ĐHKTL",
      issued_date: "2023-05-10",
      effective_from: "2023-06-01",
      effective_to: null,
      status: "active",
      applies_to_cohorts: ["K22", "K23", "K24", "K25", "K26"],
      topic: "Chuẩn đầu ra",
      issuer_level: "Cấp Trường",
      metadata_verified: false,
      file: "mau/qd-ngoai-ngu.pdf",
      articles: [
        { article: "Điều 4", title: "Chuẩn đầu ra ngoại ngữ", clauses: [
          { clause: "1", text: "Sinh viên phải đạt trình độ tiếng Anh tương đương bậc 4 theo Khung năng lực ngoại ngữ 6 bậc dùng cho Việt Nam để được xét tốt nghiệp." },
          { clause: "2", text: "Học phần dạy bằng tiếng Anh được công nhận theo [[qc-2261-2025#dieu-12-khoan-1|Khoản 1 Điều 12 QĐ 2261]]." },
        ] },
      ],
    },
  ];
}

export function stripArticles(d: RegulationDocDetail): RegulationDoc {
  const { articles: _articles, ...rest } = d;
  void _articles;
  return rest;
}

// ---------- vault ----------
export function mockVault(): RegulationMarkdown[] {
  return mockRegulationDocs().map((d) => ({ doc_id: d.doc_id, frontmatter: stripArticles(d), markdown: docToMarkdown(d) }));
}

export function mockMarkdown(docId: string): RegulationMarkdown | null {
  return mockVault().find((v) => v.doc_id === docId) ?? null;
}

export function mockBacklinks(docId: string): Backlink[] {
  return computeBacklinks(mockVault(), docId);
}

export function mockGraph(cohort?: string): RegulationGraph {
  const docs = mockRegulationDocs().filter((d) => appliesToCohort(d, cohort));
  const ids = new Set(docs.map((d) => d.doc_id));
  const nodes: RegulationGraph["nodes"] = docs.map((d) => ({
    id: d.doc_id,
    label: d.decision_no,
    type: "doc",
    status: d.status,
    cohorts: d.applies_to_cohorts,
  }));
  const edges: RegulationGraph["edges"] = [];
  const seen = new Set<string>();
  const add = (source: string, target: string, type: RegulationGraph["edges"][number]["type"]) => {
    const k = `${source}>${target}`;
    if (source === target || seen.has(k) || !ids.has(source) || !ids.has(target)) return;
    seen.add(k);
    edges.push({ source, target, type });
  };
  for (const d of mockRegulationDocs()) {
    if (d.superseded_by) add(d.superseded_by, d.doc_id, "supersedes");
  }
  add("qc-2261-2025", "qc-1268-2022", "supersedes");
  for (const v of mockVault()) {
    for (const l of parseWikilinks(v.markdown)) {
      add(v.doc_id, l.doc_id, v.frontmatter.doc_id.startsWith("hd-") ? "guides" : "references");
    }
  }
  return { nodes, edges };
}

/** "Điều 10 QĐ 1268" / "Khoản 2 Điều 9 QĐ 2261" -> {doc_id, anchor} */
export function mockResolve(ref: string): { doc_id: string; anchor: string } | null {
  const num = /(?:QĐ|quyết định)\s*(?:số\s*)?(\d+)/i.exec(ref)?.[1];
  const art = /Điều\s*(\d+[a-z]?)/i.exec(ref)?.[1];
  const clause = /Khoản\s*(\d+)/i.exec(ref)?.[1];
  if (!num) return null;
  const doc = mockRegulationDocs().find((d) => d.decision_no.startsWith(`${num}/`));
  if (!doc) return null;
  return { doc_id: doc.doc_id, anchor: art ? articleClauseAnchor(art, clause) : "" };
}

// ---------- extractive search ----------
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
}

interface Hit {
  doc: RegulationDocDetail;
  article: string;
  clause: string;
  text: string;
  score: number;
}

function search(question: string, cohort?: string): Hit[] {
  const q = new Set(tokens(question));
  const hits: Hit[] = [];
  for (const doc of mockRegulationDocs()) {
    if (!appliesToCohort(doc, cohort)) continue;
    for (const a of doc.articles) {
      for (const c of a.clauses ?? []) {
        const text = stripWikilinks(c.text);
        const t = tokens(`${a.title ?? ""} ${text}`);
        const score = t.filter((x) => q.has(x)).length;
        if (score > 0) hits.push({ doc, article: a.article, clause: c.clause, text, score });
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}

export function mockAsk(question: string, cohort?: string): AskResponse {
  const hits = search(question, cohort).slice(0, 3);
  if (!hits.length) {
    return {
      answer: "Không tìm thấy điều khoản phù hợp trong các văn bản hiện có. Hệ thống không trả lời khi không có nguồn.",
      citations: [],
      warnings: [],
      mode: "extractive",
    };
  }
  const warnings: string[] = [];
  for (const h of hits) {
    const b = effectiveBadge(h.doc);
    if (b === "expired" || b === "superseded")
      warnings.push(`Văn bản ${h.doc.decision_no} đã hết hiệu lực/bị thay thế — chỉ dùng để tham khảo.`);
    if (b === "expiring") warnings.push(`Văn bản ${h.doc.decision_no} sắp hết hiệu lực (${h.doc.effective_to}).`);
  }
  return {
    answer: `Các đoạn nguyên văn liên quan nhất (chế độ trích xuất, dữ liệu mẫu):\n${hits
      .map((h, i) => `${i + 1}. ${h.doc.decision_no}, ${h.article}, Khoản ${h.clause}: "${h.text}"`)
      .join("\n")}`,
    citations: hits.map((h) => ({
      doc_id: h.doc.doc_id,
      decision_no: h.doc.decision_no,
      article: h.article,
      clause: h.clause,
      quote: h.text,
      effective_from: h.doc.effective_from,
      effective_to: h.doc.effective_to,
      status: h.doc.status,
      metadata_verified: h.doc.metadata_verified,
    })),
    warnings: [...new Set(warnings)],
    mode: "extractive",
  };
}

export function mockCompare(topic: string, cohorts: string[]): CompareResponse {
  const rows = cohorts.map((cohort) => {
    const top = search(topic, cohort)[0];
    return top
      ? { cohort, doc: top.doc.decision_no, article: `${top.article}, Khoản ${top.clause}`, quote: top.text }
      : { cohort, doc: "—", article: "—", quote: "Không tìm thấy quy định phù hợp." };
  });
  const distinct = new Set(rows.map((r) => r.quote));
  const differences =
    distinct.size > 1
      ? [`Quy định về "${topic}" khác nhau giữa các khóa: ${rows.map((r) => `${r.cohort} theo ${r.doc}`).join("; ")}.`]
      : [];
  return { rows, differences };
}
