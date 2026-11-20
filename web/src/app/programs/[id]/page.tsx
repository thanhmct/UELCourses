"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useMounted } from "@/lib/useMounted";
import { usePlanner } from "@/lib/store";
import { Empty, Loading, PageHeader } from "@/components/ui";
import { ProgramFlowchart } from "@/components/ProgramFlowchart";
import { ModuleActions } from "@/components/ModuleActions";
import { allModules } from "@/lib/programs";

export default function ProgramDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const mounted = useMounted();
  const planner = usePlanner();

  const [activeTab, setActiveTab] = useState<"flowchart" | "blocks" | "check">("flowchart");
  const [selectedCode, setSelectedCode] = useState<string>("");

  const progReq = useApi(() => api.program(id), [id]);
  const graphReq = useApi(() => api.programGraph(id), [id]);

  const p = progReq.data;
  const graph = graphReq.data;

  // List of all modules in program
  const modulesList = useMemo(() => {
    if (!p) return [];
    return allModules(p);
  }, [p]);

  const byCode = useMemo(() => {
    return new Map(modulesList.map((m) => [m.code, m]));
  }, [modulesList]);

  // Check plan against student's planner state
  const checkReq = useApi(() => {
    if (!p) return Promise.resolve({ data: null, mock: true });
    const plannedTerms: Record<string, string[]> = {};
    planner.terms.forEach((t) => {
      plannedTerms[t.id] = t.modules;
    });
    return api.checkProgram(id, {
      completed: planner.completed.map((code) => ({ code })),
      planned: plannedTerms,
    });
  }, [id, planner.completed, planner.terms, p]);

  // Selected module details
  const selectedModule = useMemo(() => {
    if (!selectedCode) return null;
    return byCode.get(selectedCode) ?? null;
  }, [selectedCode, byCode]);

  // What modules require the selected module (unlocks)?
  const unlocksModules = useMemo(() => {
    if (!selectedCode || !graph) return [];
    return graph.edges
      .filter((e) => e.source === selectedCode)
      .map((e) => ({
        code: e.target,
        type: e.type,
        name: byCode.get(e.target)?.name ?? e.target,
      }));
  }, [selectedCode, graph, byCode]);

  if (!mounted || progReq.loading) return <Loading text="Đang tải dữ liệu CTĐT..." />;
  if (!p) {
    return (
      <Empty>
        Không tìm thấy chương trình đào tạo mã <strong>{id}</strong>.{" "}
        <Link href="/programs" className="text-brand-600 underline">
          Quay lại danh sách CTĐT
        </Link>
      </Empty>
    );
  }

  const prog = p.program;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/programs" className="text-xs text-brand-600 hover:underline">
          &larr; Danh sách chương trình đào tạo
        </Link>
        <PageHeader
          title={`${prog.name} (${prog.program_id})`}
          subtitle={
            <span className="flex flex-wrap items-center gap-2">
              <span className="chip bg-brand-100 font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-300">
                Khóa {prog.cohort}
              </span>
              <span>{prog.faculty || "Trường ĐH Kinh tế - Luật"}</span>
              <span>&middot;</span>
              <span><strong>{prog.total_credits}</strong> tín chỉ bắt buộc</span>
              <span>&middot;</span>
              <span><strong>{modulesList.length}</strong> học phần</span>
            </span>
          }
          actions={
            <div className="flex gap-2">
              <button
                className={`btn text-xs ${
                  activeTab === "flowchart" ? "btn-primary" : "btn-outline"
                }`}
                onClick={() => setActiveTab("flowchart")}
              >
                🗺️ Sơ đồ lộ trình (Flowchart)
              </button>
              <button
                className={`btn text-xs ${
                  activeTab === "blocks" ? "btn-primary" : "btn-outline"
                }`}
                onClick={() => setActiveTab("blocks")}
              >
                📚 Khối kiến thức
              </button>
              <button
                className={`btn text-xs ${
                  activeTab === "check" ? "btn-primary" : "btn-outline"
                }`}
                onClick={() => setActiveTab("check")}
              >
                ✅ Đối chiếu kế hoạch
              </button>
            </div>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main Content Area */}
        <div className="min-w-0 space-y-4">
          {activeTab === "flowchart" && (
            <div>
              {graph ? (
                <ProgramFlowchart
                  graph={graph}
                  selectedCode={selectedCode}
                  onSelectModule={(code) => setSelectedCode(code)}
                />
              ) : (
                <Loading text="Đang chuẩn bị sơ đồ..." />
              )}
            </div>
          )}

          {activeTab === "blocks" && (
            <div className="space-y-4">
              {p.blocks.map((block, idx) => (
                <div key={`${block.name}-${idx}`} className="card space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white">
                        {block.name}
                      </h3>
                      {block.parent ? (
                        <p className="text-xs text-slate-500">Thuộc: {block.parent}</p>
                      ) : null}
                    </div>
                    <div className="text-xs">
                      {block.required_credits ? (
                        <span className="font-semibold text-brand-700 dark:text-brand-300">
                          Yêu cầu: {block.required_credits} TC bắt buộc
                        </span>
                      ) : (
                        <span className="text-slate-500">Tự chọn / Điều kiện</span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {block.modules.map((m) => (
                      <button
                        key={m.code}
                        onClick={() => setSelectedCode(m.code)}
                        className={`rounded-xl border p-3 text-left transition ${
                          selectedCode === m.code
                            ? "border-brand-500 bg-brand-50 ring-1 ring-brand-400 dark:bg-brand-900/30"
                            : "border-slate-200 hover:border-brand-300 dark:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 text-xs">
                          <span className="font-mono font-bold text-brand-700 dark:text-brand-300">
                            {m.code}
                          </span>
                          <span className="text-slate-500">
                            {m.suggested_term ? `HK${m.suggested_term} · ` : ""}
                            {m.credits} TC
                          </span>
                        </div>
                        <div className="mt-1 font-semibold text-slate-800 dark:text-slate-100 text-sm line-clamp-1">
                          {m.name}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                          {m.required ? (
                            <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Bắt buộc
                            </span>
                          ) : (
                            <span className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              Tự chọn
                            </span>
                          )}
                          {(m.prereq?.length ?? 0) > 0 && (
                            <span className="chip bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                              {m.prereq?.length} tiên quyết
                            </span>
                          )}
                          {(m.previous?.length ?? 0) > 0 && (
                            <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              {m.previous?.length} học trước
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "check" && (
            <div className="space-y-4">
              <div className="card space-y-2">
                <h3 className="font-bold text-slate-900 dark:text-white">
                  Đối chiếu kế hoạch cá nhân với CTĐT {prog.program_id}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Dữ liệu được lấy từ các môn bạn đã đánh dấu &ldquo;Đã học&rdquo; và các môn đang xếp trong các học kỳ tại trang{" "}
                  <Link href="/planner" className="text-brand-600 underline">
                    Kế hoạch
                  </Link>.
                </p>
              </div>

              {checkReq.loading ? (
                <Loading text="Đang kiểm tra điều kiện..." />
              ) : checkReq.data ? (
                <div className="space-y-4">
                  {checkReq.data.warnings?.length > 0 && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      <strong>Lưu ý quy chế:</strong>
                      <ul className="mt-1 list-disc pl-5 space-y-1">
                        {checkReq.data.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {checkReq.data.blocked.length > 0 && (
                    <div className="card space-y-3 border-red-200 dark:border-red-900/50">
                      <h4 className="font-bold text-red-700 dark:text-red-300 flex items-center gap-2">
                        <span>⚠️ Các môn đang bị chặn ({checkReq.data.blocked.length})</span>
                      </h4>
                      <p className="text-xs text-slate-500">
                        Những môn này được xếp vào học kỳ khi chưa thỏa mãn điều kiện tiên quyết ở các kỳ trước:
                      </p>
                      <div className="space-y-2">
                        {checkReq.data.blocked.map((b) => (
                          <div
                            key={b.code}
                            className="rounded-lg border border-red-200 bg-red-50/50 p-3 text-xs dark:border-red-950 dark:bg-red-950/30"
                          >
                            <span className="font-mono font-bold text-red-800 dark:text-red-200">
                              {b.code} ({byCode.get(b.code)?.name ?? b.code})
                            </span>
                            <div className="mt-1 text-slate-600 dark:text-slate-400">
                              Còn thiếu: {b.missing.map((m) => `${m.code} (${m.type})`).join(", ")}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="card space-y-3">
                    <h4 className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                      <span>✅ Các môn đủ điều kiện học ngay ({checkReq.data.eligible_now.length})</span>
                    </h4>
                    <p className="text-xs text-slate-500">
                      Bạn đã hoàn thành đủ các môn tiên quyết và học trước của các môn sau:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {checkReq.data.eligible_now.slice(0, 30).map((code) => (
                        <button
                          key={code}
                          onClick={() => setSelectedCode(code)}
                          className="chip bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200"
                        >
                          {code} &middot; {byCode.get(code)?.name}
                        </button>
                      ))}
                      {checkReq.data.eligible_now.length > 30 && (
                        <span className="text-xs text-slate-400 py-1">
                          + {checkReq.data.eligible_now.length - 30} môn khác...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Sidebar / Inspector Drawer for Selected Module */}
        <aside className="space-y-4">
          <div className="card sticky top-20 space-y-4">
            <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-2 dark:border-slate-800 dark:text-white">
              Chi tiết học phần được chọn
            </h3>

            {selectedModule ? (
              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-sm font-bold text-brand-700 dark:text-brand-300">
                      {selectedModule.code}
                    </span>
                    <span className="font-semibold text-slate-500">
                      {selectedModule.credits} tín chỉ
                    </span>
                  </div>
                  <h4 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                    {selectedModule.name}
                  </h4>
                  <p className="mt-1 text-slate-500">
                    Khối: {selectedModule.block || "Chưa phân khối"}
                    {selectedModule.suggested_term ? ` · Gợi ý: Học kỳ ${selectedModule.suggested_term}` : ""}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <ModuleActions
                    module={{
                      code: selectedModule.code,
                      name: selectedModule.name,
                      credits: selectedModule.credits,
                    }}
                    compact
                  />
                  <div className="mt-2">
                    <Link
                      href={`/modules/${encodeURIComponent(selectedModule.code)}`}
                      className="text-brand-600 hover:underline inline-block font-medium"
                    >
                      Xem trang chi tiết học phần &rarr;
                    </Link>
                  </div>
                </div>

                {/* Prerequisites breakdown */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Cần học trước ({((selectedModule.prereq?.length ?? 0) + (selectedModule.previous?.length ?? 0))})
                  </span>
                  {!(selectedModule.prereq?.length || selectedModule.previous?.length) ? (
                    <p className="text-slate-400">Không ghi nhận điều kiện tiên quyết.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedModule.prereq?.map((c) => (
                        <button
                          key={c}
                          onClick={() => setSelectedCode(c)}
                          className="w-full text-left rounded-lg border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-brand-600 dark:text-brand-400">{c}</span>
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1 rounded dark:bg-emerald-950 dark:text-emerald-300">Tiên quyết</span>
                          </div>
                          <div className="truncate text-slate-600 dark:text-slate-400">{byCode.get(c)?.name ?? c}</div>
                        </button>
                      ))}
                      {selectedModule.previous?.map((c) => (
                        <button
                          key={c}
                          onClick={() => setSelectedCode(c)}
                          className="w-full text-left rounded-lg border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-brand-600 dark:text-brand-400">{c}</span>
                            <span className="text-[10px] text-amber-700 bg-amber-50 px-1 rounded dark:bg-amber-950 dark:text-amber-300">Học trước</span>
                          </div>
                          <div className="truncate text-slate-600 dark:text-slate-400">{byCode.get(c)?.name ?? c}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Unlocks breakdown */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Mở khóa môn sau ({unlocksModules.length})
                  </span>
                  {unlocksModules.length === 0 ? (
                    <p className="text-slate-400">Không có môn nào yêu cầu môn này làm điều kiện mở khóa.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {unlocksModules.map((u) => (
                        <button
                          key={u.code}
                          onClick={() => setSelectedCode(u.code)}
                          className="w-full text-left rounded-lg border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                        >
                          <span className="font-mono font-bold text-brand-600 dark:text-brand-400">{u.code}</span>
                          <div className="truncate text-slate-600 dark:text-slate-400">{u.name}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                Bấm vào một môn học trong sơ đồ lộ trình hoặc bảng danh sách để xem cây điều kiện và thao tác nhanh.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
