"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useMounted } from "@/lib/useMounted";
import { useTimetable } from "@/lib/store";
import { WEEKDAYS } from "@/lib/periods";
import type { ClassSection, Lesson } from "@/lib/types";
import { Loading, PageHeader } from "@/components/ui";
import { useT, weekdayName } from "@/i18n";
import { moduleName } from "@/i18n/names";

interface TodayLessonItem {
  code: string;
  name: string;
  class_code: string;
  lecturer?: string;
  lesson: Lesson;
  color: string;
}

/** yyyy-mm-dd in local time */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TodayPage() {
  const { t, lang } = useT();
  const mounted = useMounted();
  const tt = useTimetable();
  const semester = tt.semester;
  const entries = useMemo(() => tt.bySemester[semester] ?? [], [tt.bySemester, semester]);
  const [sections, setSections] = useState<Record<string, ClassSection[]>>({});

  // Determine current day of week (JS: 0=Sun, 1=Mon, ..., 6=Sat -> UEL: 2=Mon...8=Sun)
  const now = new Date();
  const jsDay = now.getDay();
  const todayWeekday = jsDay === 0 ? 8 : jsDay + 1;

  const [selectedDay, setSelectedDay] = useState<number>(todayWeekday);
  const [currentTime, setCurrentTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch sections
  useEffect(() => {
    if (!semester || !entries.length) return;
    const codes = entries.map((e) => e.code);
    Promise.all(codes.map(async (code) => [code, (await api.classes(code, semester)).data] as const)).then((pairs) => {
      setSections(Object.fromEntries(pairs));
    });
  }, [semester, entries]);

  // Calendar date of the selected weekday in the current week (for one-off / dated sessions)
  const selectedDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (selectedDay - todayWeekday));
    return isoDay(d);
  }, [selectedDay, todayWeekday]);

  // Lessons for selected day
  const lessonsForDay: TodayLessonItem[] = useMemo(() => {
    const list: TodayLessonItem[] = [];
    for (const e of entries) {
      if (e.hidden || !e.class_code) continue;
      const sec = sections[e.code]?.find((s) => s.class_code === e.class_code);
      if (!sec) continue;
      const modName = tt.info[e.code] ? moduleName(tt.info[e.code], lang) : e.code;

      for (const l of sec.lessons) {
        if (l.weekday !== selectedDay) continue;
        // dated sessions only show on their dates
        if (l.date_start && l.date_end && (selectedDate < l.date_start || selectedDate > l.date_end)) continue;
        list.push({ code: e.code, name: modName, class_code: e.class_code, lecturer: sec.lecturer, lesson: l, color: "#0b4f9c" });
      }
    }
    return list.sort((a, b) => a.lesson.start_period - b.lesson.start_period);
  }, [entries, sections, selectedDay, selectedDate, tt.info, lang]);

  // Status helper: past, ongoing, upcoming
  const getLessonStatus = useCallback(
    (l: Lesson) => {
      if (selectedDay !== todayWeekday || !currentTime) return "upcoming";
      if (currentTime < l.start_time) return "upcoming";
      if (currentTime >= l.start_time && currentTime <= l.end_time) return "ongoing";
      return "past";
    },
    [selectedDay, todayWeekday, currentTime],
  );

  const nextLesson = useMemo(() => {
    if (selectedDay !== todayWeekday) return null;
    return lessonsForDay.find((item) => getLessonStatus(item.lesson) !== "past") ?? null;
  }, [lessonsForDay, selectedDay, todayWeekday, getLessonStatus]);

  if (!mounted) return <Loading />;

  const isToday = selectedDay === todayWeekday;
  const dayName = weekdayName(t, selectedDay);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={t("today.title")} subtitle={t("today.subtitle")} />
        <Link href="/timetable" className="btn-outline text-xs">{t("today.toWeek")}</Link>
      </div>

      {/* Weekday switcher */}
      <div className="flex gap-1 overflow-x-auto rounded-md border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900" role="tablist">
        {WEEKDAYS.map((d) => {
          const isCurrentRealDay = d === todayWeekday;
          const isSelected = d === selectedDay;
          return (
            <button
              key={d}
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedDay(d)}
              className={`min-w-[64px] flex-1 rounded py-1.5 text-center text-xs font-semibold transition ${
                isSelected ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-white/80 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              <div>{weekdayName(t, d)}</div>
              {isCurrentRealDay && (
                <span className={`block text-[10px] font-normal ${isSelected ? "text-brand-100" : "text-brand-600 dark:text-brand-400"}`}>{t("today.todayTag")}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Next class card */}
      {isToday && (
        <div className="rounded-md bg-brand-600 p-4 text-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-brand-200">
                {currentTime ? t("today.nowAt", { t: currentTime }) : t("today.today")}
              </span>
              <h2 className="mt-1 text-xl font-bold">
                {nextLesson
                  ? getLessonStatus(nextLesson.lesson) === "ongoing"
                    ? t("today.ongoingTitle")
                    : t("today.nextTitle")
                  : t("today.doneTitle")}
              </h2>
            </div>
            {nextLesson && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  getLessonStatus(nextLesson.lesson) === "ongoing" ? "bg-emerald-400 text-emerald-950 animate-pulse" : "bg-white/20 text-white"
                }`}
              >
                {getLessonStatus(nextLesson.lesson) === "ongoing" ? t("today.ongoing") : t("today.upcoming")}
              </span>
            )}
          </div>

          {nextLesson ? (
            <div className="mt-3 grid gap-3 border-t border-white/20 pt-3 sm:grid-cols-3">
              <div>
                <span className="text-xs text-brand-200">{t("today.subject")}</span>
                <p className="text-lg font-bold">{nextLesson.name}</p>
                <p className="font-mono text-xs text-brand-200">{nextLesson.code} · {t("today.classLabel", { c: nextLesson.class_code })}</p>
              </div>
              <div>
                <span className="text-xs text-brand-200">{t("today.timePeriod")}</span>
                <p className="text-lg font-bold">{nextLesson.lesson.start_time} – {nextLesson.lesson.end_time}</p>
                <p className="text-xs text-brand-200">{t("today.periodTo", { a: nextLesson.lesson.start_period, b: nextLesson.lesson.end_period })}</p>
              </div>
              <div>
                <span className="text-xs text-brand-200">{t("today.roomLecturer")}</span>
                <p className="text-lg font-bold text-amber-300">{nextLesson.lesson.room ? t("today.room", { room: nextLesson.lesson.room }) : t("today.noRoom")}</p>
                <p className="text-xs text-brand-200">{nextLesson.lecturer || t("today.unknownLecturer")}</p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-brand-100">{t("today.freeMsg")}</p>
          )}
        </div>
      )}

      {/* Schedule list for the selected day */}
      <div className="space-y-3">
        <h3 className="flex items-center justify-between text-base font-bold text-slate-900 dark:text-white">
          <span>{t("today.listTitle", { day: dayName })}</span>
          <span className="text-xs font-normal text-slate-500">{t("today.count", { n: lessonsForDay.length })}</span>
        </h3>

        {lessonsForDay.length === 0 ? (
          <div className="card space-y-2 p-8 text-center text-slate-500">
            <p className="font-semibold text-slate-700 dark:text-slate-200">{t("today.noneDay", { day: dayName })}</p>
            <p className="text-xs text-slate-400">
              {t("today.hintA")}
              <Link href="/modules" className="text-brand-600 underline">{t("nav.modules")}</Link>
              {t("today.hintB")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {lessonsForDay.map((item, idx) => {
              const status = getLessonStatus(item.lesson);
              return (
                <div
                  key={`${item.code}-${idx}`}
                  className={`card border-l-4 ${
                    status === "ongoing"
                      ? "border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20"
                      : status === "past"
                      ? "border-l-slate-300 opacity-60 dark:border-l-slate-700"
                      : "border-l-brand-600"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-brand-700 dark:text-brand-300">{item.code}</span>
                        <span className="text-xs text-slate-400">· {t("today.classLabel", { c: item.class_code })}</span>
                        {status === "ongoing" && (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 animate-pulse dark:bg-emerald-950 dark:text-emerald-300">
                            {t("today.ongoingBadge")}
                          </span>
                        )}
                        {status === "past" && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{t("today.past")}</span>
                        )}
                      </div>
                      <h4 className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{item.name}</h4>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">{item.lesson.start_time} – {item.lesson.end_time}</span>
                      <span className="block text-xs text-slate-500">{t("today.periodRange", { a: item.lesson.start_period, b: item.lesson.end_period })}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                    <div>
                      <span>{t("today.lecturer")} </span>
                      <strong className="text-slate-800 dark:text-slate-200">{item.lecturer || t("today.unknownLecturer")}</strong>
                    </div>
                    <div>
                      <span>{t("today.roomLabel")} </span>
                      <strong className="font-mono text-sm text-brand-700 dark:text-brand-300">{item.lesson.room || t("today.none")}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
