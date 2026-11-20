"use client";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { usePlanner } from "@/lib/store";
import { useMounted } from "@/lib/useMounted";
import { prerequisiteWarnings, suggestReplacements, termCredits } from "@/lib/planner";
import { creditLoad, totalCredits } from "@/lib/credits";
import { api } from "@/lib/api";
import { Loading, PageHeader } from "@/components/ui";
import { ModuleSearch } from "@/components/ModuleSearch";
import { addModuleToPlanner } from "@/components/ModuleActions";
import { GpaCalculator } from "@/components/GpaCalculator";

function Column({ id, title, footer, children, header }: { id: string; title: ReactNode; footer?: ReactNode; header?: ReactNode; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`card flex min-h-40 flex-col gap-2 p-3 transition ${isOver ? "border-brand-500 ring-2 ring-brand-200 dark:ring-brand-800" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 font-semibold">{title}</div>
        {header}
      </div>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
      {footer}
    </div>
  );
}

function ModuleCard({ code, warn }: { code: string; warn?: string[] }) {
  const p = usePlanner();
  const m = p.catalog[code];
  const done = p.completed.includes(code);
  const isBlocked = !!(warn && warn.length > 0);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: code });
  const repl = suggestReplacements(p, code);
  const [showRepl, setShowRepl] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}
      className={`rounded-lg border p-2.5 text-sm shadow-sm transition ${
        isDragging ? "z-30 opacity-90 shadow-lg ring-2 ring-brand-400" : ""
      } ${
        done
          ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20"
          : isBlocked
          ? "border-red-300 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/20"
          : "border-slate-200 bg-white hover:border-brand-300 dark:border-slate-700 dark:bg-slate-800"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          {...listeners}
          {...attributes}
          className="cursor-grab touch-none px-1 text-slate-400 active:cursor-grabbing hover:text-slate-600"
          aria-label={`Kéo ${code}`}
        >
          ⋮⋮
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              href={`/modules/${encodeURIComponent(code)}`}
              className={`font-mono font-bold hover:underline ${
                done ? "text-emerald-700 line-through dark:text-emerald-300" : "text-brand-700 dark:text-brand-300"
              }`}
            >
              {code}
            </Link>
            <span className="text-slate-500 text-xs">&middot; {m?.credits ?? "?"} TC</span>

            {done ? (
              <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                ✓ Đã đạt
              </span>
            ) : isBlocked ? (
              <span className="rounded bg-red-100 px-1.5 py-0.2 text-[10px] font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">
                ⚠️ Bị chặn
              </span>
            ) : (
              <span className="rounded bg-blue-50 px-1.5 py-0.2 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                Đủ điều kiện
              </span>
            )}
          </div>
          <div className="truncate text-xs text-slate-600 dark:text-slate-300 mt-0.5">{m?.name}</div>
        </div>
        <button
          className="text-xs text-slate-400 hover:text-red-500"
          onClick={() => p.removeModule(code)}
          aria-label={`Xóa ${code}`}
        >
          ✕
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6 text-xs">
        <label className="flex items-center gap-1 cursor-pointer font-medium text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={done}
            onChange={() => p.toggleCompleted(code)}
            className="accent-brand-600"
          />
          Đã học / hoàn thành
        </label>
        {repl.length > 0 && (
          <button
            className="text-violet-700 hover:underline dark:text-violet-300"
            onClick={() => setShowRepl((v) => !v)}
          >
            {repl.length} môn tương đương
          </button>
        )}
      </div>

      {warn?.length ? (
        <div className="mt-1.5 rounded bg-red-100/70 p-1.5 pl-3 text-xs text-red-800 dark:bg-red-950/60 dark:text-red-200">
          ⚠️ Thiếu môn tiên quyết ở các kỳ trước: <strong>{warn.join(", ")}</strong>
        </div>
      ) : null}

      {showRepl && (
        <ul className="mt-1.5 space-y-1 rounded border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-900">
          {repl.map((e) => (
            <li key={e.code} className="flex items-center justify-between gap-2">
              <span>
                {e.code} &middot; {e.name} ({e.credits} TC)
              </span>
              <button
                className="font-semibold text-brand-600 hover:underline"
                onClick={async () => {
                  const d = (await api.module(e.code)).data;
                  p.replaceModule(code, {
                    code: e.code,
                    name: d?.name ?? e.name,
                    credits: d?.credits ?? e.credits,
                    prerequisites: d?.prerequisites ?? [],
                    equivalents: d?.equivalents ?? [{ code, name: m?.name ?? code, credits: m?.credits ?? 0 }],
                  });
                }}
              >
                Đổi môn
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PlannerPage() {
  const mounted = useMounted();
  const p = usePlanner();
  const [activeTab, setActiveTab] = useState<"board" | "gpa">("board");
  const [newTerm, setNewTerm] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const warnings = useMemo(() => prerequisiteWarnings(p), [p]);
  const warnMap = useMemo(() => Object.fromEntries(warnings.map((w) => [w.code, w.missing])), [warnings]);

  if (!mounted) return <Loading />;

  const allPlanned = [...p.backlog, ...p.terms.flatMap((t) => t.modules)];
  const totalAll = totalCredits(p.terms.flatMap((t) => t.modules).map((c) => ({ credits: p.catalog[c]?.credits ?? 0 })));
  const doneCredits = totalCredits(p.completed.map((c) => ({ credits: p.catalog[c]?.credits ?? 0 })));

  function onDragEnd(e: DragEndEvent) {
    if (e.over) p.move(String(e.active.id), String(e.over.id));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="Kế hoạch học tập"
          subtitle="Kéo môn giữa các học kỳ, kiểm tra ràng buộc tiên quyết và tính điểm GPA tốt nghiệp."
        />
        <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={() => setActiveTab("board")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "board"
                ? "bg-white text-brand-700 shadow-sm dark:bg-slate-800 dark:text-brand-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            📋 Lộ trình các học kỳ
          </button>
          <button
            onClick={() => setActiveTab("gpa")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "gpa"
                ? "bg-white text-brand-700 shadow-sm dark:bg-slate-800 dark:text-brand-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            🎓 Tính điểm GPA & Mục tiêu
          </button>
        </div>
      </div>

      {activeTab === "gpa" ? (
        <GpaCalculator />
      ) : (
        <>
          <div className="card mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
        <div>
          <span className="label">Thêm môn vào danh sách chờ</span>
          <ModuleSearch onPick={(m) => addModuleToPlanner(m)} exclude={allPlanned} />
        </div>
        <div className="text-sm">
          <div>Đã xếp: <strong>{totalAll}</strong> TC</div>
          <div>Đã học: <strong>{doneCredits}</strong> TC</div>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newTerm.trim()) p.addTerm(newTerm.trim());
            setNewTerm("");
          }}
        >
          <input className="input" placeholder="VD: Năm 3 – HK1" value={newTerm} onChange={(e) => setNewTerm(e.target.value)} aria-label="Tên học kỳ mới" />
          <button className="btn-primary shrink-0" type="submit">+ Học kỳ</button>
        </form>
      </div>
      {warnings.length > 0 && (
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" role="alert">
          {warnings.length} môn đang thiếu học phần tiên quyết ở các kỳ trước.
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Đã đạt: Đã hoàn thành môn học
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
          Đủ điều kiện: Thỏa mãn các môn tiên quyết
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          Bị chặn: Xếp vào kỳ khi chưa học môn tiên quyết ở các kỳ trước
        </span>
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Column id="backlog" title="Danh sách chờ" footer={<p className="text-xs text-slate-500">{p.backlog.length} môn</p>}>
            {p.backlog.length === 0 && <p className="text-xs text-slate-500">Thêm môn ở ô tìm kiếm, rồi kéo vào học kỳ.</p>}
            {p.backlog.map((c) => <ModuleCard key={c} code={c} />)}
          </Column>
          {p.terms.map((t) => {
            const cr = termCredits(p, t.id);
            const load = creditLoad(cr);
            return (
              <Column
                key={t.id}
                id={t.id}
                title={<input className="w-full bg-transparent font-semibold outline-none focus:underline" value={t.name} onChange={(e) => p.renameTerm(t.id, e.target.value)} aria-label="Tên học kỳ" />}
                header={<button className="text-xs text-slate-400 hover:text-red-500" onClick={() => p.removeTerm(t.id)} aria-label={`Xóa ${t.name}`}>✕</button>}
                footer={
                  <p className={`text-xs font-semibold ${load === "high" ? "text-red-600" : load === "low" ? "text-amber-600" : "text-slate-600 dark:text-slate-300"}`}>
                    Tổng: {cr} tín chỉ{load === "high" ? " — vượt mức thông thường" : load === "low" ? " — dưới mức tối thiểu thông thường" : ""}
                  </p>
                }
              >
                {t.modules.map((c) => <ModuleCard key={c} code={c} warn={warnMap[c]} />)}
              </Column>
            );
          })}
        </div>
      </DndContext>
      <p className="mt-4 text-xs text-slate-500">Ngưỡng tín chỉ (14–25/kỳ) chỉ mang tính tham khảo; hãy đối chiếu quy chế của khóa bạn ở trang Quy chế.</p>
        </>
      )}
    </div>
  );
}
