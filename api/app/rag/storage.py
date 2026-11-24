"""Publish and retrieve a versioned regulation index from the application database."""

from collections import defaultdict

from sqlalchemy import delete, or_, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.models import RegulationChunk, RegulationDocument, RegulationIndexState

from .index import RagIndex
from .models import Chunk, RegulationDoc, parse_date
from .textnorm import collapse_ws, strip_accents, syllables


def publish_index(engine: Engine, index: RagIndex, *, doc_ids: set[str] | None = None,
                  expected_version: str | None = None) -> None:
    """Publish a complete snapshot, touching only selected documents when requested."""
    with Session(engine) as db, db.begin():
        if engine.dialect.name == "postgresql":
            db.execute(text("LOCK TABLE regulation_index_state IN EXCLUSIVE MODE"))
        state = db.get(RegulationIndexState, 1)
        if doc_ids is not None and (state is None or state.version != expected_version):
            raise ValueError("Chỉ mục hiện có đã thay đổi. Hãy dựng lại bản cập nhật trước khi nạp.")
        if state and state.version == index.version:
            return
        chunks_to_delete = delete(RegulationChunk)
        docs_to_delete = delete(RegulationDocument)
        if doc_ids is not None:
            chunks_to_delete = chunks_to_delete.where(RegulationChunk.doc_id.in_(doc_ids))
            docs_to_delete = docs_to_delete.where(RegulationDocument.id.in_(doc_ids))
        db.execute(chunks_to_delete)
        db.execute(docs_to_delete)
        docs = []
        for doc in index.docs:
            if doc_ids is not None and doc.doc_id not in doc_ids:
                continue
            data = doc.to_dict()
            dates = {key: parse_date(data[key]) for key in ("issued_date", "effective_from", "effective_to")}
            columns = {key: value for key, value in data.items()
                       if key in RegulationDocument.__table__.columns and key not in (*dates, "verified")}
            docs.append(RegulationDocument(id=doc.doc_id, **columns, **dates, verified=doc.verified is True,
                                           rag_metadata=data, rag_articles=index.articles.get(doc.doc_id)))
        db.add_all(docs)
        db.flush()
        for chunk in index.chunks:
            if doc_ids is not None and chunk.doc_id not in doc_ids:
                continue
            data = chunk.to_dict()
            data.pop("text")
            storage_anchor = chunk.anchor() or chunk.chunk_id
            if chunk.window_part > 1 or chunk.chunk_type == "appendix":
                storage_anchor = chunk.chunk_id
            db.add(RegulationChunk(doc_id=chunk.doc_id, article=chunk.article, clause=chunk.clause,
                                   point=chunk.point, chapter=chunk.chapter, heading=chunk.heading, page=chunk.page,
                                   anchor=storage_anchor, text=chunk.text,
                                   search_text=strip_accents(collapse_ws(chunk.index_text())).lower(),
                                   rag_metadata=data))
        if state:
            state.version, state.stats = index.version, index.stats
        else:
            db.add(RegulationIndexState(id=1, version=index.version, stats=index.stats))


