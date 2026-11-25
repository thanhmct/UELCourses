"use client";
import Link from "next/link";
import { Fragment } from "react";
import { wikilinkHref } from "@/lib/vault";

const WIKILINK = /\[\[([^\]#|]+)(?:#\^([^\]|]+))?\|([^\]]+)\]\]/g;

/** Renders a warning, turning `[[doc#^anchor|label]]` into a clickable link to the original text. */
export function WarningText({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(WIKILINK)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(<Fragment key={`t${at}`}>{text.slice(last, at)}</Fragment>);
    parts.push(
      <Link key={`l${at}`} href={wikilinkHref(m[1], m[2])} onNavigate={onNavigate} className="font-medium underline">
        {m[3]}
      </Link>,
    );
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(<Fragment key="end">{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}
