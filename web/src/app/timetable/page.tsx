"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useMounted } from "@/lib/useMounted";
import { PALETTE, useTimetable } from "@/lib/store";
import { buildShareUrl, decodeTimetable, type SharedTimetable } from "@/lib/shareUrl";
import { conflictKeys, findConflicts } from "@/lib/conflicts";
import { totalCredits } from "@/lib/credits";
import { buildIcs } from "@/lib/ics";
import { PERIOD_COUNT, SESSION_BOUNDARIES, weekdayLabel } from "@/lib/periods";
import type { ClassSection } from "@/lib/types";
import { seatsAvailable } from "@/lib/modules";
import { Empty, Loading, PageHeader } from "@/components/ui";
import { ModuleSearch } from "@/components/ModuleSearch";
import { TimetableGrid, type GridBlock } from "@/components/TimetableGrid";
import { calculateWorkload } from "@/lib/workload";
import { WebcalSyncModal } from "@/components/WebcalSyncModal";

function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function TimetablePage() {
  const mounted = useMounted();
  const tt = useTimetable();
  const sems = useApi(() => api.semesters(), []);
  const [loaded, setLoaded] = useState<{ sem: string; data: Record<string, ClassSection[]> }>({ sem: "", data: {} });
  const [pendingImport, setPendingImport] = useState<SharedTimetable | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [toast, setToast] = useState("");
  const [showWebcal, setShowWebcal] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const semester = tt.semester;
  const activeDraft = tt.activeDrafts[semester] || "Phương án 1";
  const draftNames = Object.keys(tt.drafts[semester] || { [activeDraft]: tt.bySemester[semester] ?? [] });
  const entries = useMemo(() => tt.bySemester[semester] ?? [], [tt.bySemester, semester]);
  const sections = useMemo(() => (loaded.sem === semester ? loaded.data : {}), [loaded, semester]);

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(""), 2500);
  };

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
  const ckeys = useMemo(() => conflictKeys(selected), [selected]);
  const colorOf = useCallback((code: string) => PALETTE[(entries.find((e) => e.code === code)?.color ?? 0) % PALETTE.length], [entries]);
  const colors = useMemo(() => Object.fromEntries(entries.map((e) => [e.code, colorOf(e.code)])), [entries, colorOf]);

  const blocks: GridBlock[] = selected.flatMap((s) =>
    s.lessons.map((l, i) => ({
      key: `${s.module_code}#${i}`,
      code: s.module_code,
      name: tt.info[s.module_code]?.name ?? s.module_code,
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
      () => flash("Đã sao chép liên kết chia sẻ"),
      () => flash("Hãy sao chép liên kết bên dưới"),
    );
  }

  async function exportPng() {
    if (!gridRef.current) return;
    const { toPng } = await import("html-to-image");
    const dark = document.documentElement.classList.contains("dark");
    const url = await toPng(gridRef.current, { pixelRatio: 2, backgroundColor: dark ? "#0f172a" : "#ffffff" });
    download(`uelplan-tkb-${semester}.png`, url);
  }

  function exportIcs() {
    if (!selected.length) return flash("Chưa có lớp nào để xuất");
    const names = Object.fromEntries(Object.values(tt.info).map((m) => [m.code, m.name]));
    const ics = buildIcs(selected, { moduleNames: names, calendarName: `UELPlan ${semName}` });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    download(`uelplan-tkb-${semester}.ics`, url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function acceptImport() {
    if (!pendingImport) return;
    tt.replaceSemester(pendingImport.semester, pendingImport.entries);
    setPendingImport(null);
    window.history.replaceState(null, "", "/timetable");
    flash("Đã nhập thời khóa biểu từ liên kết");
  }

  const semName = sems.data?.find((s) => s.id === semester)?.name ?? semester;

  if (!mounted) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Thời khóa biểu"
        subtitle="Thêm môn, chọn lớp, kéo một khối lịch để xem các lớp khác của cùng môn rồi thả vào lớp muốn đổi."
        actions={
          <>
            <button className="btn-outline" onClick={() => setShowWebcal(true)}>Đồng bộ Webcal</button>
            <button className="btn-outline" onClick={share}>Chia sẻ</button>
            <button className="btn-outline" onClick={exportPng}>Xuất PNG</button>
            <button className="btn-outline" onClick={exportIcs}>Xuất .ics</button>
          </>
        }
      />
      {pendingImport && (
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-2 border-brand-300 bg-brand-50 dark:bg-brand-900/30">
          <p className="text-sm">
            Liên kết chứa thời khóa biểu gồm <strong>{pendingImport.entries.length}</strong> môn cho học kỳ <strong>{pendingImport.semester}</strong>. Nhập sẽ thay thế TKB hiện tại của học kỳ đó.
          </p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={acceptImport}>Nhập</button>
            <button className="btn-ghost" onClick={() => { setPendingImport(null); window.history.replaceState(null, "", "/timetable"); }}>Bỏ qua</button>
          </div>
        </div>
      )}
      {shareUrl && (
        <div className="mb-4 flex gap-2">
          <input className="input font-mono text-xs" readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label="Liên kết chia sẻ" />
          <button className="btn-ghost" onClick={() => setShareUrl("")} aria-label="Ẩn liên kết">✕</button>
        </div>
      )}
      {toast && <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg" role="status">{toast}</div>}

      {/* Multiple Timetable Drafts Toolbar */}
      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-2.5 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 mr-1">Phương án:</span>
          {draftNames.map((name) => (
            <button
              key={name}
              onClick={() => tt.switchDraft(semester, name)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                name === activeDraft
                  ? "bg-brand-600 text-white shadow-xs"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
              }`}
            >
              {name}
            </button>
          ))}
          <button
            onClick={() => {
              const nextNum = draftNames.length + 1;
              const name = prompt("Tên phương án mới:", `Phương án ${nextNum}`);
              if (name && name.trim()) tt.createDraft(semester, name.trim(), false);
            }}
            className="rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:text-slate-400"
            title="Tạo phương án trống"
          >
            + Phương án mới
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => {
              const name = prompt("Tên kịch bản nhân bản:", `${activeDraft} (Bản sao)`);
              if (name && name.trim()) {
                tt.createDraft(semester, name.trim(), true);
                flash(`Đã nhân bản sang ${name.trim()}`);
              }
            }}
            className="btn-outline text-xs py-1"
            title="Tạo bản sao từ phương án hiện tại để thử đổi lớp dự phòng"
          >
            📋 Nhân bản
          </button>
          {draftNames.length > 1 && (
            <button
              onClick={() => {
                if (confirm(`Xóa kịch bản "${activeDraft}"?`)) {
                  tt.deleteDraft(semester, activeDraft);
                  flash("Đã xóa kịch bản");
                }
              }}
              className="btn-ghost text-xs text-red-500 hover:bg-red-50 py-1"
              title="Xóa phương án này"
            >
              Xóa
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="card space-y-3">
            <div>
              <label className="label" htmlFor="sem">Học kỳ</label>
              <select id="sem" className="input" value={semester} onChange={(e) => tt.setSemester(e.target.value)}>
                {sems.data?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <ModuleSearch onPick={(m) => tt.addModule(m)} exclude={entries.map((e) => e.code)} />
            <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
              <span>Tổng tín chỉ</span>
              <span className="font-bold">
                {totalCredits(creditItems, false)}
                {entries.some((e) => e.hidden) && <span className="font-normal text-slate-500"> / {totalCredits(creditItems)} (gồm môn ẩn)</span>}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs dark:bg-slate-800">
              <span className="text-slate-500">Khối lượng (Workload)</span>
              <span className="font-semibold text-brand-700 dark:text-brand-300">
                ~{totalWorkloadHours} giờ/tuần
              </span>
            </div>
            {conflicts.length > 0 && (
              <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300" role="alert">
                <strong>{conflicts.length} chỗ trùng lịch:</strong>
                <ul className="mt-1 list-disc pl-5">
                  {conflicts.slice(0, 5).map((c, i) => {
                    const l = selected.find((s) => s.module_code === c.a.module_code)?.lessons[c.a.lessonIndex];
                    return <li key={i}>{c.a.module_code} ↔ {c.b.module_code}{l ? ` (${weekdayLabel(l.weekday)})` : ""}</li>;
                  })}
                </ul>
              </div>
            )}
          </div>

          {entries.length === 0 ? (
            <Empty>Chưa có môn nào. Tìm và thêm học phần ở ô phía trên.</Empty>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => {
                const info = tt.info[e.code];
                const list = sections[e.code];
                return (
                  <li key={e.code} className={`card space-y-2 p-3 ${e.hidden ? "opacity-60" : ""}`}>
                    <div className="flex items-start gap-2">
                      <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colorOf(e.code) }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{e.code} · {info?.name ?? "…"}</div>
                        <div className="text-xs text-slate-500">{info?.credits ?? "?"} tín chỉ</div>
                      </div>
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => tt.toggleHidden(e.code)} aria-pressed={e.hidden}>
                        {e.hidden ? "Hiện" : "Ẩn"}
                      </button>
                      <button className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={() => tt.removeModule(e.code)} aria-label={`Xóa ${e.code}`}>Xóa</button>
                    </div>
                    {list === undefined ? (
                      <p className="text-xs text-slate-500">Đang tải lớp…</p>
                    ) : list.length === 0 ? (
                      <p className="text-xs text-amber-600">Không có lớp mở trong học kỳ này.</p>
                    ) : (
                      <select className="input py-1 text-xs" value={e.class_code ?? ""} onChange={(ev) => tt.setClass(e.code, ev.target.value)} aria-label={`Chọn lớp ${e.code}`}>
                        {list.map((s) => (
                          <option key={s.class_code} value={s.class_code}>
                            {s.class_code} — {s.lessons.map((l) => `${weekdayLabel(l.weekday, true)} t${l.start_period}-${l.end_period}`).join(", ") || "chưa xếp lịch"}
                            {seatsAvailable(s) !== null ? ` (${seatsAvailable(s) === 0 ? "hết chỗ" : `còn ${seatsAvailable(s)}`})` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Màu">
                      {PALETTE.map((c, i) => (
                        <button
                          key={c}
                          role="radio"
                          aria-checked={e.color === i}
                          aria-label={`Màu ${i + 1}`}
                          onClick={() => tt.setColor(e.code, i)}
                          className={`h-5 w-5 rounded-full ${e.color === i ? "ring-2 ring-slate-900 ring-offset-1 dark:ring-white" : ""}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="min-w-0 space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {semName} · tiết 1–{SESSION_BOUNDARIES.morningEnd} sáng, {SESSION_BOUNDARIES.morningEnd + 1}–{SESSION_BOUNDARIES.afternoonEnd} chiều, {SESSION_BOUNDARIES.afternoonEnd + 1}–{PERIOD_COUNT} tối. Khối viền đỏ là lớp bị trùng lịch.
          </p>
          <TimetableGrid ref={gridRef} blocks={blocks} alternatives={sections} colors={colors} onChangeClass={(code, cls) => { tt.setClass(code, cls); flash(`Đã đổi ${code} sang lớp ${cls}`); }} />
          {unscheduled.length > 0 && (
            <p className="text-xs text-amber-600">Không có lịch: {unscheduled.map((e) => e.code).join(", ")}</p>
          )}
        </section>
      </div>

      <WebcalSyncModal
        open={showWebcal}
        onClose={() => setShowWebcal(false)}
        sharedData={{ semester, entries }}
        semName={semName}
      />
    </div>
  );
}

