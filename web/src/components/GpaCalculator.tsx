"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlanner } from "@/lib/store";
import { api } from "@/lib/api";
import {
  calculateGpa,
  GRADE_10_SCALE,
  GRADE_POINTS,
  scoreToLetter,
  simulateTargetGpa,
  type GradeItem,
} from "@/lib/gpa";
import { useT } from "@/i18n";
import { moduleName } from "@/i18n/names";
import { useApi } from "@/lib/useApi";
import { useDebounced } from "@/lib/useDebounced";
import { activeToken, finishedCodes, rankSuggestions, replaceActiveToken } from "@/lib/codeTokens";

const GRADES_STORAGE_KEY = "uelcourses-user-grades";
const SCORES_STORAGE_KEY = "uelcourses-user-scores";
const DONE_GROUP = "__completed__";

/** Chuỗi mã môn nhập tay: tách bằng dấu phẩy, chấm phẩy, khoảng trắng hoặc xuống dòng; bỏ trùng, viết hoa. */
function parseCodes(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(/[\s,;]+/)) {
    const c = raw.trim().toUpperCase();
    if (c) seen.add(c);
  }
  return [...seen];
}

/** lib/gpa returns Vietnamese classification labels; map them to translation keys for display. */
const CLASS_KEY: Record<string, string> = {
  "Xuất sắc": "gpa.cls.excellent",
  "Giỏi": "gpa.cls.good",
  "Khá": "gpa.cls.fair",
  "Trung bình": "gpa.cls.average",
  "Yếu / Kém": "gpa.cls.weak",
};

