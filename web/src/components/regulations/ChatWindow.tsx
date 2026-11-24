"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PanelLeft, PanelLeftClose, SquarePen, Trash2 } from "lucide-react";
import { useT } from "@/i18n";
import { useRegChat } from "@/lib/regChatStore";
import { useMounted } from "@/lib/useMounted";
import { ChatPanel } from "./ChatPanel";

export function ChatWindow({ variant = "page" }: { variant?: "page" | "popup" | "maximized" }) {
  const { t } = useT();
  const mounted = useMounted();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [composerVersion, resetComposer] = useState(0);
  const historyId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const newChat = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const activeId = useRegChat((s) => s.activeId);
  const conversations = useRegChat((s) => s.conversations);
  const openConversation = useRegChat((s) => s.openConversation);
  const deleteConversation = useRegChat((s) => s.deleteConversation);
  const wide = variant !== "popup";
  const mobileOnly = wide ? "md:hidden" : "";

  useEffect(() => {
    if (historyOpen) newChat.current?.focus();
  }, [historyOpen]);
  useEffect(() => {
    if (composerVersion) content.current?.querySelector("input")?.focus();
  }, [composerVersion]);

  function choose(id: string | null) {
    openConversation(id);
    setHistoryOpen(false);
    resetComposer((version) => version + 1);
  }

  function closeHistory() {
    setHistoryOpen(false);
    toggle.current?.focus();
  }

  function remove(id: string) {
    if (!window.confirm(t("chat.deleteConfirm"))) return;
    deleteConversation(id);
    if (id === activeId) choose(null);
    else newChat.current?.focus();
  }

  return (
    <div className="relative isolate flex h-full min-h-0 min-w-0 overflow-hidden"
      onKeyDown={(event) => {
        if (event.key === "Escape" && historyOpen && !event.defaultPrevented) {
          event.preventDefault();
          closeHistory();
        }
      }}>
      {historyOpen && (
        <div aria-hidden="true" className={`absolute inset-0 z-10 bg-slate-950/35 ${mobileOnly}`} onClick={closeHistory} />
      )}
      <aside id={historyId} aria-label={t("chat.history")}
        className={`absolute inset-y-0 left-0 z-20 w-60 max-w-[85%] flex-col gap-4 border-r border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900 ${historyOpen ? "flex" : "hidden"} ${wide ? "md:static md:flex md:max-w-none md:shrink-0" : ""}`}>
        <div className="flex items-center gap-1">
          <button type="button" ref={newChat} className="btn-outline flex min-w-0 flex-1 items-center justify-start gap-2 px-2.5 py-2 text-left text-sm"
            onClick={() => choose(null)}>
            <SquarePen aria-hidden="true" className="size-4 shrink-0" />
            {t("chat.newConversation")}
          </button>
          <button type="button" aria-label={t("chat.closeHistory")} title={t("chat.closeHistory")}
            className={`btn-ghost shrink-0 p-1.5 ${mobileOnly}`} onClick={closeHistory}>
            <PanelLeftClose aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <h3 className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{t("chat.history")}</h3>
          {mounted && conversations.length ? (
            <ul className="min-h-0 space-y-1 overflow-y-auto overscroll-contain">
              {conversations.map((conversation) => {
                const title = conversation.messages.find((message) => message.role === "user")?.text ?? t("chat.newConversation");
                const selected = activeId === conversation.id;
                return (
                  <li key={conversation.id} className={`group flex min-w-0 items-center rounded-lg ${selected ? "bg-brand-100 dark:bg-brand-900/50" : "hover:bg-slate-200/70 dark:hover:bg-slate-800"}`}>
                    <button type="button" title={title} aria-current={selected ? "true" : undefined}
                      className="min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-left text-sm" onClick={() => choose(conversation.id)}>
                      {title}
                    </button>
                    <button type="button" className="btn-ghost m-0.5 shrink-0 p-1.5 text-slate-500 hover:text-red-600 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                      aria-label={t("chat.deleteConversation", { title })} onClick={() => remove(conversation.id)}>
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-2 text-xs text-slate-500 dark:text-slate-400">{t("chat.emptyHistory")}</p>
          )}
        </div>
      </aside>
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${variant === "popup" ? "p-3" : "p-3 sm:p-5"}`}>
        <div className={`mb-2 flex items-center gap-2 ${variant === "maximized" ? "md:hidden" : ""}`}>
          <button type="button" ref={toggle} className={`btn-ghost flex items-center gap-1.5 p-1.5 text-xs ${mobileOnly}`}
            aria-controls={historyId} aria-expanded={historyOpen} onClick={() => setHistoryOpen(true)}>
            <PanelLeft aria-hidden="true" className="size-4" />
            {t("chat.openHistory")}
          </button>
          {variant === "page" && <h2 className="min-w-0 font-semibold text-slate-800 dark:text-slate-100">{t("chat.title")}</h2>}
        </div>
        <div ref={content} className="min-h-0 flex-1">
          <ChatPanel key={composerVersion} />
        </div>
      </div>
    </div>
  );
}
