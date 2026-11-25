"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { GraduationCap, Palette, Pencil, Search } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { isAnalyticsEnabled, setAnalyticsEnabled } from "@/lib/analytics";
import { COHORTS, LOCAL_KEYS, useSettings, type Theme } from "@/lib/store";
import { describeProgramCodeFull } from "@/lib/programCode";
import { buildProgramLookup } from "@/lib/programLookup";
import { useProgramProfile } from "@/lib/myProgram";
import { appConfirm } from "@/lib/dialog";
import { useMounted } from "@/lib/useMounted";
import { cohortFromId } from "@/lib/cohort";
import { api, API_URL, APP_VERSION } from "@/lib/api";
import type { AuthMeResponse, AuthProvidersResponse } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { Loading, PageHeader } from "@/components/ui";
import { ProgramProfileDialog } from "@/components/ProgramProfileDialog";
import { useProfileDialog, hasGlobalProfileDialogHost } from "@/lib/profileDialog";
import { useLang, useT, type Lang } from "@/i18n";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { useHolidayPreferences } from "@/lib/holidayPreferences";

function ProgramCodeField({ children }: { children: ReactNode }) {
  const { t, lang } = useT();
  const profile = useProgramProfile();
  const setProgramProfile = useSettings((s) => s.setProgramProfile);
  const { isOpen, open, close } = useProfileDialog();
  const hasProfile = !!profile.primaryCode;
  const programsReq = useApi(() => hasProfile ? api.programs({ degree: "all" }) : Promise.resolve({ data: [], mock: false }), [hasProfile]);
  const lookup = useMemo(() => buildProgramLookup(programsReq.data ?? [], []), [programsReq.data]);
  const savedPrograms = [
    { code: profile.primaryCode, parsed: profile.primaryParsed, label: t("profile.primaryBadge") },
    { code: profile.secondaryCode, parsed: profile.secondaryParsed, label: t("profile.secondaryBadge") },
  ];

  return (
    <section className="card min-w-0 space-y-4 rounded-xl sm:p-5" aria-labelledby="settings-programme">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="settings-programme" className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <GraduationCap className="size-5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden />
          {t("profile.title")}
        </h2>
        <button type="button" className={hasProfile ? "btn-outline" : "btn-primary"} onClick={open}>
          {hasProfile ? <Pencil className="size-4" aria-hidden /> : <Search className="size-4" aria-hidden />}
          {t(hasProfile ? "profile.change" : "profile.select")}
        </button>
      </div>

      {hasProfile ? (
        <>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50/80 px-3 dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/60">
            {savedPrograms.filter(({ code }) => code).map(({ code, parsed, label }) => (
              <li key={label} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
                  <span className="rounded bg-white px-1.5 py-0.5 font-mono text-xs font-semibold text-brand-700 dark:bg-slate-900 dark:text-brand-300">{code}</span>
                </div>
                {parsed && (
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {describeProgramCodeFull(parsed, lookup.getName(parsed), lang)}
                  </p>
                )}
                {parsed && parsed.degree !== "dai_hoc" && !programsReq.loading
                  && !lookup.hasCurriculum(parsed.contextualProgramId) && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">{t("profile.lookupByModuleHelp")}</p>
                  )}
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button
              type="button"
              className="cursor-pointer rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
              onClick={() => {
                setProgramProfile("");
                window.dispatchEvent(new CustomEvent("uel:toast", { detail: t("profile.removedToast") }));
              }}
            >
              {t("profile.remove")}
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("profile.subtitle")}</p>
      )}

      <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        {children}
      </div>

      {!hasGlobalProfileDialogHost() && <ProgramProfileDialog open={isOpen} onClose={close} />}
    </section>
  );
}

function AccountSection() {
  const { t } = useT();
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [providers, setProviders] = useState<AuthProvidersResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [m, p] = await Promise.all([api.authMe().catch(() => null), api.authProviders().catch(() => null)]);
      if (!active) return;
      setMe(m);
      setProviders(p);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleLogout = async () => {
    await api.authLogout().catch(() => null);
    setMe({ user: null });
  };

  const user = me?.user ?? null;

  return (
    <section className="card min-w-0 space-y-3 rounded-xl sm:p-5">
      <div className="space-y-1">
        <h2 className="font-semibold">{t("settings.accountTitle")}</h2>
        <p className="text-xs text-slate-500 leading-relaxed">{t("settings.accountDesc")}</p>
      </div>
      {loading ? (
        <Loading compact />
      ) : user ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-slate-700 dark:text-slate-300">
            {t("settings.accountLoggedInAs", { name: user.display_name })}
          </span>
          <button type="button" onClick={handleLogout} className="btn min-h-9 border border-slate-300 px-3 text-xs dark:border-slate-700">
            {t("settings.accountLogout")}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {providers?.google?.ready && (
            <a href={`${API_URL}/api/auth/google/login`} className="btn-primary min-h-9 px-3 text-xs">
              {t("settings.accountLoginGoogle")}
            </a>
          )}
          {providers?.facebook?.ready && (
            <a href={`${API_URL}/api/auth/facebook/login`} className="btn-primary min-h-9 px-3 text-xs">
              {t("settings.accountLoginFacebook")}
            </a>
          )}
          {!providers?.google?.ready && !providers?.facebook?.ready && (
            <p className="text-xs text-slate-400">{t("settings.accountNoProviders")}</p>
          )}
        </div>
      )}
    </section>
  );
}

