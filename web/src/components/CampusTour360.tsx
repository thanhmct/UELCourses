"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { useT } from "@/i18n";
import { sceneForRoom, tourUrl } from "@/lib/campusTour";

export function CampusTour360({ room }: { room: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useT();
  const { scene, exact } = sceneForRoom(room);
  const url = tourUrl(scene);

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/60">
      <button
        type="button"
        className="btn-outline flex w-full items-center justify-center gap-2"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Building2 className="size-4" aria-hidden="true" />
        {t(open ? "venues.tour.close" : "venues.tour.open")}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <iframe
            key={room}
            src={url}
            title={`${t("venues.tour.scene", { scene })} — ${room}`}
            loading="lazy"
            allow="fullscreen; gyroscope; accelerometer"
            allowFullScreen
            className="aspect-video w-full rounded-lg border border-slate-200 dark:border-slate-700"
          />
          <div className="flex flex-wrap items-start justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
            <div>
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {t("venues.tour.scene", { scene })}
              </p>
              {!exact && <p>{t("venues.tour.approx")}</p>}
            </div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
            >
              {t("venues.tour.newTab")}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
