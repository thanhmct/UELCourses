"use client";
import { useState } from "react";
import { TimetableDialog } from "./TimetableDialog";

export function DraftDialog({ initialName, existingNames, copy, onSave, onClose }: { initialName: string; existingNames: string[]; copy: boolean; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  return <TimetableDialog title={copy ? "Nhân bản phương án" : "Tạo phương án thời khóa biểu"} subtitle={copy ? "Giữ các lớp đã chọn để thử một cách xếp lịch khác." : "Tạo lịch trống trong học kỳ đang xem."} onClose={onClose}>
    <form onSubmit={(e) => { e.preventDefault(); const value = name.trim(); if (!value) return setError("Nhập tên phương án."); if (existingNames.some((n) => n.toLocaleLowerCase("vi") === value.toLocaleLowerCase("vi"))) return setError("Tên này đã có. Hãy chọn tên khác để giữ phương án hiện tại."); onSave(value); }}>
      <label className="label" htmlFor="draft-name">Tên phương án</label>
      <input id="draft-name" className="input" value={name} autoFocus maxLength={80} onChange={(e) => { setName(e.target.value); setError(""); }} aria-invalid={!!error} aria-describedby={error ? "draft-error" : undefined} />
      {error && <p id="draft-error" role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><button type="button" className="btn-outline" onClick={onClose}>Hủy</button><button type="submit" className="btn-primary">{copy ? "Tạo bản sao" : "Tạo phương án"}</button></div>
    </form>
  </TimetableDialog>;
}
