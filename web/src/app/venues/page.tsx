"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { buildingOf, filterVenues, freeVenues } from "@/lib/venues";
import { PERIOD_COUNT, WEEKDAYS, periodEndTime, periodStartTime, weekdayLabel } from "@/lib/periods";
import type { Venue } from "@/lib/types";
import { Empty, Loading, PageHeader } from "@/components/ui";

function RoomSchedule({ venue }: { venue: Venue }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-center text-[11px]">
        <thead>
          <tr>
            <th className="w-12 py-1 text-slate-400">Tiết</th>
            {WEEKDAYS.map((d) => <th key={d} className="py-1">{weekdayLabel(d, true)}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: PERIOD_COUNT }, (_, i) => i + 1).map((p) => (
            <tr key={p} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-1 text-slate-500">{p}</td>
              {WEEKDAYS.map((d) => {
                const s = venue.sessions.find((x) => x.weekday === d && x.start_period <= p && p <= x.end_period);
                return (
                  <td key={d} className={`border-l border-slate-100 px-1 py-1 dark:border-slate-800 ${s ? "bg-brand-100 text-brand-900 dark:bg-brand-900/60 dark:text-brand-100" : ""}`}>
                    {s && s.start_period === p ? s.module_code ?? "Bận" : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function VenuesPage() {
  const sems = useApi(() => api.semesters(), []);
  const [semester, setSemester] = useState("");
  useEffect(() => {
    if (!semester && sems.data?.length) setSemester((sems.data.find((s) => s.is_current) ?? sems.data[0]).id);
  }, [sems.data, semester]);
  const venues = useApi(() => (semester ? api.venues(undefined, semester) : Promise.resolve({ data: [] as Venue[], mock: false })), [semester]);
  const [q, setQ] = useState("");
  const [room, setRoom] = useState<string | null>(null);
  const [day, setDay] = useState(2);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(3);

  const list = useMemo(() => filterVenues(venues.data ?? [], q), [venues.data, q]);
  const free = useMemo(() => freeVenues(venues.data ?? [], day, Math.min(from, to), Math.max(from, to)), [venues.data, day, from, to]);
  const selected = venues.data?.find((v) => v.room === room) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="Phòng học" subtitle="Tra lịch sử dụng phòng và tìm phòng trống theo khung giờ (dựa trên lịch lớp học phần đã biết)." />
      <div className="card grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="vsem">Học kỳ</label>
          <select id="vsem" className="input" value={semester} onChange={(e) => setSemester(e.target.value)}>
            {sems.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="vq">Tìm phòng</label>
          <input id="vq" className="input" placeholder="VD: B.203" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold">Tìm phòng trống</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="fday">Thứ</label>
            <select id="fday" className="input" value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {WEEKDAYS.map((d) => <option key={d} value={d}>{weekdayLabel(d)}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ffrom">Từ tiết</label>
            <select id="ffrom" className="input" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              {Array.from({ length: PERIOD_COUNT }, (_, i) => i + 1).map((p) => <option key={p} value={p}>Tiết {p} ({periodStartTime(p)})</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="fto">Đến tiết</label>
            <select id="fto" className="input" value={to} onChange={(e) => setTo(Number(e.target.value))}>
              {Array.from({ length: PERIOD_COUNT }, (_, i) => i + 1).map((p) => <option key={p} value={p}>Tiết {p} ({periodEndTime(p)})</option>)}
            </select>
          </div>
        </div>
        {venues.loading ? <Loading /> : free.length === 0 ? (
          <Empty>Không có phòng trống trong khung giờ này.</Empty>
        ) : (
          <div className="flex flex-wrap gap-2">
            {free.map((v) => (
              <button key={v.room} className="chip bg-emerald-100 px-3 py-1 text-sm text-emerald-800 hover:ring-2 hover:ring-emerald-400 dark:bg-emerald-900/40 dark:text-emerald-200" onClick={() => setRoom(v.room)}>
                {v.room}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-500">Chỉ tính các phòng xuất hiện trong lịch học; phòng có thể bận vì hoạt động khác.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <section className="card">
          <h2 className="mb-2 font-semibold">Danh sách phòng ({list.length})</h2>
          {venues.loading ? <Loading /> : list.length === 0 ? <Empty>Không có phòng.</Empty> : (
            <ul className="max-h-[480px] space-y-1 overflow-auto text-sm">
              {list.map((v) => (
                <li key={v.room}>
                  <button
                    className={`flex w-full justify-between rounded-lg px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${room === v.room ? "bg-brand-50 font-semibold dark:bg-brand-900/40" : ""}`}
                    onClick={() => setRoom(v.room)}
                  >
                    <span>{v.room} <span className="text-xs text-slate-400">({buildingOf(v.room)})</span></span>
                    <span className="text-xs text-slate-500">{v.sessions.length} buổi</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card min-w-0">
          <h2 className="mb-2 font-semibold">{selected ? `Lịch sử dụng phòng ${selected.room}` : "Chọn một phòng để xem lịch"}</h2>
          {selected ? <RoomSchedule venue={selected} /> : <Empty>Chưa chọn phòng.</Empty>}
        </section>
      </div>
    </div>
  );
}
