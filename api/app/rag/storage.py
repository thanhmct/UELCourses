"""Publish and retrieve a versioned regulation index from the application database."""

from sqlalchemy import delete, or_, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.models import RegulationChunk, RegulationDocument, RegulationIndexState

from .index import RagIndex
from .models import Chunk, RegulationDoc, parse_date
from .textnorm import collapse_ws, strip_accents, syllables


def publish_index(engine: Engine, index: RagIndex) -> None:
    """Atomically replace the snapshot. The operator backs up before calling this."""
    with Session(engine) as db, db.begin():
        if engine.dialect.name == "postgresql":
            db.execute(text("LOCK TABLE regulation_index_state IN EXCLUSIVE MODE"))
        state = db.get(RegulationIndexState, 1)
        if state and state.version == index.version:
            return
        db.execute(delete(RegulationChunk))
        db.execute(delete(RegulationDocument))
        docs = []
        for doc in index.docs:
            data = doc.to_dict()
            dates = {key: parse_date(data[key]) for key in ("issued_date", "effective_from", "effective_to")}
            columns = {key: value for key, value in data.items()
                       if key in RegulationDocument.__table__.columns and key not in (*dates, "verified")}
            docs.append(RegulationDocument(id=doc.doc_id, **columns, **dates, verified=doc.verified is True,
                                           rag_metadata=data, rag_articles=index.articles.get(doc.doc_id)))
        db.add_all(docs)
        db.flush()
        for chunk in index.chunks:
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
