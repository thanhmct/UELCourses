"""Retrieval index: pure-Python BM25 over Vietnamese syllables + bigrams (accent-insensitive),
optionally fused (RRF) with dense embeddings from `fastembed`.

Persistence (``RAG_INDEX_DIR``, default ``api/data/rag_index/``):
  manifest.json  - version, build time, stats, embedding model (if any)
  docs.json      - RegulationDoc list
  chunks.json    - Chunk list (verbatim text + metadata)
  articles.json  - structured articles per doc (for /regulations/{doc_id})
  embeddings.npy - optional dense vectors (row i = chunk i)
BM25 statistics are rebuilt from chunks.json on load (fast, deterministic).
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from functools import cached_property
from typing import Any, Callable, Iterable

from .models import Chunk, RegulationDoc
from .textnorm import content_terms, features
from .validity import cohort_matches

INDEX_VERSION = 1
DEFAULT_EMBED_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
_APPENDIX = re.compile(r"(?<=\./\.)\s*(?:\d+\s+)?Phụ lục\b", re.IGNORECASE)


class BM25:
    def __init__(self, texts: list[str], k1: float = 1.2, b: float = 0.5) -> None:
        self.k1, self.b = k1, b
        self.docs: list[Counter] = [Counter(features(t)) for t in texts]
        self.lens = [sum(c.values()) for c in self.docs]
        self.n = len(texts)
        self.avgdl = (sum(self.lens) / self.n) if self.n else 0.0
        df: Counter = Counter()
        for c in self.docs:
            df.update(c.keys())
        self.idf = {t: math.log(1 + (self.n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.postings: dict[str, list[int]] = {}
        for i, c in enumerate(self.docs):
            for t in c:
                self.postings.setdefault(t, []).append(i)
        # unigram (accent-stripped) document frequencies for coverage computation
        self.term_sets = [set(content_terms(t)) for t in texts]
        udf: Counter = Counter()
        for s in self.term_sets:
            udf.update(s)
        self.udf = udf

    def term_idf(self, term: str) -> float:
        f = self.udf.get(term, 0)
        return math.log(1 + (self.n - f + 0.5) / (f + 0.5))

    def scores(self, query: str, allowed: set[int] | None = None) -> dict[int, float]:
        q = Counter(features(query, query=True))
        out: dict[int, float] = {}
        for term, qtf in q.items():
            idf = self.idf.get(term)
            if idf is None:
                continue
            for i in self.postings.get(term, ()):
                if allowed is not None and i not in allowed:
                    continue
                tf = self.docs[i][term]
                denom = tf + self.k1 * (1 - self.b + self.b * self.lens[i] / (self.avgdl or 1))
                out[i] = out.get(i, 0.0) + idf * tf * (self.k1 + 1) / denom * (1 + 0.2 * (qtf - 1))
        return out

    def coverage(self, query: str, i: int) -> float:
        """IDF-weighted share of the query's content words present in chunk i (0..1)."""
        terms = set(content_terms(query))
        if not terms:
            return 0.0
        total = sum(self.term_idf(t) for t in terms)
        hit = sum(self.term_idf(t) for t in terms if t in self.term_sets[i])
        return hit / total if total else 0.0


class Embedder:
    """Thin wrapper around fastembed (optional dependency)."""

    def __init__(self, model_name: str | None = None) -> None:
        from fastembed import TextEmbedding  # noqa: WPS433 - optional import

        self.model_name = model_name or os.getenv("RAG_EMBED_MODEL", DEFAULT_EMBED_MODEL)
        self._model = TextEmbedding(model_name=self.model_name)

    def embed(self, texts: list[str]):
        import numpy as np

        vecs = np.array(list(self._model.embed(texts)), dtype="float32")
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        norms[norms == 0] = 1
        return vecs / norms


def embeddings_available() -> bool:
    try:
        import fastembed  # noqa: F401
        import numpy  # noqa: F401
    except Exception:  # noqa: BLE001
        return False
    return True


def embeddings_requested() -> bool:
    return os.getenv("RAG_EMBEDDINGS", "0").lower() in ("1", "true", "yes", "on")