def publish_documents(engine: Engine, staged: RagIndex, doc_ids: set[str]) -> None:
    """Merge selected documents against the current snapshot without replacing other rows."""
    current = load_db_index(engine)
    if current is None:
        raise ValueError("Cần nạp chỉ mục đầy đủ lần đầu trước khi cập nhật từng văn bản.")
    available = {chunk.doc_id for chunk in staged.chunks} & staged.docs_by_id.keys()
    if not doc_ids or doc_ids - available:
        raise ValueError(f"Không thể nạp văn bản thiếu đoạn hợp lệ: {', '.join(sorted(doc_ids - available))}")
    updated = {doc.doc_id: doc for doc in staged.docs if doc.doc_id in doc_ids}
    docs = [updated.get(doc.doc_id, doc) for doc in current.docs]
    docs.extend(doc for doc_id, doc in updated.items() if doc_id not in current.docs_by_id)
    by_doc: dict[str, list[Chunk]] = defaultdict(list)
    for chunk in current.chunks:
        if chunk.doc_id not in doc_ids:
            by_doc[chunk.doc_id].append(chunk)
    for chunk in staged.chunks:
        if chunk.doc_id in doc_ids:
            by_doc[chunk.doc_id].append(chunk)
    chunks = [chunk for doc in docs for chunk in by_doc[doc.doc_id]]
    articles = {key: value for key, value in current.articles.items() if key not in doc_ids}
    articles.update({key: value for key, value in staged.articles.items() if key in doc_ids})

    stats = dict(current.stats)
    for key in ("per_doc", "warnings", "errors", "needs_ocr"):
        stats[key] = [row for row in current.stats.get(key, []) if row["doc_id"] not in doc_ids]
        stats[key].extend(row for row in staged.stats.get(key, []) if row["doc_id"] in doc_ids)
    order = {doc.doc_id: i for i, doc in enumerate(docs)}
    stats["per_doc"].sort(key=lambda row: order[row["doc_id"]])
    for key in ("articles", "clauses", "points"):
        stats[f"n_{key}"] = sum(row[key] for row in stats["per_doc"])
    stats["n_docs"] = len(docs)
    stats["n_chunks"] = len(chunks)
    stats["no_file"] = [doc.doc_id for doc in docs if not doc.file]
    merged = RagIndex(docs, chunks, articles, stats=stats)
    publish_index(engine, merged, doc_ids=doc_ids, expected_version=current.version)


def load_db_index(engine: Engine, cached: RagIndex | None = None) -> RagIndex | None:
    with engine.connect() as conn:
        if engine.dialect.name == "postgresql":
            conn = conn.execution_options(isolation_level="REPEATABLE READ")
        with Session(conn) as db:
            state = db.get(RegulationIndexState, 1)
            if state is None:
                return None
            version = state.version
            if cached and cached.version == version:
                return cached
            docs = db.scalars(select(RegulationDocument).order_by(RegulationDocument.id)).all()
            rows = db.scalars(select(RegulationChunk).order_by(RegulationChunk.id)).all()
            # Preserve the source order, including tie breaks in BM25.
            source_order = {row["doc_id"]: i for i, row in enumerate(state.stats.get("per_doc", []))}
            docs.sort(key=lambda doc: source_order.get(doc.id, len(source_order)))
            rows.sort(key=lambda row: source_order.get(row.doc_id, len(source_order)))
            index = RagIndex(
                [RegulationDoc.from_dict(doc.rag_metadata) for doc in docs],
                [Chunk.from_dict(row.rag_metadata | {"text": row.text}) for row in rows],
                {doc.id: doc.rag_articles for doc in docs if doc.rag_articles is not None},
                stats=state.stats,
            )
    index.version = version

    def candidates(query: str, ids: set[str] | None) -> set[str] | None:
        # Any matching accent-folded BM25 feature contains a matching syllable.
        # Keep all SQL candidates so the existing scorer retains its ranking.
        terms = set(syllables(strip_accents(query)))
        if not terms:
            return set()
        stmt = select(RegulationChunk.rag_metadata, RegulationIndexState.version).join(
            RegulationIndexState, RegulationIndexState.id == 1
        ).where(or_(*(RegulationChunk.search_text.contains(term, autoescape=True) for term in sorted(terms))))
        if ids is not None:
            stmt = stmt.where(RegulationChunk.doc_id.in_(ids))
        # A concurrent publication can land between snapshot loading and search.
        # Score the already-loaded snapshot if its SQL rows have been replaced.
        with Session(engine) as db:
            rows = db.execute(stmt.where(RegulationIndexState.version == version)).all()
            if not rows and db.scalar(select(RegulationIndexState.version)) != version:
                return None
        return {metadata["chunk_id"] for metadata, _version in rows}

    index.candidates = candidates
    return index
