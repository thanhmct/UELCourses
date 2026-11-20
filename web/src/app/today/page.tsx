"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useMounted } from "@/lib/useMounted";
import { useTimetable } from "@/lib/store";
import { WEEKDAYS, weekdayLabel } from "@/lib/periods";
import type { ClassSection, Lesson } from "@/lib/types";
import { Loading, PageHeader } from "@/components/ui";

interface TodayLessonItem {
  code: string;
  name: string;
  class_code: string;
  lecturer?: string;
  lesson: Lesson;
  color: string;
}

export default function TodayPage() {
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
      setCurrentTime(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      );
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

  // Lessons for selected day
  const lessonsForDay: TodayLessonItem[] = useMemo(() => {
    const list: TodayLessonItem[] = [];
    for (const e of entries) {
      if (e.hidden || !e.class_code) continue;
      const sec = sections[e.code]?.find((s) => s.class_code === e.class_code);
      if (!sec) continue;
      const modName = tt.info[e.code]?.name || e.code;

      for (const l of sec.lessons) {
        if (l.weekday === selectedDay) {
          list.push({
            code: e.code,
            name: modName,
            class_code: e.class_code,
            lecturer: sec.lecturer,
            lesson: l,
            color: "#0b4f9c",
          });
        }
      }
    }
    return list.sort((a, b) => a.lesson.start_period - b.lesson.start_period);
  }, [entries, sections, selectedDay, tt.info]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="Lịch học hôm nay"
          subtitle={`Xem nhanh các tiết học trong ngày, phòng học và giảng viên phụ trách.`}
        />
        <div className="flex items-center gap-2 text-xs">
          <Link href="/timetable" className="btn-outline">
            ← Đến Thời khóa biểu tuần
          </Link>
        </div>
      </div>

      {/* Weekday Switcher */}
      <div className="flex overflow-x-auto gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-800 dark:bg-slate-900">
        {WEEKDAYS.map((d) => {
          const isCurrentRealDay = d === todayWeekday;
          const isSelected = d === selectedDay;
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`flex-1 min-w-[70px] rounded-lg py-2 text-center text-xs font-semibold transition ${
                isSelected
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-white/80 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              <div>{weekdayLabel(d)}</div>
              {isCurrentRealDay && (
                <span className={`block text-[10px] font-normal ${isSelected ? "text-brand-100" : "text-brand-600 dark:text-brand-400"}`}>
                  (Hôm nay)
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hero / Next Class Card */}
      {isToday && (
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-600 to-brand-800 p-6 text-white shadow-lg">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-brand-200">
                {currentTime ? `Bây giờ là ${currentTime}` : "Hôm nay"}
              </span>
              <h2 className="mt-1 text-2xl font-black sm:text-3xl">
                {nextLesson ? (
                  getLessonStatus(nextLesson.lesson) === "ongoing"
                    ? "Đang trong giờ học"
                    : "Lớp học tiếp theo"
                ) : (
                  "Đã hết giờ học hôm nay"
                )}
              </h2>
            </div>
            {nextLesson && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  getLessonStatus(nextLesson.lesson) === "ongoing"
                    ? "bg-emerald-400 text-emerald-950 animate-pulse"
                    : "bg-white/20 text-white"
                }`}
              >
                {getLessonStatus(nextLesson.lesson) === "ongoing" ? "● Đang diễn ra" : "Sắp diễn ra"}
              </span>
            )}
          </div>

          {nextLesson ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3 border-t border-white/20 pt-4">
              <div>
                <span className="text-xs text-brand-200">Môn học</span>
                <p className="font-bold text-lg">{nextLesson.name}</p>
                <p className="font-mono text-xs text-brand-200">{nextLesson.code} · Lớp {nextLesson.class_code}</p>
              </div>
              <div>
                <span className="text-xs text-brand-200">Thời gian & Tiết</span>
                <p className="font-bold text-lg">
                  {nextLesson.lesson.start_time} – {nextLesson.lesson.end_time}
                </p>
                <p className="text-xs text-brand-200">Tiết {nextLesson.lesson.start_period} đến {nextLesson.lesson.end_period}</p>
              </div>
              <div>
                <span className="text-xs text-brand-200">Phòng học & Giảng viên</span>
                <p className="font-bold text-lg text-amber-300">
                  {nextLesson.lesson.room ? `Phòng ${nextLesson.lesson.room}` : "Chưa có phòng"}
                </p>
                <p className="text-xs text-brand-200">{nextLesson.lecturer || "Chưa rõ GV"}</p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-brand-100">
              Bạn không còn tiết học nào trong ngày hôm nay. Chúc bạn có thời gian tự học và nghỉ ngơi thoải mái!
            </p>
          )}
        </div>
      )}

      {/* Class Schedule Timeline for the selected day */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center justify-between">
          <span>
            Danh sách tiết học ({weekdayLabel(selectedDay)})
          </span>
          <span className="text-xs font-normal text-slate-500">
            {lessonsForDay.length} ca học
          </span>
        </h3>

        {lessonsForDay.length === 0 ? (
          <div className="card text-center p-12 text-slate-500 space-y-2">
            <span className="text-4xl block">🎉</span>
            <p className="font-semibold text-slate-700 dark:text-slate-200">
              Không có lịch học vào {weekdayLabel(selectedDay)}!
            </p>
            <p className="text-xs text-slate-400">
              Kiểm tra các ngày khác hoặc ghé thăm trang{" "}
              <Link href="/modules" className="text-brand-600 underline">
                Học phần
              </Link>{" "}
              để lên kế hoạch môn mới.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {lessonsForDay.map((item, idx) => {
              const status = getLessonStatus(item.lesson);
              return (
                <div
                  key={`${item.code}-${idx}`}
                  className={`card transition border-l-6 ${
                    status === "ongoing"
                      ? "border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 ring-2 ring-emerald-400/50"
                      : status === "past"
                      ? "border-l-slate-300 opacity-60 dark:border-l-slate-700"
                      : "border-l-brand-600"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-brand-700 dark:text-brand-300">
                          {item.code}
                        </span>
                        <span className="text-xs text-slate-400">· Lớp {item.class_code}</span>
                        {status === "ongoing" && (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 animate-pulse">
                            ● Đang học
                          </span>
                        )}
                        {status === "past" && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            Đã qua
                          </span>
                        )}
                      </div>
                      <h4 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                        {item.name}
                      </h4>
                    </div>

                    <div className="text-right">
                      <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">
                        {item.lesson.start_time} – {item.lesson.end_time}
                      </span>
                      <span className="block text-xs text-slate-500">
                        Tiết {item.lesson.start_period} – {item.lesson.end_period}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                    <div>
                      <span>Giảng viên: </span>
                      <strong className="text-slate-800 dark:text-slate-200">{item.lecturer || "Chưa rõ"}</strong>
                    </div>
                    <div>
                      <span>Phòng học: </span>
                      <strong className="text-brand-700 dark:text-brand-300 font-mono text-sm">
                        {item.lesson.room || "Chưa có"}
                      </strong>
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
