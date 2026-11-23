"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useMounted } from "@/lib/useMounted";
import { COHORTS, useSettings } from "@/lib/store";
import { useWorkspace } from "@/lib/workspace";
import { effectiveBadge } from "@/lib/regulations";
import { formatDateVi } from "@/lib/dates";
import { Loading } from "@/components/ui";
import { DocTree } from "@/components/regulations/DocTree";
import { MarkdownReader } from "@/components/regulations/MarkdownReader";
import { ChatPanel } from "@/components/regulations/ChatPanel";
import { ComparePanel } from "@/components/regulations/ComparePanel";
import { openCommandPalette } from "@/components/CommandPalette";
import { useT } from "@/i18n";

type MobilePane = "tree" | "read" | "chat";

function WarningBanner({ cohort }: { cohort: string }) {
  const { t } = useT();
  const open = useWorkspace((s) => s.open);
  const expiring = useApi(() => api.expiring(90), []);
  const all = useApi(() => api.regulations({ cohort: cohort || undefined }), [cohort]);
  const stale = (all.data ?? []).filter((d) => ["expired", "superseded"].includes(effectiveBadge(d)));
  const soon = (expiring.data ?? []).filter((d) => !cohort || d.applies_to_cohorts.includes("all") || d.applies_to_cohorts.includes(cohort));
  if (!soon.length && !stale.length) return null;
  return (
    <div className="mb-3 space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100" role="alert">
      {soon.map((d) => (
        <p key={d.doc_id}>
          ⚠ <strong>{t("reg.warnSoon")}</strong> <button className="underline" onClick={() => open(d.doc_id)}>{d.decision_no}</button> {t("reg.warnSoonDate", { d: formatDateVi(d.effective_to) })}
        </p>
      ))}
      {stale.map((d) => (
        <p key={d.doc_id}>
          ⛔ <strong>{t("reg.warnStale")}</strong> <button className="underline" onClick={() => open(d.doc_id)}>{d.decision_no}</button>
          {d.superseded_by && <>{t("reg.replacedBy")}<button className="underline" onClick={() => open(d.superseded_by!)}>{d.superseded_by}</button></>}.
        </p>
      ))}
    </div>
  );
}

export default function RegulationsWorkspace() {
  const { t } = useT();
  const mounted = useMounted();
  const savedCohort = useSettings((s) => s.cohort);
  const [cohort, setCohort] = useState("");
  const [pane, setPane] = useState<MobilePane>("read");
  const [view, setView] = useState<"read" | "compare">("read");
  const ws = useWorkspace();
  const docs = useApi(() => api.regulations({ cohort: cohort || undefined }), [cohort]);

  useEffect(() => {
    if (mounted) setCohort(savedCohort);
  }, [mounted, savedCohort]);

  // Deep link: /regulations?doc=<id>#<anchor>
  useEffect(() => {
    if (!mounted) return;
    const doc = new URLSearchParams(window.location.search).get("doc");
    if (doc) {
      useWorkspace.getState().open(doc, window.location.hash.slice(1) || undefined);
      window.history.replaceState(null, "", "/regulations");
    }
  }, [mounted]);

  // Open the first doc when nothing is open yet
  useEffect(() => {
    if (mounted && !ws.active && docs.data?.length) ws.open(docs.data[0].doc_id);
  }, [mounted, ws, docs.data]);

  // Switch to the reader on mobile whenever something is opened
  const nonce = ws.target?.nonce;
  useEffect(() => {
    if (nonce) {
      setPane("read");
      setView("read");
    }
  }, [nonce]);

  if (!mounted) return <Loading />;

  const titleOf = (id: string) => docs.data?.find((d) => d.doc_id === id)?.decision_no ?? id;
  const hidden = (p: MobilePane) => (pane === p ? "" : "hidden lg:block");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title">{t("reg.title")}</h1>
          <p className="text-xs text-slate-500">
            {t("reg.sub")}{" "}
            {!savedCohort && <Link href="/settings" className="text-brand-ink underline">{t("reg.chooseCohort")}</Link>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto py-1.5" value={cohort} onChange={(e) => setCohort(e.target.value)} aria-label={t("reg.cohortFilter")}>
            <option value="">{t("reg.allCohorts")}</option>
            {COHORTS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn-outline" onClick={() => openCommandPalette()} title="Ctrl+K">
            {t("reg.search")} <kbd className="rounded border px-1 text-[10px]">Ctrl K</kbd>
          </button>
          <Link href="/regulations/graph" className="btn-outline">{t("reg.graph")}</Link>
          <Link href="/ask" className="btn-outline">{t("ask.title")}</Link>
        </div>
      </div>
      <WarningBanner cohort={cohort} />

      <div className="mb-3 grid grid-cols-3 gap-1 rounded bg-slate-100 p-1 text-sm lg:hidden dark:bg-slate-800" role="tablist">
        {([["tree", t("reg.tabTree")], ["read", t("reg.tabRead")], ["chat", t("reg.tabChat")]] as [MobilePane, string][]).map(([p, l]) => (
          <button key={p} role="tab" aria-selected={pane === p} className={`rounded py-1.5 ${pane === p ? "bg-white font-semibold shadow dark:bg-slate-900" : ""}`} onClick={() => setPane(p)}>{l}</button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)_340px]">
        <aside className={`card h-fit p-3 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto ${hidden("tree")}`}>
          {docs.loading ? <Loading /> : <DocTree docs={docs.data ?? []} active={ws.active} onOpen={(id) => ws.open(id)} />}
        </aside>

        <section className={`card min-w-0 p-0 ${hidden("read")}`}>
          <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 px-2 pt-2 dark:border-slate-800">
            {ws.tabs.map((tab) => (
              <div key={tab} className={`flex shrink-0 items-center rounded-t border border-b-0 text-xs ${ws.active === tab && view === "read" ? "border-slate-200 bg-white font-semibold dark:border-slate-700 dark:bg-slate-900" : "border-transparent text-slate-500"}`}>
                <button className="px-3 py-1.5" onClick={() => { ws.setActive(tab); setView("read"); }}>{titleOf(tab)}</button>
                <button className="pr-2 text-slate-400 hover:text-red-500" onClick={() => ws.close(tab)} aria-label={t("reg.closeDoc", { t: titleOf(tab) })}>×</button>
              </div>
            ))}
            <button
              className={`ml-auto shrink-0 rounded-t px-3 py-1.5 text-xs ${view === "compare" ? "bg-brand-600 font-semibold text-white" : "text-brand-700 hover:bg-brand-50 dark:text-brand-300"}`}
              onClick={() => setView((v) => (v === "compare" ? "read" : "compare"))}
            >
              {t("reg.compare")}
            </button>
          </div>
          <div className="p-4">
            {view === "compare" ? (
              <ComparePanel defaultCohort={cohort} />
            ) : ws.active ? (
              <MarkdownReader key={ws.active} docId={ws.active} />
            ) : (
              <p className="py-10 text-center text-sm text-slate-500">{t("reg.pick")}</p>
            )}
          </div>
        </section>

        <aside className={`card h-fit p-3 lg:sticky lg:top-16 lg:h-[calc(100vh-5rem)] ${hidden("chat")}`}>
          <ChatPanel cohort={cohort} />
        </aside>
      </div>
    </div>
  );
}
