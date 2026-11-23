"use client";

import { useEffect, useRef } from "react";
import { Modal } from "@/components/Modal";
import { useT } from "@/i18n";
import type { PlannerAcademicYears } from "@/lib/planner";

function YearPicker({ title, group, choices, selected, describe, onSelect }: {
  title: string;
  group: string;
  choices: number[];
  selected: number;
  describe: (year: number) => string;
  onSelect: (year: number) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 font-semibold text-slate-900 dark:text-white">{title}</legend>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2">
        {choices.map((year) => (
          <label key={year} className={`flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border p-1 text-center text-xs transition sm:min-h-16 sm:p-2 sm:text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-focus ${year === selected ? "brand-fill border-transparent" : "border-slate-300 hover:border-brand-500 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}>
            <input type="radio" name={group} checked={year === selected} onChange={() => onSelect(year)} className="sr-only" />
            <span className="font-semibold tabular-nums">{year}–{year + 1}</span>
            <span className="text-[0.6875rem] leading-tight sm:text-xs">{describe(year)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PlannerYearDialog({ years, currentYear, onChange, onApply, onClose }: {
  years: PlannerAcademicYears;
  currentYear: number;
  onChange: (years: PlannerAcademicYears) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const fields = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fields.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
  }, []);

  const admissionChoices = [...new Set([years.admission, ...Array.from({ length: 7 }, (_, i) => currentYear + 1 - i)])]
    .sort((a, b) => b - a);
  const graduationChoices = [
    ...new Set([years.graduation, ...Array.from({ length: 7 }, (_, i) => currentYear + i)]),
  ].filter((year) => year >= years.admission).sort((a, b) => a - b);

  function graduationDescription(year: number) {
    const difference = year - currentYear;
    if (difference === 0) return t("pl.planThisYear");
    if (difference === 1) return t("pl.planNextYear");
    return t(difference < 0 ? "pl.planPastYear" : "pl.planFutureYear", { n: Math.abs(difference) });
  }

  return (
    <Modal open title={t("pl.planYears")} onClose={onClose} backdropClassName="bg-slate-50/55 dark:bg-slate-950/50" actions={
      <>
        <button type="button" className="btn-outline" onClick={onClose}>{t("common.cancel")}</button>
        <button type="button" className="btn-primary" onClick={onApply}>{t("pl.planApply")}</button>
      </>
    }>
      <div ref={fields} className="max-h-[calc(100dvh-13rem)] space-y-4 overflow-y-auto p-1">
        <YearPicker title={t("pl.planAdmission")} group="planner-admission" choices={admissionChoices}
          selected={years.admission} describe={(year) => year > currentYear
            ? t("pl.planNextYear")
            : t("pl.planStudyYear", { n: currentYear - year + 1 })}
          onSelect={(admission) => onChange({ admission, graduation: Math.max(years.graduation, admission) })} />
        <YearPicker title={t("pl.planGraduation")} group="planner-graduation" choices={graduationChoices}
          selected={years.graduation} describe={graduationDescription}
          onSelect={(graduation) => onChange({ ...years, graduation })} />
        <p className="text-xs tabular-nums text-slate-600 dark:text-slate-400">
          {t("pl.planTermCount", { n: (years.graduation - years.admission + 1) * 3 })}
        </p>
      </div>
    </Modal>
  );
}
