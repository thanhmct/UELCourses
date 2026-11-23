"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useSettings } from "@/lib/store";
import {
  describeProgramCodeFull,
  isDuplicateTrack,
  isProgramInCatalog,
  parseProgramCode,
  type ParsedProgramCode,
  resolveProgramAlias,
  validateProgramGroup,
} from "@/lib/programCode";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { track } from "@/lib/analytics";
import { buildProgramLookup, hasVerifiedUndergraduateTrack } from "@/lib/programLookup";
import { ProgramLookup } from "./ProgramLookup";
import {
  dismissProfilePromptThisSession,
  registerGlobalProfileDialogHost,
  useProfileDialog,
} from "@/lib/profileDialog";

export interface ProgramProfileDialogProps {
  open?: boolean;
  onClose?: () => void;
  firstVisit?: boolean;
}

export function ProgramProfileDialog({
  open: propOpen,
  onClose: propOnClose,
  firstVisit = false,
}: ProgramProfileDialogProps) {
  const { t, lang } = useT();
  const titleId = useId();

  const dialogStore = useProfileDialog();
  const open = propOpen !== undefined ? propOpen : dialogStore.isOpen;
  const onClose = propOnClose ?? dialogStore.close;

  const programsReq = useApi(() => api.programs({ degree: "all" }), []);
  const programs = programsReq.data;
  const validGroupsReq = useApi(
    () => (typeof api.validGroups === "function" ? api.validGroups() : Promise.resolve({ data: [], mock: false })),
    [],
  );
  const validGroups = validGroupsReq.data;
  const lookup = useMemo(() => buildProgramLookup(programs ?? [], validGroups ?? []), [programs, validGroups]);

  const storePrimary = useSettings((s) => s.programCode);
  const storeSecondary = useSettings((s) => s.secondaryProgramCode);
  const setProgramProfile = useSettings((s) => s.setProgramProfile);
  const setProgramPrompted = useSettings((s) => s.setProgramPrompted);

  const [primary, setPrimary] = useState(storePrimary);
  const [secondary, setSecondary] = useState(storeSecondary);
  const [primaryError, setPrimaryError] = useState("");
  const [secondaryError, setSecondaryError] = useState("");
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Ghi nhớ phần tử đã kích hoạt mở hộp thoại để trả focus khi đóng
  useEffect(() => {
    if (open) {
      triggerRef.current = (document.activeElement as HTMLElement) ?? null;
      panelRef.current?.querySelector<HTMLInputElement>("#profile-primary")?.focus();
    }
  }, [open]);

  const handleClose = () => {
    dismissProfilePromptThisSession();
    onClose();
    if (triggerRef.current && typeof triggerRef.current.focus === "function") {
      triggerRef.current.focus();
    }
  };

  const primaryParsed = primary.trim() ? parseProgramCode(primary) : null;
  const secondaryParsed = secondary.trim() ? parseProgramCode(secondary) : null;
  const loading = validGroupsReq.loading || programsReq.loading;
  const waitingForLookup = loading && !!(primaryParsed || secondaryParsed);
  const validate = (parsed: ParsedProgramCode | null) => {
    const result = validateProgramGroup(parsed, validGroups, lang);
    return !result.valid && parsed && (lookup.catalogue.has(parsed.normalized) || hasVerifiedUndergraduateTrack(parsed.normalized))
      ? { valid: true } : result;
  };
  const primaryGroupValidation = validate(primaryParsed);
  const secondaryGroupValidation = validate(secondaryParsed);

  const isKnown = (parsed: ParsedProgramCode) =>
    lookup.exactCodes.some((option) => option.code === parsed.normalized)
      || (parsed.degree === "dai_hoc" && !!validGroups?.length)
      || isProgramInCatalog(parsed);

  const getProgramInfo = (parsed: ParsedProgramCode | null) => {
    if (!parsed) return { name: null, coopName: null };
    const programId = parsed.programId;
    const name = lookup.getName(parsed);

    const coopMatch = programs?.find(
      (p) => (p.program_id === `${programId}H` || p.program_id === programId) && /co-?op/i.test(p.name),
    );
    const coopName = coopMatch?.name ?? null;
    return { name, coopName };
  };

  const primaryInfo = getProgramInfo(primaryParsed);
  const secondaryInfo = getProgramInfo(secondaryParsed);

  // Đồng bộ lại bản nháp mỗi khi hộp thoại mở ra (không mutate store khi hủy)
  // Tự động chuyển đổi các mã cũ (-V2, -V3, LKT...) sang mã chính thức (Brief W31)
  useEffect(() => {
    if (open) {
      setPrimary(resolveProgramAlias(storePrimary));
      setSecondary(resolveProgramAlias(storeSecondary));
      setPrimaryError("");
      setSecondaryError("");
    }
  }, [open, storePrimary, storeSecondary]);

  // Phím Escape để hủy
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    if (waitingForLookup) return;
    let hasErr = false;

    if (!primary.trim()) {
      setPrimaryError(t("profile.errPrimaryRequired"));
      hasErr = true;
    } else if (!primaryParsed) {
      setPrimaryError(t("profile.errInvalidFormat"));
      hasErr = true;
    } else if (!isKnown(primaryParsed)) {
      setPrimaryError(t("profile.errNotFound", { id: primaryParsed.programId }));
      hasErr = true;
    } else if (!primaryGroupValidation.valid && primaryGroupValidation.error) {
      setPrimaryError(primaryGroupValidation.error);
      hasErr = true;
    } else {
      setPrimaryError("");
    }

    if (secondary.trim()) {
      if (!secondaryParsed) {
        setSecondaryError(t("profile.errInvalidFormat"));
        hasErr = true;
      } else if (!isKnown(secondaryParsed)) {
        setSecondaryError(t("profile.errNotFound", { id: secondaryParsed.programId }));
        hasErr = true;
      } else if (primaryParsed && isDuplicateTrack(primaryParsed, secondaryParsed)) {
        setSecondaryError(t("profile.errDuplicateTrack"));
        hasErr = true;
      } else if (!secondaryGroupValidation.valid && secondaryGroupValidation.error) {
        setSecondaryError(secondaryGroupValidation.error);
        hasErr = true;
      } else {
        setSecondaryError("");
      }
    } else {
      setSecondaryError("");
    }

    if (hasErr) return;

    // Lưu nguyên tử (atomic update)
    const normPrimary = primaryGroupValidation.defaultClassCode ?? primaryParsed?.normalized ?? "";
    const normSecondary = secondaryGroupValidation.defaultClassCode ?? secondaryParsed?.normalized ?? "";
    setProgramProfile(normPrimary, normSecondary);
    if (normPrimary) {
      track("program_set", { program_code: normPrimary });
    }
    if (firstVisit) {
      setProgramPrompted(true);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("uel:toast", {
          detail: t("profile.savedToast"),
        }),
      );
    }
    handleClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]"
      onMouseDown={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && event.target === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && event.target === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
          <div>
            <h2 id={titleId} className="text-xl font-bold text-slate-900 dark:text-white">
              {t("profile.title")}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {t("profile.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label={t("common.close")}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 pt-1 pb-4 sm:px-6">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="profile-primary" className="label text-sm font-semibold">
                {t("profile.primaryBadge")}
              </label>
              <div className="flex items-center gap-1.5">
                {primaryParsed?.degree === "thac_si" && (
                  <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    {t("degree.thac_si")}
                  </span>
                )}
                {primaryParsed?.degree === "tien_si" && (
                  <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                    {t("degree.tien_si")}
                  </span>
                )}
              </div>
            </div>
            <ProgramLookup
              id="profile-primary"
              primary
              lookup={lookup}
              loading={loading}
              value={primary}
              onChange={(value) => {
                setPrimary(value);
                setPrimaryError("");
              }}
              onSave={handleSave}
            />
            {primaryError ? (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">{primaryError}</p>
            ) : !primaryGroupValidation.valid && primaryGroupValidation.error ? (
              <p className="text-xs text-red-600 dark:text-red-400">{primaryGroupValidation.error}</p>
            ) : primaryParsed ? (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                <p>{`→ ${describeProgramCodeFull(primaryParsed, primaryInfo.name, lang, primaryInfo.coopName)}`}</p>
                {(primaryParsed.degree !== "dai_hoc" || hasVerifiedUndergraduateTrack(primaryParsed.contextualProgramId)) && !loading
                  && !lookup.hasCurriculum(primaryParsed.contextualProgramId) && (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t("profile.lookupByModuleHelp")}</p>
                  )}
              </div>
            ) : null}
          </div>

          {/* Cột 2: Ngành 2 */}
          <div className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <label htmlFor="profile-secondary" className="label text-sm font-semibold">
                {t("profile.secondary")}
              </label>
              <div className="flex items-center gap-2">
                {secondaryParsed?.english && (
                  <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                    {t("profile.trackEn")}
                  </span>
                )}
                {secondary && (
                  <button
                    type="button"
                    onClick={() => {
                      setSecondary("");
                      setSecondaryError("");
                    }}
                    className="text-xs text-slate-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                  >
                    {t("profile.clearSecondary")}
                  </button>
                )}
              </div>
            </div>
            <ProgramLookup
              id="profile-secondary"
              lookup={lookup}
              loading={loading}
              value={secondary}
              onChange={(value) => {
                setSecondary(value);
                setSecondaryError("");
              }}
              onSave={handleSave}
            />
            {secondaryError ? (
              <p className="text-xs text-red-600 dark:text-red-400">{secondaryError}</p>
            ) : !secondaryGroupValidation.valid && secondaryGroupValidation.error ? (
              <p className="text-xs text-red-600 dark:text-red-400">{secondaryGroupValidation.error}</p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {secondaryParsed
                  ? `→ ${describeProgramCodeFull(secondaryParsed, secondaryInfo.name, lang, secondaryInfo.coopName)}`
                  : t("profile.secondaryHelp")}
              </p>
            )}
          </div>
        </div>

        {/* Hành động */}
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-6 dark:border-slate-800">
          <button type="button" className="btn-outline cursor-pointer" onClick={handleClose}>
            {firstVisit ? t("profile.later") : t("profile.cancel")}
          </button>
          <button
            type="button"
            className="btn-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleSave}
            disabled={waitingForLookup}
          >
            {t("profile.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hộp thoại dùng chung toàn cục gắn tại RootLayout */
export function GlobalProgramProfileDialog() {
  const { isOpen, close } = useProfileDialog();

  useEffect(() => {
    return registerGlobalProfileDialogHost();
  }, []);

  return <ProgramProfileDialog open={isOpen} onClose={close} />;
}
