"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useMounted } from "@/lib/useMounted";
import { COHORTS, useSettings } from "@/lib/store";
import { useProgramProfile } from "@/lib/myProgram";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { useT } from "@/i18n";
import { fold } from "@/lib/text";
import { GraduationCapIcon } from "@/components/icons";
import { hasGlobalProfileDialogHost, useProfileDialog } from "@/lib/profileDialog";
import { ProgramProfileDialog } from "@/components/ProgramProfileDialog";
import type { ProgramSummary } from "@/lib/types";
import { cleanMajorName, MAJOR_EN } from "@/lib/programCode";
import { facultyName } from "@/i18n/names";

/**
 * Tra cứu học phần / CTĐT forgiving matching:
 * - Tên ngành (không phân biệt dấu, hoa thường)
 * - Mã CTĐT (vd: K24414, K24404E, 414, HTTQL)
 * - Tên viết tắt (vd: HTTQL -> Hệ thống thông tin quản lý, QTKD -> Quản trị kinh doanh, TMĐT -> Thương mại điện tử)
 * - Khoa quản lý
 */
function matchesProgram(p: ProgramSummary, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;

  // 1. Khớp mã CTĐT (K24414, 414, v.v.)
  if (fold(p.program_id).includes(q)) return true;

  // 2. Khớp tên CTĐT (không dấu, thường/hoa)
  if (fold(p.name).includes(q)) return true;

  // 3. Khớp khoa quản lý
  if (p.faculty && fold(p.faculty).includes(q)) return true;

  // 4. Khớp chữ cái đầu viết tắt từ tên ngành (vd: HTTQL -> he thong thong tin quan ly)
  const words = fold(p.name)
    .replace(/\b(khoa|khoas)\s+\d+\b/g, "")
    .split(/[\s\-_,.:;+/\\]+/)
    .filter(Boolean);
  const initials = words.map((w) => w[0]).join("");
  if (initials.includes(q)) return true;

  const allWords = fold(p.name).split(/[\s\-_,.:;+/\\]+/).filter(Boolean);
  const allInitials = allWords.map((w) => w[0]).join("");
  if (allInitials.includes(q)) return true;

  // 5. Từ điển viết tắt phổ biến tại UEL
  const acronyms: Record<string, string[]> = {
    httql: ["he thong thong tin quan ly", "mis"],
    mis: ["he thong thong tin quan ly", "httql"],
    qtkd: ["quan tri kinh doanh", "ba"],
    ba: ["quan tri kinh doanh"],
    tmdt: ["thuong mai dien tu", "e-commerce", "ecommerce"],
    tcnh: ["tai chinh - ngan hang", "tai chinh", "ngan hang", "fin"],
    cntc: ["cong nghe tai chinh", "fintech"],
    fintech: ["cong nghe tai chinh"],
    ktdn: ["kinh te doi ngoai"],
    kdqt: ["kinh doanh quoc te", "ib"],
    ib: ["kinh doanh quoc te"],
    ptdl: ["phan tich du lieu", "data analytics"],
    kt: ["ke toan", "kiem toan"],
    mkt: ["marketing", "digital marketing"],
  };

  for (const [abbr, targets] of Object.entries(acronyms)) {
    if (q === abbr || q.startsWith(abbr)) {
      const pNameFolded = fold(p.name);
      if (targets.some((t) => pNameFolded.includes(t))) return true;
    }
  }

  return false;
}

