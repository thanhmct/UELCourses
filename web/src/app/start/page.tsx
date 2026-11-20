"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ErrorBox } from "@/components/ui";

/**
 * Trang mở đầu: chọn khóa và ngành, rồi chuyển sang Học phần đã lọc theo CTĐT.
 * Mã CTĐT dạng K23406 = khóa 23 (K23) + ngành 406.
 */
export default function StartPage() {
  const router = useRouter();
  const programs = useApi(() => api.programs(), []);
  const [cohort, setCohort] = useState("");
  const [programId, setProgramId] = useState("");

  const cohorts = useMemo(
    () => [...new Set((programs.data ?? []).map((p) => p.cohort))].filter(Boolean).sort((a, b) => b.localeCompare(a, "en", { numeric: true })),
    [programs.data],
  );
  const inCohort = useMemo(
    () => (programs.data ?? []).filter((p) => p.cohort === cohort).sort((a, b) => a.program_id.localeCompare(b.program_id)),
    [programs.data, cohort],
  );

  const go = () => {
    if (programId) router.push(`/modules?program=${encodeURIComponent(programId)}`);
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Bạn học khóa nào, ngành nào?</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Chọn khóa và ngành để xem học phần của chương trình đào tạo của bạn. Mã CTĐT ghép từ khóa và mã ngành, ví dụ{" "}
          <span className="font-mono">K23406</span> là khóa 23, ngành 406.
        </p>
      </header>

      {programs.error && <ErrorBox>Không tải được danh sách chương trình: {programs.error}</ErrorBox>}

      <div className="card space-y-4">
        <div>
          <label htmlFor="cohort" className="label">Khóa</label>
          <select
            id="cohort"
            className="input"
            value={cohort}
            onChange={(e) => {
              setCohort(e.target.value);
              setProgramId("");
            }}
          >
            <option value="">{programs.loading ? "Đang tải…" : "— Chọn khóa —"}</option>
            {cohorts.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="program" className="label">Ngành</label>
          <select id="program" className="input" value={programId} onChange={(e) => setProgramId(e.target.value)} disabled={!cohort}>
            <option value="">{cohort ? "— Chọn ngành —" : "Chọn khóa trước"}</option>
            {inCohort.map((p) => (
              <option key={p.program_id} value={p.program_id}>
                {p.program_id.slice(p.cohort.length)} · {p.name}
              </option>
            ))}
          </select>
          {cohort && inCohort.length === 0 && !programs.loading && (
            <p className="mt-1 text-xs text-slate-500">Chưa có chương trình nào cho {cohort}.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" className="btn-primary" onClick={go} disabled={!programId}>Xem học phần của ngành này</button>
          <Link href="/modules" className="text-sm text-brand-700 hover:underline dark:text-brand-300">Xem tất cả học phần</Link>
        </div>
      </div>
    </div>
  );
}
