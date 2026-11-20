"use client";
import { useState } from "react";
import { COHORTS, LOCAL_KEYS, useSettings, type Theme } from "@/lib/store";
import { useMounted } from "@/lib/useMounted";
import { cohortFromId } from "@/lib/cohort";
import { API_URL, APP_VERSION } from "@/lib/api";
import { Loading, PageHeader } from "@/components/ui";
import { useLang, useT, type Lang } from "@/i18n";

const MAJORS = [
  "Kinh tế học", "Kinh tế quốc tế", "Kinh doanh quốc tế", "Tài chính – Ngân hàng", "Kế toán", "Kiểm toán",
  "Quản trị kinh doanh", "Marketing", "Hệ thống thông tin quản lý", "Thương mại điện tử", "Luật", "Luật kinh tế", "Toán kinh tế",
];

export default function SettingsPage() {
  const mounted = useMounted();
  const { t, lang } = useT();
  const s = useSettings();
  const setLang = useLang((x) => x.setLang);
  const [cleared, setCleared] = useState(false);
  const [sid, setSid] = useState("");
  const [sidMsg, setSidMsg] = useState("");
  if (!mounted) return <Loading />;

  function clearLocal() {
    if (!window.confirm(t("settings.confirmClear"))) return;
    LOCAL_KEYS.forEach((k) => localStorage.removeItem(k));
    setCleared(true);
    setTimeout(() => window.location.reload(), 600);
  }

  const themes: [Theme, string][] = [["system", t("settings.themeSystem")], ["light", t("settings.themeLight")], ["dark", t("settings.themeDark")]];
  const langs: [Lang, string][] = [["vi", t("settings.langVi")], ["en", t("settings.langEn")]];

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <section className="card space-y-4">
        <div>
          <label className="label" htmlFor="cohort">{t("settings.cohort")}</label>
          <select id="cohort" className="input" value={s.cohort} onChange={(e) => s.setCohort(e.target.value)}>
            <option value="">{t("settings.cohortNone")}</option>
            {COHORTS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">{t("settings.cohortHelp")}</p>
        </div>
        <div>
          <label className="label" htmlFor="sid">{t("settings.sid")}</label>
          <div className="flex gap-2">
            <input id="sid" className="input" value={sid} onChange={(e) => { setSid(e.target.value); setSidMsg(""); }} placeholder={t("settings.sidPh")} autoComplete="off" />
            <button
              type="button"
              className="btn-outline shrink-0"
              onClick={() => {
                const c = cohortFromId(sid);
                if (c) {
                  s.setCohort(c);
                  setSidMsg(t("settings.detected", { c }));
                  setSid("");
                } else setSidMsg(t("settings.notDetected"));
              }}
            >
              {t("settings.detect")}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">{t("settings.sidPrivacy")}</p>
          {sidMsg && <p className="mt-1 text-sm text-brand-700 dark:text-brand-300" role="status">{sidMsg}</p>}
        </div>
        <div>
          <label className="label" htmlFor="major">{t("settings.major")}</label>
          <input id="major" className="input" list="majors" value={s.major} onChange={(e) => s.setMajor(e.target.value)} placeholder={t("settings.majorPh")} />
          <datalist id="majors">{MAJORS.map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <fieldset>
          <legend className="label">{t("settings.language")}</legend>
          <div className="flex flex-wrap gap-2">
            {langs.map(([v, l]) => (
              <label key={v} className={`btn cursor-pointer border ${lang === v ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" : "border-slate-300 dark:border-slate-700"}`}>
                <input type="radio" name="lang" value={v} checked={lang === v} onChange={() => setLang(v)} className="sr-only" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">{t("settings.theme")}</legend>
          <div className="flex flex-wrap gap-2">
            {themes.map(([v, l]) => (
              <label key={v} className={`btn cursor-pointer border ${s.theme === v ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" : "border-slate-300 dark:border-slate-700"}`}>
                <input type="radio" name="theme" value={v} checked={s.theme === v} onChange={() => s.setTheme(v)} className="sr-only" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
      </section>
      <section className="card space-y-2">
        <h2 className="font-semibold">{t("settings.local")}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("settings.localHelp")}</p>
        <button className="btn border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950" onClick={clearLocal}>{t("settings.clear")}</button>
        {cleared && <p className="text-sm text-emerald-600" role="status">{t("settings.cleared")}</p>}
      </section>
      <p className="text-xs text-slate-500">{t("settings.version", { v: APP_VERSION, api: API_URL })}</p>
    </div>
  );
}