export default function ProgramsPage() {
  const { t, lang } = useT();
  const displayProgramName = useCallback((name: string) => {
    if (lang !== "en") return name.normalize("NFC");
    const cleaned = cleanMajorName(name);
    return MAJOR_EN[cleaned.toLowerCase()] ?? cleaned;
  }, [lang]);
  const mounted = useMounted();
  const savedCohort = useSettings((s) => s.cohort);
  const profile = useProgramProfile();
  const { isOpen, open, close } = useProfileDialog();

  const hasMyProgram = profile.baseProgramIds.length > 0 || !!profile.primaryProgramId;

  // Trạng thái hiển thị toàn bộ hay chỉ CTĐT của tôi. Mặc định false (chỉ CTĐT của tôi nếu đã có CTĐT).
  // Hỗ trợ lưu trên URL (?all=1) để chia sẻ/quay lại (Requirement 4).
  const [showAll, setShowAll] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("all") === "1";
    }
    return false;
  });

  const [degree, setDegree] = useState<"dai_hoc" | "thac_si">(() => {
    return profile.degree === "thac_si" ? "thac_si" : "dai_hoc";
  });
  const [cohort, setCohort] = useState<string>("all");
  const [faculty, setFaculty] = useState<string>("all");
  const [query, setQuery] = useState<string>("");

  // Hàm đồng bộ query param ?all=1 trên URL
  const updateUrl = useCallback((all: boolean) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (all) {
      url.searchParams.set("all", "1");
    } else {
      url.searchParams.delete("all");
    }
    window.history.replaceState({}, "", url.toString());
  }, []);

  // Khi đổi mã CTĐT ở hộp thoại: tự động chuyển về chế độ mặc định (chỉ CTĐT của tôi), đặt lại bộ lọc
  const prevCodesRef = useRef({
    primary: profile.primaryCode,
    secondary: profile.secondaryCode,
  });

  useEffect(() => {
    if (
      prevCodesRef.current.primary !== profile.primaryCode ||
      prevCodesRef.current.secondary !== profile.secondaryCode
    ) {
      prevCodesRef.current = {
        primary: profile.primaryCode,
        secondary: profile.secondaryCode,
      };
      if (profile.degree === "thac_si") {
        setDegree("thac_si");
      } else if (profile.degree === "dai_hoc") {
        setDegree("dai_hoc");
      }
      setShowAll(false);
      setCohort("all");
      setQuery("");
      setFaculty("all");
      updateUrl(false);
    }
  }, [profile.primaryCode, profile.secondaryCode, profile.degree, updateUrl]);

  // Nạp toàn bộ danh sách CTĐT từ database / API theo bậc đào tạo (mặc định 'dai_hoc')
  const programsReq = useApi(() => api.programs({ degree }), [degree]);
  const programs = useMemo(() => programsReq.data ?? [], [programsReq.data]);

  // Kiểm tra môn có phải ngành chính / ngành 2 của người dùng
  const isPrimary = useCallback(
    (p: ProgramSummary) => {
      const pid = p.program_id.toUpperCase();
      return (
        (!!profile.primaryProgramId && pid === profile.primaryProgramId.toUpperCase()) ||
        (!!profile.basePrimaryProgramId && pid === profile.basePrimaryProgramId.toUpperCase())
      );
    },
    [profile.primaryProgramId, profile.basePrimaryProgramId],
  );

  const isSecondary = useCallback(
    (p: ProgramSummary) => {
      if (!profile.hasSecondary) return false;
      const pid = p.program_id.toUpperCase();
      return (
        (!!profile.secondaryProgramId && pid === profile.secondaryProgramId.toUpperCase()) ||
        (!!profile.baseSecondaryProgramId && pid === profile.baseSecondaryProgramId.toUpperCase())
      );
    },
    [profile.hasSecondary, profile.secondaryProgramId, profile.baseSecondaryProgramId],
  );

  // Chỉ hiển thị CTĐT của người dùng khi đã có chương trình, ở bậc đại học và không ở chế độ xem tất cả
  const onlyMine = degree === "dai_hoc" && hasMyProgram && !showAll;

  // Danh sách các khoa quản lý duy nhất
  const faculties = useMemo(() => {
    const set = new Set<string>();
    programs.forEach((p) => {
      if (p.faculty) set.add(p.faculty);
    });
    return Array.from(set).sort();
  }, [programs]);

  // Lọc CTĐT
  const filtered = useMemo(() => {
    if (onlyMine) {
      const mine: ProgramSummary[] = [];
      const prim = programs.find(isPrimary);
      if (prim) mine.push(prim);
      if (profile.hasSecondary) {
        const sec = programs.find((p) => isSecondary(p) && p.program_id !== prim?.program_id);
        if (sec) mine.push(sec);
      }
      return mine;
    }

    return programs.filter((p) => {
      if (degree === "dai_hoc") {
        const cNum = parseInt(p.cohort.replace(/\D/g, ""), 10);
        if (!isNaN(cNum) && cNum < 23) return false;
      }
      if (cohort !== "all" && p.cohort.toUpperCase() !== cohort.toUpperCase()) return false;
      if (faculty !== "all" && p.faculty !== faculty) return false;
      if (query.trim() && !matchesProgram(p, query)) return false;
      return true;
    });
  }, [programs, onlyMine, cohort, faculty, query, isPrimary, isSecondary, profile.hasSecondary, degree]);

  // Hành vi khi bấm nút chuyển đổi:
  // - "Xem tất cả CTĐT" -> đặt lại mọi bộ lọc, hiển thị toàn bộ CTĐT, số lượng N chương trình
  // - "Chỉ CTĐT của tôi" -> quay lại chế độ chỉ hiện CTĐT của người dùng
  const handleToggleAll = useCallback(() => {
    if (onlyMine) {
      setShowAll(true);
      setQuery("");
      setCohort("all");
      setFaculty("all");
      updateUrl(true);
    } else {
      setShowAll(false);
      setQuery("");
      setCohort("all");
      setFaculty("all");
      updateUrl(false);
    }
  }, [onlyMine, updateUrl]);

  // Khi người dùng gõ tìm kiếm hoặc chọn khóa/khoa trong chế độ "chỉ CTĐT của tôi",
  // tự chuyển sang chế độ xem tất cả (để không ra kết quả rỗng khó hiểu - Requirement 4)
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (!showAll && val.length > 0) {
      setShowAll(true);
      updateUrl(true);
    }
  };

  const handleCohortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setCohort(val);
    if (!showAll && val !== "all") {
      setShowAll(true);
      updateUrl(true);
    }
  };

  const handleFacultyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setFaculty(val);
    if (!showAll && val !== "all") {
      setShowAll(true);
      updateUrl(true);
    }
  };

  const handleOpenDialog = () => {
    open();
  };

  const renderLocalDialog = !hasGlobalProfileDialogHost();

  if (!mounted) return <Loading page />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("prog.title")}
        subtitle={t("prog.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">{t("prog.yourCohort")}</span>
            <span className="chip bg-brand-100 font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-300">
              {savedCohort || t("prog.notSet")}
            </span>
          </div>
        }
      />

      {/* Gợi ý nhỏ khi chưa có chương trình: mở hộp thoại chọn chương trình đào tạo */}
      {!hasMyProgram && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 min-h-[44px]">
            <GraduationCapIcon className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
            <span>{t("profile.selectProgrammePrompt")}</span>
            <button
              type="button"
              onClick={handleOpenDialog}
              className="btn-primary py-0.5 px-2 text-xs font-semibold cursor-pointer focus-visible:ring-2 focus-visible:ring-brand-focus focus:outline-hidden"
            >
              {t("profile.select")}
            </button>
          </div>
        </div>
      )}

      {/* Khối tìm kiếm & lọc (Search & Filters) - Nút Xem tất cả CTĐT nằm TRONG khối này (Requirement 3) */}
      <div
        className="card space-y-3"
        role="region"
        aria-label={t("prog.search")}
      >
        {/* Bộ chọn bậc đào tạo: Đại học / Thạc sĩ */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {t("degree.label")}:
            </span>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={degree === "dai_hoc"}
                onClick={() => {
                  setDegree("dai_hoc");
                  setCohort("all");
                }}
                className={`rounded-md px-3 py-1 text-xs transition-colors ${
                  degree === "dai_hoc"
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100 font-semibold"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {t("degree.dai_hoc")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={degree === "thac_si"}
                onClick={() => {
                  setDegree("thac_si");
                  setCohort("all");
                  setShowAll(true);
                }}
                className={`rounded-md px-3 py-1 text-xs transition-colors ${
                  degree === "thac_si"
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100 font-semibold"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {t("degree.thac_si")}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="label" htmlFor="prog-q">{t("prog.search")}</label>
            <input
              id="prog-q"
              className="input"
              placeholder={t("prog.searchPh")}
              value={query}
              onChange={handleQueryChange}
            />
          </div>

          <div>
            <label className="label" htmlFor="prog-cohort">{t("prog.cohort")}</label>
            <select
              id="prog-cohort"
              className="input"
              value={cohort}
              onChange={handleCohortChange}
            >
              <option value="all">{t("prog.allCohorts")}</option>
              {degree === "thac_si" && <option value="2025-2026">2025–2026</option>}
              {COHORTS.map((c) => (
                <option key={c} value={c}>
                  {t("prog.cohortN", { c })}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="prog-faculty">{t("prog.faculty")}</label>
            <select
              id="prog-faculty"
              className="input"
              value={faculty}
              onChange={handleFacultyChange}
            >
              <option value="all">{t("prog.allFaculties", { n: faculties.length })}</option>
              {faculties.map((f) => (
                <option key={f} value={f}>
                  {facultyName(f, lang)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Nút Xem tất cả CTĐT / Chỉ CTĐT của tôi & số lượng CTĐT nằm TRONG khối lọc (Requirement 3) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
          <div className="text-xs text-slate-500">
            {t("prog.programsCount", { n: filtered.length })}
          </div>
          {hasMyProgram && (
            <button
              type="button"
              onClick={handleToggleAll}
              className="btn-outline py-1 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950"
            >
              {onlyMine ? t("prog.viewAll") : t("prog.onlyMine")}
            </button>
          )}
        </div>
      </div>

      {programsReq.loading ? (
        <Loading className="min-h-[320px]" />
      ) : programsReq.error ? (
        <ErrorBox>{programsReq.error}</ErrorBox>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <Empty>{t("prog.empty")}</Empty>
        </div>
      ) : (
        <div className="space-y-3 min-h-[320px]">
          <div className="text-xs text-slate-500">
            {t("prog.showing", { n: filtered.length.toLocaleString(lang === "vi" ? "vi-VN" : "en-GB") })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => {
              const isPrim = isPrimary(p);
              const isSec = isSecondary(p);
              return (
                <div key={p.program_id} className="card flex flex-col justify-between transition hover:border-brand-400">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-brand-700 dark:text-brand-300">
                          {p.program_id}
                        </span>
                        {isPrim && (
                          <span className="chip bg-brand-100 text-[11px] font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-300">
                            {t("prog.primary")}
                          </span>
                        )}
                        {isSec && (
                          <span className="chip bg-amber-100 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            {t("prog.secondary")}
                          </span>
                        )}
                      </div>
                      <span className="chip bg-slate-100 text-[11px] font-semibold dark:bg-slate-800">
                        {p.cohort}
                      </span>
                    </div>

                    <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-white">
                      <Link href={`/programs/${p.program_id}`} className="hover:underline">
                        {displayProgramName(p.name)}
                      </Link>
                    </h3>

                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {p.faculty ? facultyName(p.faculty, lang) : t("prog.defaultFaculty")}
                    </p>
                  </div>

                  <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div className="mb-2 text-xs text-slate-600 dark:text-slate-400">
                      {t("prog.required", { n: p.total_credits })}
                    </div>
                    <Link href={`/programs/${p.program_id}`} className="btn-primary w-full text-center text-xs">
                      {t("prog.view")}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {renderLocalDialog && <ProgramProfileDialog open={isOpen} onClose={close} />}
    </div>
  );
}
