"use client";

import { useState, type CSSProperties } from "react";
import { Palette } from "lucide-react";
import { useT } from "@/i18n";
import { brandVariables, DEFAULT_GRADIENT, DEFAULT_PLANNER_TERM_COLOR, normalizeHex, plannerTermColorVariables } from "@/lib/appearance";
import { PALETTE, useSettings } from "@/lib/store";
import { HolidaySettings } from "./HolidaySettings";

interface HexFieldProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

function HexField({ label, value, onChange }: HexFieldProps) {
  const { t } = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const displayed = draft ?? value;
  const normalized = normalizeHex(displayed);
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-xs font-medium">{label}</span>
      <div className="festival-accent-field flex min-h-9 items-center gap-2 rounded-md border px-2 focus-within:outline-2 focus-within:outline-brand-focus">
        <input
          type="color"
          aria-label={t("appearance.picker", { label })}
          value={normalized ?? value}
          onChange={(event) => {
            setDraft(null);
            onChange(event.target.value.toUpperCase());
          }}
          className="size-7 shrink-0 cursor-pointer bg-transparent"
        />
        <input
          type="text"
          aria-label={label}
          title={t("appearance.invalidHex")}
          aria-invalid={normalized === null}
          value={displayed}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            const input = event.target.value;
            const color = normalizeHex(input);
            if (color && /^#?[0-9a-f]{6}$/i.test(input)) {
              setDraft(null);
              if (color !== value) onChange(color);
            } else {
              setDraft(input);
            }
          }}
          onBlur={() => {
            if (normalized && normalized !== value) onChange(normalized);
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="w-0 min-w-0 flex-1 bg-transparent font-mono text-sm outline-none"
        />
      </div>
    </div>
  );
}

function ColorsSettings() {
  const { t } = useT();
  const gradient = useSettings((s) => s.brandGradient) ?? DEFAULT_GRADIENT;
  const slots = useSettings((s) => s.timetableColors);
  const termColor = useSettings((s) => s.plannerTermColor);
  const setGradient = useSettings((s) => s.setBrandGradient);
  const setColor = useSettings((s) => s.setTimetableColor);
  const resetColors = useSettings((s) => s.resetTimetableColors);
  const setPlannerTermColor = useSettings((s) => s.setPlannerTermColor);
  const [start, end] = gradient;

  return (
    <section className="card space-y-4 rounded-xl sm:p-5" aria-labelledby="appearance-colors">
      <h2 id="appearance-colors" className="flex items-center gap-2 text-lg font-semibold">
        <Palette className="size-5 text-brand-ink" aria-hidden="true" />{t("appearance.title")}
      </h2>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <h3 className="text-sm font-semibold">{t("appearance.gradient")}</h3>
          <div className="h-7 rounded-md" style={{ backgroundImage: brandVariables(start, end)["--brand-gradient"] }} aria-hidden="true" />
          <div className="grid grid-cols-2 gap-2">
            <HexField value={start} label={t("appearance.start")} onChange={(color) => setGradient([color, end])} />
            <HexField value={end} label={t("appearance.end")} onChange={(color) => setGradient([start, color])} />
          </div>
          <button type="button" className="btn-outline" onClick={() => setGradient(null)}>{t("appearance.resetGradient")}</button>
        </div>
        <div className="min-w-0 space-y-3 border-t border-slate-200 pt-4 lg:border-l lg:border-t-0 lg:pt-0 lg:pl-5 dark:border-slate-800">
          <h3 className="text-sm font-semibold">{t("appearance.plannerTerm")}</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">{t("appearance.plannerTermHelp")}</p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(10rem,1fr)] sm:items-end">
            <HexField value={termColor} label={t("appearance.plannerTermColor")} onChange={setPlannerTermColor} />
            <div className="planner-term-summary flex h-14 items-center justify-center rounded-lg border font-semibold"
              style={plannerTermColorVariables(termColor) as CSSProperties}>
              {t("appearance.plannerTermPreview")}
            </div>
          </div>
          <button type="button" className="btn-outline" onClick={() => setPlannerTermColor(DEFAULT_PLANNER_TERM_COLOR)}>{t("appearance.resetPlannerTerm")}</button>
        </div>
      </div>
      <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <h3 className="text-sm font-semibold">{t("appearance.timetable")}</h3>
        <p className="text-xs text-slate-600 dark:text-slate-300">{t("appearance.timetableHelp")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {PALETTE.map((color, index) => (
            <HexField key={index} value={slots[index] ?? color} label={t("tt.colorN", { n: index + 1 })}
              onChange={(value) => setColor(index, value)} />
          ))}
        </div>
        <button type="button" className="btn-outline" onClick={resetColors}>{t("appearance.resetPalette")}</button>
      </div>
    </section>
  );
}

export function AppearanceSettings() {
  return <><HolidaySettings /><ColorsSettings /></>;
}
