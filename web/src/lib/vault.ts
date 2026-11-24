// Pure helpers for the Markdown "vault" of regulations (wikilinks, anchors, outline, backlinks, diff).
import type { Backlink, RegulationDocDetail } from "./types";

export interface Wikilink {
  raw: string;
  doc_id: string;
  anchor?: string;
  label?: string;
  index: number;
}

const WIKILINK_RE = /\[\[([^\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/g;

export function parseWikilinks(text: string): Wikilink[] {
  const out: Wikilink[] = [];
  for (const m of text.matchAll(WIKILINK_RE)) {
    out.push({
      raw: m[0],
      doc_id: m[1].trim(),
      anchor: m[2]?.trim() || undefined,
      label: m[3]?.trim() || undefined,
      index: m.index ?? 0,
    });
  }
  return out;
}

export type Segment = { type: "text"; value: string } | { type: "link"; link: Wikilink };

export function splitWikilinks(text: string): Segment[] {
  const segs: Segment[] = [];
  let last = 0;
  for (const link of parseWikilinks(text)) {
    if (link.index > last) segs.push({ type: "text", value: text.slice(last, link.index) });
    segs.push({ type: "link", link });
    last = link.index + link.raw.length;
  }
  if (last < text.length) segs.push({ type: "text", value: text.slice(last) });
  return segs;
}

/** Replace wikilinks with their label (for plain-text quotes / snippets). */
export function stripWikilinks(text: string): string {
  return text.replace(WIKILINK_RE, (_m, doc: string, anchor?: string, label?: string) => label ?? (anchor ? `${doc}#${anchor}` : doc));
}

export function wikilinkLabel(l: Pick<Wikilink, "doc_id" | "anchor" | "label">): string {
  return l.label ?? (l.anchor ? `${anchorToLabel(l.anchor)} · ${l.doc_id}` : l.doc_id);
}

export function wikilinkHref(docId: string, anchor?: string): string {
  return `/regulations/${encodeURIComponent(docId)}${anchor ? `#${encodeURIComponent(anchor)}` : ""}`;
}

/** "dieu-9-khoan-2" -> "Khoản 2 Điều 9"; "dieu-9" -> "Điều 9" */
export function anchorToLabel(anchor: string): string {
  const m = /^dieu-([\w]+?)(?:-khoan-(\w+))?$/.exec(anchor);
  if (!m) return anchor;
  return m[2] ? `Khoản ${m[2]} Điều ${m[1]}` : `Điều ${m[1]}`;
}

export function articleClauseAnchor(article: string, clause?: string | null): string {
  const n = /(\d+[a-z]?)/i.exec(article)?.[1] ?? article;
  return clause ? `dieu-${n}-khoan-${clause}` : `dieu-${n}`;
}

export function stripFrontmatter(md: string): string {
  return md.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

const HEADING_RE = /^##\s+Điều\s+(\d+[a-z]?)\.?\s*(.*)$/i;
const CLAUSE_RE = /^\*\*(\d+)\.?\*\*\s*(.*)$/;

export interface OutlineItem {
  key: string;
  anchor: string;
  number: string;
  title: string;
}

export function extractOutline(md: string): OutlineItem[] {
  const out: OutlineItem[] = [];
  const anchorOccurrences = new Map<string, number>();
  for (const line of stripFrontmatter(md).split(/\r?\n/)) {
    const m = HEADING_RE.exec(line.trim());
    if (m) {
      const anchor = `dieu-${m[1]}`;
      const occurrence = (anchorOccurrences.get(anchor) ?? 0) + 1;
      anchorOccurrences.set(anchor, occurrence);
      out.push({
        key: occurrence === 1 ? anchor : `${anchor}-${occurrence}`,
        anchor,
        number: m[1],
        title: m[2].trim(),
      });
    }
  }
  return out;
}

/** Return the text of an article or clause by anchor (for hover previews). */
export function extractSection(md: string, anchor: string): string | null {
  const lines = stripFrontmatter(md).split(/\r?\n/);
  const m = /^dieu-(\w+?)(?:-khoan-(\w+))?$/.exec(anchor);
  if (!m) return null;
  const [, art, clause] = m;
  let inArticle = false;
  const collected: string[] = [];
  let inClause = false;
  for (const raw of lines) {
    const line = raw.trim();
    const h = HEADING_RE.exec(line);
    if (h) {
      if (inArticle) break;
      inArticle = h[1] === art;
      if (inArticle && !clause) collected.push(line.replace(/^##\s+/, ""));
      continue;
    }
    if (!inArticle) continue;
    if (/^#{1,2}\s/.test(line)) break;
    if (!clause) {
      if (line) collected.push(line);
      continue;
    }
    const c = CLAUSE_RE.exec(line);
    if (c) {
      if (inClause) break;
      inClause = c[1] === clause;
      if (inClause) collected.push(line);
      continue;
    }
    if (inClause && line) collected.push(line);
  }
  if (!collected.length) return null;
  return stripWikilinks(collected.join("\n").replace(/\*\*/g, ""));
}

/** Nearest preceding anchor for each line, then gather links pointing at `target`. */
export function computeBacklinks(vault: { doc_id: string; markdown: string }[], target: string): Backlink[] {
  const out: Backlink[] = [];
  for (const d of vault) {
    if (d.doc_id === target) continue;
    let article = "";
    let anchor = "";
    for (const raw of stripFrontmatter(d.markdown).split(/\r?\n/)) {
      const line = raw.trim();
      const h = HEADING_RE.exec(line);
      if (h) {
        article = h[1];
        anchor = `dieu-${article}`;
      }
      const c = CLAUSE_RE.exec(line);
      if (c && article) anchor = `dieu-${article}-khoan-${c[1]}`;
      if (parseWikilinks(line).some((l) => l.doc_id === target)) {
        out.push({ from_doc_id: d.doc_id, from_anchor: anchor, context_snippet: stripWikilinks(line.replace(/\*\*/g, "")).slice(0, 240) });
      }
    }
  }
  return out;
}

/** Render a structured doc into the vault Markdown format of the contract. */
export function docToMarkdown(doc: RegulationDocDetail): string {
  const parts = [`# ${doc.title}`, "", `*${doc.decision_no}*`, ""];
  for (const a of doc.articles) {
    const n = /(\d+[a-z]?)/i.exec(a.article)?.[1] ?? a.article;
    parts.push(`## Điều ${n}. ${a.title ?? ""}`.trimEnd(), "");
    if (a.text) parts.push(a.text, "");
    for (const c of a.clauses ?? []) parts.push(`**${c.clause}.** ${c.text}`, "");
  }
  return parts.join("\n");
}

// ---------- word diff (LCS) for the cohort split view ----------
export type DiffPart = { type: "same" | "add" | "del"; text: string };

export function diffWords(a: string, b: string): DiffPart[] {
  const A = a.split(/(\s+)/).filter((x) => x !== "");
  const B = b.split(/(\s+)/).filter((x) => x !== "");
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push("same", A[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", A[i++]);
    else push("add", B[j++]);
  }
  while (i < n) push("del", A[i++]);
  while (j < m) push("add", B[j++]);
  return out;
}
