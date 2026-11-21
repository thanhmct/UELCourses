"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { registerDialogHost, type DialogRequest } from "@/lib/dialog";

/** Hộp thoại xác nhận / nhập liệu nổi, dùng chung cho toàn ứng dụng (xem lib/dialog.ts). */
export function AppDialog() {
  const [req, setReq] = useState<DialogRequest | null>(null);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const current = useRef<DialogRequest | null>(null);

  useEffect(() => {
    registerDialogHost((r) => {
      // Yêu cầu mới thay yêu cầu đang mở: trả kết quả "hủy" cho yêu cầu cũ để Promise không treo.
      const prev = current.current;
      if (prev?.kind === "confirm") prev.resolve(false);
      else if (prev) prev.resolve(null);
      current.current = r;
      setReq(r);
      setValue(r.kind === "prompt" ? r.opts.defaultValue ?? "" : "");
      setErr(null);
    });
    return () => registerDialogHost(null);
  }, []);

  const close = (ok: boolean) => {
    const r = current.current;
    if (!r) return;
    if (r.kind === "prompt" && ok) {
      const v = value.trim();
      const msg = r.opts.validate?.(v) ?? null;
      if (msg) return setErr(msg);
      current.current = null;
      setReq(null);
      return r.resolve(v);
    }
    current.current = null;
    setReq(null);
    if (r.kind === "confirm") r.resolve(ok);
    else r.resolve(null);
  };

  const opts = req?.opts;
  const title = opts?.title ?? (req?.kind === "prompt" ? "Nhập thông tin" : "Xác nhận");
  const okLabel = opts?.okLabel ?? (req?.kind === "prompt" ? "Lưu" : "Đồng ý");
  const cancelLabel = opts?.cancelLabel ?? "Hủy";
  const okClass = opts?.danger
    ? "rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
    : "btn-primary";

  return (
    <Modal
      open={!!req}
      title={title}
      onClose={() => close(false)}
      actions={
        <>
          <button type="button" className="btn-outline" onClick={() => close(false)}>
            {cancelLabel}
          </button>
          <button type="button" className={okClass} onClick={() => close(true)}>
            {okLabel}
          </button>
        </>
      }
    >
      {req && (
        <>
          <p className="whitespace-pre-line leading-relaxed">{req.message}</p>
          {req.kind === "prompt" && (
            <div>
              <input
                autoFocus
                className={`input ${err ? "border-red-500" : ""}`}
                value={value}
                placeholder={req.opts.placeholder}
                aria-invalid={!!err}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  setValue(e.target.value);
                  setErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    close(true);
                  }
                }}
              />
              {err && <p className="mt-1 text-xs text-red-600" role="alert">{err}</p>}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
