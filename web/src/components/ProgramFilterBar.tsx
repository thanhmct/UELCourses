"use client";

import { Loading } from "@/components/ui";
import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { GraduationCapIcon, PencilIcon, CloseIcon } from "./icons";
import { useProgramProfile } from "@/lib/myProgram";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import {
  cleanMajorName,
  DOCTORAL_MAJORS,
  formatFilterBannerText,
  MAJOR_EN,
  MASTER_ADMISSION_MAJORS,
  MASTER_MAJORS,
  parseProgramCode,
  type ParsedProgramCode,
  validateProgramGroup,
} from "@/lib/programCode";
import {
  canRenderLocalProfileDialog,
  hasGlobalProfileDialogHost,
  releaseLocalProfileDialog,
  useProfileDialog,
} from "@/lib/profileDialog";
import { ProgramProfileDialog } from "./ProgramProfileDialog";
import type { ProgramDetail } from "@/lib/types";
import { hasVerifiedUndergraduateTrack } from "@/lib/programLookup";

export interface ProgramFilterBarTrackControl {
  current: string;
  onChange: (mode: string) => void;
  options?: { value: string; label: string }[];
}

export interface ProgramFilterBarProps {
  /** Mã chương trình ghi đè (vd từ ?program= URL) */
  customProgram?: string | null;
  /** Callback khi bấm "Bỏ lọc" */
  onClearFilter?: () => void;
  /** Nhãn nút bỏ lọc nếu muốn ghi đè */
  clearFilterLabel?: string;
  /** Trạng thái bộ lọc có đang kích hoạt không (mặc định dựa vào profile.programIds.length > 0) */
  isFilterActive?: boolean;
  /** Bộ chuyển đổi ngành (Segmented control: Ngành chính / Ngành 2 / Cả hai) */
  trackControl?: ProgramFilterBarTrackControl;
  /** Lời nhắc khi chưa chọn CTĐT */
  emptyPrompt?: string;
  /** Số kết quả (vd: "71 học phần tìm thấy") hiển thị bên phải */
  resultsCount?: React.ReactNode;
  /** Program detail ngành chính đã có từ trang cha (tránh gọi API lặp lại) */
  primaryProgram?: ProgramDetail | null;
  /** Program detail ngành 2 đã có từ trang cha */
  secondaryProgram?: ProgramDetail | null;
  /** Chế độ thu gọn cho thanh Header trên cùng */
  compact?: boolean;
  /** Hiện thẻ CTĐT trong trang (mặc định true). Các trang chính đặt false vì thẻ đã nằm trên thanh trên. */
  showCard?: boolean;
  /** ClassName bổ sung */
  className?: string;
}

