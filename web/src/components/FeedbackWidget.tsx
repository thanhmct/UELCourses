"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, APP_VERSION } from "@/lib/api";
import { useT } from "@/i18n";

export const FEEDBACK_CATEGORIES = [
  { value: "bug", labelKey: "fb.cat.bug" },
  { value: "feature", labelKey: "fb.cat.feature" },
  { value: "ux", labelKey: "fb.cat.ux" },
  { value: "data", labelKey: "fb.cat.data" },
  { value: "ai", labelKey: "fb.cat.ai" },
  { value: "other", labelKey: "fb.cat.other" },
];

export function FeedbackWidget() {
  const { t } = useT();
  const page = usePathname();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState("feature");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "queued" | "error">("idle");

  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener("uel:feedback", h);
    return () => window.removeEventListener("uel:feedback", h);
  }, []);

  const reset = () => {
    setRating(0);
    setMessage("");
    setContact("");
    setStatus("idle");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating || !message.trim()) return;
    setStatus("sending");
    try {
      const res = await api.feedback({
        page,
        rating,
        category,
        message: message.trim(),
        ...(contact.trim() ? { contact: contact.trim() } : {}),
        app_version: APP_VERSION,
      });
      setStatus(res.mock ? "queued" : "sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 hidden rounded-full bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-lg hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-300 md:block print:hidden"
        aria-haspopup="dialog"
      >
        {t("fb.button")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fb-title"
            className="card w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id="fb-title" className="text-lg font-semibold">{t("fb.title")}</h2>
              <button className="btn-ghost px-2 py-1" onClick={() => setOpen(false)} aria-label={t("fb.close")}>✕</button>
            </div>
            {status === "sent" || status === "queued" ? (
              <div className="space-y-3">
                <p className="text-sm">{status === "sent" ? t("fb.thanks") : t("fb.thanksQueued")}</p>
                <div className="flex gap-2">
                  <button className="btn-outline" onClick={reset}>{t("fb.another")}</button>
                  <button className="btn-primary" onClick={() => { reset(); setOpen(false); }}>{t("fb.close")}</button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <span className="label">{t("fb.satisfaction")}</span>
                  <div className="flex gap-1" role="radiogroup" aria-label={t("fb.ratingAria")}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        type="button"
                        key={n}
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={t("rev.stars", { n })}
                        onClick={() => setRating(n)}
                        className={`h-9 w-9 rounded-lg text-xl ${n <= rating ? "text-amber-500" : "text-slate-300 dark:text-slate-600"}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="fb-cat">{t("fb.category")}</label>
                  <select id="fb-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {FEEDBACK_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{t(c.labelKey)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="fb-msg">{t("fb.message")}</label>
                  <textarea id="fb-msg" className="input min-h-24" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("fb.messagePh")} required />
                </div>
                <div>
                  <label className="label" htmlFor="fb-contact">{t("fb.contact")}</label>
                  <input id="fb-contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t("fb.contactPh")} />
                </div>
                <p className="text-xs text-slate-500">{t("fb.meta", { page, v: APP_VERSION })}</p>
                {status === "error" && <p className="text-sm text-red-600">{t("fb.error")}</p>}
                <button type="submit" className="btn-primary w-full" disabled={!rating || !message.trim() || status === "sending"}>
                  {status === "sending" ? t("fb.sending") : t("fb.submit")}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
