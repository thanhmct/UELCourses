"use client";

import { List } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";

export interface SectionJumpItem {
  id: string;
  label: string;
}

/** Điện thoại: icon tròn nổi góc dưới phải, bật lên danh sách đề mục để nhảy nhanh trong trang dài. */
export function SectionJumpMenu({ items }: { items: SectionJumpItem[] }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div ref={ref} className="fixed bottom-20 right-4 z-40 desk:hidden">
      {open && (
        <ul
          role="menu"
          aria-label={t("det.jumpMenu")}
          className="dropdown-scroll absolute bottom-14 right-0 mb-1 max-h-[60vh] w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {items.map((it) => (
            <li key={it.id} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => go(it.id)}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-slate-800"
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("det.jumpMenu")}
        title={t("det.jumpMenu")}
        onClick={() => setOpen((o) => !o)}
        className="btn-primary flex size-12 items-center justify-center rounded-full p-0 shadow-xl"
      >
        <List aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}
