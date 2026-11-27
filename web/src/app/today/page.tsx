"use client";

import { PartyPopper } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "@/lib/api";
import { useMounted } from "@/lib/useMounted";
import { useSettings, useTimetable } from "@/lib/store";
import type { ClassSection, Lesson } from "@/lib/types";
import { getOccurrencesByDate, getTimetableOccurrences } from "@/lib/occurrences";
import { Loading } from "@/components/ui";
import { useT } from "@/i18n";
import { moduleName } from "@/i18n/names";
import { formatLecturerName } from "@/lib/lecturers";
import { CampusMap } from "@/components/CampusMap";
import {
  placeForLesson,
  type CampusPlace,
} from "@/lib/campusTour";
import {
  getNextWeekDays,
  getTodayAndTomorrowDays,
  getWeekdayNumber,
} from "./todayDates";
import { getTodayDemoLessons } from "./todayDemo";

interface TodayLessonItem {
  code: string;
  name: string;
  class_code: string;
  lecturer?: string;
  lesson: Lesson;
}

interface MapSelection {
  room: string | null;
  code: string | null;
  name: string | null;
  place: CampusPlace | null;
}

function selectionForLesson(item: TodayLessonItem): MapSelection {
  const room = item.lesson.room?.trim() || null;
  return {
    room,
    code: item.code,
    name: item.name,
    place: placeForLesson(item.code, item.name, room ?? ""),
  };
}

function getNowTimeStrings() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return { current: `${hh}:${mm}`, live: `${hh}:${mm}:${ss}` };
}

