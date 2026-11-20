"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n";

export function PwaRegister() {
  const { t } = useT();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((err) => {
          console.warn("ServiceWorker registration failed: ", err);
        });
      });
    }

    // Monitor Online / Offline status
    const updateOnlineStatus = () => {
      setIsOffline(!navigator.onLine);
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      className="fixed bottom-16 left-4 z-50 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 shadow-lg dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 flex items-center gap-2"
      role="alert"
    >
      <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
      <span>{t("pwa.offlineA")}<strong>{t("pwa.offlineMode")}</strong>{t("pwa.offlineB")}</span>
    </div>
  );
}
