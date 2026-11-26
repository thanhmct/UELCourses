"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { Loading } from "@/components/ui";
import { ModuleReviews } from "@/components/ModuleReviews";
import { LecturerReviewPanel } from "@/components/LecturerReviewPanel";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import {
  pickReviewSemesters,
  readSubmitted,
  saveSubmitted,
  submittedKey,
  uniqueCourseCodes,
  type SubmittedMap,
  type SubmittedStatus,
} from "@/lib/courseReviews";
import { currentTimetableDraft, useTimetable } from "@/lib/store";
import type { Semester } from "@/lib/types";

/** Id neo của khối đánh giá đang mở — dùng để quay đúng vị trí sau khi đăng nhập (OAuth redirect). */
const ACTIVE_PANEL_ID = "cr-active-review";

const STATUS_KEY: Record<SubmittedStatus, string> = {
  approved: "cr.statusApproved",
  pending: "cr.statusPending",
  sent: "cr.statusSent",
};

const STATUS_STYLE: Record<SubmittedStatus, string> = {
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  sent: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export default function CourseReviewsPage() {
  const { t, lang } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const timetable = useTimetable();
  const [semesters, setSemesters] = useState<Semester[] | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedMap>({});
  // Khôi phục môn đang chọn từ URL (?sem=&code=) — giữ nguyên sau khi quay lại từ đăng nhập OAuth.
  const [active, setActive] = useState<{ semesterId: string; code: string } | null>(() => {
    const sem = searchParams?.get("sem");
    const code = searchParams?.get("code");
    return sem && code ? { semesterId: sem, code } : null;
  });
  const [notice, setNotice] = useState<{ status: "approved" | "pending" } | null>(null);

  useEffect(() => {
    setSubmitted(readSubmitted());
    let alive = true;
    api
      .semesters()
      .then((res) => {
        if (alive) setSemesters(res.data);
      })
      .catch(() => {
        if (alive) setSemesters([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Môn lấy trực tiếp từ thời khóa biểu (phương án đang chọn) của học kỳ trước và học kỳ hiện tại.
  const sections = useMemo(
    () =>
      pickReviewSemesters(semesters ?? []).map((sem) => ({
        sem,
        codes: uniqueCourseCodes(currentTimetableDraft(timetable, sem.id).currentEntries),
      })),
    [semesters, timetable],
  );

  const nameOf = (code: string) => {
    const info = timetable.info[code];
    if (!info) return code;
    return (lang === "en" && info.name_en) || info.name || code;
  };

  // Mở/đóng khối đánh giá của một môn, đồng bộ vào URL để giữ đúng vị trí qua vòng đăng nhập OAuth.
  const selectModule = (semesterId: string, code: string | null) => {
    setActive(code ? { semesterId, code } : null);
    setNotice(null);
    const params = new URLSearchParams(searchParams?.toString());
    if (code) {
      params.set("sem", semesterId);
      params.set("code", code);
    } else {
      params.delete("sem");
      params.delete("code");
    }
    const qs = params.toString();
    router.replace(`/feedback/courses${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const finish = (sem: Semester, code: string, status: SubmittedStatus) => {
    setSubmitted(saveSubmitted(submittedKey(sem.id, code), status));
    setNotice(status === "sent" ? null : { status });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-4">
      <div className="flex items-start gap-3">
        <BackButton href="/feedback" label={t("common.back")} />
        <div>
          <h1 className="page-title flex items-center gap-2.5">
            <MessageSquarePlus className="h-7 w-7 text-brand-600 dark:text-brand-400" aria-hidden />
            <span>{t("cr.title")}</span>
          </h1>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t("cr.intro")}</p>
      <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        {t("cr.moderationNote")}
      </p>

      {notice && (
        <p
          role="status"
          className="rounded-md bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          {notice.status === "approved" ? t("cr.doneApproved") : t("cr.donePending")}
        </p>
      )}

      {semesters === null ? (
        <Loading />
      ) : sections.length === 0 ? (
        <p className="card p-6 text-center text-sm text-slate-500 dark:text-slate-400">{t("cr.noSemesters")}</p>
      ) : (
        sections.map(({ sem, codes }) => (
          <section key={sem.id} aria-labelledby={`cr-sem-${sem.id}`} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`cr-sem-${sem.id}`} className="text-base font-bold text-slate-900 dark:text-slate-100">
                {sem.name}
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {sem.is_current ? t("cr.currentTag") : t("cr.prevTag")}
              </span>
            </div>

            {codes.length === 0 ? (
              <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-slate-600 dark:text-slate-400">
                <span>{t("cr.noCourses")}</span>
                <Link href="/timetable" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
                  {t("cr.goTimetable")}
                </Link>
              </div>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {codes.map((code) => {
                  const state = submitted[submittedKey(sem.id, code)];
                  const isActive = active?.semesterId === sem.id && active.code === code;
                  const name = nameOf(code);
                  return (
                    <li key={code}>
                      <button
                        type="button"
                        aria-expanded={isActive}
                        aria-label={state ? t(STATUS_KEY[state]) : t("cr.cardLabel")}
                        title={`${code} · ${name}`}
                        onClick={() => selectModule(sem.id, isActive ? null : code)}
                        className={`card flex w-32 flex-col items-center justify-center gap-0.5 px-3 py-2 text-center transition ${
                          isActive ? "ring-2 ring-orange-400" : ""
                        } ${
                          state
                            ? STATUS_STYLE[state]
                            : "text-orange-600 hover:border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span className="font-mono text-xs font-bold leading-tight text-slate-900 dark:text-white">{code}</span>
                        <span className="line-clamp-2 text-[11px] leading-tight text-slate-600 dark:text-slate-400">{name}</span>
                        {state && (
                          <span className="text-[10px] font-semibold leading-tight">{t(STATUS_KEY[state])}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {active && active.semesterId === sem.id && codes.includes(active.code) && (() => {
              const code = active.code;
              const name = nameOf(code);
              const loginNext = `/feedback/courses?sem=${sem.id}&code=${code}#${ACTIVE_PANEL_ID}`;
              return (
                <div id={ACTIVE_PANEL_ID} key={`${sem.id}:${code}`} className="card scroll-mt-20 space-y-5 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="min-w-0 font-semibold text-slate-900 dark:text-slate-100">
                      {t("cr.reviewingTitle", { code, name })}
                    </h3>
                    <button
                      type="button"
                      onClick={() => selectModule(sem.id, null)}
                      className="btn-outline shrink-0 px-3 py-1 text-xs"
                    >
                      {t("cr.cancel")}
                    </button>
                  </div>

                  <ModuleReviews
                    moduleCode={code}
                    moduleName={name}
                    semester={sem.id}
                    onSubmitted={(status) => finish(sem, code, status)}
                  />
                  <LecturerReviewPanel moduleCode={code} loginNext={loginNext} />
                </div>
              );
            })()}
          </section>
        ))
      )}
    </div>
  );
}
