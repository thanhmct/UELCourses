"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { weekdayLabel } from "@/lib/periods";
import { formatDateVi } from "@/lib/dates";
import { EnBadge, Empty, ErrorBox, Loading, PageHeader, TypeChip } from "@/components/ui";
import { capacityText, formatOfferingPlan, seatsAvailable } from "@/lib/modules";
import { ModuleActions } from "@/components/ModuleActions";
import { PrerequisiteTree } from "@/components/PrerequisiteTree";
import { WorkloadBreakdownView } from "@/components/WorkloadBreakdown";
import { ModuleReviews } from "@/components/ModuleReviews";

export default function ModuleDetailPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code);
  const mod = useApi(() => api.module(code), [code]);
  const sems = useApi(() => api.semesters(), []);
  const [semester, setSemester] = useState("");

  useEffect(() => {
    if (!semester && sems.data?.length) setSemester((sems.data.find((s) => s.is_current) ?? sems.data[0]).id);
  }, [sems.data, semester]);

  const classes = useApi(() => (semester ? api.classes(code, semester) : Promise.resolve({ data: [], mock: false })), [code, semester]);

  if (mod.loading) return <Loading />;
  if (mod.error) return <ErrorBox>{mod.error}</ErrorBox>;
  const m = mod.data;
  if (!m) return <Empty>Không tìm thấy học phần {code}. <Link className="text-brand-600 underline" href="/modules">Quay lại</Link></Empty>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/modules" className="text-sm text-brand-600 hover:underline">← Học phần</Link>
        <PageHeader
          title={`${m.code} · ${m.name}`}
          subtitle={<span className="flex flex-wrap items-center gap-2"><TypeChip type={m.type} />{m.is_english && <EnBadge />} {m.credits} tín chỉ · {m.faculty ?? "—"}{formatOfferingPlan(m.offering_plan) ? ` · ${formatOfferingPlan(m.offering_plan)}` : ""}</span>}
          actions={<ModuleActions module={m} />}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="mb-2 font-semibold">Mô tả & Khối lượng học</h2>
          <p className="text-sm text-slate-700 dark:text-slate-300">{m.description || "Chưa có mô tả."}</p>
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <WorkloadBreakdownView credits={m.credits} type={m.type} showDetails />
          </div>
          <div className="mt-6">
            <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">
              Cây quan hệ học phần (Tiên quyết & Mở khóa)
            </h3>
            <PrerequisiteTree code={m.code} currentName={m.name} />
          </div>
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold">Học phần tương đương</h2>
          {m.equivalents?.length ? (
            <ul className="space-y-1 text-sm">
              {m.equivalents.map((e) => (
                <li key={e.code} className="flex justify-between gap-2">
                  <Link href={`/modules/${encodeURIComponent(e.code)}`} className="text-brand-600 hover:underline">{e.code} · {e.name}</Link>
                  <span className="shrink-0 text-slate-500">{e.credits} TC</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Không có.</p>
          )}
        </section>
      </div>
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Lớp học phần</h2>
          <select className="input w-auto" value={semester} onChange={(e) => setSemester(e.target.value)} aria-label="Học kỳ">
            {sems.data?.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        {classes.loading ? (
          <Loading />
        ) : !classes.data?.length ? (
          <Empty>Chưa có lớp mở trong học kỳ này.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Mã lớp</th>
                  <th className="py-2 pr-3">Lịch học</th>
                  <th className="py-2 pr-3">Giảng viên</th>
                  <th className="py-2 pr-3">Lớp SV</th>
                  <th className="py-2 pr-3">Sĩ số / chỗ trống</th>
                  <th className="py-2">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {classes.data.map((c) => (
                  <tr key={c.class_code} className="border-t border-slate-200 align-top dark:border-slate-800">
                    <td className="py-2 pr-3 font-mono text-xs">{c.class_code}</td>
                    <td className="py-2 pr-3">
                      {c.lessons.length ? c.lessons.map((l, i) => (
                        <div key={i}>
                          {weekdayLabel(l.weekday)}, tiết {l.start_period}–{l.end_period} ({l.start_time}–{l.end_time}){l.room ? ` · ${l.room}` : ""}{l.weeks ? ` · tuần ${l.weeks}` : ""}
                        </div>
                      )) : <span className="text-slate-500">Chưa xếp lịch</span>}
                    </td>
                    <td className="py-2 pr-3">{c.lecturer ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs">{c.student_groups?.join(", ") || "—"}</td>
                    <td className={`py-2 pr-3 ${seatsAvailable(c) === 0 ? "text-red-600" : ""}`}>{capacityText(c)}</td>
                    <td className="py-2">{c.start_date ? `${formatDateVi(c.start_date)} – ${formatDateVi(c.end_date)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Community Reviews & Ratings */}
      <section className="card">
        <ModuleReviews moduleCode={m.code} moduleName={m.name} />
      </section>
    </div>
  );
}
