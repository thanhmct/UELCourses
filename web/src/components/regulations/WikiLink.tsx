"use client";
import { Loading } from "@/components/ui";
import { useRef, useState, type ReactNode } from "react";
import { getMarkdown } from "@/lib/vaultCache";
import { anchorToLabel, extractSection } from "@/lib/vault";
import { useWorkspace } from "@/lib/workspace";
import { useT } from "@/i18n";

/** Internal link to doc#anchor: click opens it in the workspace, hover shows a clause preview. */
export function WikiLink({ target, children, className = "" }: { target: string; children: ReactNode; className?: string }) {
  const { t } = useT();
  const [doc, anchor] = target.split("#");
  const open = useWorkspace((s) => s.open);
  const [preview, setPreview] = useState<{ title: string; text: string } | null>(null);
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = () => {
    timer.current = setTimeout(async () => {
      setShow(true);
      if (preview) return;
      const md = await getMarkdown(doc);
      if (!md) return setPreview({ title: doc, text: t("wiki.loadFail") });
      const text = anchor ? extractSection(md.markdown, anchor) : md.frontmatter?.title ?? null;
      setPreview({
        title: `${md.frontmatter?.decision_no ?? doc}${anchor ? ` · ${anchorToLabel(anchor)}` : ""}`,
        text: text ?? t("wiki.notFound"),
      });
    }, 250);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
  };

  return (
    <span className="relative inline" onMouseEnter={load} onMouseLeave={hide} onFocus={load} onBlur={hide}>
      <a
        href={`/regulations?doc=${encodeURIComponent(doc)}${anchor ? `#${anchor}` : ""}`}
        onClick={(e) => {
          e.preventDefault();
          hide();
          open(doc, anchor);
        }}
        className={`rounded px-0.5 font-medium text-violet-700 underline decoration-violet-300 decoration-dotted underline-offset-2 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950 ${className}`}
      >
        {children}
      </a>
      {show && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-40 mt-1 block w-72 max-w-[80vw] rounded-lg border border-slate-200 bg-white p-3 text-left text-xs font-normal not-italic text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          {preview ? <span className="mb-1 block font-semibold text-slate-900 dark:text-white">{preview.title}</span> : <Loading compact />}
          <span className="block max-h-40 overflow-hidden whitespace-pre-line">{preview?.text ?? ""}</span>
        </span>
      )}
    </span>
  );
}
