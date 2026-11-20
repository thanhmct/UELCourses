"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { usePlanner, useTimetable } from "@/lib/store";
import type { ModuleRef } from "@/lib/types";
import { useT } from "@/i18n";

export async function addModuleToPlanner(m: ModuleRef) {
  const detail = (await api.module(m.code)).data;
  usePlanner.getState().addToBacklog({
    code: m.code,
    name: detail?.name ?? m.name,
    name_en: detail?.name_en ?? m.name_en ?? null,
    credits: detail?.credits ?? m.credits,
    prerequisites: detail?.prerequisites ?? [],
    equivalents: detail?.equivalents ?? [],
  });
}

export function ModuleActions({ module, compact = false }: { module: ModuleRef; compact?: boolean }) {
  const addTT = useTimetable((s) => s.addModule);
  const semester = useTimetable((s) => s.semester);
  const { t } = useT();
  const [msg, setMsg] = useState("");
  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 1800);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className={compact ? "btn-outline px-2 py-1 text-xs" : "btn-primary"}
        onClick={() => {
          addTT(module);
          flash(semester ? t("act.addedTT") : t("act.addedTTNoSem"));
        }}
      >
        {t("act.toTT")}
      </button>
      <button
        className={compact ? "btn-outline px-2 py-1 text-xs" : "btn-outline"}
        onClick={async () => {
          await addModuleToPlanner(module);
          flash(t("act.addedPlan"));
        }}
      >
        {t("act.toPlan")}
      </button>
      {msg && <span className="text-xs text-emerald-600 dark:text-emerald-400" role="status">{msg}</span>}
    </div>
  );
}
