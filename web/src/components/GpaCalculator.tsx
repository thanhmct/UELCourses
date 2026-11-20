"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlanner } from "@/lib/store";
import {
  calculateGpa,
  GRADE_10_SCALE,
  GRADE_POINTS,
  simulateTargetGpa,
  type GradeItem,
} from "@/lib/gpa";

const GRADES_STORAGE_KEY = "uelplan-user-grades";

export function GpaCalculator() {
  const planner = usePlanner();
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [targetDegree, setTargetDegree] = useState<number>(3.2); // Default: Giỏi (3.2)
  const [totalProgramCredits, setTotalProgramCredits] = useState<number>(135);

  // Load saved grades from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GRADES_STORAGE_KEY);
      if (raw) setGrades(JSON.parse(raw));
    } catch (e) {
      console.error("Failed to load grades", e);
    }
  }, []);

  const handleGradeChange = (code: string, grade: string) => {
    setGrades((prev) => {
      const next = { ...prev, [code]: grade };
      if (!grade) delete next[code];
      try {
        localStorage.setItem(GRADES_STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error("Failed to save grade", e);
      }
      return next;
    });
  };

  // Group modules by term from the planner
  const modulesByTerm = useMemo(() => {
    const map = new Map<string, GradeItem[]>();

    // Completed bucket
    if (planner.completed.length > 0) {
      map.set(
        "Môn đã hoàn thành",
        planner.completed.map((code) => ({
          code,
          name: planner.catalog[code]?.name || code,
          credits: planner.catalog[code]?.credits || 3,
          grade: grades[code] || "A",
          term: "Đã hoàn thành",
        })),
      );
    }

    // Terms HK1..HK8
    for (const term of planner.terms) {
      if (term.modules.length > 0) {
        map.set(
          term.name,
          term.modules.map((code) => ({
            code,
            name: planner.catalog[code]?.name || code,
            credits: planner.catalog[code]?.credits || 3,
            grade: grades[code] || "",
            term: term.name,
          })),
        );
      }
    }

    return map;
  }, [planner, grades]);

  // Flatten all modules for overall calculation
  const allGradedItems = useMemo(() => {
    const list: GradeItem[] = [];
    modulesByTerm.forEach((items) => list.push(...items));
    return list;
  }, [modulesByTerm]);

  const overallGpa = useMemo(() => calculateGpa(allGradedItems), [allGradedItems]);

  const targetSim = useMemo(() => {
    const remainingCredits = Math.max(0, totalProgramCredits - overallGpa.gradedCredits);
    return simulateTargetGpa(
      overallGpa.gpa4,
      overallGpa.gradedCredits,
      remainingCredits,
      targetDegree,
    );
  }, [overallGpa, totalProgramCredits, targetDegree]);

  return (
    <div className="space-y-6">
      {/* Top Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card bg-brand-50/50 border-brand-200 dark:bg-brand-950/20 dark:border-brand-800">
          <span className="text-xs font-semibold text-brand-700 dark:text-brand-300 uppercase tracking-wider">
            GPA Tích lũy (Hệ 4)
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-brand-800 dark:text-brand-200">
              {overallGpa.gpa4 > 0 ? overallGpa.gpa4.toFixed(2) : "0.00"}
            </span>
            <span className="text-xs text-slate-500">/ 4.00</span>
          </div>
          <div className="mt-2">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${overallGpa.classification.color}`}>
              {overallGpa.classification.label}
            </span>
          </div>
        </div>

        <div className="card">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Ước tính Hệ 10
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">
              {overallGpa.gpa10 > 0 ? overallGpa.gpa10.toFixed(1) : "0.0"}
            </span>
            <span className="text-xs text-slate-500">/ 10.0</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Quy đổi thang điểm UEL</p>
        </div>

        <div className="card">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Tín chỉ đã tính điểm
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">
              {overallGpa.gradedCredits}
            </span>
            <span className="text-xs text-slate-500">/ {totalProgramCredits} TC</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full bg-brand-600 rounded-full transition-all"
              style={{ width: `${Math.min(100, (overallGpa.gradedCredits / totalProgramCredits) * 100)}%` }}
            />
          </div>
        </div>

        <div className="card">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Tín chỉ còn lại
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">
              {Math.max(0, totalProgramCredits - overallGpa.gradedCredits)}
            </span>
            <span className="text-xs text-slate-500">TC</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {allGradedItems.length - Object.keys(grades).length} môn chưa nhập điểm
          </p>
        </div>
      </div>

      {/* Target Simulator Card */}
      <div className="card border-brand-200 bg-gradient-to-r from-brand-50/40 to-slate-50 dark:from-brand-950/20 dark:to-slate-900/40">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              🎯 Mục tiêu tốt nghiệp (Target Simulator)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Mô phỏng điểm số cần đạt cho các học kỳ tiếp theo để ra trường đúng loại mong muốn.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <label htmlFor="target-grade" className="font-semibold text-slate-600 dark:text-slate-300">
                Mục tiêu:
              </label>
              <select
                id="target-grade"
                className="input text-xs py-1"
                value={targetDegree}
                onChange={(e) => setTargetDegree(Number(e.target.value))}
              >
                <option value={3.6}>Xuất sắc (≥ 3.60)</option>
                <option value={3.2}>Giỏi (≥ 3.20)</option>
                <option value={2.5}>Khá (≥ 2.50)</option>
                <option value={2.0}>Trung bình (≥ 2.00)</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <label htmlFor="total-cr" className="font-semibold text-slate-600 dark:text-slate-300">
                Tổng TC CTĐT:
              </label>
              <input
                id="total-cr"
                type="number"
                className="input text-xs py-1 w-20"
                value={totalProgramCredits}
                onChange={(e) => setTotalProgramCredits(Number(e.target.value) || 135)}
              />
            </div>
          </div>
        </div>

        <div className="mt-3">
          <div
            className={`rounded-lg border p-3 text-sm ${
              targetSim.feasible
                ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              <span>{targetSim.feasible ? "✓ Khả thi:" : "⚠️ Cảnh báo:"}</span>
              <span>{targetSim.message}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grade entry by semester */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-white">
            Bảng điểm chi tiết theo học kỳ
          </h3>
          <span className="text-xs text-slate-500">
            Dữ liệu lấy từ danh sách môn trong trang Kế hoạch học tập
          </span>
        </div>

        {Array.from(modulesByTerm.entries()).map(([termName, items]) => {
          const termGpa = calculateGpa(items);
          return (
            <div key={termName} className="card p-0 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between bg-slate-50 px-4 py-2.5 border-b border-slate-200 dark:bg-slate-800/60 dark:border-slate-800">
                <div className="font-semibold text-slate-900 dark:text-white text-sm">
                  {termName} ({items.length} môn)
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span>
                    Tổng TC: <strong>{termGpa.totalCredits}</strong>
                  </span>
                  <span>
                    GPA kỳ:{" "}
                    <strong className="text-brand-700 dark:text-brand-300">
                      {termGpa.gpa4 > 0 ? termGpa.gpa4.toFixed(2) : "—"}
                    </strong>
                  </span>
                  {termGpa.gpa4 > 0 && (
                    <span className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${termGpa.classification.color}`}>
                      {termGpa.classification.label}
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="py-2 px-4 w-28">Mã môn</th>
                      <th className="py-2 px-2">Tên học phần</th>
                      <th className="py-2 px-2 text-center w-16">Tín chỉ</th>
                      <th className="py-2 px-4 text-center w-36">Điểm chữ</th>
                      <th className="py-2 px-4 text-center w-28">Điểm hệ 4</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.map((m) => {
                      const curGrade = grades[m.code] || "";
                      const pt = curGrade in GRADE_POINTS ? GRADE_POINTS[curGrade] : null;
                      return (
                        <tr key={m.code} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="py-2 px-4 font-mono font-bold text-brand-700 dark:text-brand-300">
                            {m.code}
                          </td>
                          <td className="py-2 px-2 text-slate-700 dark:text-slate-300">
                            {m.name}
                          </td>
                          <td className="py-2 px-2 text-center text-slate-600 dark:text-slate-400">
                            {m.credits}
                          </td>
                          <td className="py-2 px-4 text-center">
                            <select
                              aria-label={`Điểm học phần ${m.code}`}
                              className="input text-xs py-1 font-semibold text-center w-28"
                              value={curGrade}
                              onChange={(e) => handleGradeChange(m.code, e.target.value)}
                            >
                              <option value="">— Chưa học —</option>
                              {Object.keys(GRADE_POINTS).map((g) => (
                                <option key={g} value={g}>
                                  {g} ({GRADE_10_SCALE[g]})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-4 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                            {pt !== null ? pt.toFixed(1) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {modulesByTerm.size === 0 && (
          <div className="card text-center p-8 text-sm text-slate-500">
            Chưa có môn học nào trong bảng Kế hoạch. Hãy thêm môn vào kế hoạch trước để bắt đầu tính GPA!
          </div>
        )}
      </div>
    </div>
  );
}
