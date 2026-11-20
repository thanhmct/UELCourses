"use client";
import { useState } from "react";
import { COHORTS, LOCAL_KEYS, useSettings, type Theme } from "@/lib/store";
import { useMounted } from "@/lib/useMounted";
import { cohortFromId } from "@/lib/cohort";
import { API_URL, APP_VERSION } from "@/lib/api";
import { Loading, PageHeader } from "@/components/ui";

const MAJORS = [
  "Kinh tế học", "Kinh tế quốc tế", "Kinh doanh quốc tế", "Tài chính – Ngân hàng", "Kế toán", "Kiểm toán",
  "Quản trị kinh doanh", "Marketing", "Hệ thống thông tin quản lý", "Thương mại điện tử", "Luật", "Luật kinh tế", "Toán kinh tế",
];

export default function SettingsPage() {
  const mounted = useMounted();
  const s = useSettings();
  const [cleared, setCleared] = useState(false);
  const [sid, setSid] = useState("");
  const [sidMsg, setSidMsg] = useState("");
  if (!mounted) return <Loading />;

  function clearLocal() {
    if (!window.confirm("Xóa toàn bộ dữ liệu cục bộ (thời khóa biểu, kế hoạch, cài đặt, góp ý chưa gửi)? Không thể hoàn tác.")) return;
    LOCAL_KEYS.forEach((k) => localStorage.removeItem(k));
    setCleared(true);
    setTimeout(() => window.location.reload(), 600);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="Cài đặt" subtitle="Các thiết lập được lưu trên trình duyệt này, không cần đăng nhập." />
      <section className="card space-y-4">
        <div>
          <label className="label" htmlFor="cohort">Khóa tuyển sinh</label>
          <select id="cohort" className="input" value={s.cohort} onChange={(e) => s.setCohort(e.target.value)}>
            <option value="">— Chưa chọn —</option>
            {COHORTS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">Mã khóa = 2 số cuối năm nhập học (K22 = tuyển sinh 2022). Trang Quy chế và Hỏi AI sẽ tự lọc văn bản áp dụng cho khóa này.</p>
        </div>
        <div>
          <label className="label" htmlFor="sid">Tự nhận khóa từ MSSV hoặc mã lớp sinh viên</label>
          <div className="flex gap-2">
            <input id="sid" className="input" value={sid} onChange={(e) => { setSid(e.target.value); setSidMsg(""); }} placeholder="VD: K224040496 hoặc K24404E" autoComplete="off" />
            <button
              type="button"
              className="btn-outline shrink-0"
              onClick={() => {
                const c = cohortFromId(sid);
                if (c) {
                  s.setCohort(c);
                  setSidMsg(`Đã chọn khóa ${c}.`);
                  setSid("");
                } else setSidMsg("Không nhận ra khóa từ mã này.");
              }}
            >
              Nhận khóa
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Chỉ xử lý trên trình duyệt — MSSV không được lưu hay gửi lên máy chủ.</p>
          {sidMsg && <p className="mt-1 text-sm text-brand-700 dark:text-brand-300" role="status">{sidMsg}</p>}
        </div>
        <div>
          <label className="label" htmlFor="major">Ngành</label>
          <input id="major" className="input" list="majors" value={s.major} onChange={(e) => s.setMajor(e.target.value)} placeholder="Chọn hoặc nhập ngành" />
          <datalist id="majors">{MAJORS.map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <fieldset>
          <legend className="label">Giao diện</legend>
          <div className="flex flex-wrap gap-2">
            {([["system", "Theo hệ thống"], ["light", "Sáng"], ["dark", "Tối"]] as [Theme, string][]).map(([v, l]) => (
              <label key={v} className={`btn cursor-pointer border ${s.theme === v ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" : "border-slate-300 dark:border-slate-700"}`}>
                <input type="radio" name="theme" value={v} checked={s.theme === v} onChange={() => s.setTheme(v)} className="sr-only" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
      </section>
      <section className="card space-y-2">
        <h2 className="font-semibold">Dữ liệu cục bộ</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">Thời khóa biểu, kế hoạch và cài đặt chỉ lưu trong trình duyệt (localStorage).</p>
        <button className="btn border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950" onClick={clearLocal}>Xóa dữ liệu cục bộ</button>
        {cleared && <p className="text-sm text-emerald-600" role="status">Đã xóa. Đang tải lại…</p>}
      </section>
      <p className="text-xs text-slate-500">UELPlan phiên bản {APP_VERSION} · API: {API_URL}</p>
    </div>
  );
}
