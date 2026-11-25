"use client";
import Link from "next/link";
import { Filter, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type ModuleFilter } from "@/lib/api";
import { usePlanner, useTimetable } from "@/lib/store";
import { useProgramProfile } from "@/lib/myProgram";
import { useApi } from "@/lib/useApi";
import { isConnectionError } from "@/lib/dataSource";
import { useSemesters } from "@/lib/semesters";
import { useDebounced } from "@/lib/useDebounced";
import { EnBadge, ErrorBox, Loading, RequiredBadge } from "@/components/ui";
import { ModuleActions, NoClassWarning } from "@/components/ModuleActions";
import { CheckFacet, FacetFilter } from "@/components/FacetFilter";
import { SemesterFilterSquares } from "@/components/SemesterPicker";
import { openClassesByTerm, parseSemesterId } from "@/lib/modules";
import type { FacetCount, ModuleFacets, ModuleSummary } from "@/lib/types";
import { useT } from "@/i18n";
import { creditsLine, departmentName, facultyName, isEnglishCode, moduleDescription, moduleName, semesterShort } from "@/i18n/names";
import { finalAssessmentKind, formatFinalAssessment, getCachedFinalAssessmentKind, setCachedFinalAssessmentKind } from "@/lib/finalAssessment";
import { formatModuleType } from "@/lib/moduleFormat";
import { ProgramFilterBar } from "@/components/ProgramFilterBar";
import { hasVerifiedUndergraduateTrack } from "@/lib/programLookup";
import { track } from "@/lib/analytics";
import { useExchangeStats, useExchangeViewActive } from "@/lib/useExchangeStats";
import { ExchangeStatBadge } from "@/components/ExchangeStatBadge";


const PAGE = 30;
const TERMS = [1, 2, 3];

