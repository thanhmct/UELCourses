from dataclasses import replace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db import Base
from app.models import RegulationChunk
from app.rag.index import RagIndex
from app.rag.storage import load_db_index, publish_documents, publish_index


def test_publish_and_reload_retains_rank_language_and_citations(index):
    engine = create_engine("sqlite://")
    try:
        Base.metadata.create_all(engine)
        assert load_db_index(engine) is None
        publish_index(engine, index)
        restored = load_db_index(engine)
        assert restored.version == index.version and restored.articles == index.articles
        assert [row.to_dict() for row in restored.chunks] == [row.to_dict() for row in index.chunks]
        publish_index(engine, index)
        assert load_db_index(engine, restored) is restored
        for query in ("hoc cai thien diem", "Điều kiện tốt nghiệp", "chung chi IELTS"):
            for docs in (None, ["QC-DT-2021-MAU"], ["invalid"]):
                expected = index.search(query, doc_ids=docs)
                assert restored.search(query, doc_ids=docs) == expected
    finally:
        engine.dispose()


def test_scoped_publish_preserves_other_rows(index):
    engine = create_engine("sqlite://")
    try:
        Base.metadata.create_all(engine)
        publish_index(engine, index)
        target = "QC-DT-2021-MAU"

        def untouched():
            with Session(engine) as db:
                return db.execute(select(RegulationChunk.id, RegulationChunk.doc_id, RegulationChunk.text)
                                  .where(RegulationChunk.doc_id != target).order_by(RegulationChunk.id)).all()

        before = untouched()
        assert before
        staged = RagIndex(index.docs, [replace(chunk, text=chunk.text + " Cập nhật thử.")
                                        for chunk in index.chunks], index.articles, stats=index.stats)
        publish_documents(engine, staged, {target})
        restored = load_db_index(engine)
        assert untouched() == before
        assert all(c.text.endswith(" Cập nhật thử.") for c in restored.chunks if c.doc_id == target)
        assert restored.stats["n_chunks"] == len(restored.chunks)

        publish_documents(engine, staged, {target})
        assert load_db_index(engine, restored) is restored
        with pytest.raises(ValueError, match="thiếu đoạn"):
            publish_documents(engine, staged, {"missing"})
        assert load_db_index(engine, restored) is restored
    finally:
        engine.dispose()
