// remark plugin: turns [[doc#anchor|label]] into links and assigns anchors
// (dieu-N on "## Điều N." headings, dieu-N-khoan-M on "**M.**" paragraphs).
import type { Heading, Link, Nodes, Paragraph, PhrasingContent, Root, Text } from "mdast";
import { splitWikilinks, wikilinkHref, wikilinkLabel } from "./vault";

function toText(node: Nodes): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node) return (node.children as Nodes[]).map(toText).join("");
  return "";
}

function setProps(node: Nodes, props: Record<string, string>) {
  const data = (node.data ??= {}) as { hProperties?: Record<string, string> };
  data.hProperties = { ...(data.hProperties ?? {}), ...props };
}

function transformWikilinks(node: Nodes) {
  if (!("children" in node) || node.type === "link" || node.type === "linkReference") return;
  const children = node.children as Nodes[];
  const next: Nodes[] = [];
  for (const child of children) {
    if (child.type === "text" && child.value.includes("[[")) {
      for (const seg of splitWikilinks(child.value)) {
        if (seg.type === "text") next.push({ type: "text", value: seg.value } as Text);
        else {
          const { doc_id, anchor } = seg.link;
          const link: Link = {
            type: "link",
            url: wikilinkHref(doc_id, anchor),
            children: [{ type: "text", value: wikilinkLabel(seg.link) }],
            data: { hProperties: { "data-wikilink": anchor ? `${doc_id}#${anchor}` : doc_id } },
          };
          next.push(link);
        }
      }
    } else {
      transformWikilinks(child);
      next.push(child);
    }
  }
  (node as { children: Nodes[] }).children = next;
}

function annotateAnchors(tree: Root) {
  let article: string | null = null;
  for (const node of tree.children) {
    if (node.type === "heading" && (node as Heading).depth === 2) {
      const m = /Điều\s+(\d+[a-z]?)/i.exec(toText(node));
      article = m ? m[1] : null;
      if (article) setProps(node, { id: `dieu-${article}`, "data-anchor": `dieu-${article}` });
      continue;
    }
    if (node.type === "paragraph") {
      const parts = (node as Paragraph).children;
      const last = parts.at(-1);
      if (last?.type === "text") {
        const block = /\s+\^(trang-\d+-muc-\d+)$/.exec(last.value);
        if (block) {
          last.value = last.value.slice(0, block.index);
          setProps(node, { id: block[1], "data-anchor": block[1] });
          continue;
        }
      }
      if (!article) continue;
      const first = parts[0] as PhrasingContent | undefined;
      if (first?.type === "strong") {
        const m = /^(\d+)\.?$/.exec(toText(first).trim());
        if (m) {
          const anchor = `dieu-${article}-khoan-${m[1]}`;
          setProps(node, { id: anchor, "data-anchor": anchor });
        }
      }
    }
  }
}

export function remarkVault() {
  return (tree: Root) => {
    transformWikilinks(tree);
    annotateAnchors(tree);
  };
}
