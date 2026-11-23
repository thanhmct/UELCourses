"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { latestEnrollmentCohort, scopeSemesters, useSemesters } from "@/lib/semesters";
import { useProgramProfile } from "@/lib/myProgram";
import { buildingOf, filterVenues } from "@/lib/venues";
import { SemesterPicker } from "@/components/SemesterPicker";
import { CampusTour360 } from "@/components/CampusTour360";
import { CloseIcon } from "@/components/icons/CloseIcon";
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
import { localeOf, useT, weekdayName } from "@/i18n";

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

/**
 * Tô đậm ô ngày theo mật độ sử dụng (số buổi trong ngày)
 */
function getDensityClass(count: number, inMonth: boolean): string {
  if (!inMonth) {
    return "bg-slate-50/60 text-slate-400 dark:bg-slate-900/40 dark:text-slate-600 opacity-60";
  }
  if (count === 0) {
    return "bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50";
  }
  if (count === 1) {
    return "bg-brand-50/50 text-slate-800 dark:bg-brand-950/20 dark:text-slate-200 hover:bg-brand-50/80 dark:hover:bg-brand-950/40";
  }
  if (count === 2) {
    return "bg-brand-100/60 text-slate-900 dark:bg-brand-950/50 dark:text-slate-100 hover:bg-brand-100/90 dark:hover:bg-brand-950/70";
  }
  return "bg-brand-200/60 text-slate-900 dark:bg-brand-900/40 dark:text-slate-100 hover:bg-brand-200/80 dark:hover:bg-brand-900/60";
}

/**
 * Lịch tháng của phòng học theo dạng lưới ~30 ngày (7 cột: T2 ... CN).
 * Mỗi ô thể hiện ngày và chip các buổi học; nhiều buổi hiện "+N".
 * Bấm ô (hoặc rê chuột) mở popover nổi không đẩy layout, liệt kê đầy đủ các buổi.
 * Bỏ hoàn toàn mã lớp khỏi giao diện theo yêu cầu.
 */
