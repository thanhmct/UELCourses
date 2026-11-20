"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Semester } from "@/lib/types";
import { TimetableDialog } from "./TimetableDialog";

export function SemesterPicker({ semesters, selected, onChange }: { semesters: Semester[]; selected: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = semesters.find((s) => s.id === selected);
  const years = [...new Set(semesters.map((s) => String(s.year)))].sort().reverse();
  return <>
    <button type="button" className="btn-outline min-w-0 flex-1 justify-between gap-4 sm:min-w-72 sm:flex-none" aria-haspopup="dialog" onClick={() => setOpen(true)}><span className="text-left"><span className="block text-xs font-normal text-slate-500">Năm học {current?.year || "…"}</span><span className="block">{current ? `Học kỳ ${current.term}${current.is_current ? " · Hiện tại" : ""}` : "Chọn học kỳ"}</span></span><ChevronDown className="h-4 w-4 shrink-0" /></button>
    {open && <TimetableDialog title="Chọn học kỳ" subtitle="Mỗi học kỳ lưu riêng các môn và phương án của bạn." onClose={() => setOpen(false)}>
      <div className="space-y-5 p-5">{years.map((year) => <section key={year}><h3 className="mb-2 text-sm font-semibold text-slate-500">Năm học {year}</h3><div className="grid grid-cols-3 gap-2">{semesters.filter((s) => String(s.year) === year).map((s) => <button key={s.id} type="button" aria-pressed={s.id === selected} className={`rounded-lg border px-3 py-3 text-sm ${s.id === selected ? "border-brand-600 bg-brand-50 font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200" : "border-slate-200 hover:border-brand-400 dark:border-slate-700"}`} onClick={() => { onChange(s.id); setOpen(false); }}>Học kỳ {s.term}{s.is_current && <span className="mt-1 block text-[10px]">Hiện tại</span>}</button>)}</div></section>)}</div>
    </TimetableDialog>}
  </>;
}
