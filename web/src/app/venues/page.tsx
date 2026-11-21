"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSemesters } from "@/lib/semesters";
import { buildingOf, filterVenues } from "@/lib/venues";
import { WEEKDAYS } from "@/lib/periods";
import {
  countOccurrences,
  dateKey,
  defaultMonth,
  monthGrid,
  monthKeyOf,
  monthLabel,
  monthsOf,
  occurrencesByDay,
  type Occurrence,
  type SemesterRange,
} from "@/lib/venueCalendar";
import type { Semester, Venue } from "@/lib/types";
import { Empty, Loading, PageHeader } from "@/components/ui";
import { useT, weekdayName } from "@/i18n";

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Thẻ chi tiết buổi học hiện khi rê chuột vào ô; bấm để giữ lại và mở trang học phần. */
function SessionDetail({ o, room }: { o: Occurrence; room: string }) {
  const { t } = useT();
  const s = o.s;
  const time = s.start_time && s.end_time ? `${s.start_time} – ${s.end_time}` : `Tiết ${s.start_period}–${s.end_period}`;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-brand-200 bg-gradient-to-r from-brand-50 to-white p-3 shadow-sm dark:border-brand-800 dark:from-brand-950/60 dark:to-slate-900">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {s.module_code && <span className="font-mono text-base font-bold text-brand-700 dark:text-brand-300">{s.module_code}</span>}
          {s.class_code && <span className="chip bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">Lớp {s.class_code}</span>}
        </div>
        {s.module_name && <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{s.module_name}</p>}
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {weekdayName(t, s.weekday)}, ngày {fmtDate(o.date)} · Tiết {s.start_period}–{s.end_period} · {time} · Phòng {room}
        </p>
      </div>
      {s.module_code && (
        <Link href={`/modules/${encodeURIComponent(s.module_code)}`} className="btn-primary shrink-0 text-xs">
          Xem học phần →
        </Link>
      )}
    </div>
  );
}

