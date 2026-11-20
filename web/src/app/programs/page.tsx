"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useMounted } from "@/lib/useMounted";
import { COHORTS, useSettings } from "@/lib/store";
import { Empty, Loading, PageHeader } from "@/components/ui";

const POPULAR_PROGRAMS = ["K22406", "K22404", "K22402", "K24419", "K22407", "K22405"];

export default function ProgramsPage() {
  const mounted = useMounted();
  const savedCohort = useSettings((s) => s.cohort);
  const [cohort, setCohort] = useState<string>("all");
  const [faculty, setFaculty] = useState<string>("all");
  const [query, setQuery] = useState<string>("");

  useEffect(() => {
    if (mounted && savedCohort) {
      setCohort(savedCohort);
    }
  }, [mounted, savedCohort]);

  const programsReq = useApi(
    () => api.programs(cohort !== "all" ? { cohort } : {}),
    [cohort],
  );

  const programs = useMemo(() => programsReq.data ?? [], [programsReq.data]);

  // Get list of unique faculties for filter
  const faculties = useMemo(() => {
    const set = new Set<string>();
    programs.forEach((p) => {
      if (p.faculty) set.add(p.faculty);
    });
    return Array.from(set).sort();
  }, [programs]);

  // Filter programs by query and faculty
  const filtered = useMemo(() => {
    return programs.filter((p) => {
      if (faculty !== "all" && p.faculty !== faculty) return false;
      if (query.trim()) {
        const q = query.toLowerCase().trim();
        const match =
          p.program_id.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.faculty && p.faculty.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [programs, faculty, query]);

  if (!mounted) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chương trình đào tạo (CTĐT)"
        subtitle="Tra cứu lộ trình học tập, cấu trúc khối kiến thức và sơ đồ tiên quyết của các ngành đào tạo tại UEL."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Khóa của bạn:</span>
            <span className="chip bg-brand-100 font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-300">
              {savedCohort || "Chưa chọn (Vào Cài đặt)"}
            </span>
          </div>
        }
      />

      {/* Hero Banner for Featured MIS 2025 / Quick Links */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900 p-6 text-white shadow-md sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-200">
          Lộ trình đào tạo UEL
        </p>
        <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
          Sơ đồ tiên quyết & Cây học phần trực quan
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-brand-100">
          Xem trực quan các học phần theo từng học kỳ gợi ý (HK1 đến HK8), phân biệt rõ học phần bắt buộc, tự chọn, và điều kiện tiên quyết / học trước.
        </p>

        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-white/15 px-3 py-2 font-medium">
            🔥 Các CTĐT phổ biến:
          </span>
          {POPULAR_PROGRAMS.map((pid) => (
            <Link
              key={pid}
              href={`/programs/${pid}`}
              className="rounded-lg bg-white/20 px-3 py-2 font-semibold transition hover:bg-white hover:text-brand-800"
            >
              {pid}
            </Link>
          ))}
        </div>
      </div>

      {/* Search & Filters Filter */}
      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className="label" htmlFor="prog-q">
            Tìm chương trình
          </label>
          <input
            id="prog-q"
            className="input"
            placeholder="Tên ngành, mã CTĐT (vd: HTTQL, K22404, Tài chính)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="prog-cohort">
            Khóa tuyển sinh
          </label>
          <select
            id="prog-cohort"
            className="input"
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
          >
            <option value="all">Tất cả các khóa</option>
            {COHORTS.map((c) => (
              <option key={c} value={c}>
                Khóa {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="prog-faculty">
            Khoa quản lý
          </label>
          <select
            id="prog-faculty"
            className="input"
            value={faculty}
            onChange={(e) => setFaculty(e.target.value)}
          >
            <option value="all">Tất cả các khoa ({faculties.length})</option>
            {faculties.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Program Cards Grid */}
      {programsReq.loading ? (
        <Loading text="Đang tải danh sách chương trình đào tạo..." />
      ) : filtered.length === 0 ? (
        <Empty>
          Không tìm thấy chương trình đào tạo phù hợp với bộ lọc hiện tại. Thử chọn &ldquo;Tất cả các khóa&rdquo; hoặc xóa từ khóa tìm kiếm.
        </Empty>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Hiển thị <strong>{filtered.length}</strong> chương trình đào tạo
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => {
              const isPopular = POPULAR_PROGRAMS.includes(p.program_id);
              return (
                <div
                  key={p.program_id}
                  className={`card flex flex-col justify-between transition hover:border-brand-400 hover:shadow-md ${
                    isPopular ? "border-brand-200 dark:border-brand-900/60" : ""
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-brand-700 dark:text-brand-300">
                        {p.program_id}
                      </span>
                      <span className="chip bg-slate-100 text-[11px] font-semibold dark:bg-slate-800">
                        {p.cohort}
                      </span>
                    </div>

                    <h3 className="mt-2 text-base font-bold text-slate-900 group-hover:text-brand-600 dark:text-white">
                      <Link
                        href={`/programs/${p.program_id}`}
                        className="hover:underline"
                      >
                        {p.name}
                      </Link>
                    </h3>

                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {p.faculty || "Trường ĐH Kinh tế - Luật"}
                    </p>
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div className="mb-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                      <span>Tổng bắt buộc: <strong>{p.total_credits}</strong> TC</span>
                    </div>

                    <div className="flex gap-2">
                      <Link
                        href={`/programs/${p.program_id}`}
                        className="btn-primary w-full text-center text-xs"
                      >
                        Xem sơ đồ lộ trình &rarr;
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