export default function SettingsPage() {
  const mounted = useMounted();
  const { t, lang } = useT();
  const s = useSettings();
  const profile = useProgramProfile();
  const regulationsCohort = /^K\d{2}$/.test(s.cohort) ? s.cohort : "";
  const setLang = useLang((x) => x.setLang);
  const [cleared, setCleared] = useState(false);
  const [adminAvailable, setAdminAvailable] = useState(false);
  const [analyticsOptIn, setAnalyticsOptIn] = useState(true);
  const [showAnalyticsInfo, setShowAnalyticsInfo] = useState(false);

  useEffect(() => {
    setAnalyticsOptIn(isAnalyticsEnabled());
  }, []);

  useEffect(() => {
    let active = true;
    adminApi
      .checkAdminAvailability()
      .then((ok) => {
        if (active) setAdminAvailable(ok);
      })
      .catch(() => {
        if (active) setAdminAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const [sid, setSid] = useState("");
  const [sidMsg, setSidMsg] = useState("");
  if (!mounted) return <Loading />;

  async function clearLocal() {
    if (!(await appConfirm(t("settings.confirmClear"), { danger: true, okLabel: t("settings.clearData") }))) return;
    LOCAL_KEYS.forEach((k) => localStorage.removeItem(k));
    useHolidayPreferences.persist.clearStorage();
    setCleared(true);
    setTimeout(() => window.location.reload(), 600);
  }

  const themes: [Theme, string][] = [["system", t("settings.themeSystem")], ["light", t("settings.themeLight")], ["dark", t("settings.themeDark")]];
  const langs: [Lang, string][] = [["vi", t("settings.langVi")], ["en", t("settings.langEn")]];

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} actions={
        <a href="#theme" className="btn-outline">
          <Palette className="size-4" aria-hidden /> {t("settings.theme")}
        </a>
      } />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProgramCodeField>
          {profile.degree === "dai_hoc" && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={s.englishCertExempt}
                onChange={(e) => s.setEnglishCertExempt(e.target.checked)}
              />
              <span>
                {t("settings.englishCertExempt")}
              </span>
            </label>
          )}
          <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">
              {t("settings.regulationsCohort")}{regulationsCohort ? ` · ${regulationsCohort}` : ""}
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="label" htmlFor="cohort">{t("settings.cohort")}</label>
                <select id="cohort" className="input" value={regulationsCohort} onChange={(e) => s.setCohort(e.target.value)}>
                  <option value="">{t("settings.cohortNone")}</option>
                  {regulationsCohort && !COHORTS.includes(regulationsCohort) && <option value={regulationsCohort}>{regulationsCohort}</option>}
                  {COHORTS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-500">{t("settings.cohortHelp")}</p>
              </div>
              <div>
                <label className="label" htmlFor="sid">{t("settings.sid")}</label>
                <div className="flex gap-2">
                  <input id="sid" className="input min-w-0" value={sid} onChange={(e) => { setSid(e.target.value); setSidMsg(""); }} placeholder={t("settings.sidPh")} autoComplete="off" />
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
            </div>
          </details>
        </ProgramCodeField>
        <section id="theme" className="card min-w-0 scroll-mt-20 space-y-4 rounded-xl sm:p-5" aria-label={t("settings.theme")} tabIndex={-1}>
          <fieldset className="min-w-0 border-b border-slate-200 pb-4 dark:border-slate-800">
            <legend className="label">{t("settings.language")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {langs.map(([v, l]) => (
                <label key={v} className={`btn min-h-10 min-w-0 cursor-pointer border px-2 text-center focus-within:outline-2 focus-within:outline-brand-focus ${lang === v ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" : "border-slate-300 dark:border-slate-700"}`}>
                  <input type="radio" name="lang" value={v} checked={lang === v} onChange={() => setLang(v)} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="min-w-0">
            <legend className="label">{t("settings.theme")}</legend>
            <div className="grid grid-cols-3 gap-2">
              {themes.map(([v, l]) => (
                <label key={v} className={`btn min-h-10 min-w-0 cursor-pointer border px-2 text-center focus-within:outline-2 focus-within:outline-brand-focus ${s.theme === v ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" : "border-slate-300 dark:border-slate-700"}`}>
                  <input type="radio" name="theme" value={v} checked={s.theme === v} onChange={() => s.setTheme(v)} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
        </section>
      </div>
      <AppearanceSettings />
      <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card min-w-0 space-y-3 rounded-xl sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 id="settings-analytics" className="font-semibold">
                {t("settings.analyticsTitle")}
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                {t("settings.analyticsDesc")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                className="sr-only peer"
                aria-labelledby="settings-analytics"
                checked={analyticsOptIn}
                onChange={(e) => {
                  setAnalyticsOptIn(e.target.checked);
                  setAnalyticsEnabled(e.target.checked);
                }}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:bg-slate-700 peer-checked:bg-brand-600"></div>
            </label>
          </div>

          <button
            type="button"
            onClick={() => setShowAnalyticsInfo((v) => !v)}
            className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
          >
            {t("settings.analyticsLearnMore")} {showAnalyticsInfo ? "▲" : "▼"}
          </button>

          {showAnalyticsInfo && (
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                {t("settings.analyticsLearnMoreTitle")}
              </h3>
              <p>{t("settings.analyticsLearnMoreBody")}</p>
            </div>
          )}
        </section>

        <section className="card min-w-0 space-y-3 rounded-xl sm:p-5">
          <h2 className="font-semibold">{t("settings.local")}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t("settings.localHelp")}</p>
          <button className="btn border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950" onClick={clearLocal}>{t("settings.clear")}</button>
          {cleared && <Loading compact />}
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <p className="min-w-0 wrap-anywhere text-xs text-slate-500">{t("settings.version", { v: APP_VERSION, api: API_URL })}</p>
        {adminAvailable && (
          <a
            href={`${(process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3100").replace(/\/$/, "")}/admin`}
            className="text-xs text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 underline transition-colors"
          >
            {t("settings.admin")}
          </a>
        )}
      </div>
    </div>
  );
}
