"""Build the regulations RAG index (+ Obsidian vault) from catalog.json + raw files.

Usage (from api/):
  python scripts/ingest_regulations.py                       # REGULATIONS_DIR -> RAG_INDEX_DIR (+ vault)
  python scripts/ingest_regulations.py --fixture             # sample fixture (tests/rag/fixtures) -> index
  python scripts/ingest_regulations.py --regulations-dir ../regulations --out data/rag_index --embeddings
  python scripts/ingest_regulations.py --no-vault --json report.json

Environment: REGULATIONS_DIR (default <repo>/regulations), RAG_INDEX_DIR (default api/data/rag_index),
VAULT_DIR (default REGULATIONS_DIR/vault), RAG_EMBEDDINGS=1 (same as --embeddings).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.rag.index import embeddings_requested  # noqa: E402
from app.rag.pipeline import build_index, index_dir, regulations_dir  # noqa: E402
from app.rag.vault import build_vault  # noqa: E402

FIXTURE_DIR = API_DIR / "tests" / "rag" / "fixtures" / "regulations"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Build chỉ mục RAG quy chế")
    ap.add_argument("--regulations-dir", type=Path, default=None)
    ap.add_argument("--fixture", action="store_true", help="dùng dữ liệu MẪU trong tests/rag/fixtures")
    ap.add_argument("--publish-db", action="store_true", help="nạp vào DB sau khi đã sao lưu")
    ap.add_argument("--out", type=Path, default=None, help="thư mục chỉ mục (mặc định RAG_INDEX_DIR)")
    ap.add_argument("--vault-dir", type=Path, default=None, help="thư mục vault Markdown (mặc định REGULATIONS_DIR/vault)")
    ap.add_argument("--no-vault", action="store_true")
    ap.add_argument("--embeddings", action="store_true", help="bật embeddings fastembed (tùy chọn)")
    ap.add_argument("--today", type=str, default=None)
    ap.add_argument("--json", type=Path, default=None, help="ghi báo cáo JSON")
    args = ap.parse_args(argv)
    if args.publish_db and (args.fixture or args.embeddings or args.out or embeddings_requested()):
        ap.error("--publish-db dùng dữ liệu thật và truy hồi SQL/BM25, không ghi cache file")
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass

    reg = FIXTURE_DIR if args.fixture else (args.regulations_dir or regulations_dir())
    out = args.out or index_dir()
    today = date.fromisoformat(args.today) if args.today else date.today()
    if not (reg / "catalog.json").exists():
        print(f"LỖI: không thấy {reg / 'catalog.json'}", file=sys.stderr)
        return 2
    index, rep = build_index(reg, today=today, with_embeddings=args.embeddings or embeddings_requested())
    if args.publish_db:
        from app.db import engine
        from app.rag.storage import publish_index

        if engine.dialect.name != "postgresql":
            ap.error("--publish-db yêu cầu PostgreSQL")
        if not index.chunks:
            ap.error("Không có đoạn văn bản hợp lệ để nạp vào DB")
        publish_index(engine, index)
    else:
        index.save(out)

    vault_info = None
    if not args.no_vault and not args.publish_db:
        vault = build_vault(index.docs, index.articles, index.chunks)
        vdir = args.vault_dir or (Path(os.environ["VAULT_DIR"]) if os.getenv("VAULT_DIR") else reg / "vault")
        try:
            vault.write(vdir)
            vault_info = {"dir": str(vdir), "files": len(vault.docs),
                          "links": sum(len(v) for v in vault.backlinks.values()),
                          "unresolved_links": len(vault.unresolved)}
        except OSError as exc:
            vault_info = {"error": f"Không ghi được vault vào {vdir}: {exc}"}

    indexed = sum(d.indexed for d in index.docs)
    print(f"Nguồn: {reg}")
    print(f"Chỉ mục: {'PostgreSQL' if args.publish_db else out}")
    print(f"Văn bản trong catalog: {rep.n_docs} | đã lập chỉ mục: {indexed}")
    print(f"Điều: {rep.n_articles} | Khoản: {rep.n_clauses} | Điểm: {rep.n_points} | Chunk: {rep.n_chunks}")
    print(f"Embeddings: {rep.embeddings or 'không (chỉ BM25)'}")
    for d in rep.per_doc:
        counts = f"{d['chunks']} đoạn"
        if d["articles"]:
            counts += f", {d['articles']} Điều, {d['clauses']} Khoản, {d['points']} Điểm"
        flag = "OK " if d["chunks"] else "-- "
        print(f"  {flag}{d['doc_id']}: {counts}")
    if rep.no_file:
        print(f"Chưa có file (file=null): {len(rep.no_file)} -> {', '.join(rep.no_file)}")
    if rep.needs_ocr:
        print(f"Cần OCR: {len(rep.needs_ocr)}")
        for x in rep.needs_ocr:
            print(f"  - {x['doc_id']}: {Path(x['file']).name} ({x.get('reason')})")
    if rep.errors:
        print(f"Lỗi đọc file: {len(rep.errors)}")
        for x in rep.errors:
            print(f"  - {x['doc_id']}: {x['error']}")
    if rep.uncataloged_files:
        print(f"File chưa có trong catalog: {', '.join(rep.uncataloged_files)}")
    if vault_info:
        print(f"Vault: {vault_info}")
    if not args.publish_db:
        (out / "needs_ocr.json").write_text(json.dumps(rep.needs_ocr, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.json:
        data = rep.to_dict() | {"vault": vault_info, "index_dir": str(out)}
        args.json.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
