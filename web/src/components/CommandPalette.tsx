"use client";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import type { ModuleSummary } from "@/lib/types";
import { moduleName } from "@/i18n/names";
import { useT } from "@/i18n";
import { NAV } from "./Header";

const usePalette = create<{ open: boolean; set: (v: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openCommandPalette = () => usePalette.getState().set(true);

const GROUP = "text-xs text-slate-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1";
const ITEM = "cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-800 data-[selected=true]:bg-brand-50 dark:text-slate-100 dark:data-[selected=true]:bg-slate-800";

/** Global Ctrl+K palette: find a module (học phần) by code or name and open it. */
export function CommandPalette() {
  const { open, set } = usePalette();
  const { t, lang } = useT();
  const [search, setSearch] = useState("");
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pages = [
    ...NAV.filter((n) => !n.hidden).map((n) => ({ href: n.href, label: t(n.labelKey) })),
    { href: "/feedback", label: t("nav.feedback") },
  ];

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

  // Search modules as the user types (short debounce so each keystroke does not hit the API).
  useEffect(() => {
    const q = search.trim();
    if (!open || !q) {
      setModules([]);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .modules({ q, size: 10 })
        .then((r) => {
          if (!cancelled) {
            setModules(r.data.items);
            setError(null);
          }
        })
        .catch((requestError: unknown) => {
          if (!cancelled) setError(requestError instanceof Error ? requestError.message : String(requestError));
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, open]);

  const close = () => {
    set(false);
    setSearch("");
  };
  const goModule = (code: string) => {
    router.push(`/modules/${encodeURIComponent(code)}`);
    close();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(v) => (v ? set(true) : close())}
      label={t("pal.label")}
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-50 bg-black/40"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder={t("pal.placeholderModules")}
        aria-label={t("pal.placeholderModules")}
        className="w-full border-b border-slate-200 bg-transparent px-4 py-3 text-sm outline-none dark:border-slate-700"
      />
      {error && <p role="status" className="px-4 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      <Command.List className="max-h-[60vh] overflow-y-auto p-2 text-sm">
        {search.trim() && <Command.Empty className="px-3 py-4 text-slate-500">{t("pal.empty")}</Command.Empty>}
        {search.trim() && pages.some((p) => p.label.toLowerCase().includes(search.trim().toLowerCase())) && (
          <Command.Group heading={t("pal.pages")} className={GROUP}>
            {pages
              .filter((p) => p.label.toLowerCase().includes(search.trim().toLowerCase()))
              .map((p) => (
                <Command.Item
                  key={p.href}
                  value={`trang ${p.label} ${p.href}`}
                  onSelect={() => { router.push(p.href); close(); }}
                  className={ITEM}
                >
                  {p.label}
                </Command.Item>
              ))}
          </Command.Group>
        )}
        {modules.length > 0 && (
          <Command.Group heading={t("pal.modules")} className={GROUP}>
            {modules.map((m) => (
              <Command.Item
                key={m.code}
                value={`${m.code} ${m.name} ${m.name_en ?? ""}`}
                onSelect={() => goModule(m.code)}
                className={ITEM}
              >
                <span className="font-mono font-semibold">{m.code}</span>{" "}
                <span className="text-slate-500">— {moduleName(m, lang)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
