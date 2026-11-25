"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/i18n";
import { SatisfactionRating } from "./SatisfactionRating";

const SESSION_ROLLED_KEY = "uelpath:satisfaction-session-rolled";
const DEFAULT_PROBABILITY = 1 / 8;
const DEFAULT_DELAY_MS = 3500;

let cachedAlreadyRated: boolean | null = null;

/** Clear in-memory status cache (intended for unit tests). */
export function resetSatisfactionPopupCache(): void {
  cachedAlreadyRated = null;
}

export interface SatisfactionPopupProps {
  delayMs?: number;
  probability?: number;
}

/**
 * Floating quick-rating popup shown randomly (~1/8 chance, max once per browser session)
 * to users/IPs that have never submitted a quick rating according to the backend.
 */
export function SatisfactionPopup({
  delayMs = DEFAULT_DELAY_MS,
  probability = DEFAULT_PROBABILITY,
}: SatisfactionPopupProps = {}) {
  const { t } = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onRated = () => {
      cachedAlreadyRated = true;
    };
    window.addEventListener("uel:satisfaction-rated", onRated);
    return () => window.removeEventListener("uel:satisfaction-rated", onRated);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (cachedAlreadyRated === true) return;
    try {
      if (sessionStorage.getItem(SESSION_ROLLED_KEY)) return;
    } catch {
      /* ignore storage errors */
    }

    let cancelled = false;
    let showTimer: number | null = null;

    api
      .feedbackSatisfactionStatus()
      .then((res) => {
        if (cancelled) return;
        const alreadyRated = Boolean(res?.data?.already_rated);
        cachedAlreadyRated = alreadyRated;
        try {
          sessionStorage.setItem(SESSION_ROLLED_KEY, "1");
        } catch {
          /* ignore storage errors */
        }
        if (alreadyRated) return;
        if (Math.random() < probability) {
          showTimer = window.setTimeout(() => {
            if (!cancelled) setOpen(true);
          }, delayMs);
        }
      })
      .catch(() => {
        /* Fail closed when backend status cannot be checked */
      });

    return () => {
      cancelled = true;
      if (showTimer !== null) window.clearTimeout(showTimer);
    };
  }, [delayMs, probability]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-50 sm:left-auto sm:right-5 sm:w-[22rem] desk:bottom-5">
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="satisfaction-popup-title"
        className="card max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border border-slate-200 p-4 shadow-xl dark:border-slate-700"
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h2 id="satisfaction-popup-title" className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("fb.satisfaction")}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("fb.rating.popupTitle")}</p>
          </div>
          <button
            type="button"
            className="btn-ghost -mr-1 -mt-1 px-2 py-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            onClick={() => setOpen(false)}
            aria-label={t("fb.rating.popupClose")}
          >
            ✕
          </button>
        </div>
        <SatisfactionRating page={pathname || "/"} onDone={() => setOpen(false)} />
      </div>
    </div>
  );
}
