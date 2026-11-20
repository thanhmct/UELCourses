"use client";
import { Command } from "cmdk";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import { getMarkdown } from "@/lib/vaultCache";
import { extractOutline } from "@/lib/vault";
import { useWorkspace } from "@/lib/workspace";
import type { RegulationDoc } from "@/lib/types";
import { NAV } from "./Header";

const usePalette = create<{ open: boolean; set: (v: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openCommandPalette = () => usePalette.getState().set(true);

interface ArticleItem {
  doc: RegulationDoc;
  anchor: string;
  label: string;
}

/** Global Ctrl+K palette: jump to a page, document or article, or hand a question to the AI. */
export function CommandPalette() {
  const { open, set } = usePalette();
  const [search, setSearch] = useState("");
  const [docs, setDocs] = useState<RegulationDoc[]>([]);
  const [articles, setArticles] = useState<ArticleItem[]>([]);
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
    api.regulations().then(async (r) => {
      setDocs(r.data);
      const items = await Promise.all(
        r.data.map(async (d) => {
          const md = await getMarkdown(d.doc_id);
          return md ? extractOutline(md.markdown).map((o) => ({ doc: d, anchor: o.anchor, label: `Điều ${o.number}. ${o.title}` })) : [];
        }),
      );
      setArticles(items.flat());
    });
  }, [open, docs.length]);

  const close = () => {
    set(false);
    setSearch("");
  };
  const goDoc = (doc: string, anchor?: string) => {
    useWorkspace.getState().open(doc, anchor);
    if (path !== "/regulations") router.push("/regulations");
    close();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(v) => (v ? set(true) : close())}
      label="Tìm nhanh"
      overlayClassName="fixed inset-0 z-50 bg-black/40"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder="Tìm văn bản, Điều, trang… hoặc gõ câu hỏi cho AI"
        className="w-full border-b border-slate-200 bg-transparent px-4 py-3 text-sm outline-none dark:border-slate-700"
      />
      <Command.List className="max-h-[60vh] overflow-y-auto p-2 text-sm">
        <Command.Empty className="px-3 py-4 text-slate-500">Không có kết quả.</Command.Empty>
        {search.trim().length > 3 && (
          <Command.Group heading="Hỏi AI" className="text-xs text-slate-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
            <Command.Item
              value={`ask ${search}`}
              onSelect={() => {
                useWorkspace.getState().askLater(search.trim());
                if (path !== "/regulations") router.push("/regulations");
                close();
              }}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-800 data-[selected=true]:bg-brand-50 dark:text-slate-100 dark:data-[selected=true]:bg-slate-800"
            >
              ✦ Hỏi AI: “{search.trim()}”
            </Command.Item>
          </Command.Group>
        )}
        <Command.Group heading="Văn bản" className="text-xs text-slate-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
          {docs.map((d) => (
            <Command.Item key={d.doc_id} value={`${d.decision_no} ${d.title} ${d.doc_id}`} onSelect={() => goDoc(d.doc_id)} className="cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-800 data-[selected=true]:bg-brand-50 dark:text-slate-100 dark:data-[selected=true]:bg-slate-800">
              <span className="font-semibold">{d.decision_no}</span> <span className="text-slate-500">— {d.title}</span>
            </Command.Item>
          ))}
        </Command.Group>
        {search.trim() && (
          <Command.Group heading="Điều" className="text-xs text-slate-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
            {articles.map((a) => (
              <Command.Item key={`${a.doc.doc_id}#${a.anchor}`} value={`${a.label} ${a.doc.decision_no} ${a.doc.doc_id}#${a.anchor}`} onSelect={() => goDoc(a.doc.doc_id, a.anchor)} className="cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-800 data-[selected=true]:bg-brand-50 dark:text-slate-100 dark:data-[selected=true]:bg-slate-800">
                {a.label} <span className="text-slate-500">· {a.doc.decision_no}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        <Command.Group heading="Trang" className="text-xs text-slate-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
          {[...NAV, { href: "/regulations/graph", label: "Đồ thị văn bản" }].map((n) => (
            <Command.Item key={n.href} value={`trang ${n.label} ${n.href}`} onSelect={() => { router.push(n.href); close(); }} className="cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-800 data-[selected=true]:bg-brand-50 dark:text-slate-100 dark:data-[selected=true]:bg-slate-800">
              {n.label}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
      <p className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-700">↑↓ chọn · Enter mở · Esc đóng</p>
    </Command.Dialog>
  );
}