export function ProgramFilterBar({
  customProgram,
  onClearFilter,
  clearFilterLabel,
  isFilterActive,
  trackControl,
  emptyPrompt,
  resultsCount,
  primaryProgram: propPrimaryProgram,
  secondaryProgram: propSecondaryProgram,
  compact = false,
  showCard = true,
  className = "",
}: ProgramFilterBarProps) {
  const { t, lang } = useT();
  const profile = useProgramProfile();
  const isEn = lang === "en";

  const { isOpen, open, close } = useProfileDialog();
  const changeBtnRef = useRef<HTMLButtonElement>(null);

  const barId = useId();
  const renderLocalDialog = !hasGlobalProfileDialogHost() && canRenderLocalProfileDialog(barId);

  useEffect(() => {
    return () => {
      releaseLocalProfileDialog(barId);
    };
  }, [barId]);

  // Danh sách CTĐT từ catalog / API
  const usesGraduateCatalogue = profile.degree !== "dai_hoc" || (profile.secondaryParsed?.degree ?? "dai_hoc") !== "dai_hoc";
  const allProgramsReq = useApi(() => usesGraduateCatalogue ? api.programs({ degree: "all" }) : api.programs(), [usesGraduateCatalogue]);
  const allPrograms = allProgramsReq.data;

  // Danh sách nhóm lớp hợp lệ
  const validGroupsReq = useApi(
    () => (typeof api.validGroups === "function" ? api.validGroups() : Promise.resolve({ data: [], mock: false })),
    [],
  );
  const validGroups = validGroupsReq.data;

  // Lấy chi tiết program nếu trang cha chưa truyền vào
  const primaryCode = customProgram || profile.primaryCode || profile.primaryProgramId;
  const secondaryCode = profile.secondaryCode || profile.secondaryProgramId;

  const isPrimaryInvalid = useMemo(() => {
    if (!validGroups || validGroups.length === 0) return false;
    if (!primaryCode) return false;
    const parsed = parseProgramCode(primaryCode);
    if (!parsed) return false;
    return !allPrograms?.some((program) => program.program_id === parsed.normalized)
      && !hasVerifiedUndergraduateTrack(parsed.normalized)
      && !validateProgramGroup(parsed, validGroups, lang).valid;
  }, [validGroups, allPrograms, primaryCode, lang]);

  const primaryProgramReq = useApi(
    () =>
      propPrimaryProgram !== undefined || !profile.primaryProgramId
        ? Promise.resolve({ data: null, mock: false })
        : api.program(profile.primaryProgramId),
    [propPrimaryProgram, profile.primaryProgramId],
  );

  const secondaryProgramReq = useApi(
    () =>
      propSecondaryProgram !== undefined || !profile.secondaryProgramId
        ? Promise.resolve({ data: null, mock: false })
        : api.program(profile.secondaryProgramId),
    [propSecondaryProgram, profile.secondaryProgramId],
  );

  const basePrimaryReq = useApi(
    () =>
      propPrimaryProgram !== undefined || !profile.basePrimaryProgramId || profile.basePrimaryProgramId === profile.primaryProgramId
        ? Promise.resolve({ data: null, mock: false })
        : api.program(profile.basePrimaryProgramId),
    [propPrimaryProgram, profile.basePrimaryProgramId, profile.primaryProgramId],
  );

  const baseSecondaryReq = useApi(
    () =>
      propSecondaryProgram !== undefined || !profile.baseSecondaryProgramId || profile.baseSecondaryProgramId === profile.secondaryProgramId
        ? Promise.resolve({ data: null, mock: false })
        : api.program(profile.baseSecondaryProgramId),
    [propSecondaryProgram, profile.baseSecondaryProgramId, profile.secondaryProgramId],
  );

  const primaryProgram = propPrimaryProgram ?? (primaryProgramReq.data ?? basePrimaryReq.data);
  const secondaryProgram = propSecondaryProgram ?? (secondaryProgramReq.data ?? baseSecondaryReq.data);

  const getProgramInfo = useCallback(
    (codeOrId: string, detailName?: string | null) => {
      const parsed = parseProgramCode(codeOrId);
      if (!parsed) return { name: null, coopName: null, parsed: null };
      const programId = parsed.programId;
      const fromList = allPrograms?.find(
        (p) => p.program_id === programId || p.program_id === parsed.contextualProgramId,
      );
      const fallback = parsed.degree === "thac_si" ? MASTER_MAJORS[parsed.major] || MASTER_ADMISSION_MAJORS[parsed.major]
        : parsed.degree === "tien_si" ? DOCTORAL_MAJORS[parsed.major] : undefined;
      const name = detailName || fromList?.name || fallback || null;
      const coopMatch = allPrograms?.find(
        (p) => (p.program_id === `${programId}H` || p.program_id === programId) && /co-?op/i.test(p.name),
      );
      const coopName = coopMatch?.name ?? null;
      return { name, coopName, parsed };
    },
    [allPrograms],
  );

  const primaryInfo = useMemo(() => {
    return getProgramInfo(primaryCode, primaryProgram?.program?.name);
  }, [primaryCode, primaryProgram?.program?.name, getProgramInfo]);

  const secondaryInfo = useMemo(() => {
    return getProgramInfo(secondaryCode, secondaryProgram?.program?.name);
  }, [secondaryCode, secondaryProgram?.program?.name, getProgramInfo]);

  // Kiểm tra có chương trình được thiết lập không
  const hasProgram = !!(customProgram || profile.programIds.length > 0);
  const isFiltering = isFilterActive !== undefined ? isFilterActive : hasProgram;

  // Mở popup nhập mã CTĐT
  const handleOpenDialog = () => {
    open();
  };

  // Render chip cho một chương trình đào tạo (bản tiêu chuẩn)
  const renderProgramChip = (
    info: { name: string | null; coopName: string | null; parsed: ParsedProgramCode | null },
    labelBadge?: string,
    badgeAriaLabel?: string,
  ) => {
    const { parsed, name, coopName } = info;
    if (!parsed) return null;

    const isLoading = allProgramsReq.loading && !name;
    const cleaned = cleanMajorName(name);
    const majorDisplay = cleaned
      ? isEn
        ? MAJOR_EN[cleaned.toLowerCase()] ?? cleaned
        : cleaned
      : t("profile.majorCode", { code: parsed.major });

    const cohortNum = parsed.cohort.replace(/\D/g, "").slice(-2);
    const cohortLabel = parsed.degree === "dai_hoc" ? t("profile.cohortChip", { n: cohortNum }) : t(`degree.${parsed.degree}`);

    let specialChip: React.ReactNode = null;
    if (parsed.kind === "english") {
      specialChip = (
        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
          {t("profile.englishShort")}
        </span>
      );
    } else if (parsed.kind === "talent") {
      specialChip = (
        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-950 dark:text-purple-300">
          {t(parsed.english ? "profile.lookupTrack.talentEn" : "profile.talentTrack")}
        </span>
      );
    } else if (parsed.kind === "coop") {
      const label = coopName?.trim() || t("profile.coopTrack");
      specialChip = (
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          {label}
        </span>
      );
    }

    return (
      <div className="flex flex-col gap-0.5" aria-label={badgeAriaLabel}>
        {labelBadge && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {labelBadge}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {isLoading ? (
            <Loading compact />
          ) : (
            <span className="font-semibold text-slate-900 dark:text-slate-100">{majorDisplay}</span>
          )}
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {cohortLabel}
          </span>
          {specialChip}
        </div>
      </div>
    );
  };

  // Render chip gọn cho Header (bản gọn)
  const renderCompactProgramChip = (
    info: { name: string | null; coopName: string | null; parsed: ParsedProgramCode | null },
  ) => {
    const { parsed, name, coopName } = info;
    if (!parsed) return null;

    const isLoading = allProgramsReq.loading && !name;
    const cleaned = cleanMajorName(name);
    const majorDisplay = cleaned
      ? isEn
        ? MAJOR_EN[cleaned.toLowerCase()] ?? cleaned
        : cleaned
      : t("profile.majorCode", { code: parsed.major });

    const cohortNum = parsed.cohort.replace(/\D/g, "").slice(-2);
    const cohortLabel = parsed.degree === "dai_hoc" ? t("profile.cohortChip", { n: cohortNum }) : t(`degree.${parsed.degree}`);

    let specialChip: React.ReactNode = null;
    if (parsed.kind === "english") {
      specialChip = (
        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
          {t("profile.englishShort")}
        </span>
      );
    } else if (parsed.kind === "talent") {
      specialChip = (
        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[11px] font-medium text-purple-800 dark:bg-purple-950 dark:text-purple-300">
          {t(parsed.english ? "profile.lookupTrack.talentEn" : "profile.talentTrack")}
        </span>
      );
    } else if (parsed.kind === "coop") {
      const label = coopName?.trim() || t("profile.coopTrack");
      // Phones: the full co-op name repeats the major, so show only "Co-op" (full name stays in the tooltip).
      specialChip = (
        <span className="shrink-0 whitespace-nowrap rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" title={label}>
          <span className="sm:hidden">{t("profile.coopTrack")}</span>
          <span className="hidden sm:inline">{label}</span>
        </span>
      );
    }

    return (
      <span className="inline-flex min-w-0 items-center gap-x-1.5 gap-y-0.5">
        {isLoading ? (
          <Loading compact />
        ) : (
          <span className="min-w-0 truncate font-semibold text-slate-900 dark:text-slate-100" title={majorDisplay}>
            {majorDisplay}
          </span>
        )}
        <span className="shrink-0 whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {parsed.degree === "dai_hoc" ? (
            <><span className="sm:hidden">{parsed.cohort}</span><span className="hidden sm:inline">{cohortLabel}</span></>
          ) : cohortLabel}
        </span>
        {specialChip}
      </span>
    );
  };

  // Câu mô tả tự nhiên đầy đủ (đặt trong title / aria-label / sr-only để tương thích test & accessibility)
  const fullSentence = useMemo(() => {
    if (!hasProgram) return "";
    if (isPrimaryInvalid) {
      return t("profile.invalidCodeWarning", { code: primaryCode });
    }
    if (customProgram) {
      return formatFilterBannerText(customProgram, primaryInfo.name, lang, primaryInfo.coopName);
    }
    if (profile.hasSecondary && profile.secondaryProgramId) {
      const p1Text = formatFilterBannerText(
        profile.primaryCode || profile.primaryProgramId,
        primaryInfo.name,
        lang,
        primaryInfo.coopName,
      );
      const p2Text = formatFilterBannerText(
        profile.secondaryCode || profile.secondaryProgramId,
        secondaryInfo.name,
        lang,
        secondaryInfo.coopName,
      );
      return `${p1Text} (${t("profile.primaryBadge")}) + ${p2Text} (${t("profile.secondaryBadge")})`;
    }
    return formatFilterBannerText(
      profile.primaryCode || profile.primaryProgramId,
      primaryInfo.name,
      lang,
      primaryInfo.coopName,
    );
  }, [
    hasProgram,
    isPrimaryInvalid,
    primaryCode,
    customProgram,
    profile.hasSecondary,
    profile.secondaryProgramId,
    profile.primaryCode,
    profile.primaryProgramId,
    profile.secondaryCode,
    primaryInfo.name,
    primaryInfo.coopName,
    secondaryInfo.name,
    secondaryInfo.coopName,
    lang,
    t,
  ]);

  // PHIÊN BẢN GỌN (COMPACT / HEADER MODE)
  if (compact) {
    if (!hasProgram) {
      return (
        <div className={`flex items-center ${className}`}>
          <div className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-3 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
            <GraduationCapIcon className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />
            <span className="min-w-0 font-medium">{t("profile.title")}</span>
            <button
              type="button"
              onClick={handleOpenDialog}
              title={t("profile.selectProgrammePrompt")}
              aria-label={t("profile.selectProgrammePrompt")}
              className="btn-primary shrink-0 rounded-lg px-3 py-1 text-sm font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-brand-focus focus:outline-hidden"
            >
              {t("profile.select")}
            </button>
          </div>
          {renderLocalDialog && <ProgramProfileDialog open={isOpen} onClose={close} />}
        </div>
      );
    }

    const hasTwoMajors = !customProgram && profile.hasSecondary && !!profile.secondaryProgramId;

    return (
      <div className={`flex min-w-0 items-center ${className}`}>
        <div
          data-testid="program-filter-bar"
          title={fullSentence}
          aria-label={fullSentence}
          className={`inline-flex max-w-full items-center gap-1.5 sm:gap-2 rounded-xl border px-2 sm:px-2.5 py-1 text-xs shadow-xs min-h-[38px] ${
            isPrimaryInvalid
              ? "border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/40"
              : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          }`}
        >
          {!isPrimaryInvalid && <span className="sr-only">{fullSentence}</span>}

          {/* Bấm vào thẻ để mở hộp thoại đổi chương trình */}
          <button
            type="button"
            onClick={handleOpenDialog}
            className="inline-flex min-w-0 items-center gap-1.5 text-left cursor-pointer hover:opacity-85 transition rounded focus-visible:ring-2 focus-visible:ring-brand-focus focus:outline-hidden"
            title={t("profile.buttonTooltip")}
            aria-label={fullSentence}
          >
            <GraduationCapIcon
              className={`h-4 w-4 shrink-0 ${
                isPrimaryInvalid
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-brand-600 dark:text-brand-400"
              }`}
            />

            {isPrimaryInvalid ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/80 dark:text-amber-200">
                {t("profile.invalidCodeWarning", { code: primaryCode })}
              </span>
            ) : !hasTwoMajors ? (
              renderCompactProgramChip(primaryInfo)
            ) : (
              <div className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-1.5">
                {renderCompactProgramChip(primaryInfo)}
                <span className="text-slate-300 dark:text-slate-600 font-medium select-none" aria-hidden>
                  +
                </span>
                {renderCompactProgramChip(secondaryInfo)}
              </div>
            )}
          </button>

          {/* Vạch ngăn dọc giữa phần thông tin và hai nút icon */}
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" aria-hidden="true" />

          {/* Cụm hai nút icon: Đổi và Bỏ lọc (bỏ chữ, icon 18x18 trong nút vuông 36x36 rounded-lg) */}
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              ref={changeBtnRef}
              type="button"
              onClick={handleOpenDialog}
              aria-label={t("profile.changeAria")}
              title={t("profile.changeAria")}
              className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg text-brand-600 hover:bg-brand-50 hover:text-brand-ink dark:text-brand-400 dark:hover:bg-brand-950/60 dark:hover:text-brand-300 transition-colors focus-visible:ring-2 focus-visible:ring-brand-focus focus:outline-hidden cursor-pointer"
            >
              <PencilIcon className="h-[18px] w-[18px]" />
            </button>

            {onClearFilter && (
              <button
                type="button"
                onClick={onClearFilter}
                aria-label={
                  isFiltering
                    ? t("profile.clearFilterAria")
                    : clearFilterLabel || t("profile.filterBy")
                }
                title={
                  isFiltering
                    ? t("profile.clearFilterAria")
                    : clearFilterLabel || t("profile.filterBy")
                }
                className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors focus-visible:ring-2 focus-visible:ring-brand-focus focus:outline-hidden cursor-pointer"
              >
                <CloseIcon className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
        </div>

        {renderLocalDialog && <ProgramProfileDialog open={isOpen} onClose={close} />}
      </div>
    );
  }

  // Khi chưa có chương trình đào tạo (bản tiêu chuẩn)
  if (!hasProgram) {
    if (!showCard && !resultsCount) {
      return renderLocalDialog ? <ProgramProfileDialog open={isOpen} onClose={close} /> : null;
    }
    return (
      <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`}>
        {!showCard ? <span /> : <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 min-h-[44px]">
          <GraduationCapIcon className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
          <span>{emptyPrompt || t("profile.selectProgrammePrompt")}</span>
          <button
            type="button"
            onClick={handleOpenDialog}
            className="btn-primary py-0.5 px-2 text-xs font-semibold cursor-pointer focus-visible:ring-2 focus-visible:ring-brand-focus focus:outline-hidden"
          >
            {t("profile.select")}
          </button>
        </div>}
        {resultsCount && (
          <div className="text-xs text-slate-500 dark:text-slate-400" role="status" aria-live="polite">
            {resultsCount}
          </div>
        )}
        {renderLocalDialog && <ProgramProfileDialog open={isOpen} onClose={close} />}
      </div>
    );
  }

  const hasTwoMajors = !customProgram && profile.hasSecondary && !!profile.secondaryProgramId;

  const trackGroup = trackControl ? (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("eq.majorFilter")}>
      {(
        trackControl.options ?? [
          { value: "all", label: t("eq.bothMajors") },
          { value: "primary", label: t("profile.primaryBadge") },
          { value: "secondary", label: t("profile.secondaryBadge") },
        ]
      ).map((opt) => {
        const isActive =
          opt.value === "all" || opt.value === "both"
            ? trackControl.current === "all" || trackControl.current === "both"
            : trackControl.current === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`rounded px-2.5 py-1 text-xs font-medium transition cursor-pointer focus-visible:ring-2 focus-visible:ring-brand-focus focus:outline-hidden ${
              isActive
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
            onClick={() => trackControl.onChange(opt.value)}
            aria-pressed={isActive}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  ) : null;

  // Trang đã có thẻ CTĐT trên thanh trên: chỉ giữ bộ chuyển ngành và số kết quả, không lặp lại thẻ
  if (!showCard && !customProgram) {
    const showTrack = hasTwoMajors && !!trackGroup;
    if (!showTrack && !resultsCount) {
      return renderLocalDialog ? <ProgramProfileDialog open={isOpen} onClose={close} /> : null;
    }
    return (
      <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`}>
        {showTrack ? trackGroup : <span />}
        {resultsCount && (
          <div className="text-xs text-slate-500 dark:text-slate-400" role="status" aria-live="polite">
            {resultsCount}
          </div>
        )}
        {renderLocalDialog && <ProgramProfileDialog open={isOpen} onClose={close} />}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`}>
      {/* Khối chip bar gọn gàng */}
      <div
        data-testid="program-filter-bar"
        title={fullSentence}
        aria-label={fullSentence}
        className={`inline-flex max-w-full flex-wrap items-center gap-2.5 rounded-xl border px-3 py-1.5 text-sm shadow-xs min-h-[44px] ${
          isPrimaryInvalid
            ? "border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/40"
            : !isFiltering
            ? "border-dashed border-slate-300 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60"
            : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        }`}
      >
        {/* Câu đầy đủ cho screen readers và tương thích test */}
        {!isPrimaryInvalid && <span className="sr-only">{fullSentence}</span>}

        {/* Biểu tượng mũ cử nhân */}
        <GraduationCapIcon
          className={`h-5 w-5 shrink-0 ${
            isPrimaryInvalid
              ? "text-amber-600 dark:text-amber-400"
              : "text-brand-600 dark:text-brand-400"
          }`}
        />

        {/* 1 Ngành hoặc 2 Ngành */}
        {!hasTwoMajors ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 block leading-tight">
              {t("profile.yourProgramme")}
            </span>
            {isPrimaryInvalid ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/80 dark:text-amber-200">
                {t("profile.invalidCodeWarning", { code: primaryCode })}
              </span>
            ) : (
              renderProgramChip(primaryInfo)
            )}
          </div>
        ) : trackControl ? (
          // Chế độ Segmented Control: tích hợp chuyển đổi ngành trực tiếp trong thanh
          trackGroup
        ) : (
          // Hai chip ngành liền kề nhau ngăn bởi dấu +
          <div className="flex flex-wrap items-center gap-2">
            {renderProgramChip(primaryInfo, t("profile.primaryBadge"), t("profile.primaryBadge"))}
            <span className="text-slate-300 dark:text-slate-600 font-medium select-none" aria-hidden>
              +
            </span>
            {renderProgramChip(secondaryInfo, t("profile.secondaryBadge"), t("profile.secondaryBadge"))}
          </div>
        )}

        {/* Cụm nút hành động bên phải liền kề: hai nút icon, bỏ chữ, kích thước 18x18 trong nút vuông 36x36 rounded-lg */}
        <div className="flex items-center gap-1 border-l border-slate-200 pl-1.5 dark:border-slate-800 ml-1">
          {/* Nút Đổi: mở hộp thoại ProgramProfileDialog pop-up */}
          <button
            ref={changeBtnRef}
            type="button"
            onClick={handleOpenDialog}
            aria-label={t("profile.changeAria")}
            title={t("profile.changeAria")}
            className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg text-brand-600 hover:bg-brand-50 hover:text-brand-ink dark:text-brand-400 dark:hover:bg-brand-950/60 dark:hover:text-brand-300 transition-colors focus-visible:ring-2 focus-visible:ring-brand-focus focus:outline-hidden cursor-pointer"
          >
            <PencilIcon className="h-[18px] w-[18px]" />
          </button>

          {/* Nút Bỏ lọc / Áp dụng lọc: icon ✕, bỏ chữ */}
          {onClearFilter && (
            <button
              type="button"
              onClick={onClearFilter}
              aria-label={
                isFiltering
                  ? t("profile.clearFilterAria")
                  : clearFilterLabel || t("profile.filterBy")
              }
              title={
                isFiltering
                  ? t("profile.clearFilterAria")
                  : clearFilterLabel || t("profile.filterBy")
              }
              className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors focus-visible:ring-2 focus-visible:ring-brand-focus focus:outline-hidden cursor-pointer"
            >
              <CloseIcon className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      </div>

      {/* Số lượng kết quả căn phải trên màn hình rộng */}
      {resultsCount && (
        <div className="text-xs text-slate-500 dark:text-slate-400 self-center" role="status" aria-live="polite">
          {resultsCount}
        </div>
      )}

      {/* Render dialog cục bộ khi trang chạy độc lập ngoài RootLayout (vd: trong các test Vitest) */}
      {renderLocalDialog && <ProgramProfileDialog open={isOpen} onClose={close} />}
    </div>
  );
}
