"use client";
import { useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkVault } from "@/lib/remarkVault";
import { getMarkdown } from "@/lib/vaultCache";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { anchorToLabel, extractOutline } from "@/lib/vault";
import { effectiveBadge } from "@/lib/regulations";
import { formatDateVi } from "@/lib/dates";
import { HIGHLIGHT_COLORS, useRegNotes, useWorkspace, type HighlightColor } from "@/lib/workspace";
import type { RegulationMarkdown } from "@/lib/types";
import { EffectiveBadgeChip, Empty, Loading } from "@/components/ui";
import { useT } from "@/i18n";
import { WikiLink } from "./WikiLink";

const HL_CLS: Record<HighlightColor, string> = {
  yellow: "bg-yellow-100 dark:bg-yellow-900/40",
  green: "bg-emerald-100 dark:bg-emerald-900/40",
  blue: "bg-sky-100 dark:bg-sky-900/40",
  pink: "bg-pink-100 dark:bg-pink-900/40",
};
const HL_DOT: Record<HighlightColor, string> = { yellow: "bg-yellow-300", green: "bg-emerald-300", blue: "bg-sky-300", pink: "bg-pink-300" };

function ClauseBlock({ docId, anchor, children }: { docId: string; anchor: string; children: React.ReactNode }) {
  const { t } = useT();
  const key = `${docId}#${anchor}`;
  const entry = useRegNotes((s) => s.notes[key]);
  const setHighlight = useRegNotes((s) => s.setHighlight);
  const setNote = useRegNotes((s) => s.setNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry?.note ?? "");
  return (
    <div id={anchor} data-anchor={anchor} className={`group relative my-2 scroll-mt-24 rounded-md px-2 py-1 ${entry?.color ? HL_CLS[entry.color] : ""}`}>
      <div className="pr-8">{children}</div>
      <button
        className="absolute right-1 top-1 rounded px-1 text-xs text-slate-400 opacity-60 hover:bg-slate-200 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-700"
        onClick={() => {
          setDraft(entry?.note ?? "");
          setEditing((v) => !v);
        }}
        aria-label={t("md.noteAria", { a: anchorToLabel(anchor) })}
        title={t("md.markTitle")}
      >
        ✎
      </button>
      {entry?.note && !editing && (
        <p className="mt-1 rounded border-l-4 border-brand-400 bg-white/70 px-2 py-1 text-xs italic text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">{t("md.noteLabel", { n: entry.note })}</p>
      )}
      {editing && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <span>{t("md.highlight")}</span>
            {HIGHLIGHT_COLORS.map((c) => (
              <button key={c} className={`h-5 w-5 rounded-full ${HL_DOT[c]} ${entry?.color === c ? "ring-2 ring-slate-700 ring-offset-1" : ""}`} onClick={() => setHighlight(key, entry?.color === c ? null : c)} aria-label={t(`md.color.${c}`)} />
            ))}
            {entry?.color && <button className="text-slate-500 underline" onClick={() => setHighlight(key, null)}>{t("md.clear")}</button>}
          </div>
          <textarea className="input min-h-16 text-xs" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("md.notePh")} />
          <div className="flex gap-2">
            <button className="btn-primary px-2 py-1 text-xs" onClick={() => { setNote(key, draft); setEditing(false); }}>{t("md.save")}</button>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(false)}>{t("md.close")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function useMarkdown(docId: string) {
  const [state, setState] = useState<{ id: string; md: RegulationMarkdown | null; loading: boolean }>({ id: docId, md: null, loading: true });
  useEffect(() => {
    let alive = true;
    setState({ id: docId, md: null, loading: true });
    getMarkdown(docId).then((md) => alive && setState({ id: docId, md, loading: false }));
    return () => {
      alive = false;
    };
  }, [docId]);
  return state.id === docId ? state : { id: docId, md: null, loading: true };
}

export function MarkdownReader({ docId }: { docId: string }) {
  const { t } = useT();
  const { md, loading } = useMarkdown(docId);
  const backlinks = useApi(() => api.backlinks(docId), [docId]);
  const target = useWorkspace((s) => s.target);
  const open = useWorkspace((s) => s.open);
  const scrollRef = useRef<HTMLDivElement>(null);
  const outline = useMemo(() => (md ? extractOutline(md.markdown) : []), [md]);

  // Scroll + flash when a target anchor is requested for this doc
  useEffect(() => {
    if (!md || !target || target.doc !== docId || !target.anchor) return;
    const timer = setTimeout(() => {
      const el = scrollRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(target.anchor!)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("flash-target");
      void el.offsetWidth;
      el.classList.add("flash-target");
    }, 60);
    return () => clearTimeout(timer);
  }, [md, target, docId]);

  const components = useMemo<Components>(
    () => ({
      a: ({ href, children, ...rest }: ComponentPropsWithoutRef<"a"> & { "data-wikilink"?: string }) => {
        const wl = rest["data-wikilink"];
        if (wl) return <WikiLink target={wl}>{children}</WikiLink>;
        return <a href={href} target="_blank" rel="noreferrer" className="text-brand-600 underline">{children}</a>;
      },
      h1: ({ children }) => <h1 className="mb-1 text-xl font-bold">{children}</h1>,
      h2: ({ children, id }) => (
        <h2 id={id} className="mt-6 scroll-mt-24 border-b border-slate-200 pb-1 text-lg font-semibold dark:border-slate-700">{children}</h2>
      ),
      h3: ({ children }) => <h3 className="mt-4 font-semibold">{children}</h3>,
      p: ({ children, id }: ComponentPropsWithoutRef<"p">) =>
        id && id.includes("-khoan-") ? <ClauseBlock docId={docId} anchor={id}>{children}</ClauseBlock> : <p className="my-2">{children}</p>,
      ul: ({ children }) => <ul className="my-2 list-disc pl-6">{children}</ul>,
      ol: ({ children }) => <ol className="my-2 list-decimal pl-6">{children}</ol>,
      table: ({ children }) => <div className="overflow-x-auto"><table className="my-2 w-full border-collapse text-xs">{children}</table></div>,
      th: ({ children }) => <th className="border border-slate-300 px-2 py-1 text-left dark:border-slate-700">{children}</th>,
      td: ({ children }) => <td className="border border-slate-300 px-2 py-1 dark:border-slate-700">{children}</td>,
    }),
    [docId],
  );

  if (loading) return <Loading />;
  if (!md) return <Empty>{t("md.loadFail", { id: docId })}</Empty>;
  const fm = md.frontmatter;
  const badge = fm ? effectiveBadge(fm) : "active";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_200px]">
      <div ref={scrollRef} className="min-w-0">
        {fm && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <strong className="text-slate-800 dark:text-slate-100">{fm.decision_no}</strong>
            <EffectiveBadgeChip badge={badge} />
            <span>{t("md.effective", { a: formatDateVi(fm.effective_from) })}{fm.effective_to ? t("md.effectiveTo", { d: formatDateVi(fm.effective_to) }) : ""}</span>
            <span>{t("md.applies", { c: fm.applies_to_cohorts?.includes("all") ? t("md.allCohorts") : fm.applies_to_cohorts?.join(", ") })}</span>
            {fm.metadata_verified === false && <span className="chip bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200">{t("md.unverified")}</span>}
            {fm.source_url && <a className="text-brand-600 underline" href={fm.source_url} target="_blank" rel="noreferrer">{t("md.source")}</a>}
          </div>
        )}
        {(badge === "expired" || badge === "superseded") && (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">
            {badge === "superseded" ? t("md.staleSuperseded") : t("md.staleExpired")}
            {fm?.superseded_by && (
              <> {t("md.seeReplacement")} <button className="font-semibold underline" onClick={() => open(fm.superseded_by!)}>{fm.superseded_by}</button>.</>
            )}
          </div>
        )}
        {badge === "expiring" && (
          <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" role="alert">
            {t("md.expiring", { d: formatDateVi(fm?.effective_to) })}
          </div>
        )}
        <article className="text-sm leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkVault]} components={components}>
            {md.markdown}
          </ReactMarkdown>
        </article>
        <section className="mt-8 rounded-md border border-slate-200 p-3 dark:border-slate-800">
          <h3 className="mb-2 text-sm font-semibold">{t("md.backlinks", { n: backlinks.data?.length ?? 0 })}</h3>
          {backlinks.loading ? <Loading /> : !backlinks.data?.length ? (
            <p className="text-xs text-slate-500">{t("md.noBacklinks")}</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {backlinks.data.map((b, i) => (
                <li key={i} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                  <WikiLink target={`${b.from_doc_id}${b.from_anchor ? `#${b.from_anchor}` : ""}`}>
                    {b.from_doc_id}{b.from_anchor ? ` · ${anchorToLabel(b.from_anchor)}` : ""}
                  </WikiLink>
                  <p className="mt-1 text-slate-600 dark:text-slate-400">{b.context_snippet}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <nav className="order-first h-fit text-xs xl:sticky xl:top-20 xl:order-none" aria-label={t("md.outlineAria")}>
        <h3 className="mb-1 font-semibold uppercase tracking-wide text-slate-500">{t("md.outline")}</h3>
        <ul className="flex flex-wrap gap-1 xl:block xl:space-y-1">
          {outline.map((o) => (
            <li key={o.anchor}>
              <button className="rounded px-1 py-0.5 text-left text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-slate-800" onClick={() => open(docId, o.anchor)}>
                {o.title ? t("md.articleTitle", { n: o.number, title: o.title }) : t("md.article", { n: o.number })}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
