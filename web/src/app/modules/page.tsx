"use client";
import Link from "next/link";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type ModuleFilter } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useDebounced } from "@/lib/useDebounced";
import { EnBadge, ErrorBox } from "@/components/ui";
import { ModuleActions } from "@/components/ModuleActions";
import { CheckFacet, FacetFilter } from "@/components/FacetFilter";
import { openClassesByTerm, parseSemesterId } from "@/lib/modules";
import type { ModuleSummary } from "@/lib/types";
import { useT } from "@/i18n";
import { departmentName, facultyName, moduleName } from "@/i18n/names";

const PAGE = 30;
const TERMS = [1, 2, 3];

/** HK1 / HK2 / HK3 tabs for the academic year; a term with open classes is filled and shows the class count. */
function TermTabs({ m, year }: { m: ModuleSummary; year?: string }) {
  const { t } = useT();
  const open = openClassesByTerm(m, year);
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700" role="group" aria-label={t("mod.termsTitle")}>
      {TERMS.map((term) => {
        const n = open.get(term);
        return (
          <span
            key={term}
            className={`flex flex-col items-center px-2 py-1.5 text-center text-xs font-semibold ${
              n ? "bg-brand-600 text-white" : "bg-white text-slate-400 dark:bg-slate-900 dark:text-slate-500"
            }`}
            title={n ? t("mod.termClassCount", { n }) : t("mod.termNoClass")}
          >
            HK{term}
            {n ? <span className="font-normal opacity-90">{t("mod.termClassCount", { n })}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

export default function ModulesPage() {
  const { t, lang } = useT();
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState(""); // "" | "vi" | "en"
  const [credits, setCredits] = useState("");
  const [faculty, setFaculty] = useState(""); // Khoa / Bộ môn (gộp một bộ lọc)
  const [type, setType] = useState("");
  // CTĐT được chọn ở trang /start (?program=K23406 = khóa 23, ngành 406)
  const [programId, setProgramId] = useState("");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("program");
    if (p) setProgramId(p.trim().toUpperCase());
  }, []);
  const programs = useApi(() => api.programs(), []);
  const program = programs.data?.find((p) => p.program_id === programId);
  const [semester, setSemester] = useState("");
  const [outline, setOutline] = useState(false);
  const dq = useDebounced(q, 300);

  const sems = useApi(() => api.semesters(), []);
  const year = sems.data?.find((s) => s.is_current)?.year;
  const yearStr = year !== undefined ? String(year).replace("–", "-") : undefined;
  const facets = useApi(() => api.moduleFacets(), []);

  const [items, setItems] = useState<ModuleSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const filter: ModuleFilter = useMemo(
    () => ({
      q: dq,
      language: language || undefined,
      credits: credits || undefined,
      faculty: faculty || undefined,
      type: type || undefined,
      semester: semester || undefined,
      program_id: programId || undefined,
      has_outline: outline ? "true" : undefined,
      size: PAGE,
    }),
    [dq, language, credits, faculty, type, semester, programId, outline],
  );
  const filterKey = JSON.stringify(filter);

  const load = useCallback(
    async (p: number) => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const r = await api.modules({ ...filter, page: p });
        if (id !== reqId.current) return;
        setItems((prev) => (p === 1 ? r.data.items : [...prev, ...r.data.items]));
        setTotal(r.data.total);
        setPage(p);
        setError(null);
      } catch (e) {
        if (id === reqId.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterKey],
  );
  useEffect(() => {
    load(1);
  }, [load]);

  const hasMore = items.length < total;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loading) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && load(page + 1), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, page, load]);

  const reset = () => {
    setLanguage("");
    setCredits("");
    setFaculty("");
    setType("");
    setSemester("");
    setOutline(false);
  };

  const f = facets.data;
  // Khoa + Bộ môn gộp thành một danh sách; cùng tên thì cộng số lượng.
  const orgItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const x of [...(f?.faculty ?? []), ...(f?.department ?? [])]) counts.set(x.value, (counts.get(x.value) ?? 0) + x.count);
    return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  }, [f]);
  const semLabel = useCallback(
    (id: string) => {
      const p = parseSemesterId(id);
      return p ? t("semester.short", { term: p.term, year: p.year }) : id;
    },
    [t],
  );
  const creditLabel = useCallback((v: string) => t("common.credits", { n: v }), [t]);
  const langLabel = useCallback((v: string) => (v === "en" ? t("mod.filterLangEn") : t("mod.filterLangVi")), [t]);
  // Bộ lọc "Khoa / Bộ môn" trộn cả hai loại giá trị: departmentName tra bảng bộ môn rồi bảng khoa/đơn vị.
  const facultyLabel = useCallback((v: string) => departmentName(v, lang), [lang]);
  const count = (list: { value: string; count: number }[] | undefined, value: string) => list?.find((x) => x.value === value)?.count;

  return (
    <div className="space-y-3">
      <div className="relative border-b border-slate-300 focus-within:border-brand-600 dark:border-slate-700">
        <Search className="pointer-events-none absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          id="q"
          type="search"
          className="w-full bg-transparent py-3 pl-9 text-lg outline-none placeholder:text-slate-400"
          placeholder={t("mod.searchPlaceholder")}
          aria-label={t("mod.searchAria")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>
      {programId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm dark:border-brand-800 dark:bg-brand-900/30">
          <span>
            Đang lọc theo CTĐT <strong className="font-mono">{programId}</strong>
            {program?.name ? ` · ${program.name}` : ""}
          </span>
          <span className="flex gap-3">
            <Link href="/start" className="text-brand-700 hover:underline dark:text-brand-300">Đổi</Link>
            <button type="button" className="text-brand-700 hover:underline dark:text-brand-300" onClick={() => setProgramId("")}>Bỏ lọc CTĐT</button>
          </span>
        </div>
      ) : (
        <Link href="/start" className="text-sm text-brand-700 hover:underline dark:text-brand-300">Chọn khóa và ngành để lọc theo chương trình →</Link>
      )}
      <p className="border-b border-slate-200 pb-2 text-right text-sm text-slate-500 dark:border-slate-800" role="status" aria-live="polite">
        {loading && items.length === 0 ? t("mod.foundLoading") : t("mod.found", { n: total.toLocaleString(localeTag(lang)) })}
      </p>
      {error && <ErrorBox>{t("common.error", { message: error })}</ErrorBox>}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          {!loading && items.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{t("mod.empty")}</p>
          ) : (
            <ul>
              {items.map((m) => {
                const desc = excerpt(m.description);
                return (
                  <li key={m.code} className="flex flex-col gap-4 border-b border-slate-200 py-5 sm:flex-row sm:justify-between sm:gap-8 dark:border-slate-800">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Link href={`/modules/${encodeURIComponent(m.code)}`} className="text-lg font-semibold leading-snug text-brand-600 hover:underline dark:text-brand-300">
                        <span className="font-mono">{m.code}</span> {moduleName(m, lang)}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                        <span>{facultyName(m.faculty, lang) || t("common.unknownFaculty")} • {t("common.credits", { n: m.credits })} • {m.type}</span>
                        {(m.language_track === "en" || (!m.language_track && m.is_english)) && <EnBadge />}
                        {m.outline_url ? (
                          <a href={m.outline_url} target="_blank" rel="noopener noreferrer" className="chip bg-emerald-100 text-emerald-800 hover:underline dark:bg-emerald-900/40 dark:text-emerald-200">
                            {t("badge.outline")} (PDF) ↗
                          </a>
                        ) : (
                          m.has_outline && <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">{t("badge.outline")}</span>
                        )}
                        {m.has_equivalents && <span className="chip bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">{t("mod.card.hasEquiv")}</span>}
                      </div>
                      {desc ? (
                        <p className="line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{desc}</p>
                      ) : (
                        <p className="text-xs italic text-slate-400">{t("det.noDescription")}</p>
                      )}
                      <ModuleActions module={m} compact />
                    </div>
                    <div className="w-full shrink-0 space-y-1.5 sm:w-52">
                      <TermTabs m={m} year={yearStr} />
                      <p className="text-xs text-slate-500">{yearStr ? t("mod.card.yearOf", { year: yearStr }) : ""}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div ref={sentinel} className="py-6 text-center text-sm text-slate-500">
            {loading && items.length > 0 && t("common.loadingMore")}
            {!loading && hasMore && (
              <button className="btn-outline" onClick={() => load(page + 1)}>{t("common.loadMore", { loaded: items.length, total })}</button>
            )}
          </div>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1" aria-label={t("mod.filterTitle")}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t("mod.filterTitle")}</h2>
            <button className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300" onClick={reset}>{t("common.clear")}</button>
          </div>
          <FacetFilter title={t("mod.filterLang")} items={f?.language ?? []} value={language} onChange={setLanguage} labelOf={langLabel} sort="none" total={f?.total} />
          <FacetFilter title={t("mod.filterCredits")} items={f?.credits ?? []} value={credits} onChange={setCredits} labelOf={creditLabel} sort="none" total={f?.total} />
          <FacetFilter
            title="Khoa / Bộ môn"
            items={orgItems}
            value={faculty}
            onChange={setFaculty}
            labelOf={facultyLabel}
            searchable
            searchPlaceholder="Tìm khoa hoặc bộ môn…"
            total={f?.total}
          />
          <FacetFilter title={t("mod.filterType")} items={f?.type ?? []} value={type} onChange={setType} sort="none" total={f?.total} />
          <FacetFilter title={t("mod.filterSemester")} items={f?.semester ?? []} value={semester} onChange={setSemester} labelOf={semLabel} sort="none" total={f?.total} />
          <fieldset>
            <legend className="label mb-1">{t("mod.filterOutline")}</legend>
            <CheckFacet label={t("badge.outline")} count={count(f?.has_outline, "true")} checked={outline} onChange={setOutline} />
          </fieldset>
        </aside>
      </div>
    </div>
  );
}

/** Đoạn trích ngắn của mô tả: cắt ở hết câu nếu được, không quá `max` ký tự. */
function excerpt(text: string | null | undefined, max = 260): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.length <= max) return t;
  const window = t.slice(0, max);
  const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("; "));
  if (sentence > max * 0.5) return window.slice(0, sentence + 1);
  const space = window.lastIndexOf(" ");
  return `${window.slice(0, space > 0 ? space : max)}…`;
}

function localeTag(lang: "vi" | "en") {
  return lang === "vi" ? "vi-VN" : "en-GB";
}
