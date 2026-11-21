"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Eye, EyeOff, RefreshCw, RotateCcw, Share2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useSemesters } from "@/lib/semesters";
import { useMounted } from "@/lib/useMounted";
import { PALETTE, useTimetable } from "@/lib/store";
import { buildShareUrl, decodeTimetable, type SharedTimetable } from "@/lib/shareUrl";
import { adjacencyViolations, conflictKeys, findConflicts } from "@/lib/conflicts";
import { appConfirm, appPrompt } from "@/lib/dialog";
import { SelectMenu } from "@/components/SelectMenu";
import { useMyProgramId } from "@/lib/myProgram";
import { totalCredits } from "@/lib/credits";
import { buildIcs } from "@/lib/ics";
import type { ClassSection } from "@/lib/types";
import { seatsAvailable } from "@/lib/modules";
import { Empty, EnBadge, Loading } from "@/components/ui";
import { ModuleSearch } from "@/components/ModuleSearch";
import { TimetableGrid, type GridBlock } from "@/components/TimetableGrid";
import { calculateWorkload } from "@/lib/workload";
import { WebcalSyncModal } from "@/components/WebcalSyncModal";
import { useT, weekdayName } from "@/i18n";
import { moduleName } from "@/i18n/names";

function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function TimetablePage() {
  const { t, lang } = useT();
  const myProgramId = useMyProgramId();
  const mounted = useMounted();
  const tt = useTimetable();
  const sems = useSemesters();
  const [loaded, setLoaded] = useState<{ sem: string; data: Record<string, ClassSection[]> }>({ sem: "", data: {} });
  const [pendingImport, setPendingImport] = useState<SharedTimetable | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [toast, setToast] = useState("");
  const [showWebcal, setShowWebcal] = useState(false);
  const [showNames, setShowNames] = useState(true);
  const [downOpen, setDownOpen] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const semester = tt.semester;
  const activeDraft = tt.activeDrafts[semester] || "Phương án 1"; // store key, kept in Vietnamese for stored data
  const draftNames = Object.keys(tt.drafts[semester] || { [activeDraft]: tt.bySemester[semester] ?? [] });
  const entries = useMemo(() => tt.bySemester[semester] ?? [], [tt.bySemester, semester]);
  const sections = useMemo(() => (loaded.sem === semester ? loaded.data : {}), [loaded, semester]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  const semLabel = useCallback(
    (s: { term: number | string; year: number | string }) => t("semester.label", { term: s.term, year: String(s.year) }),
    [t],
  );

  // Default semester
  useEffect(() => {
    if (!mounted || !sems.data?.length) return;
    if (!semester || !sems.data.some((s) => s.id === semester)) {
      tt.setSemester((sems.data.find((s) => s.is_current) ?? sems.data[0]).id);
    }
  }, [mounted, sems.data, semester, tt]);

  // Import from shared link
  useEffect(() => {
    if (!mounted) return;
    const shared = decodeTimetable(window.location.search);
    if (shared) setPendingImport(shared);
  }, [mounted]);

  // Load sections (and missing module info) for each entry
  const codesKey = entries.map((e) => e.code).join(",");
  useEffect(() => {
    if (!semester || !codesKey) return;
    let alive = true;
    const codes = codesKey.split(",");
    Promise.all(codes.map(async (code) => [code, (await api.classes(code, semester)).data] as const)).then((pairs) => {
      if (!alive) return;
      setLoaded((prev) => ({ sem: semester, data: { ...(prev.sem === semester ? prev.data : {}), ...Object.fromEntries(pairs) } }));
    });
    codes
      .filter((c) => !useTimetable.getState().info[c])
      .forEach(async (c) => {
        const d = (await api.module(c)).data;
        if (d) useTimetable.getState().rememberInfo(d);
      });
    return () => {
      alive = false;
    };
  }, [semester, codesKey]);

  // Auto-select first class for entries that have none (or an invalid one)
  useEffect(() => {
    for (const e of entries) {
      const list = sections[e.code];
      if (!list?.length) continue;
      if (!e.class_code || !list.some((s) => s.class_code === e.class_code)) tt.setClass(e.code, list[0].class_code);
    }
  }, [entries, sections, tt]);

  const selected = useMemo(
    () =>
      entries
        .filter((e) => !e.hidden && e.class_code)
        .map((e) => sections[e.code]?.find((s) => s.class_code === e.class_code))
        .filter((s): s is ClassSection => !!s),
    [entries, sections],
  );
  const conflicts = useMemo(() => findConflicts(selected), [selected]);
  const adjViolations = useMemo(() => adjacencyViolations(selected), [selected]);
  const ckeys = useMemo(() => conflictKeys(selected), [selected]);
  const colorOf = useCallback((code: string) => PALETTE[(entries.find((e) => e.code === code)?.color ?? 0) % PALETTE.length], [entries]);
  const colors = useMemo(() => Object.fromEntries(entries.map((e) => [e.code, colorOf(e.code)])), [entries, colorOf]);

  const blocks: GridBlock[] = selected.flatMap((s) =>
    s.lessons.map((l, i) => ({
      key: `${s.module_code}#${i}`,
      code: s.module_code,
      name: tt.info[s.module_code] ? moduleName(tt.info[s.module_code], lang) : s.module_code,
      class_code: s.class_code,
      lesson: l,
      color: colorOf(s.module_code),
      conflict: ckeys.has(`${s.module_code}#${i}`),
    })),
  );

  const creditItems = entries.map((e) => ({ credits: tt.info[e.code]?.credits ?? 0, hidden: e.hidden }));
  const unscheduled = entries.filter((e) => !e.hidden && sections[e.code] && sections[e.code].length === 0);
  const totalWorkloadHours = useMemo(() => {
    return entries
      .filter((e) => !e.hidden)
      .reduce((sum, e) => sum + calculateWorkload(tt.info[e.code]?.credits ?? 3).total_hours, 0);
  }, [entries, tt.info]);

  function share() {
    const url = buildShareUrl(window.location.origin, "/timetable", { semester, entries });
    setShareUrl(url);
    navigator.clipboard?.writeText(url).then(
      () => flash(t("tt.copied")),
      () => flash(t("tt.copyManual")),
    );
  }

  async function exportPng() {
    if (!gridRef.current) return;
    const { toPng } = await import("html-to-image");
    const dark = document.documentElement.classList.contains("dark");
    const url = await toPng(gridRef.current, { pixelRatio: 2, backgroundColor: dark ? "#0f172a" : "#ffffff" });
    download(`uelcourses-tkb-${semester}.png`, url);
  }

  function exportIcs() {
    if (!selected.length) return flash(t("tt.noClassesExport"));
    const names = Object.fromEntries(Object.values(tt.info).map((m) => [m.code, moduleName(m, lang)]));
    const ics = buildIcs(selected, { moduleNames: names, calendarName: `UELCourses ${semName}` });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    download(`uelcourses-tkb-${semester}.ics`, url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function acceptImport() {
    if (!pendingImport) return;
    tt.replaceSemester(pendingImport.semester, pendingImport.entries);
    setPendingImport(null);
    window.history.replaceState(null, "", "/timetable");
    flash(t("tt.imported"));
  }

  const semIdx = sems.data?.findIndex((s) => s.id === semester) ?? -1;
  const stepSem = (d: number) => {
    const n = sems.data?.[semIdx + d];
    if (n) tt.setSemester(n.id);
  };
  const semName = sems.data?.find((s) => s.id === semester);
  const semText = semName ? semLabel(semName) : semester;

  if (!mounted) return <Loading />;

  return (
    <div className="space-y-3">
      {/* semester switcher */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 transition hover:bg-brand-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-brand-900/50 dark:text-brand-200 dark:hover:bg-brand-800"
          onClick={() => stepSem(-1)}
          disabled={semIdx <= 0}
          aria-label={t("tt.prevSem")}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <SelectMenu
          className="min-w-[17rem]"
          ariaLabel={t("tt.selectSem")}
          value={semester}
          onChange={(v) => tt.setSemester(v)}
          options={(sems.data ?? []).map((s) => ({
            value: s.id,
            label: `Học kỳ ${s.term}`,
            display: semLabel(s),
            group: `Năm học ${String(s.year).replace("-", "–")}`,
          }))}
        />
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 transition hover:bg-brand-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-brand-900/50 dark:text-brand-200 dark:hover:bg-brand-800"
          onClick={() => stepSem(1)}
          disabled={semIdx < 0 || semIdx >= (sems.data?.length ?? 0) - 1}
          aria-label={t("tt.nextSem")}
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {pendingImport && (
        <div className="card flex flex-wrap items-center justify-between gap-2 border-brand-300 bg-brand-50 dark:bg-brand-900/30">
          <p className="text-sm">{t("tt.importText", { n: pendingImport.entries.length, sem: pendingImport.semester })}</p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={acceptImport}>{t("tt.import")}</button>
            <button className="btn-ghost" onClick={() => { setPendingImport(null); window.history.replaceState(null, "", "/timetable"); }}>{t("tt.skip")}</button>
          </div>
        </div>
      )}
      {shareUrl && (
        <div className="flex gap-2">
          <input className="input font-mono text-xs" readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label={t("tt.shareAria")} />
          <button className="btn-ghost" onClick={() => setShareUrl("")} aria-label={t("tt.hideLink")}>✕</button>
        </div>
      )}
      {toast && <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white shadow-lg md:bottom-6" role="status">{toast}</div>}

      {conflicts.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300" role="alert">
          <strong>{t("tt.conflicts", { n: conflicts.length })}</strong>{" "}
          {conflicts.slice(0, 5).map((c, i) => {
            const l = selected.find((s) => s.module_code === c.a.module_code)?.lessons[c.a.lessonIndex];
            return <span key={i} className="mr-2">{c.a.module_code} ↔ {c.b.module_code}{l ? ` (${weekdayName(t, l.weekday)})` : ""}</span>;
          })}
        </div>
      )}
      {adjViolations.length > 0 && (
        <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200" role="alert">
          <strong>Vi phạm quy định xếp lớp: {adjViolations.length} cặp lớp học cạnh nhau.</strong>
          <p className="mt-1 text-xs">
            Không được có hai lớp học liền kề qua ranh giới tiết 6 | 7 (sáng – chiều) và tiết 12 | 13 (chiều – tối) theo quy định phòng đào tạo.
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {adjViolations.slice(0, 5).map((c, i) => (
              <li key={i}>{c.a.module_code} ({c.a.class_code}) và {c.b.module_code} ({c.b.class_code})</li>
            ))}
          </ul>
        </div>
      )}

      {/* grid + toolbar */}
      <section className="min-w-0 space-y-2" aria-label={t("tt.title")}>
        <TimetableGrid
          ref={gridRef}
          blocks={blocks}
          alternatives={sections}
          colors={colors}
          showNames={showNames}
          onChangeClass={(code, cls) => { tt.setClass(code, cls); flash(t("tt.changed", { code, cls })); }}
        />
        {unscheduled.length > 0 && (
          <p className="text-xs text-amber-600">{t("tt.unscheduled", { codes: unscheduled.map((e) => e.code).join(", ") })}</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button className="btn-outline" onClick={() => setShowNames((v) => !v)} aria-pressed={showNames}>
            {showNames ? t("tt.hideNames") : t("tt.showNames")}
          </button>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <button className="btn-outline" onClick={() => setDownOpen((v) => !v)} aria-haspopup="menu" aria-expanded={downOpen}>
                <Download className="h-4 w-4" aria-hidden /> {t("tt.download")} <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </button>
              {downOpen && (
                <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-md dark:border-slate-700 dark:bg-slate-900" role="menu">
                  <button role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setDownOpen(false); exportPng(); }}>{t("tt.png")}</button>
                  <button role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setDownOpen(false); exportIcs(); }}>{t("tt.ics")}</button>
                </div>
              )}
            </div>
            <button className="btn-outline" onClick={share}><Share2 className="h-4 w-4" aria-hidden /> {t("tt.share")}</button>
            <button className="btn-outline" onClick={() => setShowWebcal(true)}><RefreshCw className="h-4 w-4" aria-hidden /> {t("tt.sync")}</button>
            <button
              className="btn-outline text-red-600"
              onClick={async () => {
                if (entries.length && (await appConfirm(t("tt.confirmReset"), { danger: true, okLabel: "Xóa hết" }))) tt.replaceSemester(semester, []);
              }}
              disabled={!entries.length}
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> {t("tt.reset")}
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* module list */}
        <div className="card space-y-3">
          <div>
            <p className="label">{t("tt.addLabel")}</p>
            <ModuleSearch
              onPick={(m) => tt.addModule(m)}
              exclude={entries.map((e) => e.code)}
              placeholder={t("tt.addPlaceholder")}
              programId={myProgramId}
              semester={semester}
            />
            {!myProgramId && (
              <p className="mt-1 text-xs text-slate-500">Nhập mã lớp (vd K23406E1) để chỉ hiện học phần trong chương trình của bạn.</p>
            )}
          </div>
          {entries.length === 0 ? (
            <Empty>{t("tt.emptyList")}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((e) => {
                const info = tt.info[e.code];
                const list = sections[e.code];
                return (
                  <li key={e.code} className={`space-y-1.5 py-2 ${e.hidden ? "opacity-60" : ""}`}>
                    <div className="flex items-start gap-2">
                      <div className="relative">
                        <button
                          className="mt-0.5 h-5 w-5 shrink-0 rounded"
                          style={{ backgroundColor: colorOf(e.code) }}
                          onClick={() => setPickerFor(pickerFor === e.code ? null : e.code)}
                          aria-label={t("tt.colorOf", { code: e.code })}
                          aria-expanded={pickerFor === e.code}
                        />
                        {pickerFor === e.code && (
                          <div className="absolute left-0 top-7 z-20 flex w-40 flex-wrap gap-1.5 rounded-md border border-slate-200 bg-white p-2 shadow-md dark:border-slate-700 dark:bg-slate-900" role="radiogroup" aria-label={t("tt.colorLabel")}>
                            {PALETTE.map((c, i) => (
                              <button
                                key={c}
                                role="radio"
                                aria-checked={e.color === i}
                                aria-label={t("tt.colorN", { n: i + 1 })}
                                onClick={() => { tt.setColor(e.code, i); setPickerFor(null); }}
                                className={`h-5 w-5 rounded ${e.color === i ? "ring-2 ring-slate-900 ring-offset-1 dark:ring-white" : ""}`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link href={`/modules/${encodeURIComponent(e.code)}`} className="block truncate text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                          <span className="font-mono">{e.code}</span> {info ? moduleName(info, lang) : "…"}
                        </Link>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          {t("common.credits", { n: info?.credits ?? "?" })}
                          {(info as { is_english?: boolean } | undefined)?.is_english ? <EnBadge /> : null}
                        </div>
                      </div>
                      <button
                        className="btn-ghost px-2 py-1"
                        onClick={() => tt.toggleHidden(e.code)}
                        aria-pressed={e.hidden}
                        aria-label={e.hidden ? t("tt.show", { code: e.code }) : t("tt.hide", { code: e.code })}
                        title={e.hidden ? t("tt.showTitle") : t("tt.hideTitle")}
                      >
                        {e.hidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                      </button>
                      <button className="btn-ghost px-2 py-1 text-red-600" onClick={() => tt.removeModule(e.code)} aria-label={t("tt.remove", { code: e.code })} title={t("tt.removeTitle")}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    {list === undefined ? (
                      <p className="text-xs text-slate-500">{t("tt.loadingClasses")}</p>
                    ) : list.length === 0 ? (
                      <p className="text-xs text-amber-600">{t("tt.noOpenClasses")}</p>
                    ) : (
                      <select className="input py-1 text-xs" value={e.class_code ?? ""} onChange={(ev) => tt.setClass(e.code, ev.target.value)} aria-label={t("tt.chooseClass", { code: e.code })}>
                        {list.map((s) => (
                          <option key={s.class_code} value={s.class_code}>
                            {s.class_code} — {s.lessons.map((l) => {
                              const time = l.start_time && l.end_time ? ` (${l.start_time} – ${l.end_time})` : "";
                              const dmy = (iso: string) => iso.split("-").reverse().join("/");
                              const dates = l.date_start ? `, từ ngày ${dmy(l.date_start)}${l.date_end && l.date_end !== l.date_start ? ` đến ${dmy(l.date_end)}` : ""}` : "";
                              return `${weekdayName(t, l.weekday)}, tiết ${l.start_period} đến tiết ${l.end_period}${time}${dates}`;
                            }).join("; ") || t("tt.noSchedule")}
                            {seatsAvailable(s) !== null ? ` (${seatsAvailable(s) === 0 ? t("tt.full") : t("tt.seatsLeft", { n: seatsAvailable(s) ?? 0 })})` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm dark:border-slate-800">
            <span>
              {t("tt.total")} <strong>{t("tt.totalCredits", { n: totalCredits(creditItems, false) })}</strong>
              {entries.some((e) => e.hidden) && <span className="text-slate-500"> / {totalCredits(creditItems)} {t("tt.hiddenIncluded")}</span>}
            </span>
            <span className="text-xs text-slate-500">{t("tt.workload", { n: totalWorkloadHours })}</span>
          </div>
        </div>

        {/* drafts */}
        <div className="card space-y-2 self-start">
          <div className="label mb-0">{t("tt.drafts")}</div>
          <div className="flex flex-wrap items-center gap-[6.3px]">
            {draftNames.map((name) => (
              <button
                key={name}
                onClick={() => tt.switchDraft(semester, name)}
                aria-pressed={name === activeDraft}
                className={`rounded px-[11.5px] py-[5px] text-[13.8px] font-semibold ${
                  name === activeDraft
                    ? "bg-brand-600 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {name}
              </button>
            ))}
            <button
              onClick={async () => {
                const name = await appPrompt(t("tt.newDraftPrompt"), {
                  title: "Thêm bản nháp",
                  defaultValue: `${t("tt.drafts")} ${draftNames.length + 1}`,
                  placeholder: "Tên bản nháp",
                  okLabel: "Tạo",
                  validate: (v) => (v ? null : "Vui lòng nhập tên bản nháp."),
                });
                if (name) tt.createDraft(semester, name, false);
              }}
              className="rounded border border-dashed border-slate-300 px-[11.5px] py-[5px] text-[13.8px] font-semibold text-slate-600 hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:text-slate-400"
              title={t("tt.newDraftTitle")}
            >
              {t("tt.newDraft")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const name = await appPrompt(t("tt.duplicatePrompt"), {
                  title: "Nhân bản bản nháp",
                  defaultValue: `${activeDraft} (${t("tt.duplicate")})`,
                  placeholder: "Tên bản nháp mới",
                  okLabel: "Nhân bản",
                  validate: (v) => (v ? null : "Vui lòng nhập tên bản nháp."),
                });
                if (name) {
                  tt.createDraft(semester, name, true);
                  flash(t("tt.duplicated", { name }));
                }
              }}
              className="rounded-md border border-brand-300 bg-brand-50 px-[11.5px] py-[5px] text-[13.8px] font-semibold text-brand-700 transition hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-200 dark:hover:bg-brand-900/70"
              title={t("tt.duplicateTitle")}
            >
              {t("tt.duplicate")}
            </button>
            {draftNames.length > 1 && (
              <button
                onClick={async () => {
                  if (await appConfirm(t("tt.confirmDeleteDraft", { name: activeDraft }), { danger: true, okLabel: "Xóa bản nháp" })) {
                    tt.deleteDraft(semester, activeDraft);
                    flash(t("tt.draftDeleted"));
                  }
                }}
                className="rounded-md border border-red-300 bg-red-50 px-[11.5px] py-[5px] text-[13.8px] font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
              >
                {t("tt.deleteDraft")}
              </button>
            )}
          </div>
        </div>
      </div>

      <WebcalSyncModal
        open={showWebcal}
        onClose={() => setShowWebcal(false)}
        sharedData={{ semester, entries }}
        semName={semText}
      />
    </div>
  );
}
