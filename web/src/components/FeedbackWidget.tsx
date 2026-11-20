"use client";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api, APP_VERSION } from "@/lib/api";

export const FEEDBACK_CATEGORIES = [
  { value: "bug", label: "Báo lỗi" },
  { value: "feature", label: "Đề xuất tính năng" },
  { value: "ux", label: "Giao diện / trải nghiệm" },
  { value: "data", label: "Dữ liệu sai / thiếu" },
  { value: "ai", label: "Câu trả lời AI quy chế" },
  { value: "other", label: "Khác" },
];

export function FeedbackWidget() {
  const page = usePathname();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState("feature");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "queued" | "error">("idle");

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
        className="fixed bottom-4 right-4 z-40 rounded-full bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-300 print:hidden"
        aria-haspopup="dialog"
      >
        Góp ý
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
              <h2 id="fb-title" className="text-lg font-semibold">Góp ý cho UELPlan</h2>
              <button className="btn-ghost px-2 py-1" onClick={() => setOpen(false)} aria-label="Đóng">✕</button>
            </div>
            {status === "sent" || status === "queued" ? (
              <div className="space-y-3">
                <p className="text-sm">
                  {status === "sent"
                    ? "Cảm ơn bạn! Góp ý đã được gửi."
                    : "Cảm ơn bạn! Máy chủ chưa phản hồi nên góp ý được lưu tạm trên trình duyệt."}
                </p>
                <div className="flex gap-2">
                  <button className="btn-outline" onClick={reset}>Gửi góp ý khác</button>
                  <button className="btn-primary" onClick={() => { reset(); setOpen(false); }}>Đóng</button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <span className="label">Mức độ hài lòng</span>
                  <div className="flex gap-1" role="radiogroup" aria-label="Đánh giá 1 đến 5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        type="button"
                        key={n}
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={`${n} sao`}
                        onClick={() => setRating(n)}
                        className={`h-9 w-9 rounded-lg text-xl ${n <= rating ? "text-amber-500" : "text-slate-300 dark:text-slate-600"}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="fb-cat">Loại góp ý</label>
                  <select id="fb-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {FEEDBACK_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="fb-msg">Nội dung</label>
                  <textarea id="fb-msg" className="input min-h-24" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Bạn muốn UELPlan cải thiện điều gì?" required />
                </div>
                <div>
                  <label className="label" htmlFor="fb-contact">Liên hệ (không bắt buộc)</label>
                  <input id="fb-contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Email nếu muốn được phản hồi" />
                </div>
                <p className="text-xs text-slate-500">Trang: {page} · Phiên bản {APP_VERSION}</p>
                {status === "error" && <p className="text-sm text-red-600">Gửi thất bại, vui lòng kiểm tra nội dung.</p>}
                <button type="submit" className="btn-primary w-full" disabled={!rating || !message.trim() || status === "sending"}>
                  {status === "sending" ? "Đang gửi…" : "Gửi góp ý"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
