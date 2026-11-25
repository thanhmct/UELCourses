"use client";
import { TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { api } from "@/lib/api";
import { usePlanner, useTimetable } from "@/lib/store";
import type { PlannedModule } from "@/lib/planner";
import type { ModuleRef, ModuleSummary, Semester } from "@/lib/types";
import { useT } from "@/i18n";
import { track } from "@/lib/analytics";

export const COMPLETED_WITHOUT_TERM = "__completed__";

export function placeModuleInPlanner(m: PlannedModule, targetTermId?: string) {
  const planner = usePlanner.getState();
  if (targetTermId === COMPLETED_WITHOUT_TERM) {
    planner.addCompletedModule(m);
    return;
  }
  planner.addToBacklog(m);
  if (!targetTermId || targetTermId === "backlog") return;
  const target = usePlanner.getState().terms.find((term) => term.id === targetTermId);
  if (target) usePlanner.getState().move(m.code, target.id);
}

export async function addModuleToPlanner(m: ModuleRef, targetTermId?: string) {
  const detail = (await api.module(m.code)).data;
  placeModuleInPlanner({
    code: m.code,
    name: detail?.name ?? m.name,
    name_en: detail?.name_en ?? m.name_en ?? null,
    credits: detail?.credits ?? m.credits,
    prerequisites: detail?.prerequisites ?? [],
    equivalents: detail?.equivalents ?? [],
  }, targetTermId);
}

/** Dòng cảnh báo "không có lớp mở ở học kỳ này"; dùng riêng khi cần đặt cảnh báo ngoài cụm nút (điện thoại). */
export function NoClassWarning({
  module,
  timetableSemester,
}: {
  module: Pick<ModuleSummary, "open_semesters">;
  timetableSemester?: Semester;
}) {
  const { t } = useT();
  const semesterId = timetableSemester?.id;
  const open = module.open_semesters;
  if (!semesterId || !open || open.some((s) => s.semester === semesterId && s.classes > 0)) return null;
  return (
    <p className="flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300">
      <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      <span>{t("act.noClasses")}</span>
    </p>
  );
}

export function ModuleActions({
  module,
  timetableSemester,
  compact = false,
  classCode = null,
  warningElsewhereOnPhone = false,
  stacked = false,
  equalCols = false,
  responsiveStack = false,
  className = "",
}: {
  /** Xếp hai nút theo hàng dọc, cảnh báo "không có lớp mở" do nơi gọi hiển thị. */
  stacked?: boolean;
  module: ModuleRef & Pick<ModuleSummary, "open_semesters">;
  timetableSemester?: Semester;
  compact?: boolean;
  classCode?: string | null;
  /** Trên điện thoại dòng "không có lớp mở" được hiển thị ở nơi khác (xem NoClassWarning). */
  warningElsewhereOnPhone?: boolean;
  /** Xếp hai nút thành hai cột đều nhau (vd. cân bằng với nút Báo lỗi ở trang chi tiết). */
  equalCols?: boolean;
  /** Điện thoại: xếp dọc, chồng lên nhau, đủ rộng để bấm. Máy tính (sm+): quay lại vừa khít nội dung, nằm ngang. */
  responsiveStack?: boolean;
  /** Lớp bổ sung cho khung bọc ngoài (vd. col-span khi đặt trong lưới cha). */
  className?: string;
}) {
  const addTT = useTimetable((s) => s.addModule);
  const removeTT = useTimetable((s) => s.removeModule);
  const removePlan = usePlanner((s) => s.removeModule);
  const semesterId = timetableSemester?.id;
  const doneTT = useTimetable((s) =>
    !!semesterId && (s.bySemester[semesterId]?.some((entry) => entry.code === module.code) ?? false),
  );
  const donePlan = usePlanner((s) =>
    s.backlog.includes(module.code) || s.terms.some((term) => term.modules.includes(module.code)),
  );
  const { t } = useT();
  const warningId = useId();
  const [addingPlan, setAddingPlan] = useState(false);
  const [planError, setPlanError] = useState(false);
  const semesterLabel = timetableSemester ? t("act.timetableSemester") : "";
  const openSemesters = module.open_semesters;
  let timetableWarning = "";
  if (semesterId && openSemesters && !openSemesters.some((s) => s.semester === semesterId && s.classes > 0)) {
    timetableWarning = t("act.noClasses");
  }
  const buttonSize = `${compact ? "px-2 py-1 text-xs" : ""} ${
    stacked || equalCols
      ? "w-full min-h-12 justify-center text-center"
      : responsiveStack
        ? "min-h-12 justify-center text-center sm:min-h-0"
        : ""
  }`;
  const addStyle = "btn-outline enabled:hover:border-brand-600 enabled:hover:bg-brand-600 enabled:hover:text-white dark:enabled:hover:border-brand-300 dark:enabled:hover:bg-brand-300 dark:enabled:hover:text-brand-900";
  const timetableRemoveStyle = "btn border-2 border-brand-700 bg-brand-50 text-brand-700 shadow-md hover:bg-brand-600 hover:text-white focus-visible:bg-brand-600 focus-visible:text-white dark:border-brand-300 dark:bg-slate-800 dark:text-brand-300 dark:hover:bg-brand-600 dark:hover:text-white dark:focus-visible:bg-brand-600 dark:focus-visible:text-white";
  const plannerRemoveStyle = "btn brand-fill border border-brand-600 hover:bg-none hover:bg-white hover:text-brand-700 focus-visible:bg-none focus-visible:bg-white focus-visible:text-brand-700 dark:hover:bg-slate-900 dark:hover:text-brand-300 dark:focus-visible:bg-slate-900 dark:focus-visible:text-brand-300";
  const timetableAction = t(doneTT ? "act.removeTT" : "act.toTT");
  const plannerAction = t(donePlan ? "act.removePlan" : "act.toPlan");

  const wrapperBase = stacked
    ? "flex min-w-0 max-w-full flex-col items-stretch gap-2"
    : equalCols
      ? "grid min-w-0 max-w-full grid-cols-2 items-stretch gap-2"
      : responsiveStack
        ? "flex min-w-0 max-w-full flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-end"
        : "flex min-w-0 max-w-full flex-wrap items-stretch gap-x-2 gap-y-1";

  return (
    <div className={`${wrapperBase} ${className}`.trim()}>
      {stacked && timetableWarning && (
        <p id={warningId} className="hidden items-center gap-1 text-xs font-medium text-amber-800 sm:flex dark:text-amber-300">
          <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          <span>{timetableWarning}</span>
        </p>
      )}
      <button
        type="button"
        className={`${doneTT ? timetableRemoveStyle : addStyle} ${buttonSize} cursor-pointer flex-col gap-0.5`}
        aria-label={[timetableAction, semesterLabel].filter(Boolean).join(" ")}
        aria-describedby={timetableWarning ? warningId : undefined}
        disabled={!semesterId}
        onClick={() => {
          if (!semesterId) return;
          if (doneTT) {
            removeTT(module.code, semesterId);
            track("timetable_remove", { module_code: module.code, semester_id: semesterId });
            return;
          }
          addTT(module, classCode ?? null, semesterId);
          track("timetable_add", {
            module_code: module.code,
            class_code: classCode ?? null,
            semester_id: semesterId,
          });
        }}
      >
        <span>{timetableAction}</span>
        {semesterLabel && <span className="text-xs font-normal">{semesterLabel}</span>}
      </button>
      <button
        type="button"
        className={`${donePlan ? plannerRemoveStyle : addStyle} ${buttonSize} cursor-pointer`}
        disabled={addingPlan}
        onClick={async () => {
          if (addingPlan) return;
          if (donePlan) {
            removePlan(module.code);
            return;
          }
          setAddingPlan(true);
          setPlanError(false);
          try {
            await addModuleToPlanner(module);
            track("planner_add", { module_code: module.code, semester_id: semesterId || undefined });
          } catch {
            setPlanError(true);
          } finally {
            setAddingPlan(false);
          }
        }}
      >
        {plannerAction}
      </button>
      {!stacked && openSemesters && (compact || timetableWarning) && (
        <div className={`relative h-5 w-full ${warningElsewhereOnPhone ? "hidden sm:block" : ""}`}>
          {timetableWarning && (
            <span id={warningId} className="absolute inset-0 flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300">
              <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate" title={timetableWarning}>{timetableWarning}</span>
            </span>
          )}
        </div>
      )}
      <span className="sr-only" role="status">
        {[doneTT && !timetableWarning ? t("act.addedTT") : "", donePlan ? t("act.addedPlan") : ""].filter(Boolean).join(". ")}
      </span>
      {planError && <p className="w-full text-xs text-red-700 dark:text-red-300" role="alert">{t("act.planError")}</p>}
    </div>
  );
}
