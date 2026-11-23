"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  ExternalLink,
  Maximize2,
  Minimize2,
  Minus,
  Sparkles,
  X,
} from "lucide-react";
import { COHORTS, useSettings } from "@/lib/store";
import { useRegChat } from "@/lib/regChatStore";
import { useT } from "@/i18n";
import { useMounted } from "@/lib/useMounted";
import { ChatPanel } from "./ChatPanel";

export function RegulationsChatPopup() {
  const { t } = useT();
  const router = useRouter();
  const path = usePathname();
  const mounted = useMounted();

  const status = useRegChat((s) => s.status);
  const openPopup = useRegChat((s) => s.openPopup);
  const closeChat = useRegChat((s) => s.closeChat);
  const minimizeChat = useRegChat((s) => s.minimizeChat);
  const toggleMaximize = useRegChat((s) => s.toggleMaximize);
  const cohort = useRegChat((s) => s.cohort);
  const setCohort = useRegChat((s) => s.setCohort);
  const mode = useRegChat((s) => s.mode);
  const setMode = useRegChat((s) => s.setMode);

  const savedCohort = useSettings((s) => s.cohort);
  const popupRef = useRef<HTMLDivElement>(null);

  // Sync cohort from settings on initial mount if not explicitly set
  useEffect(() => {
    if (mounted && !cohort && savedCohort) {
      setCohort(savedCohort);
    }
  }, [mounted, cohort, savedCohort, setCohort]);

  // Handle ESC key to minimize or close popup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "closed") {
        e.preventDefault();
        if (status === "maximized") {
          toggleMaximize();
        } else {
          closeChat();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [status, toggleMaximize, closeChat]);

  if (!mounted) return null;

  // Do NOT render anything (neither FAB nor popup) on the full regulations page
  const isFullRegulationsPage = path === "/regulations";
  if (isFullRegulationsPage) {
    return null;
  }

  const isClosed = status === "closed";
  const isMaximized = status === "maximized";

  const handleOpenFullPage = () => {
    closeChat();
    router.push("/regulations");
  };

  return (
    <>
      {/* 1. Nút nổi (FAB) góc dưới bên phải mọi trang */}
      {isClosed && (
        <button
          onClick={openPopup}
          className="fixed bottom-20 right-4 z-40 flex h-13 w-13 p-0 items-center justify-center rounded-full btn-primary shadow-xl transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-brand-300 md:bottom-6 md:right-6 md:h-14 md:w-14"
          aria-label={t("chat.popupFabTooltip")}
          title={t("chat.popupFabTooltip")}
        >
          <div className="relative">
            <Bot className="h-6 w-6 md:h-7 md:w-7" aria-hidden />
            <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-amber-300 animate-pulse" />
          </div>
        </button>
      )}

      {/* 2. Cửa sổ chat pop-up & Cửa sổ phóng to */}
      {!isClosed && (
        <div
          className={
            isMaximized
              ? "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 backdrop-blur-xs"
              : "fixed bottom-0 inset-x-0 z-50 h-[80vh] w-full border-t border-slate-200 bg-white shadow-2xl sm:bottom-6 sm:right-6 sm:left-auto sm:h-[560px] sm:w-[380px] sm:rounded-2xl sm:border dark:border-slate-800 dark:bg-slate-900"
          }
          onClick={isMaximized ? () => toggleMaximize() : undefined}
        >
          <div
            ref={popupRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("chat.popupTitle")}
            onClick={(e) => e.stopPropagation()}
            className={
              isMaximized
                ? "card flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden p-0 shadow-2xl"
                : "flex h-full w-full flex-col overflow-hidden"
            }
          >
            {/* Thanh tiêu đề pop-up */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/90">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
                  <Bot className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <h2 className="text-xs font-bold leading-tight text-slate-800 sm:text-sm dark:text-slate-100">
                    {t("chat.popupTitle")}
                  </h2>
                </div>
              </div>

              {/* Bộ điều khiển tiêu đề */}
              <div className="flex items-center gap-1.5">
                {/* Chọn khóa */}
                <select
                  value={cohort}
                  onChange={(e) => setCohort(e.target.value)}
                  className="input h-7 py-0.5 px-1.5 text-[11px]"
                  aria-label={t("reg.cohortFilter")}
                  title={t("reg.cohortFilter")}
                >
                  <option value="">{t("chat.cohortAll")}</option>
                  {COHORTS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {/* Chế độ trả lời */}
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as "extractive" | "llm")}
                  className="input hidden h-7 py-0.5 px-1.5 text-[11px] sm:inline-block"
                  aria-label={t("chat.mode")}
                  title={t("chat.mode")}
                >
                  <option value="extractive">{t("chat.modeExt")}</option>
                  <option value="llm">{t("chat.modeLlm")}</option>
                </select>

                {/* Mở trang đầy đủ */}
                <button
                  type="button"
                  onClick={handleOpenFullPage}
                  className="btn-ghost rounded p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  title={t("chat.openFullPage")}
                  aria-label={t("chat.openFullPage")}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>

                {/* Phóng to / Thu nhỏ kích thước */}
                <button
                  type="button"
                  onClick={toggleMaximize}
                  className="btn-ghost rounded p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  title={isMaximized ? t("chat.restore") : t("chat.maximize")}
                  aria-label={isMaximized ? t("chat.restore") : t("chat.maximize")}
                >
                  {isMaximized ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* Nút Thu nhỏ xuống FAB */}
                <button
                  type="button"
                  onClick={minimizeChat}
                  className="btn-ghost rounded p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  title={t("chat.minimize")}
                  aria-label={t("chat.minimize")}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>

                {/* Nút Đóng */}
                <button
                  type="button"
                  onClick={closeChat}
                  className="btn-ghost rounded p-1 text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                  title={t("chat.close")}
                  aria-label={t("chat.close")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Nội dung ChatPanel dùng chung */}
            <div className="flex-1 overflow-hidden p-3 sm:p-4">
              <ChatPanel
                cohort={cohort}
                variant={isMaximized ? "maximized" : "popup"}
                showHeader={false}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