/** Lịch một tháng của phòng: 7 cột (Thứ Hai → Chủ nhật), mỗi ô ngày liệt kê các buổi học. */
function RoomMonth({ venue, sem, month }: { venue: Venue; sem: SemesterRange | undefined; month: string }) {
  const { t } = useT();
  const [hover, setHover] = useState<Occurrence | null>(null);
  // Bấm vào một buổi học thì ghim chi tiết; bấm lại để bỏ ghim.
  const [pinned, setPinned] = useState<Occurrence | null>(null);
  const shown = pinned ?? hover;
  const byDay = useMemo(() => occurrencesByDay(venue.sessions, sem, month), [venue.sessions, sem, month]);
  const cells = useMemo(() => monthGrid(month), [month]);
  const total = countOccurrences(byDay);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{monthLabel(month)}</span>
        <span className="text-xs text-slate-500">{total} buổi trong tháng</span>
      </div>

      <div className="min-h-[92px]">
        {shown ? (
          <SessionDetail o={shown} room={venue.room} />
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700">
            Rê chuột vào một buổi học để xem chi tiết, bấm để giữ lại và mở học phần.
          </p>
        )}
      </div>

      {total === 0 && (
        <p className="text-center text-xs text-slate-500">Phòng này không có buổi học nào trong tháng.</p>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[700px]" onMouseLeave={() => setHover(null)}>
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-500">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">{weekdayName(t, d, true)}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d) => {
              const k = dateKey(d);
              const list = byDay.get(k) ?? [];
              const inMonth = monthKeyOf(d) === month;
              return (
                <div
                  key={k}
                  className={`min-h-[96px] border-l border-t border-slate-200 p-1 dark:border-slate-800 ${
                    inMonth ? "" : "bg-slate-50 text-slate-400 dark:bg-slate-900/40"
                  }`}
                >
                  <div className="text-right text-[11px] font-semibold">{d.getDate()}</div>
                  <div className="mt-0.5 space-y-0.5">
                    {list.map((o, i) => {
                      const active = shown === o;
                      return (
                        <button
                          key={`${k}-${i}`}
                          type="button"
                          onMouseEnter={() => setHover(o)}
                          onClick={() => setPinned(pinned === o ? null : o)}
                          title={`${o.s.module_code ?? t("venues.busy")} · Tiết ${o.s.start_period}–${o.s.end_period}`}
                          className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight transition-colors ${
                            active
                              ? "bg-brand-600 text-white ring-2 ring-brand-400"
                              : "bg-brand-100 text-brand-900 hover:bg-brand-200 dark:bg-brand-900/60 dark:text-brand-100 dark:hover:bg-brand-800"
                          }`}
                        >
                          <span className="font-mono font-semibold">{o.s.module_code ?? t("venues.busy")}</span>{" "}
                          <span className="opacity-80">T{o.s.start_period}–{o.s.end_period}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VenuesPage() {
  const { t } = useT();
  const sems = useSemesters();
  const [semester, setSemester] = useState("");
  const [monthPick, setMonthPick] = useState<string | null>(null);
  useEffect(() => {
    if (!semester && sems.data?.length) setSemester((sems.data.find((s) => s.is_current) ?? sems.data[0]).id);
  }, [sems.data, semester]);

  const semObj: Semester | undefined = sems.data?.find((s) => s.id === semester);
  // Các tháng của học kỳ; thiếu ngày học kỳ thì chỉ hiện tháng hiện tại.
  const months = useMemo(() => monthsOf(semObj), [semObj]);
  const monthOptions = useMemo(() => (months.length ? months : [monthKeyOf(new Date())]), [months]);
  const month = monthPick && monthOptions.includes(monthPick) ? monthPick : defaultMonth(monthOptions);
  const monthIdx = monthOptions.indexOf(month);

  const venues = useApi(
    () => (semester ? api.venues(undefined, semester) : Promise.resolve({ data: [] as Venue[], mock: false })),
    [semester],
  );
  const [q, setQ] = useState("");
  const [room, setRoom] = useState<string | null>(null);

  // Toàn bộ phòng (kể cả phòng không có buổi học trong tháng), kèm số buổi trong tháng đang chọn.
  const list = useMemo(() => filterVenues(venues.data ?? [], q), [venues.data, q]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of venues.data ?? []) m.set(v.room, countOccurrences(occurrencesByDay(v.sessions, semObj, month)));
    return m;
  }, [venues.data, semObj, month]);
  const selected = venues.data?.find((v) => v.room === room) ?? null;

  return (
    <div className="space-y-4">
      <PageHeader title={t("venues.title")} subtitle={t("venues.subtitle")} />
      <div className="card grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="vsem">{t("venues.semester")}</label>
          <select
            id="vsem"
            className="input"
            value={semester}
            onChange={(e) => {
              setSemester(e.target.value);
              setMonthPick(null);
            }}
          >
            {sems.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="vmonth">Tháng</label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-outline px-2 py-1"
              onClick={() => setMonthPick(monthOptions[Math.max(0, monthIdx - 1)])}
              disabled={monthIdx <= 0}
              aria-label="Tháng trước"
            >
              ‹
            </button>
            <select id="vmonth" className="input min-w-0" value={month} onChange={(e) => setMonthPick(e.target.value)}>
              {monthOptions.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn-outline px-2 py-1"
              onClick={() => setMonthPick(monthOptions[Math.min(monthOptions.length - 1, monthIdx + 1)])}
              disabled={monthIdx >= monthOptions.length - 1}
              aria-label="Tháng sau"
            >
              ›
            </button>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="vq">{t("venues.find")}</label>
          <input id="vq" className="input" placeholder={t("venues.placeholder")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <section className="card">
          <h2 className="mb-2 font-semibold">{t("venues.listTitle", { n: list.length })}</h2>
          {venues.loading ? <Loading /> : list.length === 0 ? <Empty>{t("venues.noRooms")}</Empty> : (
            <ul className="max-h-[560px] space-y-1 overflow-auto text-sm">
              {list.map((v) => {
                const n = counts.get(v.room) ?? 0;
                return (
                  <li key={v.room}>
                    <button
                      className={`flex w-full justify-between gap-2 rounded px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        room === v.room ? "bg-brand-50 font-semibold dark:bg-brand-900/40" : ""
                      }`}
                      onClick={() => setRoom(v.room)}
                    >
                      <span className="min-w-0 truncate">
                        {v.room} <span className="text-xs text-slate-400">({buildingOf(v.room)})</span>
                      </span>
                      <span className={`shrink-0 text-xs ${n > 0 ? "text-slate-600 dark:text-slate-300" : "text-slate-400"}`}>
                        {t("venues.sessions", { n })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="card min-w-0">
          <h2 className="mb-2 font-semibold">{selected ? t("venues.schedTitle", { room: selected.room }) : t("venues.pick")}</h2>
          {selected ? (
            <RoomMonth key={`${selected.room}-${month}`} venue={selected} sem={semObj} month={month} />
          ) : (
            <Empty>{t("venues.notPicked")}</Empty>
          )}
        </section>
      </div>
    </div>
  );
}
