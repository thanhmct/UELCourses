"use client";
import { useState } from "react";
import { useSettings } from "@/lib/store";
import { useMounted } from "@/lib/useMounted";
import { describeProgramCode, parseProgramCode } from "@/lib/programCode";
import { Modal } from "./Modal";

/** Hộp thoại chào lần đầu: hỏi mã lớp (vd K23406E1). Có thể đổi sau trong Cài đặt. */
export function FirstVisitModal() {
  const mounted = useMounted();
  const programCode = useSettings((s) => s.programCode);
  const prompted = useSettings((s) => s.programPrompted);
  const setProgramCode = useSettings((s) => s.setProgramCode);
  const setPrompted = useSettings((s) => s.setProgramPrompted);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  if (!mounted || prompted || programCode) return null;

  const parsed = value.trim() ? parseProgramCode(value) : null;
  const close = () => setPrompted(true);

  const save = () => {
    if (!parsed) {
      setError("Mã lớp chưa đúng. Ví dụ: K23406E1, K24416A hoặc K23406H.");
      return;
    }
    setProgramCode(parsed.normalized);
    setPrompted(true);
  };

  return (
    <Modal
      open
      title="Chào bạn! Mã lớp của bạn là gì?"
      onClose={close}
      actions={
        <>
          <button type="button" className="btn-outline" onClick={close}>Để sau</button>
          <button type="button" className="btn-primary" onClick={save} disabled={!parsed}>Lưu mã</button>
        </>
      }
    >
      <p>
        Nhập mã lớp của bạn để hệ thống lọc lại theo chương trình đào tạo từ phía nhà trường. Bạn có thể đổi lại trong <strong>Cài đặt</strong>.
      </p>
      <div>
        <label htmlFor="program-code" className="label">Mã lớp</label>
        <input
          id="program-code"
          className="input font-mono text-base uppercase"
          placeholder="VD: K23406E1"
          value={value}
          autoFocus
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && parsed && save()}
          autoComplete="off"
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
        <p className="font-semibold text-slate-800 dark:text-slate-100">Cách đọc mã:</p>
        <p>K23 = khóa 23 · 406 = mã CTĐT · hậu tố: H = Coop · T = cử nhân tài năng · E = hệ tiếng Anh (E1, E2… là thứ tự lớp) · A, B, C = hệ chuẩn (chữ là thứ tự lớp).</p>
        {parsed && (
          <p className="mt-2 font-semibold text-brand-700 dark:text-brand-300">→ {describeProgramCode(parsed)}</p>
        )}
      </div>
    </Modal>
  );
}