export default function TodayPage() {
  const { t, lang } = useT();
  const mounted = useMounted();
  const demoMode =
    mounted &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") === "1";
  const tt = useTimetable();
  const semester = tt.semester;
  const entries = useMemo(() => tt.bySemester[semester] ?? [], [tt.bySemester, semester]);
  const [sections, setSections] = useState<Record<string, ClassSection[]>>({});

  const [activeTab, setActiveTab] = useState<"today" | "next_week">("today");
  const [currentTime, setCurrentTime] = useState<string>("");
  const [liveClock, setLiveClock] = useState<string>("");
  const [mapSelection, setMapSelection] = useState<MapSelection | null>(null);
  const [pickedPlace, setPickedPlace] = useState<CampusPlace | null>(null);
  // Map visibility follows the saved setting (Cài đặt); toggling here saves it too.
  const [showMap, setShowMap] = useState(false);
  const setDefaultShowMap = useSettings((s) => s.setDefaultShowMap);
  const todayRoomColor = useSettings((s) => s.todayRoomColor);

  useEffect(() => {
    setShowMap(useSettings.getState().defaultShowMap);
  }, []);

  const toggleMap = () => {
    const next = !showMap;
    setShowMap(next);
    setDefaultShowMap(next);
  };

  // Live second-by-second clock in local time, safely cleaned up on unmount
  useEffect(() => {
    const updateClock = () => {
      const { current, live } = getNowTimeStrings();
      setCurrentTime(current);
      setLiveClock(live);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch sections for modules in current timetable
  useEffect(() => {
    if (!semester || !entries.length) return;
    const codes = entries.map((e) => e.code);
    Promise.all(codes.map(async (code) => [code, (await api.classes(code, semester)).data] as const)).then((pairs) => {
      setSections(Object.fromEntries(pairs));
    });
  }, [semester, entries]);

  const isSunday = useMemo(() => getWeekdayNumber(new Date()) === 8, []);

  const todayTomorrowDays = useMemo(() => {
    return getTodayAndTomorrowDays(new Date(), lang);
  }, [lang]);

  const nextWeekDays = useMemo(() => {
    return getNextWeekDays(new Date(), lang);
  }, [lang]);

  const displayedDays = activeTab === "today" ? todayTomorrowDays : nextWeekDays;

  // Status helper: past, ongoing, upcoming
  const getLessonStatus = useCallback(
    (l: Lesson, isTargetToday: boolean = true) => {
      if (!isTargetToday || !currentTime) return "upcoming";
      if (currentTime < l.start_time) return "upcoming";
      if (currentTime >= l.start_time && currentTime <= l.end_time) return "ongoing";
      return "past";
    },
    [currentTime],
  );

  const selectedSections = useMemo(
    () =>
      entries
        .filter((e) => !e.hidden && e.class_code)
        .map((e) => sections[e.code]?.find((s) => s.class_code === e.class_code))
        .filter((s): s is ClassSection => !!s),
    [entries, sections],
  );

  const timetableOccurrences = useMemo(
    () => getTimetableOccurrences(selectedSections),
    [selectedSections],
  );

  const occurrencesByDate = useMemo(
    () => getOccurrencesByDate(timetableOccurrences),
    [timetableOccurrences],
  );

  // Group lessons by displayed days
  const daysWithLessons = useMemo(() => {
    return displayedDays.map((dayItem, dayIndex) => {
      if (demoMode) {
        return {
          ...dayItem,
          lessons: getTodayDemoLessons(dayItem, dayIndex, activeTab, lang),
        };
      }

      const occs = occurrencesByDate.get(dayItem.isoDate) ?? [];
      const list: TodayLessonItem[] = occs.map((occ) => ({
        code: occ.module_code,
        name: tt.info[occ.module_code] ? moduleName(tt.info[occ.module_code], lang) : occ.module_code,
        class_code: occ.class_code,
        lecturer: occ.section.lecturer,
        lesson: occ.lesson,
      }));
      return {
        ...dayItem,
        lessons: list,
      };
    });
  }, [activeTab, demoMode, displayedDays, occurrencesByDate, tt.info, lang]);

  // Lessons strictly for today (for Next Class banner)
  const todayDayItem = useMemo(() => {
    return todayTomorrowDays.find((d) => d.isToday) ?? todayTomorrowDays[0];
  }, [todayTomorrowDays]);

  const todayLessons = useMemo(() => {
    if (!todayDayItem) return [];
    if (demoMode) return getTodayDemoLessons(todayDayItem, 0, "today", lang);
    const occs = occurrencesByDate.get(todayDayItem.isoDate) ?? [];
    return occs.map((occ) => ({
      code: occ.module_code,
      name: tt.info[occ.module_code] ? moduleName(tt.info[occ.module_code], lang) : occ.module_code,
      class_code: occ.class_code,
      lecturer: occ.section.lecturer,
      lesson: occ.lesson,
    }));
  }, [demoMode, todayDayItem, occurrencesByDate, tt.info, lang]);

  const nextLesson = useMemo(() => {
    return todayLessons.find((item) => getLessonStatus(item.lesson, true) !== "past") ?? null;
  }, [todayLessons, getLessonStatus]);

  const defaultMapSelection = useMemo<MapSelection>(() => {
    const visibleLesson = daysWithLessons
      .flatMap((day) => day.lessons)
      .find((item) => Boolean(item.lesson.room?.trim()));
    const initialLesson = nextLesson?.lesson.room?.trim() ? nextLesson : visibleLesson;
    return initialLesson
      ? selectionForLesson(initialLesson)
      : { room: null, code: null, name: null, place: null };
  }, [daysWithLessons, nextLesson]);

  const activeSelection = mapSelection ?? defaultMapSelection;
  const activePlace = pickedPlace ?? activeSelection.place;

  const selectLesson = (item: TodayLessonItem) => {
    setMapSelection(selectionForLesson(item));
    setPickedPlace(null);
  };

  if (!mounted) return <Loading page />;

  return (
    <div className="w-full lg:min-h-0 lg:flex-1">
      <div
        className={`grid gap-4 lg:h-full lg:grid-rows-[minmax(0,1fr)] ${
          showMap ? "lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.45fr)]" : "lg:grid-cols-[minmax(0,1fr)]"
        }`}
      >
        <section
          aria-label={t("today.title")}
          tabIndex={0}
          className="min-w-0 space-y-4 rounded-md lg:min-h-0 lg:overflow-y-auto lg:overscroll-y-contain lg:p-0.5 lg:pr-2"
        >
          {/* Current or next class. */}
          <div className="rounded-md bg-brand-700 p-4 text-white shadow-sm">
            {nextLesson ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-brand-200">{t("today.subject")}</span>
                  {liveClock && (
                    <span
                      className="rounded bg-brand-800 px-2.5 py-1 font-mono text-sm font-semibold tabular-nums text-white shadow-sm"
                      aria-label="live-clock"
                    >
                      {liveClock}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="mt-2 line-clamp-2 text-lg font-bold leading-snug">
                    {nextLesson.name}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="whitespace-nowrap font-mono text-xl font-bold">
                      {nextLesson.lesson.start_time} – {nextLesson.lesson.end_time}
                    </span>
                    {nextLesson.lesson.room ? (
                      <button
                        type="button"
                        aria-pressed={activeSelection.room === nextLesson.lesson.room}
                        onClick={() => selectLesson(nextLesson)}
                        style={{ "--today-room-color": todayRoomColor } as CSSProperties}
                        className="today-room-color rounded px-1 text-xl font-bold transition hover:bg-white/10"
                      >
                        {t("today.room", { room: nextLesson.lesson.room })}
                      </button>
                    ) : (
                      <span style={{ "--today-room-color": todayRoomColor } as CSSProperties} className="today-room-color text-xl font-bold">
                        {t("today.noRoom")}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 truncate text-xs text-brand-100">
                    <span className="font-mono">{nextLesson.code}</span>
                    <span aria-hidden="true"> · </span>
                    {formatLecturerName(nextLesson.lecturer, lang) || t("today.unknownLecturer")}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-semibold text-white">
                  {todayLessons.length === 0 ? t("today.dayOff") : t("today.freeMsg")}
                </p>
                {liveClock && (
                  <span
                    className="shrink-0 rounded bg-brand-800 px-2.5 py-1 font-mono text-sm font-semibold tabular-nums text-white shadow-sm"
                    aria-label="live-clock"
                  >
                    {liveClock}
                  </span>
                )}
              </div>
            )}
          </div>

      {/* Tabs: "Hôm nay & mai" | "Tuần sau" */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex gap-1 rounded-md border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900"
          role="tablist"
        >
          <button
            role="tab"
            id="tab-today-tomorrow"
            aria-selected={activeTab === "today"}
            aria-controls="panel-schedule"
            onClick={() => setActiveTab("today")}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "today"
                ? "brand-fill shadow-sm"
                : "text-slate-600 hover:bg-white/80 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            {isSunday ? t("today.tabTodayOnly") : t("today.tabTodayTomorrow")}
          </button>
          <button
            role="tab"
            id="tab-next-week"
            aria-selected={activeTab === "next_week"}
            aria-controls="panel-schedule"
            onClick={() => setActiveTab("next_week")}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "next_week"
                ? "brand-fill shadow-sm"
                : "text-slate-600 hover:bg-white/80 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            {t("today.tabNextWeek")}
          </button>
        </div>

        <button
          type="button"
          onClick={toggleMap}
          aria-pressed={showMap}
          className="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {showMap ? t("today.hideMap") : t("today.showMap")}
        </button>
      </div>

      {/* Empty days use two compact rows instead of a tall empty card. */}
      <div id="panel-schedule" role="tabpanel" className="space-y-4">
        {daysWithLessons.map((dayItem) => (
          <div key={dayItem.isoDate} className="space-y-1.5">
            {/* Header: thứ + ngày/tháng (ví dụ "Thứ hai, 23/11") */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{dayItem.label}</span>
                {dayItem.isToday && (
                  <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                    {t("today.todayTag")}
                  </span>
                )}
              </h3>
              {dayItem.lessons.length > 0 && (
                <span className="text-xs text-slate-500">
                  {t("today.count", { n: dayItem.lessons.length })}
                </span>
              )}
            </div>

            {dayItem.lessons.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                <PartyPopper className="size-4 text-amber-500" aria-hidden />
                <span>{t("today.noClass")}</span>
              </div>
            ) : (
              <div className="space-y-2">
                {dayItem.lessons.map((item, idx) => {
                  const status = getLessonStatus(item.lesson, dayItem.isToday);
                  const room = item.lesson.room?.trim();
                  const selected = Boolean(
                    room &&
                      activeSelection.code === item.code &&
                      activeSelection.room?.trim().toUpperCase() === room.toUpperCase(),
                  );
                  return (
                    <button
                      type="button"
                      key={`${item.code}-${dayItem.isoDate}-${idx}`}
                      aria-pressed={selected}
                      onClick={() => selectLesson(item)}
                      className={`card w-full border-l-4 p-3 text-left text-sm transition disabled:cursor-default ${
                        status === "ongoing"
                          ? "border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20"
                          : status === "past"
                          ? "border-l-slate-300 opacity-60 dark:border-l-slate-700"
                          : "border-l-brand-600"
                      } ${selected ? "ring-2 ring-brand-500" : ""}`}
                    >
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-bold text-brand-700 dark:text-brand-300">
                          {item.code}
                        </span>
                        <span aria-hidden="true" className="text-slate-400">·</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {item.lesson.start_time} – {item.lesson.end_time}
                        </span>
                        <span aria-hidden="true" className="text-slate-400">·</span>
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100">
                          {room || t("today.none")}
                        </span>
                        {status === "past" && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {t("today.past")}
                          </span>
                        )}
                      </div>
                      <span className="mt-1 block break-words font-semibold text-slate-900 dark:text-white">
                        {item.name}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">
                        {formatLecturerName(item.lecturer, lang) || t("today.unknownLecturer")}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
        </section>

        {showMap && (
          <aside className="card p-3 lg:flex lg:min-h-0 lg:min-w-0 lg:flex-col">
            <CampusMap
              target={activePlace}
              onPick={setPickedPlace}
              fill
              className="border border-slate-200 dark:border-slate-700 lg:min-h-0 lg:flex-1"
            />
          </aside>
        )}
      </div>
    </div>
  );
}
