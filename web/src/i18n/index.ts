"use client";
import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMounted } from "@/lib/useMounted";
import { vi } from "./vi";
import { en } from "./en";

export type Lang = "vi" | "en";
export const LANGS: Lang[] = ["vi", "en"];
export const LANG_STORAGE_KEY = "uelcourses-lang";

/** Language choice, persisted in localStorage. Default: Vietnamese. */
export const useLang = create<{ lang: Lang; setLang: (l: Lang) => void }>()(
  persist(
    (set) => ({ lang: "vi", setLang: (lang) => set({ lang }) }),
    { name: LANG_STORAGE_KEY },
  ),
);

const DICTS: Record<Lang, Record<string, string>> = { vi, en };

/** Look up `key` in the dictionary of `lang`, fall back to Vietnamese, then to the key itself. */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? vi[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/**
 * Translation hook. Renders Vietnamese until mounted so server HTML and the first client render match,
 * then switches to the stored language.
 */
export function useT() {
  const mounted = useMounted();
  const stored = useLang((s) => s.lang);
  const lang: Lang = mounted ? stored : "vi";
  const t = useMemo(
    () => (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
  return { t, lang };
}

export const localeOf = (lang: Lang) => (lang === "vi" ? "vi-VN" : "en-GB");

/** Weekday name for the timetable: weekday 2..8 (8 = Sunday). */
export function weekdayName(t: (k: string) => string, weekday: number, short = false): string {
  return t(`wd.${short ? "short" : "long"}.${weekday}`);
}
