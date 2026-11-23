"use client";
import { useEffect } from "react";
import { useSettings } from "@/lib/store";
import { useLang } from "@/i18n";
import { brandVariables, normalizeHex } from "@/lib/appearance";

/** Applies the `dark` class and the `lang` attribute on <html> from settings. */
export function ThemeApplier() {
  const theme = useSettings((s) => s.theme);
  const gradient = useSettings((s) => s.brandGradient);
  const lang = useLang((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    const start = normalizeHex(gradient?.[0] ?? "");
    const end = normalizeHex(gradient?.[1] ?? "");
    if (!start || !end) return;
    const style = document.documentElement.style;
    const variables = brandVariables(start, end);
    for (const [name, value] of Object.entries(variables)) style.setProperty(name, value);
    return () => {
      for (const name of Object.keys(variables)) style.removeProperty(name);
    };
  }, [gradient]);
  return null;
}

/** Inline script run before paint to avoid a flash of the wrong theme. */
export const themeInitScript = `(function(){try{var s=JSON.parse(localStorage.getItem('uelcourses-settings')||'{}');var t=(s.state&&s.state.theme)||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