/** Ô thêm nhiều mã môn cùng lúc vào bảng điểm; từng mã có dòng báo kết quả riêng. */
function AddCodesBox() {
  const planner = usePlanner((s) => s.terms);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<string>(DONE_GROUP);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ code: string; ok: boolean; msg: string }[]>([]);
  const { lang } = useT();

  // Gợi ý mã khớp với phần đang gõ (đoạn sau dấu phẩy cuối cùng); mỗi dấu phẩy bắt đầu một mã mới.
  const { token } = activeToken(text);
  const dq = useDebounced(token.trim(), 250);
  const suggestReq = useApi(
    () => (dq.length >= 2 ? api.modules({ q: dq, size: 12 }) : Promise.resolve({ data: { items: [], total: 0 }, mock: false })),
    [dq],
  );
  const suggestions = useMemo(
    () => (dq.length >= 2 && token.trim().length >= 2 ? rankSuggestions(suggestReq.data?.items ?? [], token, finishedCodes(text)).slice(0, 8) : []),
    [suggestReq.data, dq, token, text],
  );

  const add = async () => {
    const codes = parseCodes(text);
    if (codes.length === 0) return;
    setBusy(true);
    const rows: { code: string; ok: boolean; msg: string }[] = [];
    for (const code of codes) {
      try {
        const detail = (await api.module(code)).data;
        if (!detail) {
          rows.push({ code, ok: false, msg: "không tìm thấy trong danh mục học phần" });
          continue;
        }
        const st = usePlanner.getState();
        st.addToBacklog({
          code,
          name: detail.name,
          name_en: detail.name_en ?? null,
          credits: detail.credits ?? 0,
          prerequisites: detail.prerequisites ?? [],
          equivalents: detail.equivalents ?? [],
        });
        if (target === DONE_GROUP) {
          if (!st.completed.includes(code)) st.toggleCompleted(code);
        } else {
          st.move(code, target);
        }
        rows.push({ code, ok: true, msg: detail.name });
      } catch {
        rows.push({ code, ok: false, msg: "lỗi tải dữ liệu, thử lại sau" });
      }
    }
    setReport(rows);
    setBusy(false);
    if (rows.every((r) => r.ok)) setText("");
  };

  return (
    <div className="card space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Thêm môn vào bảng điểm</h4>
        <p className="text-xs text-slate-500">Nhập nhiều mã cùng lúc, cách nhau bằng dấu phẩy hoặc xuống dòng. Mỗi mã được báo kết quả riêng.</p>
      </div>
      <textarea
        rows={2}
        aria-label="Mã học phần cần thêm"
        className="input font-mono text-sm"
        placeholder="VD: BIM5011, BFF4002, TKE2001"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {token.trim().length >= 2 && (
        <div className="rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" role="listbox" aria-label="Gợi ý mã học phần">
          <p className="border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-800">
            {suggestReq.loading
              ? `Đang tìm mã khớp với “${token.trim()}”…`
              : suggestions.length > 0
                ? `Mã khớp với “${token.trim()}” — bấm để chọn, sau dấu phẩy là mã mới`
                : `Không có mã nào khớp với “${token.trim()}”`}
          </p>
          <ul className="max-h-56 overflow-auto">
            {suggestions.map((m) => (
              <li key={m.code} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="flex w-full justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-brand-50 dark:hover:bg-slate-800"
                  onClick={() => setText((prev) => replaceActiveToken(prev, m.code))}
                >
                  <span><span className="font-mono font-semibold">{m.code}</span> {moduleName(m, lang)}</span>
                  <span className="shrink-0 text-xs text-slate-500">{m.credits ?? "?"} TC</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="add-target" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Thêm vào</label>
        <select id="add-target" className="input w-auto py-1 text-xs" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value={DONE_GROUP}>Đã hoàn thành</option>
          {planner.map((term) => (
            <option key={term.id} value={term.id}>{term.name}</option>
          ))}
        </select>
        <button type="button" className="btn-primary" onClick={add} disabled={busy || !text.trim()}>
          {busy ? "Đang thêm…" : "Thêm môn"}
        </button>
      </div>
      {report.length > 0 && (
        <ul className="space-y-1 text-xs">
          {report.map((r) => (
            <li key={r.code} className={r.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}>
              {r.ok ? "✓" : "✗"} <span className="font-mono font-bold">{r.code}</span> — {r.msg}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function GpaCalculator() {
  const { t, lang } = useT();
const planner = usePlanner();
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, number>>({}); // điểm thang 10 người dùng nhập
  const [targetDegree, setTargetDegree] = useState<number>(3.2); // default: Giỏi (3.2)
  const [totalProgramCredits, setTotalProgramCredits] = useState<number>(135);

  // Load saved grades and scores from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GRADES_STORAGE_KEY);
      if (raw) setGrades(JSON.parse(raw));
      const rawScores = localStorage.getItem(SCORES_STORAGE_KEY);
      if (rawScores) setScores(JSON.parse(rawScores));
    } catch (e) {
      console.error("Failed to load grades", e);
    }
  }, []);

  const persist = (gradesNext: Record<string, string>, scoresNext: Record<string, number>) => {
    try {
      localStorage.setItem(GRADES_STORAGE_KEY, JSON.stringify(gradesNext));
      localStorage.setItem(SCORES_STORAGE_KEY, JSON.stringify(scoresNext));
    } catch (e) {
      console.error("Failed to save grade", e);
    }
  };

  /** Chọn điểm chữ trực tiếp: xóa điểm số đã nhập của môn đó. */
  const handleGradeChange = (code: string, grade: string) => {
    const nextGrades = { ...grades };
    const nextScores = { ...scores };
    if (grade) nextGrades[code] = grade;
    else delete nextGrades[code];
    delete nextScores[code];
    setGrades(nextGrades);
    setScores(nextScores);
    persist(nextGrades, nextScores);
  };

  /** Nhập điểm thang 10: đổi tự động sang điểm chữ. Ô trống thì xóa điểm. */
  const handleScoreChange = (code: string, raw: string) => {
    const nextGrades = { ...grades };
    const nextScores = { ...scores };
    const value = raw.trim() === "" ? NaN : Number(raw);
    const letter = scoreToLetter(value);
    if (letter) {
      nextScores[code] = value;
      nextGrades[code] = letter;
    } else {
      delete nextScores[code];
      delete nextGrades[code];
    }
    setGrades(nextGrades);
    setScores(nextScores);
    persist(nextGrades, nextScores);
  };

  // Group modules by term from the planner; key = internal id, label = display name
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: GradeItem[] }>();
    if (planner.completed.length > 0) {
      map.set(DONE_GROUP, {
        label: t("gpa.doneGroup"),
        items: planner.completed.map((code) => ({
          code,
          name: planner.catalog[code] ? moduleName(planner.catalog[code], lang) : code,
          credits: planner.catalog[code]?.credits || 3,
          grade: grades[code] || "A",
          term: DONE_GROUP,
        })),
      });
    }
    for (const term of planner.terms) {
      if (term.modules.length > 0) {
        map.set(term.id, {
          label: term.name,
          items: term.modules.map((code) => ({
            code,
            name: planner.catalog[code] ? moduleName(planner.catalog[code], lang) : code,
            credits: planner.catalog[code]?.credits || 3,
            grade: grades[code] || "",
            term: term.id,
          })),
        });
      }
    }
    return map;
  }, [planner, grades, t, lang]);

  const allGradedItems = useMemo(() => {
    const list: GradeItem[] = [];
    groups.forEach((g) => list.push(...g.items));
    return list;
  }, [groups]);

  const overallGpa = useMemo(() => calculateGpa(allGradedItems), [allGradedItems]);
  const classLabel = (label: string) => (CLASS_KEY[label] ? t(CLASS_KEY[label]) : label);

  const targetSim = useMemo(() => {
    const remainingCredits = Math.max(0, totalProgramCredits - overallGpa.gradedCredits);
    return simulateTargetGpa(overallGpa.gpa4, overallGpa.gradedCredits, remainingCredits, targetDegree);
  }, [overallGpa, totalProgramCredits, targetDegree]);

  const card = "card";
  const kpi = "text-xs font-semibold uppercase tracking-wider text-slate-500";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${card} border-brand-200 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-950/20`}>
          <span className={`${kpi} !text-brand-700 dark:!text-brand-300`}>{t("gpa.cumulative")}</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-brand-800 dark:text-brand-200">{overallGpa.gpa4 > 0 ? overallGpa.gpa4.toFixed(2) : "0.00"}</span>
            <span className="text-xs text-slate-500">/ 4.00</span>
          </div>
          <div className="mt-1">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${overallGpa.classification.color}`}>{classLabel(overallGpa.classification.label)}</span>
          </div>
        </div>

        <div className={card}>
          <span className={kpi}>{t("gpa.ten")}</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">{overallGpa.gpa10 > 0 ? overallGpa.gpa10.toFixed(1) : "0.0"}</span>
            <span className="text-xs text-slate-500">/ 10.0</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{t("gpa.tenNote")}</p>
        </div>

        <div className={card}>
          <span className={kpi}>{t("gpa.graded")}</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">{overallGpa.gradedCredits}</span>
            <span className="text-xs text-slate-500">/ {t("common.credits", { n: totalProgramCredits })}</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.min(100, (overallGpa.gradedCredits / totalProgramCredits) * 100)}%` }} />
          </div>
        </div>

        <div className={card}>
          <span className={kpi}>{t("gpa.remaining")}</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">{Math.max(0, totalProgramCredits - overallGpa.gradedCredits)}</span>
            <span className="text-xs text-slate-500">{t("common.unitCr")}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{t("gpa.ungraded", { n: allGradedItems.length - Object.keys(grades).length })}</p>
        </div>
      </div>

      {/* Target simulator */}
      <div className={`${card} border-brand-200 dark:border-brand-800`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">{t("gpa.targetTitle")}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{t("gpa.targetDesc")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <label htmlFor="target-grade" className="font-semibold text-slate-600 dark:text-slate-300">{t("gpa.target")}</label>
              <select id="target-grade" className="input py-1 text-xs" value={targetDegree} onChange={(e) => setTargetDegree(Number(e.target.value))}>
                <option value={3.6}>{t("gpa.tOut")}</option>
                <option value={3.2}>{t("gpa.tGood")}</option>
                <option value={2.5}>{t("gpa.tFair")}</option>
                <option value={2.0}>{t("gpa.tAvg")}</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <label htmlFor="total-cr" className="font-semibold text-slate-600 dark:text-slate-300">{t("gpa.totalCr")}</label>
              <input id="total-cr" type="number" className="input w-20 py-1 text-xs" value={totalProgramCredits} onChange={(e) => setTotalProgramCredits(Number(e.target.value) || 135)} />
            </div>
          </div>
        </div>
        <div className="mt-3">
          <div
            role="status"
            className={`rounded border p-3 text-sm ${
              targetSim.feasible
                ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 font-semibold">
              <span>{targetSim.feasible ? t("gpa.feasible") : t("gpa.warn")}</span>
              <span className="font-normal">{targetSim.message}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grades by term */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-slate-900 dark:text-white">{t("gpa.tableTitle")}</h3>
          <span className="text-xs text-slate-500">{t("gpa.tableNote")}</span>
        </div>

        <AddCodesBox />

        {Array.from(groups.entries()).map(([key, group]) => {
          const termGpa = calculateGpa(group.items);
          return (
            <div key={key} className="card overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{t("gpa.termCount", { name: group.label, n: group.items.length })}</div>
                <div className="flex items-center gap-3 text-xs">
                  <span>{t("gpa.totalCr2")} <strong>{termGpa.totalCredits}</strong></span>
                  <span>
                    {t("gpa.termGpa")}{" "}
                    <strong className="text-brand-700 dark:text-brand-300">{termGpa.gpa4 > 0 ? termGpa.gpa4.toFixed(2) : "—"}</strong>
                  </span>
                  {termGpa.gpa4 > 0 && (
                    <span className={`rounded px-1.5 text-[10px] font-semibold ${termGpa.classification.color}`}>{classLabel(termGpa.classification.label)}</span>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 text-[11px] uppercase text-slate-400 dark:border-slate-800">
                    <tr>
                      <th className="w-28 px-3 py-2">{t("gpa.thCode")}</th>
                      <th className="px-2 py-2">{t("gpa.thName")}</th>
                      <th className="w-16 px-2 py-2 text-center">{t("gpa.thCredits")}</th>
                      <th className="w-64 px-3 py-2 text-center">{t("gpa.thGrade")}</th>
                      <th className="w-28 px-3 py-2 text-center">{t("gpa.thPoints")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {group.items.map((m) => {
                      const curGrade = grades[m.code] || "";
                      const pt = curGrade in GRADE_POINTS ? GRADE_POINTS[curGrade] : null;
                      return (
                        <tr key={m.code} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-3 py-2 font-mono font-bold text-brand-700 dark:text-brand-300">{m.code}</td>
                          <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{m.name}</td>
                          <td className="px-2 py-2 text-center text-slate-600 dark:text-slate-400">{m.credits}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                max={10}
                                step={0.1}
                                inputMode="decimal"
                                aria-label={`Điểm thang 10 của ${m.code}`}
                                placeholder="/10"
                                className="input w-16 py-1 text-center text-xs"
                                value={scores[m.code] ?? ""}
                                onChange={(e) => handleScoreChange(m.code, e.target.value)}
                              />
                              <select
                                aria-label={t("gpa.gradeAria", { code: m.code })}
                                className="input w-28 py-1 text-center text-xs font-semibold"
                                value={curGrade}
                                onChange={(e) => handleGradeChange(m.code, e.target.value)}
                              >
                                <option value="">{t("gpa.notTaken")}</option>
                                {Object.keys(GRADE_POINTS).map((g) => (
                                  <option key={g} value={g}>{g} ({GRADE_10_SCALE[g]})</option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center font-mono font-bold text-slate-800 dark:text-slate-200">{pt !== null ? pt.toFixed(1) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {groups.size === 0 && <div className="card p-8 text-center text-sm text-slate-500">{t("gpa.empty")}</div>}
      </div>
    </div>
  );
}
