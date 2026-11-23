from sqlalchemy import create_engine

from app.db import Base
from app.rag.storage import load_db_index, publish_index


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