/** Inline HK1 / HK2 / HK3 semester strip showing class count per term. */
function TermStrip({ m, year }: { m: ModuleSummary; year?: string }) {
  const { t, lang } = useT();
  const open = openClassesByTerm(m, year);
  return (
    <div
      role="group"
      aria-label={t("mod.termsTitle")}
      className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 text-xs font-bold dark:border-slate-700 dark:bg-slate-700"
    >
      {TERMS.map((term) => {
        const n = open.get(term) ?? 0;
        const label = n === 1 ? t("mod.termClassCountOne") : t("mod.termClassCount", { n });
        const termName = lang === "en" ? semesterShort({ term }, lang) : `HK${term}`;
        return (
          <span
            key={term}
            title={n ? label : t("mod.termNoClass")}
            className={`flex min-w-0 flex-wrap items-center justify-center gap-x-1 break-words px-1 py-1.5 text-center leading-tight ${
              n ? "bg-brand-600 text-white" : "bg-white text-slate-400 dark:bg-slate-900 dark:text-slate-500"
            }`}
          >
            {termName}
            {n ? <span className="font-normal opacity-90">{label}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

/** HK1 / HK2 / HK3 tabs for the academic year; a term with open classes is filled and shows the class count. */
function TermTabs({ m, year }: { m: ModuleSummary; year?: string }) {
  const { t, lang } = useT();
  const open = openClassesByTerm(m, year);
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700" role="group" aria-label={t("mod.termsTitle")}>
      {TERMS.map((term) => {
        const n = open.get(term);
        const countLabel = n === 1 ? t("mod.termClassCountOne") : t("mod.termClassCount", { n: n ?? 0 });
        return (
          <span
            key={term}
            className={`flex min-h-12 flex-col items-center justify-center whitespace-nowrap px-1.5 py-1.5 text-center text-xs font-semibold ${
              n ? "bg-brand-600 text-white" : "bg-white text-slate-400 dark:bg-slate-900 dark:text-slate-500"
            }`}
            title={n ? countLabel : t("mod.termNoClass")}
          >
            {lang === "en" ? semesterShort({ term }, lang) : `HK${term}`}
            {n ? <span className="font-normal opacity-90">{countLabel}</span> : null}
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
  const [credits, setCredits] = useState<string[]>([]);
  const [faculties, setFaculties] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [finalAssessments, setFinalAssessments] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Tăng số này khi thoát bộ lọc để các danh sách khoa/bộ môn trên điện thoại về trạng thái thu gọn ban đầu.
  const [filterUiKey, setFilterUiKey] = useState(0);
  const toggleFilters = () => {
    if (filtersOpen) {
      setFilterUiKey((k) => k + 1);
    }
    setFiltersOpen((v) => !v);
  };

  // CTĐT được chọn ở trang /start hoặc từ hồ sơ sinh viên (ngành chính + ngành 2 nếu có)
  // Lọc theo union các CTĐT của sinh viên; bấm "Bỏ lọc CTĐT" để xem toàn bộ trường.
  const profile = useProgramProfile();
  const myProgramIds = profile.programIds;
  const [customProgram, setCustomProgram] = useState<string | null>(null);
  const [disableProgramFilter, setDisableProgramFilter] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("program");
    if (p) setCustomProgram(p.trim().toUpperCase());
  }, []);

  // Khi hồ sơ CTĐT của sinh viên thay đổi (nhập/đổi/xóa ngành ở hộp thoại hay Cài đặt):
  // Xóa override từ URL (?program=), kích hoạt lại lọc CTĐT, đặt lại trang 1 để tự lọc lại ngay.
  const prevCodesRef = useRef({
    primary: profile.primaryCode,
    secondary: profile.secondaryCode,
  });

  useEffect(() => {
    if (
      prevCodesRef.current.primary !== profile.primaryCode ||
      prevCodesRef.current.secondary !== profile.secondaryCode
    ) {
      prevCodesRef.current = {
        primary: profile.primaryCode,
        secondary: profile.secondaryCode,
      };
      setCustomProgram(null);
      setDisableProgramFilter(false);
      setPage(1);
      if (typeof window !== "undefined" && window.location.search.includes("program=")) {
        const url = new URL(window.location.href);
        url.searchParams.delete("program");
        window.history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
      }
    }
  }, [profile.primaryCode, profile.secondaryCode]);

  const effectivePrimaryProgId = customProgram || profile.primaryProgramId;
  const primaryProgramReq = useApi(
    () => (effectivePrimaryProgId ? api.program(effectivePrimaryProgId) : Promise.resolve({ data: null, mock: false })),
    [effectivePrimaryProgId],
  );
  const basePrimaryReq = useApi(
    () =>
      !customProgram && profile.basePrimaryProgramId && profile.basePrimaryProgramId !== profile.primaryProgramId
        ? api.program(profile.basePrimaryProgramId)
        : Promise.resolve({ data: null, mock: false }),
    [customProgram, profile.basePrimaryProgramId, profile.primaryProgramId],
  );
  const secondaryProgramReq = useApi(
    () => (!customProgram && profile.secondaryProgramId ? api.program(profile.secondaryProgramId) : Promise.resolve({ data: null, mock: false })),
    [customProgram, profile.secondaryProgramId],
  );
  const baseSecondaryReq = useApi(
    () =>
      !customProgram && profile.baseSecondaryProgramId && profile.baseSecondaryProgramId !== profile.secondaryProgramId
        ? api.program(profile.baseSecondaryProgramId)
        : Promise.resolve({ data: null, mock: false }),
    [customProgram, profile.baseSecondaryProgramId, profile.secondaryProgramId],
  );

  const primaryProgram = primaryProgramReq.data ?? basePrimaryReq.data;
  const secondaryProgram = secondaryProgramReq.data ?? baseSecondaryReq.data;

  const graduateDegree = !customProgram && !disableProgramFilter
    ? [profile.primaryParsed, profile.secondaryParsed].find((program) => program && program.degree !== "dai_hoc")?.degree
    : undefined;
  const missingPrimary = !!graduateDegree && !!profile.primaryParsed && profile.primaryParsed.degree !== "dai_hoc"
    && (primaryProgram?.program.program_id !== profile.primaryProgramId || !primaryProgram.blocks.some((block) => block.modules.length > 0));
  const missingSecondary = !!graduateDegree && !!profile.secondaryParsed && profile.secondaryParsed.degree !== "dai_hoc"
    && (secondaryProgram?.program.program_id !== profile.secondaryProgramId || !secondaryProgram.blocks.some((block) => block.modules.length > 0));
  const missingVerifiedPrimary = !disableProgramFilter && !customProgram && !primaryProgramReq.loading
    && !primaryProgramReq.data && hasVerifiedUndergraduateTrack(profile.primaryProgramId);
  const missingVerifiedSecondary = !disableProgramFilter && !customProgram && !secondaryProgramReq.loading
    && !secondaryProgramReq.data && hasVerifiedUndergraduateTrack(profile.secondaryProgramId);
  const codeSearch = missingPrimary || missingSecondary || missingVerifiedPrimary || missingVerifiedSecondary;
  const dq = useDebounced(q, 300);
  const activeProgramIds = useMemo(() => {
    if (disableProgramFilter || (codeSearch && dq)) return [];
    if (customProgram) return [customProgram];
    return myProgramIds.filter((id) =>
      (!(missingPrimary || missingVerifiedPrimary) || id !== profile.primaryProgramId)
      && (!(missingSecondary || missingVerifiedSecondary) || id !== profile.secondaryProgramId));
  }, [disableProgramFilter, codeSearch, dq, customProgram, myProgramIds, missingPrimary, missingSecondary, missingVerifiedPrimary, missingVerifiedSecondary,
    profile.primaryProgramId, profile.secondaryProgramId]);
  const moduleDegree = graduateDegree ? (!activeProgramIds.length && !dq ? graduateDegree : "all") : undefined;

  const primaryElectivesReq = useApi(
    () => (effectivePrimaryProgId ? api.electiveGroups(effectivePrimaryProgId) : Promise.resolve({ data: [], mock: false })),
    [effectivePrimaryProgId],
  );
  const secondaryElectivesReq = useApi(
    () => (!customProgram && profile.secondaryProgramId ? api.electiveGroups(profile.secondaryProgramId) : Promise.resolve({ data: [], mock: false })),
    [customProgram, profile.secondaryProgramId],
  );

  const moduleProgramStatus = useMemo(() => {
    const map = new Map<string, { required: boolean; electiveRequirement?: string }>();
    const p1 = primaryProgram;
    const p2 = secondaryProgram;
    const allElectiveGroups = [...(primaryElectivesReq.data ?? []), ...(secondaryElectivesReq.data ?? [])];

    const addProg = (prog: typeof p1) => {
      if (!prog) return;
      for (const block of prog.blocks) {
        for (const pm of block.modules) {
          if (!map.has(pm.code)) {
            const grp = allElectiveGroups.find((g) => g.modules.some((x) => x.code === pm.code));
            const reqText =
              grp && grp.required_credits > 0
                ? t("mod.electiveReq", { n: grp.required_credits, block: grp.block })
                : undefined;
            map.set(pm.code, {
              required: pm.required,
              electiveRequirement: reqText,
            });
          }
        }
      }
    };
    addProg(p1);
    addProg(p2);
    return map;
  }, [primaryProgram, secondaryProgram, primaryElectivesReq.data, secondaryElectivesReq.data, t]);

  const [semesters, setSemesters] = useState<string[]>([]);
  const [outline, setOutline] = useState(false);

  const { academicYear, globalCurrent, currentYearSecondTerm } = useSemesters();
  const yearStr = academicYear ? academicYear.replace("–", "-") : undefined;
  const currentSlot = globalCurrent && parseSemesterId(globalCurrent.id);
  const currentSlotOrder = currentSlot ? Number(currentSlot.year.slice(0, 4)) * 3 + currentSlot.term : null;
  const isCatalogSemester = useCallback((id: string) => {
    const slot = parseSemesterId(id);
    return currentSlotOrder === null || !slot || Number(slot.year.slice(0, 4)) * 3 + slot.term >= currentSlotOrder;
  }, [currentSlotOrder]);
  const visibleSemesters = useMemo(() => semesters.filter(isCatalogSemester), [semesters, isCatalogSemester]);
  const semester = visibleSemesters[0] ?? "";

  const [facetsData, setFacetsData] = useState<ModuleFacets | null>(null);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const facetsReqId = useRef(0);

  const [items, setItems] = useState<ModuleSummary[]>([]);
  const exchangeActive = useExchangeViewActive();
  const exchangeStats = useExchangeStats(items.map((m) => m.code), exchangeActive);
  // Chế độ SV trao đổi: mặc định lọc môn tiếng Anh (chỉ lần đầu bật), và đưa môn đã chọn/đã học lên đầu
  const langDefaulted = useRef(false);
  useEffect(() => {
    if (exchangeActive && !langDefaulted.current) {
      langDefaulted.current = true;
      setLanguage((prev) => prev || "en");
    }
  }, [exchangeActive]);
  const ttBySemester = useTimetable((s) => s.bySemester);
  const plannedTerms = usePlanner((s) => s.terms);
  const plannerBacklog = usePlanner((s) => s.backlog);
  const studiedCodes = usePlanner((s) => s.completed);
  const priorityCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const entries of Object.values(ttBySemester)) for (const e of entries) codes.add(e.code);
    for (const term of plannedTerms) for (const c of term.modules) codes.add(c);
    for (const c of plannerBacklog) codes.add(c);
    for (const c of studiedCodes) codes.add(c);
    return Array.from(codes);
  }, [ttBySemester, plannedTerms, plannerBacklog, studiedCodes]);
  const prioritySet = useMemo(() => new Set(priorityCodes), [priorityCodes]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ offline: true } | { message: string } | null>(null);
  const reqId = useRef(0);

  const facetFilterParams: ModuleFilter = useMemo(
    () => ({
      q: dq || undefined,
      language: language || undefined,
      credits_in: credits.length > 0 ? credits : undefined,
      faculty_in: faculties.length > 0 ? faculties : undefined,
      department_in: departments.length > 0 ? departments : undefined,
      type_in: types.length > 0 ? types : undefined,
      final_assessment_in: finalAssessments.length > 0 ? finalAssessments : undefined,
      semester: semester || undefined,
      degree: moduleDegree,
      program_ids: activeProgramIds.length > 0 ? activeProgramIds : undefined,
      has_outline: outline ? "true" : undefined,
    }),
    [dq, language, credits, faculties, departments, types, finalAssessments, semester, moduleDegree, activeProgramIds, outline],
  );
  const facetParamsKey = JSON.stringify(facetFilterParams);

  useEffect(() => {
    let alive = true;
    const id = ++facetsReqId.current;
    setFacetsLoading(true);
    api
      .moduleFacets(facetFilterParams)
      .then((res) => {
        if (!alive || id !== facetsReqId.current) return;
        const data = res.data;
        setFacetsData(data);
        if (data) {
          // Requirement 7: tự bỏ chọn các lựa chọn đang chọn mà không còn hợp lệ (đếm 0)
          if (credits.length > 0) {
            const valid = new Set(data.credits.filter((c) => c.count > 0).map((c) => c.value));
            setCredits((prev) => {
              const next = prev.filter((c) => valid.has(c));
              return next.length !== prev.length ? next : prev;
            });
          }
          if (faculties.length > 0) {
            const valid = new Set(data.faculty.filter((f) => f.count > 0).map((f) => f.value));
            setFaculties((prev) => {
              const next = prev.filter((f) => valid.has(f));
              return next.length !== prev.length ? next : prev;
            });
          }
          if (departments.length > 0) {
            const valid = new Set(data.department.filter((d) => d.count > 0).map((d) => d.value));
            setDepartments((prev) => {
              const next = prev.filter((d) => valid.has(d));
              return next.length !== prev.length ? next : prev;
            });
          }
          if (types.length > 0) {
            const valid = new Set(data.type.filter((t) => t.count > 0).map((t) => t.value));
            setTypes((prev) => {
              const next = prev.filter((t) => valid.has(t));
              return next.length !== prev.length ? next : prev;
            });
          }
          if (finalAssessments.length > 0) {
            const valid = new Set((data.final_assessment ?? []).filter((f) => f.count > 0).map((f) => f.value));
            setFinalAssessments((prev) => {
              const next = prev.filter((f) => valid.has(f));
              return next.length !== prev.length ? next : prev;
            });
          }
          if (language) {
            const valid = new Set(data.language.filter((l) => l.count > 0).map((l) => l.value));
            if (!valid.has(language)) setLanguage("");
          }
          if (semesters.length > 0) {
            const valid = new Set(data.semester.filter((s) => s.count > 0).map((s) => s.value));
            setSemesters((prev) => {
              const next = prev.filter((s) => valid.has(s));
              return next.length !== prev.length ? next : prev;
            });
          }
          if (outline) {
            const hasOutlineTrue = (data.has_outline || []).some((o) => o.value === "true" && o.count > 0);
            if (!hasOutlineTrue) setOutline(false);
          }
        }
      })
      .catch(() => {
        // Giữ dữ liệu cũ mờ đi trong lúc lỗi hoặc timeout
      })
      .finally(() => {
        if (alive && id === facetsReqId.current) {
          setFacetsLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [facetParamsKey]);

  const filter: ModuleFilter = useMemo(
    () => ({
      q: dq,
      language: language || undefined,
      credits_in: credits.length > 0 ? credits : undefined,
      faculty_in: faculties.length > 0 ? faculties : undefined,
      department_in: departments.length > 0 ? departments : undefined,
      type_in: types.length > 0 ? types : undefined,
      final_assessment_in: finalAssessments.length > 0 ? finalAssessments : undefined,
      semester: semester || undefined,
      degree: moduleDegree,
      program_ids: activeProgramIds.length > 0 ? activeProgramIds : undefined,
      has_outline: outline ? "true" : undefined,
      priority_codes: exchangeActive && priorityCodes.length > 0 ? priorityCodes.join(",") : undefined,
      exchange_rank: exchangeActive ? true : undefined,
      size: PAGE,
    }),
    [dq, language, credits, faculties, departments, types, finalAssessments, semester, moduleDegree, activeProgramIds, outline, exchangeActive, priorityCodes],
  );
  const filterKey = JSON.stringify(filter);

  const load = useCallback(
    async (p: number) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const r = await api.modules({ ...filter, page: p });
        if (id !== reqId.current) return;
        setItems((prev) => (p === 1 ? r.data.items : [...prev, ...r.data.items]));
        setTotal(r.data.total);
        setPage(p);
        setError(null);
        if (p === 1) {
          if (dq) {
            if (r.data.total === 0) {
              track("search_no_result", { query: dq });
            } else {
              track("search", { query: dq });
            }
          }
          if (credits.length || faculties.length || departments.length || types.length || semester || outline) {
            track("filter_use", { filters: filter });
          }
        }
      } catch (e) {
        if (id === reqId.current) setError(isConnectionError(e) ? { offline: true } : { message: e instanceof Error ? e.message : String(e) });
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

  const [finalAssessmentMap, setFinalAssessmentMap] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!items.length) return;
    let alive = true;
    items.forEach(async (m) => {
      if (m.final_assessment) return;
      const cached = getCachedFinalAssessmentKind(m.code);
      if (cached !== undefined) {
        if (cached !== null) {
          setFinalAssessmentMap((prev) => (prev[m.code] === cached ? prev : { ...prev, [m.code]: cached }));
        }
        return;
      }
      if (!m.has_outline) {
        setCachedFinalAssessmentKind(m.code, null);
        return;
      }
      try {
        const outline = await api.outline(m.code);
        if (!alive) return;
        const kind = finalAssessmentKind(outline?.assessments);
        setCachedFinalAssessmentKind(m.code, kind);
        if (kind) {
          setFinalAssessmentMap((prev) => ({ ...prev, [m.code]: kind }));
        }
      } catch {
        if (!alive) return;
        setCachedFinalAssessmentKind(m.code, null);
      }
    });
    return () => {
      alive = false;
    };
  }, [items]);


  const hasMore = items.length < total;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loading) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && load(page + 1), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, page, load]);

  const activeCount =
    (language ? 1 : 0) +
    credits.length +
    faculties.length +
    departments.length +
    types.length +
    finalAssessments.length +
    visibleSemesters.length +
    (outline ? 1 : 0);

  const reset = () => {
    setLanguage("");
    setCredits([]);
    setFaculties([]);
    setDepartments([]);
    setTypes([]);
    setFinalAssessments([]);
    setSemesters([]);
    setOutline(false);
  };

  // Faculty items are the API facet index as-is: the server already canonicalizes and orders them.
  const facultyItems = useMemo(
    () => (facetsData?.faculty ?? []).filter((i: FacetCount) => i.value && i.value.trim() && i.count > 0),
    [facetsData?.faculty],
  );

  const departmentItems = useMemo(() => {
    return (facetsData?.department ?? []).filter((i: FacetCount) => i.value && i.value.trim() && i.count > 0);
  }, [facetsData?.department]);

  const creditLabel = useCallback((v: string) => t("common.credits", { n: v }), [t]);
  const langLabel = useCallback((v: string) => (v === "en" ? t("mod.filterLangEn") : t("mod.filterLangVi")), [t]);
  const facultyLabel = useCallback((v: string) => facultyName(v, lang) || t("common.unknownFaculty"), [lang, t]);
  const departmentLabel = useCallback((v: string) => departmentName(v, lang), [lang]);
  const finalAssessmentLabel = useCallback(
    (v: string) => formatFinalAssessment(v, lang) ?? (v === "Khác" ? t("common.other") : v),
    [lang, t],
  );
  const count = (list: { value: string; count: number }[] | undefined, value: string) => list?.find((x) => x.value === value)?.count;

  return (
    <div className="relative desk:static">
      {/* Thanh tìm kiếm nằm trong cột trái; "Lọc theo" ở cột phải bắt đầu ngang hàng với nó và dính khi cuộn. */}
      <div className="grid items-start gap-8 desk:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 min-h-[500px] space-y-3">
      <div className="sticky top-[var(--app-header-h,4.125rem)] z-20 -mx-1 flex items-center gap-2 bg-[#f7f8fa] px-1 dark:bg-slate-950">
        <div className="relative min-w-0 flex-1 border-b border-slate-300 focus-within:border-brand-600 dark:border-slate-700">
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
        <button
          type="button"
          aria-label={t("mod.filterTitle")}
          title={t("mod.filterTitle")}
          aria-expanded={filtersOpen}
          onClick={toggleFilters}
          className="desk:hidden fixed bottom-20 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover"
        >
          {filtersOpen ? <X className="size-6" aria-hidden /> : <Filter className="size-6" aria-hidden />}
          {!filtersOpen && activeCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[11px] font-bold text-white dark:bg-white dark:text-slate-900">
              {activeCount}
            </span>
          )}
        </button>
      </div>
      <ProgramFilterBar
        showCard={false}
        customProgram={customProgram}
        onClearFilter={() => setDisableProgramFilter((v) => !v)}
        isFilterActive={activeProgramIds.length > 0 || !!graduateDegree}
        primaryProgram={primaryProgram}
        secondaryProgram={secondaryProgram}
      />
      {codeSearch && !primaryProgramReq.loading && !secondaryProgramReq.loading && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("profile.lookupByModuleHelp")}</p>
      )}
      {error && <ErrorBox>{"offline" in error ? t("api.connectionError") : t("common.error", { message: error.message })}</ErrorBox>}

          {loading && items.length === 0 ? <Loading page /> : !error && items.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{t("mod.empty")}</p>
          ) : (
            <ul>
              {items.map((m) => {
                const descInfo = moduleDescription(m, lang); // VI → description, EN → description_en (thiếu thì dùng bản còn lại)
                const desc = descInfo.text;
                const targetOutlineUrl = lang === "en" ? (m.outline_url_en || m.outline_url) : (m.outline_url || m.outline_url_en);
                // Nút đề cương: luôn đặt ngay sau loại học phần; bộ môn · khoa xuống dòng riêng khi không đủ chỗ.
                const outlineChip = targetOutlineUrl ? (
                  <a
                    href={targetOutlineUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chip gap-1 bg-indigo-50 text-indigo-700 hover:underline dark:bg-indigo-950 dark:text-indigo-300"
                    aria-label={t("badge.outlinePdf")}
                    title={t("badge.outlinePdf")}
                  >
                    {t("badge.outlineLink")}
                    <span aria-hidden="true">↗</span>
                  </a>
                ) : m.has_outline ? (
                  <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">{t("badge.outline")}</span>
                ) : null;
                return (
                  <li key={m.code} className="flex flex-col gap-4 border-b border-slate-200 py-5 sm:flex-row sm:justify-between sm:gap-8 dark:border-slate-800">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/modules/${encodeURIComponent(m.code)}`} className="text-lg font-semibold leading-snug text-brand-600 hover:underline dark:text-brand-300">
                          <span className="font-mono">{m.code}</span> {moduleName(m, lang)}
                        </Link>
                        {(() => {
                          const progStatus = moduleProgramStatus.get(m.code);
                          if (!progStatus) return null;
                          return <RequiredBadge required={progStatus.required} lang={lang} />;
                        })()}
                        <ExchangeStatBadge stat={exchangeStats[m.code]} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                        {(() => {
                          const finalAssessment = m.final_assessment || finalAssessmentMap[m.code] || getCachedFinalAssessmentKind(m.code);
                          const department = m.department ? departmentName(m, lang) : undefined;
                          const faculty = facultyName(m, lang) || t("common.unknownFaculty");
                          const deptFaculty = [department, faculty].filter(Boolean).join(" · ");
                          return (
                            <>
                              {/* Tín chỉ · thi · loại và nút đề cương luôn đi cùng nhau; bộ môn · khoa xuống dòng riêng khi không đủ chỗ. */}
                              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span>{creditsLine({ credits: m.credits, finalAssessment, type: m.type }, lang)}</span>
                                {outlineChip}
                              </span>
                              {deptFaculty && <span>{deptFaculty}</span>}
                            </>
                          );
                        })()}
                        {(() => {
                          const progStatus = moduleProgramStatus.get(m.code);
                          if (!progStatus?.electiveRequirement) return null;
                          return (
                            <span className="text-xs text-amber-700 dark:text-amber-300">
                              ({progStatus.electiveRequirement})
                            </span>
                          );
                        })()}
                        {(m.language_track === "en" || (!m.language_track && m.is_english)) && !isEnglishCode(m.code) && <EnBadge />}
                        {exchangeActive && prioritySet.has(m.code) && (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            {t("exchange.chip.selected")}
                          </span>
                        )}
                      </div>
                      <div className="sm:hidden">
                        <TermStrip m={m} year={yearStr} />
                        <div className="mt-1.5"><NoClassWarning module={m} timetableSemester={currentYearSecondTerm} /></div>
                      </div>
                      {desc ? (
                        <p lang={descInfo.fallback ? (lang === "en" ? "vi" : "en") : lang} className="whitespace-pre-line wrap-anywhere text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                          {desc}
                          {descInfo.fallback && <span className="ml-1 text-xs italic text-slate-400" title={t("det.descFallback")}>({lang === "en" ? "VI" : "EN"})</span>}
                        </p>
                      ) : (
                        <p className="text-xs italic text-slate-400">{t("det.noDescription")}</p>
                      )}
                    </div>
                    <div className="w-full shrink-0 space-y-2 sm:w-60">
                      <div className="hidden space-y-1.5 sm:block">
                        <TermTabs m={m} year={yearStr} />
                      </div>
                      <ModuleActions module={m} timetableSemester={currentYearSecondTerm} compact stacked />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div ref={sentinel} className="py-6 text-center text-sm text-slate-500">
            {loading && items.length > 0 && <Loading compact />}
            {!loading && hasMore && (
              <button className="btn-outline" onClick={() => load(page + 1)}>{t("common.loadMore", { loaded: items.length, total })}</button>
            )}
          </div>
        </div>

        <aside
          // Điện thoại: khung kết thúc phía trên nút tròn cam (top-14 = 3.5rem; nút ở bottom-20 cao 3rem → 8rem + 0.5rem khe)
          // nên nút không bao giờ đè lên nội dung bộ lọc.
          className={`space-y-3 max-h-[calc(100dvh-12rem)] overflow-y-auto desk:sticky desk:top-[calc(var(--app-header-h,4.125rem)+0.5rem)] desk:max-h-[calc(100vh-var(--app-header-h,4.125rem)-1rem)] desk:overflow-y-auto desk:pr-1 desk:order-none desk:block desk:z-auto desk:rounded-none desk:border-0 desk:bg-transparent desk:p-0 desk:shadow-none ${
            filtersOpen ? "fixed inset-x-0 top-14 z-[35] block rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900 desk:inset-x-auto desk:top-6" : "hidden"
          } ${facetsLoading ? "opacity-60 transition-opacity" : "transition-opacity"}`}
          aria-label={t("mod.filterTitle")}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t("mod.filterTitle")}</h2>
            <button
              type="button"
              disabled={activeCount === 0}
              onClick={reset}
              className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-center text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-blue-600"
            >
              {activeCount > 0 ? t("mod.filterResetCount", { n: activeCount }) : t("mod.filterReset")}
            </button>
          </div>

          <FacetFilter
            title={t("mod.filterLang")}
            items={facetsData?.language ?? []}
            value={language}
            onChange={setLanguage}
            labelOf={langLabel}
            sort="none"
            total={facetsData?.total}          />
          <FacetFilter
            title={t("mod.filterCredits")}
            items={facetsData?.credits ?? []}
            multiple
            values={credits}
            onValuesChange={setCredits}
            labelOf={creditLabel}
            sort="none"
            total={facetsData?.total}          />
          <FacetFilter
            key={`faculty-${filterUiKey}`}
            title={t("mod.filterFaculty")}
            items={facultyItems}
            multiple
            values={faculties}
            onValuesChange={setFaculties}
            labelOf={facultyLabel}
            sort="alpha"
            collapsibleOnMobile
            headerInToggle
            expandLabel={t("facet.addFacultyFilter")}
            total={facetsData?.total}          />
          <FacetFilter
            key={`department-${filterUiKey}`}
            title={t("mod.filterDepartment")}
            items={departmentItems}
            multiple
            values={departments}
            onValuesChange={setDepartments}
            labelOf={departmentLabel}
            sort="alpha"
            collapsibleOnMobile
            headerInToggle
            expandLabel={t("facet.addDepartmentFilter")}
            total={facetsData?.total}          />
          <FacetFilter
            title={t("mod.filterType")}
            items={facetsData?.type ?? []}
            multiple
            values={types}
            onValuesChange={setTypes}
            labelOf={(value) => formatModuleType(value, lang)}
            sort="none"
            total={facetsData?.total}          />
          <SemesterFilterSquares
            title={t("mod.filterSemester")}
            items={facetsData?.semester.filter((item) => isCatalogSemester(item.value)) ?? []}
            values={visibleSemesters}
            onValuesChange={setSemesters}          />
          {/* Một dòng: ô chọn + "Có đề cương" + số môn có đề cương */}
          <CheckFacet
            label={t("badge.outline")}
            count={count(facetsData?.has_outline, "true")}
            checked={outline}
            onChange={setOutline}
          />

          {/* Final assessment: chỉ hiện khi có dữ liệu thật (Requirement 5) */}
          {facetsData?.final_assessment && facetsData.final_assessment.some((x: FacetCount) => x.count > 0) && (
            <FacetFilter
              title={t("mod.filterFinalAssessment")}
              items={facetsData.final_assessment}
              multiple
              values={finalAssessments}
              onValuesChange={setFinalAssessments}
              labelOf={finalAssessmentLabel}
              sort="count"
              noScroll
              total={facetsData.total}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
