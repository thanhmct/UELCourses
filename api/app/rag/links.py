"""Detect Vietnamese legal cross-references and turn them into Obsidian wikilinks.

Recognised forms (case-insensitive):
  "điểm a khoản 2 Điều 10", "khoản 2 Điều 10", "Điều 10"            -> same document
  "khoản 1 Điều này", "khoản 3" (no Điều)                            -> same article
  "Điều 5 Quy chế này", "Điều 5 của Quy định này"                    -> same document
  "Điều 12 Quyết định số 1268/QĐ-ĐHKTL", "Điều 10 QĐ 1268"           -> other document (via decision_no)
  "Quyết định số 1268/QĐ-ĐHKTL", "Thông tư 08/2021/TT-BGDĐT",
  "Nghị định số 238/2025/NĐ-CP"                                      -> other document (no anchor)
Unresolvable references keep their text and are logged (`Resolver.unresolved`).
"""
from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Iterable

from .models import RegulationDoc, anchor_for
from .textnorm import strip_accents

log = logging.getLogger("app.rag.links")

_KIND = r"(?:Quy\s+chế|Quy\s+định|Thông\s+tư|Nghị\s+định|Quyết\s+định|Hướng\s+dẫn|Luật|QĐ|TT|NĐ)"
_NUMBER = r"\d+(?:\s*/\s*[0-9A-Za-zĐđ][0-9A-Za-zĐđ\-–/]*[0-9A-Za-zĐđ])?"
_QUAL = (rf"(?P<qual>(?:của\s+)?(?:Quy\s+chế|Quy\s+định)(?:\s+[^.;:()\n]{{0,60}}?)?\s+(?:được\s+)?(?:ban\s+hành\s+)?"
         rf"kèm\s+theo\s+(?:Quyết\s+định|Thông\s+tư)(?:\s+số)?\s*{_NUMBER}"
         rf"|(?:của\s+)?{_KIND}(?:\s+số)?\s*(?::\s*)?(?:này|{_NUMBER}))")

ARTICLE_REF_RE = re.compile(
    r"(?P<full>(?:(?:điểm)\s+(?P<point>[a-zđ])\s*,?\s+)?(?:(?:khoản)\s+(?P<clause>\d{1,2})\s*,?\s+)?"
    r"(?:Điều)\s+(?P<article>\d{1,3}[a-zđ]?|này)\b(?:\s+" + _QUAL + r")?)",
    re.IGNORECASE,
)
CLAUSE_ONLY_RE = re.compile(
    r"(?P<full>(?:(?:điểm)\s+(?P<point>[a-zđ])\s*,?\s+)?(?:khoản)\s+(?P<clause>\d{1,2})\b)(?!\s*,?\s*(?:khoản\s+\d+\s*,?\s*)*Điều)",
    re.IGNORECASE,
)
DOC_REF_RE = re.compile(
    r"(?P<full>(?P<kind>Thông\s+tư|Nghị\s+định|Quyết\s+định|QĐ)(?:\s+số)?\s*(?::\s*)?(?P<num>" + _NUMBER + r"))",
    re.IGNORECASE,
)
_EXTERNAL_AFTER_RE = re.compile(
    r"^\s+(?:của\s+)?(?:Luật|Bộ\s+luật|Hiến\s+pháp|Nghị\s+định|Thông\s+tư|Quyết\s+định|Quy\s+chế|Quy\s+định)"
    r"(?!\s+(?:số\s+)?(?:này|\d))", re.IGNORECASE)


def _norm_decision(s: str) -> str:
    s = strip_accents(s or "").lower()
    return re.sub(r"[\s.]", "", s).replace("–", "-")


@dataclass
class Ref:
    start: int
    end: int
    text: str
    kind: str  # "article" | "clause" | "doc"
    target_doc: str | None
    anchor: str | None
    resolved: bool
    edge: str = "references"  # references | amends | guides
    reason: str | None = None

    def wikilink(self) -> str | None:
        if not self.resolved or not self.target_doc:
            return None
        target = self.target_doc + (f"#^{self.anchor}" if self.anchor else "")
        return f"[[{target}|{self.text}]]"

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["wikilink"] = self.wikilink()
        return d