@dataclass
class Hit:
    chunk: Chunk
    score: float  # BM25 score (used for thresholds)
    coverage: float  # query-term coverage (0..1)
    rank_score: float  # fused score used for ordering
    dense: float | None = None


class RagIndex:
    def __init__(self, docs: list[RegulationDoc], chunks: list[Chunk],
                 articles: dict[str, list[dict[str, Any]]] | None = None,
                 embedder: Embedder | None = None, vectors=None, stats: dict[str, Any] | None = None) -> None:
        self.docs = docs
        self.docs_by_id = {d.doc_id: d for d in docs}
        self.chunks = chunks
        self.chunk_by_id = {c.chunk_id: c for c in chunks}
        self.articles = articles or {}
        self.bm25 = BM25([c.index_text() for c in chunks])  # chunk-level stats (idf, coverage)
        # Scoring corpus: every chunk + an extra "lead" pseudo-document (article title + clause lead-in)
        # for clauses that enumerate points, so a short matching lead-in is not drowned by long points.
        texts, self._owner = [], []
        for i, c in enumerate(chunks):
            texts.append(c.index_text())
            self._owner.append(i)
            if c.points:
                texts.append(f"{c.article_title}\n{c.text.split(chr(10), 1)[0]}")
                self._owner.append(i)
            elif c.source_type == "regulation" and (appendix := _APPENDIX.search(c.text)):
                # Keep annexes searchable while scoring the actual closing clause on its own as well.
                texts.append(f"{c.article_title}\n{c.text[:appendix.start()]}")
                self._owner.append(i)
        self._scorer = BM25(texts)
        self.embedder = embedder
        self.vectors = vectors
        self.stats = stats or {}
        self.candidates: Callable[[str, set[str] | None], set[str] | None] | None = None

    @cached_property
    def version(self) -> str:
        data = ([d.to_dict() for d in self.docs], [c.to_dict() for c in self.chunks], self.articles)
        return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

    def evidence_group(self, doc_id: str) -> str:
        doc = self.docs_by_id[doc_id]
        if doc.source_type == "handbook":
            return "handbook"
        return "ocr" if doc.ocr_transcript else "regulation"

    @cached_property
    def evidence_indexes(self) -> dict[str, RagIndex]:
        """Compute relevance against comparable sources so adding OCR or summaries does not shift BM25 statistics."""
        rows: dict[str, list[int]] = {}
        for i, chunk in enumerate(self.chunks):
            rows.setdefault(self.evidence_group(chunk.doc_id), []).append(i)
        if len(rows) == 1:
            return dict.fromkeys(rows, self)
        indexes = {}
        for group, positions in rows.items():
            chunks = [self.chunks[i] for i in positions]
            ids = {chunk.doc_id for chunk in chunks}
            docs = [doc for doc in self.docs if doc.doc_id in ids]
            vectors = None if self.vectors is None else self.vectors[positions]
            subindex = RagIndex(docs, chunks, embedder=self.embedder, vectors=vectors)
            subindex.candidates = self.candidates
            indexes[group] = subindex
        return indexes

    def comparable_relevance(self, query: str, hits: list[Hit]) -> dict[str, float]:
        """Use one corpus to compare the keyword support offered by candidate sources."""
        candidate_ids = {hit.chunk.chunk_id for hit in hits}
        allowed = {i for i, chunk in enumerate(self.chunks) if chunk.chunk_id in candidate_ids}
        if not allowed:
            return {}
        return {self.chunks[i].chunk_id: score * self.bm25.coverage(query, i) ** 2
                for i, score in self.bm25.scores(query, allowed).items()}

    # ------------------------------------------------------------ search --
    def search(self, query: str, top_k: int = 5, doc_ids: Iterable[str] | None = None, *,
               cohort: str | None = None) -> list[Hit]:
        allowed = None
        ids = set(doc_ids) if doc_ids is not None else None
        matches = self.candidates(query, ids) if self.candidates is not None else None
        if ids is not None or matches is not None or cohort is not None:
            allowed = {i for i, c in enumerate(self.chunks)
                       if (ids is None or c.doc_id in ids) and (matches is None or c.chunk_id in matches)
                       and (c.chunk_type != "appendix" or c.article or cohort_matches(c.applies_to_cohorts, cohort))}
            if not allowed:
                return []
        allowed_rows = None if allowed is None else {r for r, i in enumerate(self._owner) if i in allowed}
        bm: dict[int, float] = {}
        for row, s in self._scorer.scores(query, allowed_rows).items():
            i = self._owner[row]
            if s > bm.get(i, 0.0):
                bm[i] = s
        ranked = sorted(bm.items(), key=lambda kv: (-kv[1], kv[0]))
        dense_scores: dict[int, float] = {}
        if self.embedder is not None and self.vectors is not None and len(self.chunks):
            qv = self.embedder.embed([query])[0]
            sims = self.vectors @ qv
            cand = [i for i in range(len(self.chunks)) if allowed is None or i in allowed]
            cand.sort(key=lambda i: -float(sims[i]))
            dense_scores = {i: float(sims[i]) for i in cand[: max(50, top_k * 5)]}
        if dense_scores:
            fused: dict[int, float] = {}
            for r, (i, _) in enumerate(ranked[:200]):
                fused[i] = fused.get(i, 0.0) + 1 / (60 + r + 1)
            for r, i in enumerate(sorted(dense_scores, key=lambda i: -dense_scores[i])):
                fused[i] = fused.get(i, 0.0) + 1 / (60 + r + 1)
            order = sorted(fused, key=lambda i: (-fused[i], i))
            rank_score = fused
        else:
            order = [i for i, _ in ranked]
            rank_score = dict(ranked)
        hits = []
        for i in order[:top_k]:
            hits.append(Hit(chunk=self.chunks[i], score=bm.get(i, 0.0), coverage=self.bm25.coverage(query, i),
                            rank_score=rank_score[i], dense=dense_scores.get(i)))
        return hits

    # ------------------------------------------------------- persistence --
    def save(self, out_dir: str | Path) -> Path:
        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)
        manifest = {
            "version": INDEX_VERSION,
            "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "n_docs": len(self.docs),
            "n_chunks": len(self.chunks),
            "embedding_model": self.embedder.model_name if self.embedder and self.vectors is not None else None,
            "stats": self.stats,
        }
        _dump(out / "docs.json", [d.to_dict() for d in self.docs])
        _dump(out / "chunks.json", [c.to_dict() for c in self.chunks])
        _dump(out / "articles.json", self.articles)
        if self.vectors is not None:
            import numpy as np

            np.save(out / "embeddings.npy", self.vectors)
        elif (out / "embeddings.npy").exists():
            (out / "embeddings.npy").unlink()
        _dump(out / "manifest.json", manifest)
        return out

    @classmethod
    def load(cls, in_dir: str | Path) -> "RagIndex":
        d = Path(in_dir)
        manifest = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
        docs = [RegulationDoc.from_dict(x) for x in json.loads((d / "docs.json").read_text(encoding="utf-8"))]
        chunks = [Chunk.from_dict(x) for x in json.loads((d / "chunks.json").read_text(encoding="utf-8"))]
        articles = json.loads((d / "articles.json").read_text(encoding="utf-8")) if (d / "articles.json").exists() else {}
        embedder, vectors = None, None
        model = manifest.get("embedding_model")
        if model and (d / "embeddings.npy").exists() and embeddings_available() and embeddings_requested():
            import numpy as np

            vectors = np.load(d / "embeddings.npy")
            embedder = Embedder(model)
        return cls(docs, chunks, articles, embedder, vectors, manifest.get("stats"))

    @staticmethod
    def exists(in_dir: str | Path) -> bool:
        d = Path(in_dir)
        return (d / "manifest.json").exists() and (d / "chunks.json").exists()

    def add_embeddings(self, model_name: str | None = None) -> None:
        self.embedder = Embedder(model_name)
        self.vectors = self.embedder.embed([c.index_text() for c in self.chunks]) if self.chunks else None


def _dump(path: Path, obj: Any) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
