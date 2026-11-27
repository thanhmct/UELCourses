"use client";

import { Loading } from "@/components/ui";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { isConnectionError } from "@/lib/dataSource";
import type { PlannedModule } from "@/lib/planner";
import { useT } from "@/i18n";
import { moduleName } from "@/i18n/names";
import { useApi } from "@/lib/useApi";
import { useDebounced } from "@/lib/useDebounced";
import { activeToken, finishedCodes, parseCodes, rankSuggestions, replaceActiveToken } from "@/lib/codeTokens";
import { usePlanner } from "@/lib/store";

export function BatchModuleAdd({ onAdd }: {
  onAdd: (module: PlannedModule) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ code: string; ok: boolean; msg: string }[]>([]);
  const { t, lang } = useT();
  const catalog = usePlanner((s) => s.catalog);

  // Gợi ý mã khớp với phần đang gõ (đoạn sau dấu phẩy cuối cùng); mỗi dấu phẩy bắt đầu một mã mới.
  const { token } = activeToken(text);
  const dq = useDebounced(token.trim(), 250);
  const suggestReq = useApi(
    () => (dq.length >= 2 ? api.modules({ q: dq, size: 12 }) : Promise.resolve({ data: { items: [], total: 0 }, mock: false })),
    [dq],
  );
  const suggestions = useMemo(() => {
    if (dq.length < 2 || token.trim().length < 2) return [];
    const seen = new Set<string>();
    return rankSuggestions(
      [...(suggestReq.data?.items ?? []), ...Object.values(catalog)],
      token,
      finishedCodes(text),
    ).filter((item) => {
      if (seen.has(item.code)) return false;
      seen.add(item.code);
      return true;
    }).slice(0, 8);
  }, [suggestReq.data, catalog, dq, token, text]);

  const add = async () => {
    const codes = parseCodes(text);
    if (codes.length === 0) return;
    setBusy(true);
    const rows: { code: string; ok: boolean; msg: string }[] = [];
    for (const code of codes) {
      try {
        const cached = catalog[code];
        if (cached) {
          onAdd(cached);
          rows.push({ code, ok: true, msg: moduleName(cached, lang) });
          continue;
        }
        const detail = (await api.module(code)).data;
        if (!detail) {
          rows.push({ code, ok: false, msg: t("gpa.add.notFound") });
          continue;
        }
        onAdd({
          code,
          name: detail.name,
          name_en: detail.name_en ?? null,
          credits: detail.credits ?? 0,
          prerequisites: detail.prerequisites ?? [],
          equivalents: detail.equivalents ?? [],
        });
        rows.push({ code, ok: true, msg: moduleName(detail, lang) });
      } catch (error) {
        rows.push({ code, ok: false, msg: t(isConnectionError(error) ? "common.loadFailure" : "gpa.add.loadError") });
      }
    }
    setReport(rows);
    setBusy(false);
    setText(rows.filter((row) => !row.ok).map((row) => row.code).join(", "));
  };

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-slate-500">{t("gpa.add.desc")}</p>
      <textarea
        rows={2}
        aria-label={t("gpa.add.inputAria")}
        className="input font-mono text-sm"
        placeholder={t("gpa.add.placeholder")}
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
      />
      {token.trim().length >= 2 && (
        <div className="rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" role="listbox" aria-label={t("gpa.add.suggestionsAria")}>
          <p className="border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-800">
            {suggestReq.loading
              ? <Loading compact />
              : suggestions.length > 0
                  ? t("gpa.add.matches", { token: token.trim() })
                  : t("gpa.add.noMatches", { token: token.trim() })}
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
                  <span className="shrink-0 text-xs text-slate-500">{m.credits ?? "?"} {t("common.unitCr")}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" onClick={add} disabled={busy || !text.trim()}>
          {busy ? t("gpa.add.adding") : t("gpa.add.submit")}
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

