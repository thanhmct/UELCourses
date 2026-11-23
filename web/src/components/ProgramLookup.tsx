"use client";

import { Loading } from "@/components/ui";
import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Search } from "lucide-react";
import { useT } from "@/i18n";
import {
  hasVerifiedUndergraduateTrack,
  type LookupDegree, type LookupMajor, type LookupOption, lookupTrack,
  parseLookupQuery, searchProgramMajors, type buildProgramLookup,
} from "@/lib/programLookup";
import { parseProgramCode } from "@/lib/programCode";

const degrees = ["all", "dai_hoc", "thac_si", "tien_si"] as const;
const optionClass = "flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-focus dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800";

export function ProgramLookup({ id, value, lookup, loading, onChange, onSave, primary }: {
  id: string;
  value: string;
  lookup: ReturnType<typeof buildProgramLookup>;
  loading: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  primary?: boolean;
}) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(primary && !value);
  const [degree, setDegree] = useState<LookupDegree>("all");
  const [majorId, setMajorId] = useState("");
  const [browse, setBrowse] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const query = parseLookupQuery(browse ? "" : value);
  const visible = !!open;
  const resultsId = `${id}-results`;
  const majors = query.code ? [] : searchProgramMajors(lookup.majors, query, degree, lang);
  const selected = majors.find((major) => major.id === majorId);
  const parsedCode = query.code ? parseProgramCode(value) : null;
  const codeOptions = query.code
    ? lookup.exactCodes.filter(({ code }) => code.startsWith(query.code)
      || (parsedCode?.degree !== "dai_hoc" && code === parsedCode?.contextualProgramId))
      .sort((a, b) => Number(b.code === query.code) - Number(a.code === query.code) || a.code.localeCompare(b.code))
    : [];

  function focusResult() {
    root.current?.querySelector<HTMLButtonElement>("[data-lookup-result]")?.focus();
  }

  function choose(option: LookupOption) {
    onChange(option.code);
    setMajorId("");
    setBrowse(false);
    setOpen(false);
    input.current?.focus();
  }

  function chooseMajor(major: LookupMajor) {
    if (major.degree !== "dai_hoc" && major.options.length === 1) {
      choose(major.options[0]);
    } else {
      setMajorId(major.id);
      input.current?.focus();
    }
  }

  function handleNavigation(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && visible) {
      event.stopPropagation();
      setOpen(false);
      input.current?.focus();
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && event.target instanceof HTMLButtonElement
      && event.target.hasAttribute("data-lookup-result")) {
      event.preventDefault();
      const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>("[data-lookup-result]") ?? [])];
      const next = buttons.indexOf(event.target) + (event.key === "ArrowDown" ? 1 : -1);
      (buttons[next] ?? (next < 0 ? input.current : undefined))?.focus();
    }
  }

  function renderOption(option: LookupOption, showName = false) {
    const { parsed } = option;
    const name = (lang === "en" ? option.englishName : option.name) || t("profile.majorCode", { code: parsed.major });
    const track = lookupTrack(parsed);
    const label = parsed.degree === "dai_hoc"
      ? t(`profile.lookupTrack.${track}`)
      : track === "other" ? t(`degree.${parsed.degree}`) : t(`profile.lookupTrack.${track}`);
    const title = showName ? name : label;
    const details = [
      ...(showName && label !== name ? [label] : []),
      ...(parsed.degree === "dai_hoc" ? [t("profile.cohortChip", { n: parsed.cohort.slice(1) })] : []),
      ...(!option.hasCurriculum && (parsed.degree !== "dai_hoc" || hasVerifiedUndergraduateTrack(parsed.contextualProgramId))
        ? [t("profile.lookupModuleCode")] : []),
    ].join(" · ");
    return (
      <button key={option.code} type="button" data-lookup-result className={optionClass} onClick={() => choose(option)}
        aria-label={[title, details, option.code].filter(Boolean).join(" · ")}>
        <span className="min-w-0">
          <span className="block break-words text-sm font-semibold text-slate-900 dark:text-white">{title}</span>
          {details && <span className="block text-xs text-slate-600 dark:text-slate-400">{details}</span>}
        </span>
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">{option.code}</span>
      </button>
    );
  }

  return (
    <div ref={root} onKeyDown={handleNavigation} className="space-y-2" onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
        <input
          ref={input}
          id={id}
          aria-controls={visible ? resultsId : undefined}
          className="input min-h-11 pl-9 pr-10"
          placeholder={t(primary ? "profile.primaryPh" : "profile.secondaryPh")}
          value={value}
          autoComplete="off"
          onChange={(event) => {
            onChange(event.target.value);
            setMajorId("");
            setBrowse(false);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (visible) focusResult();
              else setOpen(true);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (parseProgramCode(value) || !visible) onSave();
              else focusResult();
            }
          }}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 grid w-10 cursor-pointer place-items-center rounded-r-lg text-slate-500 hover:text-brand-700 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-focus"
          aria-label={t("profile.browse")}
          aria-expanded={visible}
          aria-controls={visible ? resultsId : undefined}
          onClick={() => {
            setMajorId("");
            setBrowse(!visible);
            setDegree("all");
            setOpen(!visible);
          }}
        >
          <ChevronDown className={`size-4 transition-transform ${visible ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </div>
      {visible && (
        <div id={resultsId} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          {selected ? (
            <div className="border-b border-slate-200 px-2 py-1.5 dark:border-slate-700">
              <button type="button" onClick={() => { setMajorId(""); input.current?.focus(); }} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-slate-800">
                <ArrowLeft className="size-4 shrink-0" aria-hidden />
                {t("profile.lookupBack")}
              </button>
              <div className="px-2 pb-1">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {(lang === "en" ? selected.englishName : selected.name) || t("profile.majorCode", { code: selected.major })}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {t(selected.degree === "dai_hoc" ? "profile.lookupChooseTrack" : "profile.lookupChooseDirection")}
                </p>
              </div>
            </div>
          ) : !query.code && (
            <div role="group" aria-label={t("degree.label")} className="flex flex-wrap gap-1.5 border-b border-slate-200 bg-slate-50/70 p-2 dark:border-slate-700 dark:bg-slate-800/50">
              {degrees.map((item) => (
                <button
                  type="button" key={item} aria-pressed={(query.degree ?? degree) === item}
                  onClick={() => {
                    if (query.degree && query.degree !== item) setBrowse(true);
                    setDegree(item);
                  }}
                  className="min-h-8 cursor-pointer rounded-md px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 aria-pressed:bg-brand-100 aria-pressed:text-brand-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:aria-pressed:bg-brand-950 dark:aria-pressed:text-brand-200"
                >{t(item === "dai_hoc" ? "profile.lookupBachelor" : `degree.${item}`)}</button>
              ))}
            </div>
          )}
          <div role="group" aria-label={t("profile.lookupResults")} className="max-h-56 overflow-y-auto overscroll-contain p-1">
            {loading ? (
              <Loading compact className="px-3 py-4" />
            ) : selected ? [...selected.options].sort((a, b) =>
              b.parsed.cohort.localeCompare(a.parsed.cohort) || a.code.localeCompare(b.code),
            ).map((option) => renderOption(option)) : query.code
              ? codeOptions.map((option) => renderOption(option, true))
              : majors.map((major) => {
                const name = (lang === "en" ? major.englishName : major.name) || t("profile.majorCode", { code: major.major });
                const alternate = lang === "en" ? major.name : major.englishName;
                const level = t(major.degree === "dai_hoc" ? "profile.lookupBachelor" : `degree.${major.degree}`);
                const details = [level, major.major, ...(alternate && alternate !== name ? [alternate] : [])].join(" · ");
                return (
                  <button key={major.id} type="button" data-lookup-result className={optionClass} onClick={() => chooseMajor(major)}
                    aria-label={`${name} · ${details}`}>
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-semibold text-slate-900 dark:text-white">{name}</span>
                      <span className="block text-xs text-slate-600 dark:text-slate-400">
                        {details}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-slate-500" aria-hidden />
                  </button>
                );
              })}
            {!loading && !selected && (query.code ? codeOptions.length === 0 : majors.length === 0) && (
              <p role="status" className="px-3 py-4 text-sm text-slate-600 dark:text-slate-400">
                {t("profile.lookupEmpty")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
