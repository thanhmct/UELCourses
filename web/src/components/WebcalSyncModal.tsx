"use client";

import { useMemo, useState } from "react";
import { encodeTimetable, type SharedTimetable } from "@/lib/shareUrl";

interface Props {
  open: boolean;
  onClose: () => void;
  sharedData: SharedTimetable;
  semName: string;
}

export function WebcalSyncModal({ open, onClose, sharedData, semName }: Props) {
  const [copied, setCopied] = useState(false);

  const { webcalUrl, httpsUrl } = useMemo(() => {
    if (typeof window === "undefined") return { webcalUrl: "", httpsUrl: "" };
    const query = encodeTimetable(sharedData);
    const host = window.location.host;
    const protocol = window.location.protocol;
    const path = `/api/webcal?${query}&name=${encodeURIComponent(`UELPlan ${semName}`)}`;

    const https = `${protocol}//${host}${path}`;
    const webcal = `webcal://${host}${path}`;
    return { webcalUrl: webcal, httpsUrl: https };
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            📅 Đồng bộ Webcal Trực tiếp (Live Sync)
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs text-slate-600 dark:text-slate-300">
          <p>
            Đăng ký (Subscribe) thời khóa biểu vào <strong>Google Calendar</strong>, <strong>Apple Calendar</strong> (iPhone/Mac) hoặc <strong>Outlook</strong>. Khi TKB trên UELPlan thay đổi, lịch ứng dụng trên điện thoại/máy tính sẽ tự động cập nhật!
          </p>

          <div>
            <label className="label">Đường dẫn Webcal (URL Đăng ký)</label>
            <div className="flex gap-2">
              <input
                readOnly
                className="input font-mono text-xs select-all py-1.5"
                value={httpsUrl}
              />
              <button
                type="button"
                className="btn-primary shrink-0 text-xs py-1.5"
                onClick={() => copyLink(httpsUrl)}
              >
                {copied ? "Đã chép!" : "Sao chép URL"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 dark:border-slate-800 dark:bg-slate-950/60">
            <span className="font-semibold text-slate-900 dark:text-white block">
              Hướng dẫn cài đặt nhanh:
            </span>
            <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
              <li>
                <strong>Apple Calendar (iPhone/iPad):</strong> Cài đặt → Lịch → Tài khoản → Thêm tài khoản → Khác → <em>Thêm Lịch đã đăng ký</em> → Dán liên kết trên.
              </li>
              <li>
                <strong>Google Calendar (Máy tính):</strong> Ở thanh bên trái, cạnh <em>Lịch khác</em>, bấm dấu <strong>+</strong> → Chọn <strong>Từ URL (From URL)</strong> → Dán liên kết trên.
              </li>
              <li>
                <strong>Microsoft Outlook:</strong> Thêm lịch → Đăng ký từ web (Subscribe from web) → Dán liên kết trên.
              </li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <a
              href={webcalUrl}
              className="btn-outline text-xs"
              target="_blank"
              rel="noreferrer"
            >
              Mở trực tiếp bằng Apple / Outlook
            </a>
            <button
              onClick={onClose}
              className="btn-primary text-xs"
            >
              Hoàn tất
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
