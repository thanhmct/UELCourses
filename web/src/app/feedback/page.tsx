"use client";
import { MessageSquarePlus } from "lucide-react";
import { FeedbackForm } from "@/components/FeedbackWidget";
import { BackButton } from "@/components/BackButton";
import { useT } from "@/i18n";

export default function FeedbackPage() {
  const { t } = useT();

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div className="flex items-start gap-3">
        <BackButton href="/" label={t("common.back")} />
        <div>
          <h1 className="page-title flex items-center gap-2.5">
            <MessageSquarePlus className="h-7 w-7 text-brand-600 dark:text-brand-400" aria-hidden />
            <span>{t("fb.title")}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {t("home.s3a") + t("nav.feedback") + t("home.s3b")}
          </p>
        </div>
      </div>

      <div className="card">
        <FeedbackForm page="/feedback" />
      </div>
    </div>
  );
}
