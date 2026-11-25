"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { Loading } from "@/components/ui";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import { getAnonId } from "@/lib/analytics";
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

const MIN_LEN = 5;
const MAX_LEN = 1000;

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
  const timetable = useTimetable();
  const [semesters, setSemesters] = useState<Semester[] | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedMap>({});
  const [active, setActive] = useState<{ semesterId: string; code: string } | null>(null);
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

  const finish = (sem: Semester, code: string, status: SubmittedStatus) => {
    setSubmitted(saveSubmitted(submittedKey(sem.id, code), status));
    setActive(null);
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
                        disabled={Boolean(state)}
                        aria-expanded={isActive}
                        aria-label={state ? t(STATUS_KEY[state]) : t("cr.cardLabel")}
                        title={`${code} · ${name}`}
                        onClick={() => setActive(isActive ? null : { semesterId: sem.id, code })}
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

            {active && active.semesterId === sem.id && codes.includes(active.code) && (
              <ReviewForm
                key={`${sem.id}:${active.code}`}
                code={active.code}
                name={nameOf(active.code)}
                semester={sem}
                onDone={(status) => finish(sem, active.code, status)}
                onCancel={() => setActive(null)}
              />
            )}
          </section>
        ))
      )}
    </div>
  );
}

function ReviewForm({
  code,
  name,
  semester,
  onDone,
  onCancel,
}: {
  code: string;
  name: string;
  semester: Semester;
  onDone: (status: SubmittedStatus) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [rating, setRating] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (rating === null) {
      setError(t("cr.ratingRequired"));
      return;
    }
    if (trimmed.length < MIN_LEN) {
      setError(t("cr.tooShort"));
      return;
    }
    if (trimmed.length > MAX_LEN) {
      setError(t("cr.tooLong"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.postModuleComment(code, {
        body: trimmed,
        rating,
        anon_id: getAnonId(),
        semester: semester.id,
      });
      onDone(res.status === "approved" ? "approved" : "pending");
    } catch (err) {
      const httpStatus = (err as { status?: number } | null)?.status;
      if (httpStatus === 409) {
        setError(t("cr.alreadySent"));
        onDone("sent");
        return;
      }
      if (httpStatus === 422) setError(t("cr.blocked"));
      else if (httpStatus === 429) setError(t("cr.rateLimited"));
      else setError(t("cr.errorDefault"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4 p-5" aria-label={`${code} ${name}`}>
      <h3 className="font-semibold text-slate-900 dark:text-slate-100">
        <span className="text-orange-600 dark:text-orange-400">{code}</span> · {name}
      </h3>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("cr.ratingLabel")}</legend>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              aria-label={t("comments.starAria", { n: star })}
              className={`text-2xl transition-transform hover:scale-110 ${
                rating !== null && star <= rating ? "text-amber-400" : "text-slate-300 dark:text-slate-600"
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("cr.bodyLabel")}</span>
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setError(null);
          }}
          rows={4}
          placeholder={t("cr.bodyPlaceholder")}
          className="w-full rounded-md border border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-focus focus:outline-none focus:ring-1 focus:ring-brand-focus dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder-slate-500"
        />
      </label>
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>{t("comments.lengthHint")}</span>
        <span>{body.length}/{MAX_LEN}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="submit" disabled={submitting} className="btn-primary px-4 py-1.5 text-sm font-medium disabled:opacity-50">
            {submitting ? t("cr.submitting") : t("cr.submit")}
          </button>
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
            {t("cr.cancel")}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