@dataclass
class Resolver:
    """Maps decision numbers -> doc_id and knows which anchors exist in each document."""

    docs: list[RegulationDoc]
    articles: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    unresolved: list[dict[str, str]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.by_decision: dict[str, str] = {}
        self.by_number: dict[str, list[str]] = {}
        self.anchors: dict[str, set[str]] = {}
        self.article_parts: dict[str, dict[str, list[int]]] = {}
        for d in self.docs:
            if d.decision_no:
                key = _norm_decision(d.decision_no)
                self.by_decision[key] = d.doc_id
                num = re.match(r"\d+", key)
                if num:
                    self.by_number.setdefault(num.group().lstrip("0") or "0", []).append(d.doc_id)
        for doc_id, arts in self.articles.items():
            s: set[str] = set()
            parts: dict[str, list[int]] = {}
            for a in arts:
                art, part = str(a["article"]), int(a.get("part", 0) or 0)
                parts.setdefault(art.lower(), []).append(part)
                s.add(anchor_for(art, part=part))
                for c in a.get("clauses", []):
                    if c.get("clause"):
                        s.add(anchor_for(art, c["clause"], part=part))
                    for p in c.get("points", []):
                        s.add(anchor_for(art, c.get("clause") or None, p["point"], part))
            self.anchors[doc_id] = s
            self.article_parts[doc_id] = parts

    def doc_for_number(self, raw: str) -> str | None:
        key = _norm_decision(raw)
        if key in self.by_decision:
            return self.by_decision[key]
        for k, v in self.by_decision.items():  # tolerate missing/extra suffix parts
            if "/" in key and (k.startswith(key) or key.startswith(k)):
                return v
        num = re.match(r"\d+", key)
        if num and "/" not in key:
            cands = self.by_number.get(num.group().lstrip("0") or "0", [])
            if len(cands) == 1:
                return cands[0]
        return None

    def best_anchor(self, doc_id: str, article: str, clause: str | None, point: str | None,
                    prefer_part: int = 0) -> tuple[str | None, bool]:
        """Return (anchor, exists). Falls back to the article / doc if the exact anchor is unknown."""
        parts = self.article_parts.get(doc_id, {}).get(article.lower())
        if not parts:
            return anchor_for(article, clause, point), doc_id not in self.anchors
        part = prefer_part if prefer_part in parts else max(parts)
        known = self.anchors.get(doc_id, set())
        for a in (anchor_for(article, clause, point, part), anchor_for(article, clause, None, part),
                  anchor_for(article, None, None, part)):
            if a in known:
                return a, True
        return anchor_for(article, None, None, part), True


@dataclass
class LinkContext:
    doc_id: str
    article: str | None = None
    part: int = 0


def _edge_kind(text: str, start: int) -> str:
    before = strip_accents(text[max(0, start - 60):start].lower())
    if re.search(r"sua doi|bo sung|thay the", before):
        return "amends"
    if re.search(r"huong dan|quy dinh chi tiet|thuc hien", before):
        return "guides"
    return "references"


def find_references(text: str, ctx: LinkContext, resolver: Resolver) -> list[Ref]:
    refs: list[Ref] = []
    taken: list[tuple[int, int]] = []

    def free(s: int, e: int) -> bool:
        return all(e <= a or s >= b for a, b in taken)

    for m in ARTICLE_REF_RE.finditer(text):
        s, e = m.span("full")
        art, clause, point, qual = m.group("article"), m.group("clause"), m.group("point"), m.group("qual")
        target, reason = ctx.doc_id, None
        if art.lower() == "này":
            art = ctx.article
            if art is None:
                continue
        if qual and not qual.lower().rstrip().endswith("này"):
            nums = list(re.finditer(_NUMBER, qual))
            num = nums[-1] if nums else None
            target = resolver.doc_for_number(num.group()) if num else None
            if target is None:
                reason = f"không tìm thấy văn bản '{qual.strip()}'"
        elif not qual and _EXTERNAL_AFTER_RE.match(text[e:e + 40]):
            target, reason = None, "dẫn chiếu văn bản ngoài (không có số hiệu)"
        refs.append(_mk(text, s, e, "article", target, art, clause, point, ctx, resolver, reason))
        taken.append((s, e))

    for m in CLAUSE_ONLY_RE.finditer(text):
        s, e = m.span("full")
        if not free(s, e) or ctx.article is None:
            continue
        refs.append(_mk(text, s, e, "clause", ctx.doc_id, ctx.article, m.group("clause"), m.group("point"),
                        ctx, resolver, None))
        taken.append((s, e))

    for m in DOC_REF_RE.finditer(text):
        s, e = m.span("full")
        if not free(s, e):
            continue
        num = m.group("num")
        if not re.search(r"\d", num):
            continue
        target = resolver.doc_for_number(num)
        ref = Ref(s, e, text[s:e], "doc", target, None, target is not None, _edge_kind(text, s),
                  None if target else f"không tìm thấy văn bản số {num}")
        if target is None:
            _log_unresolved(resolver, ctx, ref)
        refs.append(ref)
        taken.append((s, e))
    refs.sort(key=lambda r: r.start)
    return refs


def _mk(text: str, s: int, e: int, kind: str, target: str | None, art: str, clause: str | None,
        point: str | None, ctx: LinkContext, resolver: Resolver, reason: str | None) -> Ref:
    if target is None:
        ref = Ref(s, e, text[s:e], kind, None, None, False, _edge_kind(text, s), reason)
        _log_unresolved(resolver, ctx, ref)
        return ref
    anchor, exists = resolver.best_anchor(target, art, clause, point, ctx.part if target == ctx.doc_id else 0)
    if not exists:
        reason = f"{target} không có Điều {art}"
        ref = Ref(s, e, text[s:e], kind, target, None, True, _edge_kind(text, s), reason)
        _log_unresolved(resolver, ctx, ref)
        return ref
    return Ref(s, e, text[s:e], kind, target, anchor, True, _edge_kind(text, s))


def _log_unresolved(resolver: Resolver, ctx: LinkContext, ref: Ref) -> None:
    item = {"from_doc_id": ctx.doc_id, "article": ctx.article or "", "text": ref.text, "reason": ref.reason or ""}
    resolver.unresolved.append(item)
    log.info("Tham chiếu chưa phân giải được: %s", item)


def linkify(text: str, ctx: LinkContext, resolver: Resolver) -> tuple[str, list[Ref]]:
    refs = find_references(text, ctx, resolver)
    out, pos = [], 0
    for r in refs:
        out.append(text[pos:r.start])
        out.append(r.wikilink() or text[r.start:r.end])
        pos = r.end
    out.append(text[pos:])
    return "".join(out), refs


def resolve_ref(ref: str, resolver: Resolver, from_doc: str | None = None) -> dict[str, Any]:
    """Resolve a free-text reference such as 'Điều 10 QĐ 1268' or 'khoản 2 Điều 5 Quyết định số 789/QĐ-ĐHKTL'."""
    ctx = LinkContext(doc_id=from_doc or "", article=None)
    refs = [r for r in find_references(ref, ctx, resolver) if r.kind in ("article", "doc")]
    if not refs:
        return {"doc_id": None, "anchor": None, "resolved": False, "reason": "không nhận diện được tham chiếu"}
    r = refs[0]
    if r.kind == "doc" and len(refs) == 1:
        pass
    ok = bool(r.target_doc) and r.resolved
    return {"doc_id": r.target_doc or None, "anchor": r.anchor, "resolved": ok and bool(r.target_doc),
            "wikilink": r.wikilink() if r.target_doc else None, "text": r.text, "reason": r.reason}


@dataclass
class Backlink:
    from_doc_id: str
    from_anchor: str | None
    to_doc_id: str
    to_anchor: str | None
    context_snippet: str
    edge: str = "references"


def snippet(text: str, s: int, e: int, width: int = 70) -> str:
    a, b = max(0, s - width), min(len(text), e + width)
    return ("…" if a > 0 else "") + text[a:b].strip() + ("…" if b < len(text) else "")


def build_backlinks(items: Iterable[Backlink]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for b in items:
        out.setdefault(b.to_doc_id, []).append(asdict(b))
    return out
