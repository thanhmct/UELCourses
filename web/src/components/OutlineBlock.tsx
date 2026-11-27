"use client";

import { useEffect, useState } from "react";
import { api, type OutlineData } from "@/lib/api";
import { useT } from "@/i18n";
import { fold } from "@/lib/text";
import { formatOutlineAssessment, formatOutlineMaterial } from "@/lib/outlineLanguage";
import type { ModuleAssessment, ModuleTextbook } from "@/lib/types";

const STAGES = ["process", "midterm", "final", "advanced"] as const;

export function OutlineBlock({ code, programId, cohort, assessment, textbooks }: {
  code: string;
  programId?: string;
  cohort?: string;
  assessment?: ModuleAssessment | null;
  textbooks?: ModuleTextbook[];
}) {
  const { t, lang } = useT();
  const [data, setData] = useState<OutlineData | null>(null);
  useEffect(() => {
    let active = true;
    setData(null);
    api.outline(code, { program_id: programId, cohort }).then((outline) => {
      if (active) setData(outline);
    });
    return () => { active = false; };
  }, [code, programId, cohort]);

  const assessments = STAGES.flatMap((stage) => {
    const form = assessment?.[`${stage}_form`]?.trim();
    const ratio = assessment?.[`${stage}_ratio`];
    return form || typeof ratio === "number" ? [{ stage, form, ratio }] : [];
  });
  const examType = assessment?.exam_type?.trim() || null;
  const examDuration = assessment?.exam_duration?.trim() || null;
  const materials = new Map<string, { kind?: string; citation: string; url?: string; docCode?: string; note?: string }>();
  for (const { kind, citation } of data?.materials ?? []) {
    if (citation?.trim()) materials.set(fold(citation), { kind, citation: citation.trim() });
  }
  for (const { name, url, is_main, document_code, note } of textbooks ?? []) {
    const citation = name?.trim() || url?.trim();
    if (!citation) continue;
    const safeUrl = url?.trim() && /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined;
    materials.set(fold(citation), {
      kind: is_main ? "textbook" : "reference",
      citation,
      url: safeUrl,
      docCode: document_code?.trim() || undefined,
      note: note?.trim() || undefined,
    });
  }

  if (!assessments.length && !materials.size && !examType && !examDuration) return null;

  const percent = new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 2 });

  return (
    <section className="card space-y-5" aria-label={t("outline.title")}>
      {(assessments.length > 0 || examType || examDuration) && (
        <div className="overflow-x-auto">
          <h2 className="mb-1 font-semibold">{t("outline.assess")}</h2>
          {assessments.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th scope="col" className="py-1">{t("outline.assessItem")}</th>
                  <th scope="col" className="py-1 text-right">{t("outline.assessWeight")}</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map(({ stage, form, ratio }) => (
                  <tr key={stage} className="border-t border-slate-100 align-top dark:border-slate-800">
                    <td className="py-2 pr-3">
                      <div>{t(`outline.assessStage.${stage}`)}</div>
                      {form && <div className="text-xs text-slate-500">{formatOutlineAssessment(form, lang)}</div>}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {typeof ratio === "number" ? percent.format(ratio) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(examType || examDuration) && (
            <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              {examType && (
                <>
                  <dt className="text-slate-500">{t("outline.examType")}</dt>
                  <dd>{formatOutlineAssessment(examType, lang)}</dd>
                </>
              )}
              {examDuration && (
                <>
                  <dt className="text-slate-500">{t("outline.examDuration")}</dt>
                  <dd>{examDuration}</dd>
                </>
              )}
            </dl>
          )}
        </div>
      )}
      {materials.size > 0 && (
        <div>
          <h2 className="mb-1 font-semibold">{t("outline.materials")}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {[...materials].map(([key, { kind, citation, url, docCode, note }]) => (
              <li key={key}>
                <span className="mr-1 text-xs text-slate-500">
                  {t(kind === "textbook" ? "outline.textbook" : kind === "software" ? "outline.software" : "outline.reference")} ·
                </span>
                {url ? <a href={url} className="text-brand-700 underline dark:text-brand-300" target="_blank" rel="noreferrer">{formatOutlineMaterial(citation, lang)}</a> : formatOutlineMaterial(citation, lang)}
                {docCode && <span className="ml-2 text-xs text-slate-500">{t("outline.docCode")}: {docCode}</span>}
                {note && <div className="text-xs text-slate-500">{t("outline.note")}: {formatOutlineMaterial(note, lang)}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
