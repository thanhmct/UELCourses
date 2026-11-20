"""RegulationService: lazy-loaded index + status refresh, used by the router and scripts."""
from __future__ import annotations

import os
import threading
from datetime import date
from pathlib import Path
from typing import Any, Callable

from . import answer as answer_mod
from . import compare as compare_mod
from .graph import build_graph
from .index import RagIndex, embeddings_requested
from .links import Resolver, resolve_ref
from .vault import Vault, build_vault
from .pipeline import build_index, index_dir, regulations_dir
from .providers import LLMProvider
from .textnorm import strip_accents
from .validity import DEFAULT_EXPIRING_DAYS, cohort_applies, expiring, refresh_statuses, validity_warnings


class RagUnavailable(Exception):
    """Raised when no index exists and it cannot be built automatically."""


class RegulationService:
    def __init__(self, index: RagIndex, today_fn: Callable[[], date] = date.today,
                 provider: LLMProvider | None = None) -> None:
        self.index = index
        self.today_fn = today_fn
        self.provider = provider

    def _refresh(self) -> date:
        today = self.today_fn()
        refresh_statuses(self.index.docs, today)
        for c in self.index.chunks:
            d = self.index.docs_by_id.get(c.doc_id)
            if d:
                c.status = d.status
        return today

    def list_docs(self, cohort: str | None = None, status: str | None = None, q: str | None = None) -> list[dict[str, Any]]:
        self._refresh()
        out = []
        qn = strip_accents(q.lower()) if q else None
        for d in self.index.docs:
            if cohort and not cohort_applies(d, cohort, self.index.docs_by_id):
                continue
            if status and d.status != status:
                continue
            if qn and qn not in strip_accents(f"{d.title} {d.decision_no} {d.doc_id}".lower()):
                continue
            out.append(d.to_api())
        return out

    def get_doc(self, doc_id: str) -> dict[str, Any] | None:
        today = self._refresh()
        d = self.index.docs_by_id.get(doc_id)
        if d is None:
            return None
        data = d.to_api()
        data["articles"] = self.index.articles.get(doc_id, [])
        data["warnings"] = validity_warnings(d, today, docs_by_id=self.index.docs_by_id)
        return data

    def ask(self, question: str, cohort: str | None = None, mode: str | None = None, top_k: int = 3) -> dict[str, Any]:
        today = self._refresh()
        return answer_mod.ask(self.index, question, cohort, mode, today, self.provider, top_k)

    def compare(self, topic: str, cohorts: list[str]) -> dict[str, Any]:
        today = self._refresh()
        return compare_mod.compare(self.index, topic, cohorts, today)

    def expiring(self, within_days: int = DEFAULT_EXPIRING_DAYS) -> list[dict[str, Any]]:
        today = self._refresh()
        return [d.to_api() for d in expiring(self.index.docs, today, within_days)]

    # ------------------------------------------------------ vault / graph --
    _vault: Vault | None = None

    @property
    def vault(self) -> Vault:
        if self._vault is None:
            self._refresh()
            self._vault = build_vault(self.index.docs, self.index.articles)
        return self._vault

    def markdown(self, doc_id: str) -> dict[str, Any] | None:
        vd = self.vault.docs.get(doc_id)
        if vd is None:
            return None
        return {"doc_id": doc_id, "frontmatter": vd.frontmatter, "markdown": vd.markdown}

    def backlinks(self, doc_id: str) -> list[dict[str, Any]] | None:
        if doc_id not in self.index.docs_by_id:
            return None
        return [b for b in self.vault.backlinks.get(doc_id, []) if b["from_doc_id"] != doc_id]

    def graph(self, cohort: str | None = None, include_articles: bool = False) -> dict[str, Any]:
        self._refresh()
        return build_graph(self.index.docs, self.vault.backlinks, cohort, include_articles, self.index.articles)

    def resolve(self, ref: str, from_doc: str | None = None) -> dict[str, Any]:
        return resolve_ref(ref, Resolver(self.index.docs, self.index.articles), from_doc)


_service: RegulationService | None = None
_lock = threading.Lock()


def _auto_build_enabled() -> bool:
    return os.getenv("RAG_AUTO_BUILD", "1").lower() not in ("0", "false", "no", "off")


def _index_is_stale(idx: Path, reg: Path) -> bool:
    cat = reg / "catalog.json"
    man = idx / "manifest.json"
    return cat.exists() and man.exists() and cat.stat().st_mtime > man.stat().st_mtime


def load_or_build() -> RagIndex:
    idx, reg = index_dir(), regulations_dir()
    if RagIndex.exists(idx) and not (_auto_build_enabled() and _index_is_stale(idx, reg)):
        return RagIndex.load(idx)
    if _auto_build_enabled() and (reg / "catalog.json").exists():
        index, _ = build_index(reg, with_embeddings=embeddings_requested())
        try:
            index.save(idx)
        except OSError:
            pass  # read-only filesystem: keep in memory only
        return index
    if RagIndex.exists(idx):
        return RagIndex.load(idx)
    raise RagUnavailable(
        "Chưa có chỉ mục quy chế. Hãy chạy `python scripts/ingest_regulations.py` trong thư mục api/ "
        f"(đọc {reg / 'catalog.json'}, ghi vào {idx})."
    )


def get_service() -> RegulationService:
    global _service
    if _service is None:
        with _lock:
            if _service is None:
                _service = RegulationService(load_or_build())
    return _service


def set_service(service: RegulationService | None) -> None:
    """Override (tests) or reset (None -> reload lazily on next request)."""
    global _service
    _service = service