function RoomMonth({
  venue,
  sem,
  month,
}: {
  venue: Venue;
  sem: SemesterRange | undefined;
  month: string;
}) {
  const { t, lang } = useT();
  const byDay = useMemo(() => occurrencesByDay(venue.sessions, sem, month), [venue.sessions, sem, month]);
  const cells = useMemo(() => monthGrid(month), [month]);
  const total = countOccurrences(byDay);
  const todayKey = useMemo(() => dateKey(new Date()), []);

  const [pinnedDay, setPinnedDay] = useState<{
    date: Date;
    dateStr: string;
    sessions: Occurrence[];
  } | null>(null);
  const [hoverDay, setHoverDay] = useState<{
    date: Date;
    dateStr: string;
    sessions: Occurrence[];
  } | null>(null);

  const currentDay = pinnedDay ?? hoverDay;

  // Đổi phòng hoặc tháng: đóng popover
  useEffect(() => {
    setPinnedDay(null);
    setHoverDay(null);
  }, [venue.room, month]);

  // Nhấn Escape đóng popover
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinnedDay(null);
        setHoverDay(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="space-y-3">
      {total === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700">
          {t("venues.noSessions")}
        </p>
      )}

      <div className="relative overflow-x-auto">
        <div className="min-w-[680px]" onMouseLeave={() => (!pinnedDay ? setHoverDay(null) : null)}>
          {/* Hàng thứ 7 cột */}
          <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2">
                {weekdayName(t, d, true)}
              </div>
            ))}
          </div>

          {/* Lưới các ô ngày */}
          <div className="grid grid-cols-7 border-l border-t border-slate-200 dark:border-slate-800">
            {cells.map((d) => {
              const k = dateKey(d);
              const list = byDay.get(k) ?? [];
              const inMonth = monthKeyOf(d) === month;
              const isToday = k === todayKey;
              const count = list.length;
              const isSelected = currentDay?.dateStr === k;

              const MAX_CHIPS = 2;
              const visibleChips = list.slice(0, MAX_CHIPS);
              const hiddenCount = count - MAX_CHIPS;

              return (
                <button
                  key={k}
                  type="button"
                  disabled={count === 0}
                  onClick={() => {
                    if (count > 0) {
                      setPinnedDay(pinnedDay?.dateStr === k ? null : { date: d, dateStr: k, sessions: list });
                    }
                  }}
                  onMouseEnter={() => {
                    if (count > 0 && !pinnedDay) {
                      setHoverDay({ date: d, dateStr: k, sessions: list });
                    }
                  }}
                  aria-label={t("venues.dayAria", { day: d.getDate(), sessions: t("venues.sessionsCount", { n: count }) })}
                  className={`relative flex min-h-[92px] flex-col justify-between border-b border-r border-slate-200 p-1.5 text-left transition-colors dark:border-slate-800 ${getDensityClass(
                    count,
                    inMonth,
                  )} ${isToday ? "ring-2 ring-brand-500 ring-inset dark:ring-brand-400" : ""} ${
                    isSelected ? "ring-2 ring-brand-600 dark:ring-brand-300" : ""
                  } ${count > 0 ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold ${
                          isToday
                            ? "font-bold text-brand-600 dark:text-brand-400"
                            : inMonth
                            ? "text-slate-800 dark:text-slate-200"
                            : "text-slate-400 dark:text-slate-600"
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      {count > 0 && (
                        <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                          ({count})
                        </span>
                      )}
                    </div>

                    {count > 0 && (
                      <div className="mt-1 space-y-1">
                        {visibleChips.map((o, idx) => {
                          const s = o.s;
                          return (
                            <div
                              key={`${k}-${idx}`}
                              title={`${s.module_code ?? t("venues.busy")} · ${t("venues.periodOnly", { s: s.start_period, e: s.end_period })}`}
                              className="flex items-center justify-between gap-1 truncate rounded bg-brand-100/90 px-1 py-0.5 text-[10px] leading-tight text-brand-900 dark:bg-brand-900/60 dark:text-brand-100"
                            >
                              <span className="truncate font-mono font-semibold">
                                {s.module_code ?? t("venues.busy")}
                              </span>
                              <span className="shrink-0 opacity-80">
                                T{s.start_period}–{s.end_period}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {hiddenCount > 0 && (
                    <div className="mt-1 flex justify-end">
                      <span className="inline-block rounded bg-brand-200/80 px-1 py-0.2 text-[9px] font-bold text-brand-800 dark:bg-brand-900/80 dark:text-brand-200">
                        +{hiddenCount}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lớp nền mờ khi ghim popover */}
        {pinnedDay && (
          <div
            className="absolute inset-0 z-20 bg-slate-900/10 backdrop-blur-[0.5px]"
            onClick={() => setPinnedDay(null)}
            aria-hidden="true"
          />
        )}

        {/* Popover chi tiết ngày nổi (không đẩy layout) */}
        {currentDay && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              lang === "en"
                ? t("venues.dayDialogAria", { date: fmtDate(currentDay.date) })
                : t("venues.dayDialogAria", { date: fmtDate(currentDay.date) })
            }
            className="absolute inset-x-4 top-10 z-30 mx-auto max-w-lg rounded-xl border border-brand-200 bg-white p-4 shadow-2xl dark:border-brand-800 dark:bg-slate-900"
            onMouseEnter={() => {
              if (!pinnedDay) setHoverDay(currentDay);
            }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-2 dark:border-slate-800">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                  {(() => {
                    const weekday = new Intl.DateTimeFormat(localeOf(lang), { weekday: "long" }).format(currentDay.date);
                    return t("venues.dayHeading", { weekday, date: fmtDate(currentDay.date) });
                  })()}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("venues.schedTitle", { room: venue.room })} · {t("venues.sessionsCount", { n: currentDay.sessions.length })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPinnedDay(null);
                  setHoverDay(null);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label={t("common.close")}
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-2 max-h-[340px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {currentDay.sessions.map((o: Occurrence, idx: number) => {
                const s = o.s;
                const time = s.start_time && s.end_time ? `${s.start_time} – ${s.end_time}` : "";
                const isOneDay = Boolean(s.date_start && s.date_end && s.date_start === s.date_end);

                return (
                  <div
                    key={`${currentDay.dateStr}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-1 last:pb-1"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="chip bg-brand-50 font-semibold text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
                          {t("venues.periodOnly", { s: s.start_period, e: s.end_period })}
                        </span>
                        {time && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            ({time})
                          </span>
                        )}
                        {isOneDay && (
                          <span className="chip bg-amber-50 text-xs text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            {t("tt.oneTime")}
                          </span>
                        )}
                      </div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {s.module_name || s.module_code || t("common.module")}
                      </div>
                    </div>

                    {s.module_code && (
                      <Link
                        href={`/modules/${encodeURIComponent(s.module_code)}`}
                        className="btn-outline shrink-0 text-xs"
                      >
                        {s.module_code} →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VenuesPage() {
  const { t, lang } = useT();
  const sems = useSemesters();
  const profile = useProgramProfile();
  const defaultCohort = latestEnrollmentCohort(sems.globalCurrent ?? undefined);
  const semesters = useMemo(
    () => sems.data ? (profile.primaryParsed ? sems.data : scopeSemesters(sems.data, defaultCohort)) : [],
    [sems.data, profile.primaryParsed, defaultCohort],
  );
  const [semester, setSemester] = useState("");
  const [monthPick, setMonthPick] = useState<string | null>(null);

  useEffect(() => {
    // Học kỳ đang chọn không còn trong danh sách (đổi khóa): chọn lại học kỳ hiện tại.
    if (semesters.length && !semesters.some((s) => s.id === semester)) {
      setSemester((semesters.find((s) => s.is_current) ?? semesters[0]).id);
    }
  }, [semesters, semester]);

  const goToCurrentSemester = () => {
    if (!semesters.length) return;
    const nowIso = new Date().toISOString().slice(0, 10);
    const target =
      semesters.find((s) => s.is_current) ??
      semesters.find((s) => {
        const start = s.teaching_start || s.start_date;
        const end = s.teaching_end || s.end_date;
        return start && end && start <= nowIso && nowIso <= end;
      }) ??
      semesters[0];
    if (target) {
      setSemester(target.id);
      setMonthPick(null);
    }
  };

  const semIdx = semesters.findIndex((s) => s.id === semester);
  const stepSem = (d: number) => {
    const n = semesters[semIdx + d];
    if (n) {
      setSemester(n.id);
      setMonthPick(null);
    }
  };

  const semObj: Semester | undefined = semesters.find((s) => s.id === semester);
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
      <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 transition hover:bg-brand-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-brand-900/50 dark:text-brand-200 dark:hover:bg-brand-800"
              onClick={() => stepSem(-1)}
              disabled={semIdx <= 0}
              aria-label={t("tt.prevSem")}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <SemesterPicker
              semesters={semesters}
              value={semester}
              onChange={(v) => {
                setSemester(v);
                setMonthPick(null);
              }}
              ariaLabel={t("venues.semester")}
              className="min-w-0"
              align="center"
            />
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 transition hover:bg-brand-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-brand-900/50 dark:text-brand-200 dark:hover:bg-brand-800"
              onClick={() => stepSem(1)}
              disabled={semIdx < 0 || semIdx >= semesters.length - 1}
              aria-label={t("tt.nextSem")}
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn-outline h-9 px-3 text-xs whitespace-nowrap shrink-0"
              onClick={goToCurrentSemester}
              title={t("sem.goToCurrentTitle")}
            >
              {t("sem.goToCurrent")}
            </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <section className="card min-h-[480px]" aria-labelledby="venue-list-title">
          <h2 id="venue-list-title" className="mb-2 font-semibold">{t("venues.listTitle", { n: list.length })}</h2>
          <label className="sr-only" htmlFor="vq">{t("venues.find")}</label>
          <input id="vq" type="search" className="input mb-3" placeholder={t("venues.find")}
            value={q} onChange={(e) => setQ(e.target.value)} />
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
        <section className="@container card relative min-h-[480px] min-w-0" aria-labelledby="venue-calendar-title">
          <header className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-slate-100 pb-2 @lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] dark:border-slate-800">
            <h2 id="venue-calendar-title" className="col-start-1 row-start-1 min-w-0 font-semibold text-slate-900 dark:text-slate-100">
              {selected ? t("venues.schedTitle", { room: selected.room }) : t("venues.pick")}
              {selected && <span className="hidden @lg:inline" aria-hidden="true"> ·</span>}
            </h2>
            <div className="col-span-2 col-start-1 row-start-2 flex items-center gap-1 justify-self-center @lg:col-span-1 @lg:col-start-2 @lg:row-start-1">
              <button type="button" className="btn-outline size-9 shrink-0 p-0"
                onClick={() => setMonthPick(monthOptions[monthIdx - 1])} disabled={monthIdx <= 0}
                aria-label={t("venues.prevMonth")}>
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <label className="sr-only" htmlFor="vmonth">{t("venues.month")}</label>
              <select id="vmonth" className="input h-9 w-auto cursor-pointer appearance-none px-2.5 py-1 text-center tabular-nums"
                value={month} onChange={(e) => setMonthPick(e.target.value)}>
                {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m, lang)}</option>)}
              </select>
              <button type="button" className="btn-outline size-9 shrink-0 p-0"
                onClick={() => setMonthPick(monthOptions[monthIdx + 1])} disabled={monthIdx >= monthOptions.length - 1}
                aria-label={t("venues.nextMonth")}>
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
            {selected && (
              <span className="chip col-start-2 row-start-1 justify-self-end bg-brand-100 font-semibold whitespace-nowrap text-brand-800 @lg:col-start-3 dark:bg-brand-950 dark:text-brand-300">
                {t("venues.sessionsCount", { n: counts.get(selected.room) ?? 0 })}
              </span>
            )}
          </header>
          {selected ? (
            <>
              <CampusTour360 room={selected.room} />
              <RoomMonth key={`${selected.room}-${month}`} venue={selected} sem={semObj} month={month} />
            </>
          ) : (
            <Empty>{t("venues.notPicked")}</Empty>
          )}
        </section>
      </div>
    </div>
  );
}
