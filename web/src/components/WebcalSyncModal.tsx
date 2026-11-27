"use client";

import { useMemo, useState } from "react";
import { encodeTimetable, type SharedTimetable } from "@/lib/shareUrl";
import { useT } from "@/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  sharedData: SharedTimetable;
  semName: string;
}

export function WebcalSyncModal({ open, onClose, sharedData, semName }: Props) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  const { webcalUrl, httpsUrl, downloadUrl, googleCalendarUrl } = useMemo(() => {
    if (typeof window === "undefined") {
      return { webcalUrl: "", httpsUrl: "", downloadUrl: "", googleCalendarUrl: "" };
    }
    const query = encodeTimetable(sharedData);
    const host = window.location.host;
    const protocol = window.location.protocol;
    const path = `/api/webcal?${query}&name=${encodeURIComponent(`UELPATH ${semName}`)}`;

    const https = `${protocol}//${host}${path}`;
    const webcal = `webcal://${host}${path}`;
    const download = `${https}&dl=1`;
    const googleCalendar = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(webcal)}`;
    return {
      webcalUrl: webcal,
      httpsUrl: https,
      downloadUrl: download,
      googleCalendarUrl: googleCalendar,
    };
  }, [sharedData, semName]);

  if (!open) return null;

  const copyLink = (url: string) => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="webcal-title"
        className="w-full max-w-lg rounded-md border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <h2 id="webcal-title" className="text-lg font-bold text-slate-900 dark:text-white">{t("webcal.title")}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs text-slate-600 dark:text-slate-300">
          <p>{t("webcal.intro")}</p>

          <div>
            <label className="label" htmlFor="webcal-url">{t("webcal.urlLabel")}</label>
            <div className="flex gap-2">
              <input id="webcal-url" readOnly className="input py-1.5 font-mono text-xs select-all" value={httpsUrl} />
              <button type="button" className="btn-primary shrink-0 py-1.5 text-xs" onClick={() => copyLink(httpsUrl)}>
                {copied ? t("webcal.copied") : t("webcal.copy")}
              </button>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
            <span className="block font-semibold text-slate-900 dark:text-white">{t("webcal.howTo")}</span>
            <ul className="list-disc space-y-1 pl-4 text-slate-600 dark:text-slate-400">
              <li><strong>{t("webcal.apple")}</strong> {t("webcal.appleSteps")}</li>
              <li><strong>{t("webcal.google")}</strong> {t("webcal.googleSteps")}</li>
              <li><strong>{t("webcal.outlook")}</strong> {t("webcal.outlookSteps")}</li>
              <li><strong>{t("webcal.samsung")}</strong> {t("webcal.samsungSteps")}</li>
            </ul>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <a href={googleCalendarUrl} className="btn-outline text-xs" target="_blank" rel="noreferrer">
              {t("webcal.googleDirect")}
            </a>
            <a href={downloadUrl} download="UELPATH-timetable.ics" className="btn-outline text-xs">
              {t("webcal.download")}
            </a>
            <a href={webcalUrl} className="btn-outline text-xs" target="_blank" rel="noreferrer">
              {t("webcal.openDirect")}
            </a>
            <button type="button" onClick={onClose} className="btn-primary text-xs">{t("webcal.done")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}