"use client";
import type { ClassSection } from "@/lib/types";
import { lessonLabel } from "@/lib/lessonLabel";
import { formatDateVi } from "@/lib/dates";
import { seatsAvailable } from "@/lib/modules";
import { TimetableDialog } from "./TimetableDialog";

export function ClassPickerDialog({ code, sections, selected, onPick, onClose }: { code: string; sections: ClassSection[]; selected: string | null; onPick: (code: string) => void; onClose: () => void }) {
  return <TimetableDialog title={`Chọn lớp ${code}`} subtitle="Xem tất cả các buổi của lớp trước khi chọn." onClose={onClose}>
    <div className="space-y-3">{sections.map((section) => {
      const seats = seatsAvailable(section);
      return <button key={section.class_code} type="button" aria-pressed={selected === section.class_code} onClick={() => onPick(section.class_code)} className={`w-full rounded-lg border p-4 text-left transition ${selected === section.class_code ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20" : "border-slate-200 hover:border-brand-400 dark:border-slate-700"}`}>
        <span className="flex flex-wrap justify-between gap-2"><strong className="font-mono text-sm text-brand-700 dark:text-brand-300">{section.class_code}</strong><span className="text-xs text-slate-500">{selected === section.class_code ? "Đang chọn · " : ""}{seats === null ? "Chưa có sĩ số" : seats === 0 ? "Hết chỗ" : `Còn ${seats} chỗ`}</span></span>
        <span className="mt-2 block space-y-1 text-sm">{section.lessons.length ? section.lessons.map((lesson, i) => <span key={i} className="block">{lessonLabel(lesson)}{lesson.weeks && <span className="block text-xs text-slate-500">Tuần học: {lesson.weeks}</span>}</span>) : "Chưa xếp lịch"}</span>
        <span className="mt-2 block text-xs text-slate-500">{section.lecturer || "Chưa có giảng viên"}{section.start_date ? ` · ${formatDateVi(section.start_date)} – ${formatDateVi(section.end_date)}` : ""}</span>
      </button>;
    })}</div>
  </TimetableDialog>;
}
