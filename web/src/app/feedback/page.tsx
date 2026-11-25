"use client";
import { Bug, Code2, Database, Lightbulb, MessageSquarePlus, Star, type LucideIcon } from "lucide-react";
import { FeedbackForm } from "@/components/FeedbackWidget";
import Link from "next/link";
import { SatisfactionRating } from "@/components/SatisfactionRating";
import { useT } from "@/i18n";

const CARDS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Bug, title: "fb.page.reportTitle", body: "fb.page.reportBody" },
  { icon: Lightbulb, title: "fb.page.ideaTitle", body: "fb.page.ideaBody" },
  { icon: Database, title: "fb.page.dataTitle", body: "fb.page.dataBody" },
  { icon: Code2, title: "fb.page.devTitle", body: "fb.page.devBody" },
];

export default function FeedbackPage() {
  const { t } = useT();

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4">
      <div>
        <h1 className="page-title flex items-center gap-2.5">
          <MessageSquarePlus className="h-7 w-7 text-brand-600 dark:text-brand-400" aria-hidden />
          <span>{t("fb.page.titlePrefix")}</span>
          {" "}
          <img
            src="/brand/uelpath-wordmark-tight.webp"
            alt="UELPATH"
            width={166}
            height={29}
            className="h-7 w-auto shrink-0 dark:rounded-md dark:bg-white dark:px-1.5 dark:py-1"
          />
        </h1>
      </div>

      <section className="rounded-md bg-brand-700 p-5 text-white shadow-sm">
        <h2 className="text-lg font-bold">{t("fb.page.heroTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-brand-100">{t("fb.page.heroBody")}</p>
      </section>

      <section aria-labelledby="fb-satisfaction" className="card space-y-3 p-5">
        <SatisfactionRating
          page="/feedback"
          label={
            <h2 id="fb-satisfaction" className="flex shrink-0 items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
              <Star className="h-5 w-5 shrink-0 text-amber-500" aria-hidden />
              {t("fb.satisfaction")}
            </h2>
          }
        />
      </section>

      <section aria-labelledby="fb-courses" className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0 space-y-1">
          <h2 id="fb-courses" className="font-semibold text-slate-900 dark:text-slate-100">
            {t("cr.entryTitle")}
          </h2>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t("cr.entryBody")}</p>
        </div>
        <Link href="/feedback/courses" className="btn-primary shrink-0 px-4 py-1.5 text-sm font-medium">
          {t("cr.entryCta")}
        </Link>
      </section>

      <section aria-labelledby="fb-for-all" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="fb-for-all" className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t("fb.page.forAllTitle")}
          </h2>
          <a href="#fb-form" className="btn-primary">
            {t("fb.page.jumpToForm")}
          </a>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="card space-y-2 p-4">
              <Icon className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden />
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t(title)}</h3>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t(body)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="fb-form" aria-labelledby="fb-form-title" className="space-y-3 scroll-mt-20">
        <h2 id="fb-form-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
          {t("fb.page.formTitle")}
        </h2>
        <div className="card">
          <FeedbackForm page="/feedback" />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("fb.page.privacyNote")}</p>
      </section>
    </div>
  );
}
