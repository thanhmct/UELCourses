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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePlanner, useSettings } from "@/lib/store";
import { useMyProgramId } from "@/lib/myProgram";
import { isEnglishCourse } from "@/lib/gpa";
import { useMounted } from "@/lib/useMounted";
import { prerequisiteWarnings, suggestReplacements, termCredits } from "@/lib/planner";
import { creditLoad, totalCredits } from "@/lib/credits";
import { api } from "@/lib/api";
import { Loading, PageHeader } from "@/components/ui";
import { ModuleSearch } from "@/components/ModuleSearch";
import { addModuleToPlanner } from "@/components/ModuleActions";
import { GpaCalculator } from "@/components/GpaCalculator";
import { useT } from "@/i18n";
import { moduleName } from "@/i18n/names";

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
  const { t, lang } = useT();
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
      className={`rounded border p-2.5 text-sm transition ${
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
          aria-label={t("pl.dragAria", { code })}
        >
          ⋮⋮
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`/modules/${encodeURIComponent(code)}`}
              className={`font-mono font-bold hover:underline ${
                done ? "text-emerald-700 line-through dark:text-emerald-300" : "text-brand-700 dark:text-brand-300"
              }`}
            >
              {code}
            </Link>
            <span className="text-xs text-slate-500">· {t("common.credits", { n: m?.credits ?? "?" })}</span>
            {done ? (
              <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{t("pl.doneBadge")}</span>
            ) : isBlocked ? (
              <span className="rounded bg-red-100 px-1.5 text-[10px] font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">{t("pl.blockedBadge")}</span>
            ) : (
              <span className="rounded bg-blue-50 px-1.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">{t("pl.eligible")}</span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300">{m ? moduleName(m, lang) : ""}</div>
        </div>
        <button className="text-xs text-slate-400 hover:text-red-500" onClick={() => p.removeModule(code)} aria-label={t("pl.remove", { code })}>
          ✕
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6 text-xs">
        <label className="flex cursor-pointer items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={done} onChange={() => p.toggleCompleted(code)} className="accent-brand-600" />
          {t("pl.completedCheck")}
        </label>
        {repl.length > 0 && (
          <button className="text-violet-700 hover:underline dark:text-violet-300" onClick={() => setShowRepl((v) => !v)}>
            {t("pl.replCount", { n: repl.length })}
          </button>
        )}
      </div>

      {warn?.length ? (
        <div className="mt-1.5 rounded bg-red-100/70 p-1.5 pl-3 text-xs text-red-800 dark:bg-red-950/60 dark:text-red-200">
          {t("pl.missingPrereq")} <strong>{warn.join(", ")}</strong>
        </div>
      ) : null}

      {showRepl && (
        <ul className="mt-1.5 space-y-1 rounded border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-900">
          {repl.map((e) => (
            <li key={e.code} className="flex items-center justify-between gap-2">
              <span>
                <span className="font-mono">{e.code}</span> · {moduleName(e, lang)} ({t("common.credits", { n: e.credits })})
              </span>
              <button
                className="font-semibold text-brand-600 hover:underline"
                onClick={async () => {
                  const d = (await api.module(e.code)).data;
                  p.replaceModule(code, {
                    code: e.code,
                    name: d?.name ?? e.name,
                    name_en: d?.name_en ?? e.name_en ?? null,
                    credits: d?.credits ?? e.credits,
                    prerequisites: d?.prerequisites ?? [],
                    equivalents: d?.equivalents ?? [{ code, name: m?.name ?? code, credits: m?.credits ?? 0 }],
                  });
                }}
              >
                {t("pl.swap")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PlannerPage() {
  const { t } = useT();
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

  // Danh sách chờ theo CTĐT của người dùng: mọi học phần của CTĐT chưa hoàn thành (HK1 năm 1 → HK3 năm 4).
  const myProgramId = useMyProgramId();
  const englishExempt = useSettings((s) => s.englishCertExempt);
  useEffect(() => {
    if (!myProgramId) return;
    let alive = true;
    api.program(myProgramId).then((r) => {
      if (!alive || !r.data) return;
      const byCode = new Map<string, { code: string; name: string; name_en?: string | null; credits: number }>();
      for (const b of r.data.blocks) for (const m of b.modules) byCode.set(m.code, { code: m.code, name: m.name, name_en: m.name_en, credits: m.credits });
      const exempt = useSettings.getState().englishCertExempt
        ? [...byCode.values()].filter((m) => isEnglishCourse(m.name)).map((m) => m.code)
        : [];
      usePlanner.getState().syncProgram([...byCode.values()], exempt);
    });
    return () => {
      alive = false;
    };
  }, [myProgramId, englishExempt]);

  if (!mounted) return <Loading />;

  const allPlanned = [...p.backlog, ...p.terms.flatMap((term) => term.modules)];
  const totalAll = totalCredits(p.terms.flatMap((term) => term.modules).map((c) => ({ credits: p.catalog[c]?.credits ?? 0 })));
  const doneCredits = totalCredits(p.completed.map((c) => ({ credits: p.catalog[c]?.credits ?? 0 })));

  function onDragEnd(e: DragEndEvent) {
    if (e.over) p.move(String(e.active.id), String(e.over.id));
  }

  const tabCls = (on: boolean) =>
    `rounded px-3 py-1.5 text-xs font-semibold transition ${on ? "bg-white text-brand-700 dark:bg-slate-800 dark:text-brand-300" : "text-slate-600 hover:text-slate-900 dark:text-slate-400"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title={t("pl.title")} subtitle={t("pl.subtitle")} />
        <div className="flex gap-1 rounded border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900" role="tablist">
          <button role="tab" aria-selected={activeTab === "board"} onClick={() => setActiveTab("board")} className={tabCls(activeTab === "board")}>
            {t("pl.tabBoard")}
          </button>
          <button role="tab" aria-selected={activeTab === "gpa"} onClick={() => setActiveTab("gpa")} className={tabCls(activeTab === "gpa")}>
            {t("pl.tabGpa")}
          </button>
        </div>
      </div>

      {activeTab === "gpa" ? (
        <GpaCalculator />
      ) : (
        <>
          <div className="card grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <div>
              <p className="label">{t("pl.addWait")}</p>
              <ModuleSearch onPick={(m) => addModuleToPlanner(m)} exclude={allPlanned} />
            </div>
            <div className="text-sm">
              <div>{t("pl.plannedN", { n: totalAll })}</div>
              <div>{t("pl.doneN", { n: doneCredits })}</div>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newTerm.trim()) p.addTerm(newTerm.trim());
                setNewTerm("");
              }}
            >
              <input className="input" placeholder={t("pl.termPh")} value={newTerm} onChange={(e) => setNewTerm(e.target.value)} aria-label={t("pl.termNew")} />
              <button className="btn-primary shrink-0" type="submit">{t("pl.addTerm")}</button>
            </form>
          </div>
          {warnings.length > 0 && (
            <div className="rounded bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" role="alert">
              {t("pl.warnCount", { n: warnings.length })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />{t("pl.legendDone")}</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />{t("pl.legendOk")}</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />{t("pl.legendBlocked")}</span>
          </div>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Column id="backlog" title={t("pl.backlog")} footer={<p className="text-xs text-slate-500">{t("pl.backlogCount", { n: p.backlog.length })}</p>}>
                {p.backlog.length === 0 && <p className="text-xs text-slate-500">{t("pl.backlogEmpty")}</p>}
                {p.backlog.map((c) => <ModuleCard key={c} code={c} />)}
              </Column>
              {p.terms.map((term) => {
                const cr = termCredits(p, term.id);
                const load = creditLoad(cr);
                return (
                  <Column
                    key={term.id}
                    id={term.id}
                    title={<input className="w-full bg-transparent font-semibold outline-none focus:underline" value={term.name} onChange={(e) => p.renameTerm(term.id, e.target.value)} aria-label={t("pl.termName")} />}
                    header={<button className="text-xs text-slate-400 hover:text-red-500" onClick={() => p.removeTerm(term.id)} aria-label={t("pl.removeTerm", { name: term.name })}>✕</button>}
                    footer={
                      <p className={`text-xs font-semibold ${load === "high" ? "text-red-600" : load === "low" ? "text-amber-600" : "text-slate-600 dark:text-slate-300"}`}>
                        {t("pl.termTotal", { n: cr })}
                        {load === "high" ? t("pl.overload") : load === "low" ? t("pl.underload") : ""}
                      </p>
                    }
                  >
                    {term.modules.map((c) => <ModuleCard key={c} code={c} warn={warnMap[c]} />)}
                  </Column>
                );
              })}
            </div>
          </DndContext>
          <p className="text-xs text-slate-500">{t("pl.thresholdNote")}</p>
        </>
      )}
    </div>
  );
}
