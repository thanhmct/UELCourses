"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import { API_URL } from "@/lib/api";
import { flushOfflineQueue } from "@/lib/offlineQueue";

const OFFLINE_NOTICE_DURATION_MS = 5000;

export function PwaRegister() {
  const { t } = useT();
  const [isOffline, setIsOffline] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(false);
  const [queueError, setQueueError] = useState(false);

  useEffect(() => {
    // Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator && process.env.NODE_ENV !== "test") {
      const register = () => {
        navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch((err) => {
          console.warn("ServiceWorker registration failed: ", err);
        });
      };
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }

    const syncQueue = () => void flushOfflineQueue(API_URL);
    const reportQueueFailure = () => {
      setQueueError(true);
      setNoticeVisible(true);
      window.setTimeout(() => {
        setNoticeVisible(false);
        setQueueError(false);
      }, OFFLINE_NOTICE_DURATION_MS);
    };
    syncQueue();
    window.addEventListener("online", syncQueue);
    window.addEventListener("focus", syncQueue);
    window.addEventListener("uel:offline-queue-failed", reportQueueFailure);

    // Monitor Online / Offline status
    const updateOnlineStatus = () => {
      setIsOffline(!navigator.onLine);
    };
    updateOnlineStatus();

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      window.removeEventListener("online", syncQueue);
      window.removeEventListener("focus", syncQueue);
      window.removeEventListener("uel:offline-queue-failed", reportQueueFailure);
    };
  }, []);

  useEffect(() => {
    if (!isOffline) {
      setNoticeVisible(false);
      return;
    }
    setNoticeVisible(true);
    const timer = setTimeout(() => setNoticeVisible(false), OFFLINE_NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [isOffline]);

  if (!noticeVisible) return null;

  return (
    <div
      className="fixed bottom-16 left-4 z-50 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 shadow-lg dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 flex items-center gap-2"
      role={queueError ? "alert" : "status"}
    >
      <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
      <span>{queueError ? t("common.offlineQueueFailure") : <>{t("pwa.offlineA")}<strong>{t("pwa.offlineMode")}</strong>{t("pwa.offlineB")}</>}</span>
    </div>
  );
}
