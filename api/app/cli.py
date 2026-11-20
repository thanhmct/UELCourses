"""CLI quản trị dữ liệu.

    python -m app.cli import-classes data/courses.json [--semester 2026-2027-1]
    python -m app.cli import-equivalents equivalents.json
    python -m app.cli import-uis-classes UIS-DanhSachThongTinLHPDangKy_2025-2026_HK01.xlsx
    python -m app.cli import-ta-plan Thong_tin_mon_hoc_TA_2026_2027.xlsx [--year 2026-2027]
    python -m app.cli import-portal-timetable uel_my_timetable.json
    python -m app.cli import-ctdt ctdt_programs.json
    python -m app.cli seed [--sample]   # file thật trong DATA_DIR/raw nếu có, nếu không: dữ liệu mẫu (idempotent)
    python -m app.cli clear-sample      # xóa dữ liệu mẫu khi đã có dữ liệu thật
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.db import SessionLocal, init_db
from app.services.ctdt_import import import_ctdt
from app.services.excel_import import import_ta_plan, import_uis_classes
from app.services.importer import (
    ImportFormatError,
    clear_sample_data,
    extract_rows,
    import_classes,
    import_equivalents,
    load_json_bytes,
)
from app.services.language import classify_languages, export_language_split
from app.services.legacy import purge_legacy_codes, purge_old_programs
from app.services.lineage import log_run
from app.services.outline_import import extract_outline_texts, import_outlines, import_regulation_catalog, link_outlines_to_modules
from app.services.outline_parse import parse_outlines
from app.services.portal_timetable import import_portal_timetable
from app.services.seed import run_seed


def _path(path: str) -> Path:
    p = Path(path)
    if not p.exists():
        sys.exit(f"Không tìm thấy file: {p}")
    return p


def _json(path: str):
    return load_json_bytes(_path(path).read_bytes())


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):  # console Windows: in được tiếng Việt
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Quản trị dữ liệu UELCourses")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("import-classes", help="Import JSON lớp học phần từ fetch_courses.py")
    p.add_argument("path")
    p.add_argument("--semester", help="Ép mã học kỳ, vd 2026-2027-1")
    p = sub.add_parser("import-equivalents", help="Import JSON học phần tương đương")
    p.add_argument("path")
    p = sub.add_parser("import-uis-classes", help="Import Excel UIS danh sách LHP")
    p.add_argument("path")
    p.add_argument("--semester")
    p = sub.add_parser("import-ta-plan", help="Import Excel kế hoạch môn học tiếng Anh")
    p.add_argument("path")
    p.add_argument("--year", help="Năm học, vd 2026-2027")
    p = sub.add_parser("import-portal-timetable", help="Import JSON TKB portal (DrawingSchedules_v2)")
    p.add_argument("path")
    p = sub.add_parser("import-ctdt", help="Import JSON chương trình đào tạo {StudyProgramID: [rows]}")
    p.add_argument("path")
    p = sub.add_parser("import-outlines", help="Nạp danh mục đề cương CTĐT 2025 (data/outlines_2025) + liên kết PDF")
    p.add_argument("--data-dir", default=str(Path(__file__).resolve().parents[2] / "data"), help="Thư mục data gốc")
    p.add_argument("--no-hash", action="store_true", help="Bỏ qua tính sha256 PDF (nhanh hơn)")
    p = sub.add_parser("extract-outline-texts", help="Trích văn bản từ PDF đề cương bằng pdftotext (PDF scan -> needs_ocr)")
    p.add_argument("--data-dir", default=str(Path(__file__).resolve().parents[2] / "data"))
    p.add_argument("--limit", type=int)
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--force", action="store_true", help="Trích lại cả những file đã có văn bản")
    p = sub.add_parser("purge-legacy-codes", help="Xóa học phần mã hệ cũ (4 ký tự có chữ số) khỏi DB — nên sao lưu trước")
    p.add_argument("--dry-run", action="store_true", help="Chỉ đếm, không xóa")
    p = sub.add_parser("purge-old-programs", help="Xóa chương trình đào tạo của khóa cũ (mặc định < K23) — nên sao lưu trước")
    p.add_argument("--before", type=int, help="Xóa khóa < số này (vd 23 = K19–K22)")
    p.add_argument("--dry-run", action="store_true")
    p = sub.add_parser("build-catalog-programs", help="Dựng CTĐT một khóa từ danh mục Đề cương CTĐT 2025 (khi cổng chưa có dữ liệu khóa đó)")
    p.add_argument("--cohort", default="K25")
    sub.add_parser("fill-english-names", help="Điền modules.name_en từ đề cương, catalog CTĐT và bảng api/seed/module_names_en.tsv")
    sub.add_parser("classify-languages", help="Phân loại môn tiếng Anh/tiếng Việt (mã E…/(E)) và ghép cặp Anh–Việt")
    p = sub.add_parser("export-language-split", help="Xuất danh sách môn tiếng Anh / tiếng Việt ra CSV (data/processed)")
    p.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "data" / "processed"))
    p = sub.add_parser("parse-outlines", help="Phân tích đề cương đã trích văn bản -> bảng có cấu trúc (outline_courses, outline_clos…)")
    p.add_argument("--data-dir", default=str(Path(__file__).resolve().parents[2] / "data"))
    p.add_argument("--limit", type=int)
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--ids", type=int, nargs="*", help="Chỉ phân tích các outline_documents.id này")
    p.add_argument("--force", action="store_true", help="Phân tích lại cả tài liệu đã xong bằng phiên bản hiện tại")
    sub.add_parser("link-outlines", help="Liên kết mỗi đề cương PDF với mã học phần (từ danh mục CTĐT 2025)")
    p = sub.add_parser("import-regulations", help="Nạp danh mục văn bản quy chế (regulations/catalog.json)")
    p.add_argument("path", nargs="?", default=str(Path(__file__).resolve().parents[2] / "regulations" / "catalog.json"))
    p = sub.add_parser("seed", help="Nạp dữ liệu ban đầu (file thật trong DATA_DIR/raw, nếu không có: dữ liệu mẫu)")
    p.add_argument("--sample", action="store_true", help="Chỉ nạp dữ liệu mẫu")
    sub.add_parser("clear-sample", help="Xóa dữ liệu mẫu")
    args = parser.parse_args(argv)

    init_db()
    try:
        with SessionLocal() as db:
            if args.cmd == "import-classes":
                res = import_classes(db, extract_rows(_json(args.path)), semester=args.semester).model_dump()
            elif args.cmd == "import-equivalents":
                res = import_equivalents(db, extract_rows(_json(args.path))).model_dump()
            elif args.cmd == "import-uis-classes":
                p = _path(args.path)
                res = import_uis_classes(db, p, semester=args.semester, filename=p.name).model_dump()
            elif args.cmd == "import-ta-plan":
                p = _path(args.path)
                res = import_ta_plan(db, p, academic_year=args.year, filename=p.name).model_dump()
            elif args.cmd == "import-portal-timetable":
                res = import_portal_timetable(db, _json(args.path)).model_dump()
            elif args.cmd == "import-ctdt":
                res = import_ctdt(db, _json(args.path)).model_dump()
            elif args.cmd == "import-outlines":
                res = import_outlines(db, _path(args.data_dir), hash_pdfs=not args.no_hash)
            elif args.cmd == "extract-outline-texts":
                res = extract_outline_texts(db, _path(args.data_dir), limit=args.limit, workers=args.workers, force=args.force)
            elif args.cmd == "purge-legacy-codes":
                res = purge_legacy_codes(db, dry_run=args.dry_run)
            elif args.cmd == "purge-old-programs":
                res = purge_old_programs(db, before=args.before, dry_run=args.dry_run)
            elif args.cmd == "build-catalog-programs":
                from app.services.catalog_programs import build_catalog_programs
                res = build_catalog_programs(db, cohort=args.cohort)
                classify_languages(db)  # môn mới tạo từ catalog cần phân loại ngôn ngữ
                log_run(db, "catalog_programs", None, res)
            elif args.cmd == "fill-english-names":
                from app.services.english_names import fill_english_names
                res = fill_english_names(db)
            elif args.cmd == "classify-languages":
                res = classify_languages(db)
            elif args.cmd == "export-language-split":
                res = export_language_split(db, Path(args.out))
            elif args.cmd == "parse-outlines":
                res = parse_outlines(db, _path(args.data_dir), limit=args.limit, workers=args.workers, only_ids=args.ids, force=args.force)
            elif args.cmd == "link-outlines":
                res = link_outlines_to_modules(db)
            elif args.cmd == "import-regulations":
                res = import_regulation_catalog(db, _path(args.path))
            elif args.cmd == "seed":
                res = run_seed(db, sample_only=args.sample)
            else:
                res = clear_sample_data(db)
            if args.cmd.startswith("import-") or args.cmd in ("seed", "parse-outlines"):
                classify_languages(db)  # luôn giữ cột language_track đồng bộ sau khi nạp dữ liệu
            # Nhật ký nguồn dữ liệu (không ghi cho dữ liệu cá nhân như TKB portal).
            if args.cmd.startswith("import-") and args.cmd != "import-portal-timetable" and isinstance(res, dict):
                log_run(db, args.cmd[len("import-"):], Path(args.path) if getattr(args, "path", None) else None, res)
    except ImportFormatError as e:
        sys.exit(f"Lỗi định dạng: {e}")
    print(json.dumps(res, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
