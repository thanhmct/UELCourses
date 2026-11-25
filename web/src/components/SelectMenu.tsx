"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useMaxVisibleItems } from "@/lib/useMaxVisibleItems";

export interface MenuOption {
  value: string;
  /** nhãn trong danh sách */
  label: string;
  /** nhãn hiển thị trên nút khi đang chọn (mặc định = label) */
  display?: string;
  /** nhóm (tiêu đề phân đoạn), vd "Năm học 2026–2027" */
  group?: string;
}

/**
 * Danh sách thả xuống tự vẽ (thay cho <select> của trình duyệt):
 * có tiêu đề nhóm, dấu chọn, hiệu ứng rê chuột, điều khiển bằng bàn phím.
 */
export function SelectMenu({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  options: MenuOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const uid = useId();
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  useMaxVisibleItems(listRef, open);
  const [active, setActive] = useState(0);
  const idx = options.findIndex((o) => o.value === value);
  const current = idx >= 0 ? options[idx] : undefined;

  // Đóng khi bấm ra ngoài.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Giữ mục đang rê/bàn phím luôn nhìn thấy trong danh sách cuộn.
  useEffect(() => {
    if (open) document.getElementById(`${uid}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, uid]);

  const openMenu = () => {
    setActive(Math.max(idx, 0));
    setOpen(true);
  };
  const pick = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
    }
  };

  // Ghép danh sách theo nhóm, giữ thứ tự gốc.
  const rows: ReactElement[] = [];
  let lastGroup: string | undefined;
  options.forEach((o, i) => {
    if (o.group && o.group !== lastGroup) {
      lastGroup = o.group;
      rows.push(
        <li key={`g-${i}`} role="presentation" className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 first:pt-1 dark:text-slate-500">
          {o.group}
        </li>,
      );
    }
    const selected = o.value === value;
    const highlighted = i === active;
    rows.push(
      <li
        key={o.value}
        id={`${uid}-${i}`}
        role="option"
        aria-selected={selected}
        onMouseEnter={() => setActive(i)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => pick(i)}
        className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors desk:gap-6 desk:border-0 ${
          highlighted ? "bg-brand-50 dark:bg-brand-900/40" : ""
        } ${
          selected
            ? "border-brand-300 font-semibold text-brand-700 dark:border-brand-700 dark:text-brand-300"
            : "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200"
        }`}
      >
        <span className="min-w-0 whitespace-normal break-words desk:whitespace-nowrap">{o.label}</span>
        {selected && <Check className="h-4 w-4 shrink-0" aria-hidden />}
      </li>,
    );
  });

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKey}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-focus dark:bg-slate-900 dark:text-slate-100 ${
          open ? "border-brand-500 ring-2 ring-brand-500/20" : "border-slate-200 dark:border-slate-700"
        }`}
      >
        <span className="min-w-0 whitespace-normal break-words text-left desk:truncate">{current ? current.display ?? current.label : "—"}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={`${uid}-list`}
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-2 max-h-80 space-y-1.5 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900 desk:left-1/2 desk:right-auto desk:w-max desk:min-w-full desk:-translate-x-1/2 desk:space-y-0"
        >
          {rows}
        </ul>
      )}
    </div>
  );
}
