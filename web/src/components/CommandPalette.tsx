"use client";
import { Command } from "cmdk";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import { getMarkdown } from "@/lib/vaultCache";
import { extractOutline, wikilinkHref, type OutlineItem } from "@/lib/vault";
import { useWorkspace } from "@/lib/workspace";
import type { RegulationDoc } from "@/lib/types";
import { useT } from "@/i18n";
import { NAV } from "./Header";

const usePalette = create<{ open: boolean; set: (v: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openCommandPalette = () => usePalette.getState().set(true);

interface ArticleItem extends OutlineItem {
  doc: RegulationDoc;
}

const GROUP = "text-xs text-slate-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1";
const ITEM = "cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-800 data-[selected=true]:bg-brand-50 dark:text-slate-100 dark:data-[selected=true]:bg-slate-800";

/** Global Ctrl+K palette: jump to a page, document or article, or hand a question to the AI. */
export function CommandPalette() {
  const { open, set } = usePalette();
  const { t } = useT();
  const [search, setSearch] = useState("");
  const [docs, setDocs] = useState<RegulationDoc[]>([]);
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        usePalette.getState().set(!usePalette.getState().open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open || docs.length) return;
    setError(null);
    api.regulations().then(async (r) => {
      setDocs(r.data);
      const items = await Promise.all(
        r.data.map(async (d) => {
          const md = await getMarkdown(d.doc_id);
          return md ? extractOutline(md.markdown).map((o) => ({ doc: d, ...o })) : [];
        }),
      );
      setArticles(items.flat());
    }).catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : String(requestError)));
  }, [open, docs.length]);

  const close = () => {
    set(false);
    setSearch("");
  };
  const goDoc = (doc: string, anchor?: string) => {
    useWorkspace.getState().open(doc, anchor);
    router.push(wikilinkHref(doc, anchor));
    close();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(v) => (v ? set(true) : close())}
      label={t("pal.label")}
      overlayClassName="fixed inset-0 z-50 bg-black/40"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder={t("pal.placeholder")}
        className="w-full border-b border-slate-200 bg-transparent px-4 py-3 text-sm outline-none dark:border-slate-700"
      />
      {error && <p role="status" className="px-4 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      <Command.List className="max-h-[60vh] overflow-y-auto p-2 text-sm">
        <Command.Empty className="px-3 py-4 text-slate-500">{t("pal.empty")}</Command.Empty>
        {search.trim().length > 3 && (
          <Command.Group heading={t("pal.askGroup")} className={GROUP}>
            <Command.Item
              value={`ask ${search}`}
              onSelect={() => {
                useWorkspace.getState().askLater(search.trim());
                if (path !== "/regulations") router.push("/regulations");
                close();
              }}
              className={ITEM}
            >
              {t("pal.ask", { q: search.trim() })}
            </Command.Item>
          </Command.Group>
        )}
        <Command.Group heading={t("pal.docs")} className={GROUP}>
          {docs.map((d) => (
            <Command.Item key={d.doc_id} value={`${d.decision_no} ${d.title} ${d.doc_id}`} onSelect={() => goDoc(d.doc_id)} className={ITEM}>
              <span className="font-semibold">{d.decision_no}</span> <span className="text-slate-500">— {d.title}</span>
            </Command.Item>
          ))}
        </Command.Group>
        {search.trim() && (
          <Command.Group heading={t("pal.articles")} className={GROUP}>
            {articles.map((a) => (
              <Command.Item key={`${a.doc.doc_id}#${a.key}`} value={`${a.number} ${a.title} ${a.doc.decision_no} ${a.doc.doc_id}#${a.key}`} onSelect={() => goDoc(a.doc.doc_id, a.anchor)} className={ITEM}>
                {t("pal.articleLabel", { n: a.number, title: a.title })} <span className="text-slate-500">· {a.doc.decision_no}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        <Command.Group heading={t("pal.pages")} className={GROUP}>
          {[
            ...NAV.map((n) => ({ href: n.href, label: t(n.labelKey) })),
            { href: "/feedback", label: t("nav.feedback") },
            { href: "/regulations/graph", label: t("pal.graph") },
          ].map((n) => (
            <Command.Item key={n.href} value={`trang ${n.label} ${n.href}`} onSelect={() => { router.push(n.href); close(); }} className={ITEM}>
              {n.label}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
      <p className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-700">{t("pal.hint")}</p>
    </Command.Dialog>
  );
}
