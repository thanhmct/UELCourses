"use client";
import Link from "next/link";
import { useT } from "@/i18n";

const FEATURES = [
  { href: "/today", t: "home.f.today.t", d: "home.f.today.d" },
  { href: "/modules", t: "home.f.modules.t", d: "home.f.modules.d" },
  { href: "/programs", t: "home.f.programs.t", d: "home.f.programs.d" },
  { href: "/timetable", t: "home.f.timetable.t", d: "home.f.timetable.d" },
  { href: "/planner", t: "home.f.planner.t", d: "home.f.planner.d" },
  { href: "/venues", t: "home.f.venues.t", d: "home.f.venues.d" },
  { href: "/equivalents", t: "home.f.equiv.t", d: "home.f.equiv.d" },
  { href: "/regulations", t: "home.f.reg.t", d: "home.f.reg.d" },
];

export default function Home() {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-md bg-brand-600 px-5 py-6 text-white sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-200">{t("home.kicker")}</p>
        <h1 className="mt-2 max-w-2xl text-2xl font-bold leading-tight">{t("home.h1")}</h1>
        <p className="mt-2 max-w-xl text-sm text-brand-100">{t("home.lead")}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/timetable" className="btn bg-white text-brand-700 hover:bg-brand-50">{t("home.ctaTT")}</Link>
          <Link href="/regulations" className="btn border border-white/40 text-white hover:bg-white/10">{t("home.ctaReg")}</Link>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {FEATURES.map((f) => (
          <Link key={f.href} href={f.href} className="card group hover:border-brand-400">
            <h2 className="font-semibold text-brand-700 group-hover:underline dark:text-brand-300">{t(f.t)}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t(f.d)}</p>
          </Link>
        ))}
      </section>
      <section className="card text-sm text-slate-600 dark:text-slate-400">
        <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">{t("home.quick")}</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>{t("home.s1a")}<Link className="text-brand-600 underline" href="/settings">{t("nav.settings")}</Link>{t("home.s1b")}</li>
          <li>{t("home.s2a")}<Link className="text-brand-600 underline" href="/modules">{t("nav.modules")}</Link>{t("home.s2b")}</li>
          <li>{t("home.s3a")}<strong>{t("nav.feedback")}</strong>{t("home.s3b")}</li>
        </ol>
      </section>
    </div>
  );
}
