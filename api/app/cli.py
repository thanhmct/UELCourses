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

from sqlalchemy import text

from app.db import SessionLocal, init_db
from app.services.ctdt_import import import_ctdt, rebuild_equivalent_relations
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
from app.services.outline_import import (
    extract_outline_texts,
    import_outlines,
    import_regulation_catalog,
    link_outlines_to_modules,
    ocr_outline_texts,
)
from app.services.outline_colab import import_colab_results
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
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Quản trị dữ liệu UELPATH")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("import-classes", help="Import JSON lớp học phần từ fetch_courses.py")
    p.add_argument("path")
    p.add_argument("--semester", help="Ép mã học kỳ, vd 2026-2027-1")
    p = sub.add_parser("import-dkhp-csv", help="ETL idempotent: CSV cào Tra cứu học phần dkhp (bỏ qua tệp đã nạp, không tạo bản ghi trùng)")
    p.add_argument("path")
    p.add_argument("--force", action="store_true", help="Nạp lại dù sha256 đã có (vẫn upsert, không trùng)")
    p.add_argument("--dry-run", action="store_true", help="Chỉ transform và báo cáo, không ghi DB")
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
    p = sub.add_parser("clone-cohort-programs", help="Tạo CTĐT tiếng Việt K23 còn thiếu từ K24")
    p.add_argument("--dry-run", action="store_true", help="Chỉ kiểm tra và xuất báo cáo CSV")
    p.add_argument("--data-dir", type=Path, help="Thư mục dữ liệu chứa outlines_master và processed")
    p.add_argument("--out", type=Path, help="Đường dẫn file CSV báo cáo")
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
    p = sub.add_parser("repair-equivalent-edges",
                       help="Dựng lại cạnh 'tương đương' của CTĐT từ program_modules.equivalent_raw (sửa cạnh rác 'T', 'TRONG', '3'…)")
    p.add_argument("--dry-run", action="store_true", help="Chỉ đếm, không ghi")
    p = sub.add_parser("purge-old-programs", help="Xóa chương trình đào tạo của khóa cũ (mặc định < K23) — nên sao lưu trước")
    p.add_argument("--before", type=int, help="Xóa khóa < số này (vd 23 = K19–K22)")
    p.add_argument("--dry-run", action="store_true")
    p = sub.add_parser("build-catalog-programs", help="Dựng CTĐT một khóa từ danh mục Đề cương CTĐT 2025 (khi cổng chưa có dữ liệu khóa đó)")
    p.add_argument("--cohort", default="K25")
    p = sub.add_parser("import-portal-equivalents", help="Nạp học phần tương đương từ JSON của GET /student/equivalentcourse (và sửa dòng mảnh vỡ cũ)")
    p.add_argument("path")
    p.add_argument("--no-repair", action="store_true", help="Không dọn các dòng equivalents bị hỏng trước khi nạp")
    p = sub.add_parser("backfill-lesson-dates", help="Nạp lại date_start/date_end của buổi học từ schedule_raw (sửa lịch bị lặp hằng tuần)")
    p.add_argument("--dry-run", action="store_true", help="Chỉ đếm, không ghi")
    sub.add_parser("fill-descriptions", help="Điền mô tả học phần song ngữ (modules.description VI / description_en EN) từ đề cương")
    sub.add_parser("fill-faculties", help="Điền khoa/bộ môn từ đề cương (áp dụng apply_outline_faculties)")
    p = sub.add_parser("audit-faculty", help="Kiểm tra độc lập khoa/bộ môn theo đề cương và tiền tố (không sửa DB, xuất CSV và tóm tắt)")
    p.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "data" / "processed" / "module_faculty_audit.csv"),
                   help="Đường dẫn file CSV báo cáo")
    p.add_argument("--rebuild-prefix-table", action="store_true",
                   help="Tạo lại bảng tiền tố -> khoa (api/seed/prefix_to_faculty.tsv) từ DB")
    p.add_argument("--conflicts-out", default=str(Path(__file__).resolve().parents[2] / "data" / "processed" / "module_faculty_prefix_conflicts.csv"),
                   help="Đường dẫn file CSV danh sách mâu thuẫn tiền tố")
    p = sub.add_parser("fix-module-faculty", help="Rà soát và sửa khoa/bộ môn theo đề cương và tiền tố (mượn từ counterpart, điền tiền tố chỗ trống; --dry-run chỉ xuất CSV)")
    p.add_argument("--dry-run", action="store_true", help="Chỉ kiểm tra và xuất báo cáo CSV, không sửa DB")
    p.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "data" / "processed" / "module_faculty_audit.csv"),
                   help="Đường dẫn file CSV báo cáo")
    p.add_argument("--rebuild-prefix-table", action="store_true",
                   help="Tạo lại bảng tiền tố -> khoa (api/seed/prefix_to_faculty.tsv) từ DB")
    p.add_argument("--conflicts-out", default=str(Path(__file__).resolve().parents[2] / "data" / "processed" / "module_faculty_prefix_conflicts.csv"),
                   help="Đường dẫn file CSV danh sách mâu thuẫn tiền tố")
    sub.add_parser("fill-english-names", help="Điền modules.name_en từ đề cương, catalog CTĐT và bảng api/seed/module_names_en.tsv")
    sub.add_parser("classify-languages", help="Phân loại môn tiếng Anh/tiếng Việt (mã E…/(E)) và ghép cặp Anh–Việt")
    p = sub.add_parser("export-language-split", help="Xuất danh sách môn tiếng Anh / tiếng Việt ra CSV (data/processed)")
    p.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "data" / "processed"))
    p = sub.add_parser("parse-outlines", help="Phân tích đề cương đã trích văn bản -> bảng có cấu trúc (outline_courses, outline_clos…)")
    p.add_argument("--data-dir", default=str(Path(__file__).resolve().parents[2] / "data"))
    p.add_argument("--limit", type=int)
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--ids", type=int, nargs="*", help="Chỉ phân tích các outline_documents.id này")
    p.add_argument("--force", action="store_true", help="Phân tích lại cả tài liệu đã chạy bằng phiên bản hiện tại (vẫn bỏ qua tài liệu đã 'ok')")
    p.add_argument("--include-ok", action="store_true", help="Phân tích lại cả đề cương đã 'ok' (mặc định bỏ qua)")
    p = sub.add_parser("ocr-outlines", help="OCR (Tesseract vie+eng) các PDF đề cương scan (text_status=needs_ocr); cần pdftoppm + tesseract (container jobs)")
    p.add_argument("--data-dir", default=str(Path(__file__).resolve().parents[2] / "data"))
    p.add_argument("--ids", type=int, nargs="*", help="Chỉ OCR các outline_documents.id này")
    p.add_argument("--dpi", type=int, default=300)
    p = sub.add_parser("import-colab-outlines", help="Nạp outline_results.jsonl (Colab: văn bản + bảng PyMuPDF) và phân tích lại đề cương")
    p.add_argument("--file", required=True, help="Đường dẫn outline_results.jsonl đã tải từ Drive")
    p.add_argument("--data-dir", default=str(Path(__file__).resolve().parents[2] / "data"))
    sub.add_parser("link-outlines", help="Liên kết mỗi đề cương PDF với mã học phần (từ danh mục CTĐT 2025)")
    p = sub.add_parser("import-regulations", help="Nạp danh mục văn bản quy chế (regulations/catalog.json)")
    p.add_argument("path", nargs="?", default=str(Path(__file__).resolve().parents[2] / "regulations" / "catalog.json"))
    p = sub.add_parser("import-academic-calendar", help="Nạp lịch năm học (academic_events) từ file seed JSON")
    p.add_argument("--file", help="Đường dẫn file JSON (mặc định: api/seed/academic_calendar_2026_2027.json)")
    p = sub.add_parser("aggregate-analytics", help="Tổng hợp sự kiện vào analytics_daily và analytics_pairs")
    p.add_argument("--since", help="Ngày bắt đầu tổng hợp (YYYY-MM-DD)")
    p = sub.add_parser("purge-analytics", help="Xóa sự kiện thô analytics_events cũ hơn số ngày quy định")
    p.add_argument("--retention-days", type=int, default=180, help="Số ngày lưu trữ (mặc định 180)")
    p = sub.add_parser("seed", help="Nạp dữ liệu ban đầu (file thật trong DATA_DIR/raw, nếu không có: dữ liệu mẫu)")
    p.add_argument("--sample", action="store_true", help="Chỉ nạp dữ liệu mẫu")
    p = sub.add_parser("create-admin", help="Tạo hoặc cập nhật tài khoản quản trị viên (Brief A0)")
    p.add_argument("--email", required=True, help="Email quản trị viên (vd admin@uel.edu.vn)")
    p.add_argument("--role", default="admin", choices=["admin", "moderator", "data_editor"], help="Vai trò quản trị")
    p = sub.add_parser("reset-admin-password", help="Đặt lại mật khẩu quản trị viên và in mật khẩu tạm thời một lần (Brief A0)")
    p.add_argument("--email", required=True, help="Email quản trị viên cần đặt lại mật khẩu")
    p = sub.add_parser("import-master-data", help="Nạp Master_data.xlsx: môn học, khoa/bộ môn, đánh giá, link đề cương, giáo trình (Brief D4)")
    p.add_argument("--file", help="Đường dẫn file Master_data.xlsx (mặc định: data/raw/Master_data.xlsx)")
    p.add_argument("--module-details-only", action="store_true", help="Chỉ cập nhật đánh giá và giáo trình của các học phần đã có")
    p.add_argument("--dry-run", action="store_true", help="Chỉ kiểm tra và xuất báo cáo CSV, không sửa DB")
    p.add_argument("--preview-out", help="Đường dẫn file CSV xem trước (mặc định: data/processed/master_import_preview.csv)")
    p.add_argument("--conflicts-out", help="Đường dẫn file CSV mâu thuẫn Master vs đề cương (mặc định: data/processed/module_faculty_conflicts.csv)")
    p = sub.add_parser("import-ctdt-files", help="Nạp CTĐT từ 46 file PDF/Excel/Word đã thu thập (Brief D3)")
    p.add_argument("--dir", help="Thư mục chứa các file CTĐT (mặc định: data/raw/ctdt_pdf)")
    p.add_argument("--bdcl-dir", help="Thư mục chứa 8-9 Excel BĐCL K25-K26 (mặc định: data/raw/ctdt_bdcl)")
    p.add_argument("--excel-2023-dir", help="Thư mục chứa 17 Excel CTĐT 2023 (mặc định: data/outlines_master/ctdt2023_excel)")
    p.add_argument("--dry-run", action="store_true", help="Chỉ kiểm tra và xuất báo cáo CSV, không sửa DB")
    p.add_argument("--only", help="Chỉ xử lý các file khớp mẫu (regex hoặc chuỗi con)")
    p.add_argument("--preview-out", help="Đường dẫn file CSV xem trước (mặc định: data/processed/ctdt_import_preview.csv)")
    p.add_argument("--vs-db-out", help="Đường dẫn file CSV đối chiếu K23 (mặc định: data/processed/ctdt2023_vs_db.csv)")
    p = sub.add_parser("diff-english-tracks", help="Báo cáo đối chiếu CTĐT hệ E chính thức vs tự sinh cũ (Brief D7)")
    p.add_argument("--bdcl-dir", help="Thư mục chứa Excel BĐCL K25-K26 (mặc định: data/raw/ctdt_bdcl)")
    p.add_argument("--dry-run", action="store_true", default=True, help="Chạy chế độ kiểm tra và xuất CSV (mặc định)")
    p.add_argument("--out", help="Đường dẫn file CSV báo cáo (mặc định: data/processed/english_track_diff.csv)")
    p = sub.add_parser("import-ths", help="Nạp CTĐT Thạc sĩ từ 10 workbook BĐCL (Brief D6)")
    p.add_argument("--bdcl-dir", help="Thư mục chứa 10 Excel BĐCL Thạc sĩ (mặc định: data/raw/ctdt_bdcl)")
    p.add_argument("--dry-run", action="store_true", help="Chỉ kiểm tra và xuất báo cáo CSV, không sửa DB")
    p.add_argument("--preview-out", help="Đường dẫn file CSV xem trước (mặc định: data/processed/ths_import_preview.csv)")
    p = sub.add_parser("import-outlines-docx", help="Nạp đề cương học phần từ file Word (.docx) theo năm CTĐT (Brief D5)")
    p.add_argument("--dir", required=True, help="Thư mục chứa file docx")
    p.add_argument("--ctdt-year", type=int, choices=[2023, 2025], required=True, help="Năm CTĐT (2023 hoặc 2025)")
    p.add_argument("--manifest", help="Đường dẫn file manifest.csv (nếu có)")
    p.add_argument("--dry-run", action="store_true", help="Chỉ kiểm tra, không ghi vào DB")
    p.add_argument("--replace-bff4009", action="store_true", help="Thay đề cương BFF4009 bằng bản chuẩn manual/BFF4009_K25.docx")
    p.add_argument("--export-chan-quyen", action="store_true", help="Xuất danh sách chan-quyen từ manifest 2023 ra data/processed/outlines_2023_chan_quyen.csv")
    p = sub.add_parser("replace-bff4009-outline", help="Thay hẳn đề cương BFF4009 năm 2025 bằng bản chuẩn manual/BFF4009_K25.docx")
    p.add_argument("--file", help="Đường dẫn file manual (mặc định: data/outlines_master/manual/BFF4009_K25.docx)")
    p.add_argument("--dry-run", action="store_true", help="Chạy thử không ghi vào DB")
    p = sub.add_parser("export-chan-quyen-outlines", help="Xuất danh sách đề cương bị chặn quyền từ manifest_ctdt2023.csv ra file CSV")
    p.add_argument("--manifest", help="Đường dẫn manifest (mặc định: data/outlines_master/manifest_ctdt2023.csv)")
    p.add_argument("--out", help="Đường dẫn file xuất (mặc định: data/processed/outlines_2023_chan_quyen.csv)")
    p = sub.add_parser("fill-description-en", help="Điền mô tả tiếng Anh (modules.description_en) cho các môn hệ E từ đề cương tiếng Anh (Brief D7)")
    p.add_argument("--dry-run", action="store_true", help="Chạy thử không ghi vào DB")
    p.add_argument("--only-missing", action=argparse.BooleanOptionalAction, default=True, help="Chỉ xử lý các môn E chưa có description_en (mặc định True)")
    p.add_argument("--data-dir", help="Thư mục data (mặc định: data)")
    p.add_argument("--missing-out", help="Đường dẫn file CSV xuất danh sách môn vẫn thiếu mô tả EN (mặc định: data/processed/E_modules_still_missing_description_en.csv)")
    p = sub.add_parser("audit-x6", help="Xuất khoảng trống đề cương và kiểm toán tên tiếng Anh (Brief X6)")
    p.add_argument("--data-dir", help="Thư mục data (mặc định: data)")
    p.add_argument("--apply-names", action="store_true", help="Áp dụng tên EN còn trống/khác hình thức; mặc định chỉ xuất báo cáo")
    p = sub.add_parser("report-db-consolidated", help="Sinh DB_CONSOLIDATED_REPORT.md (X5 Bước E)")
    p.add_argument("--data-dir", help="Thư mục data (mặc định: data)")
    p.add_argument("--pending-imports", action="store_true", help="Ghi chú rằng các lượt nạp còn bị chặn")
    p = sub.add_parser("import-exchange-stats", help="Nạp số SV trao đổi đã học từng học phần theo học kỳ (exchange_<học kỳ>.json)")
    p.add_argument("--dir", default="data/processed", help="Thư mục chứa exchange_<học kỳ>.json (mặc định: data/processed)")
    p.add_argument("--dry-run", action="store_true", help="Chỉ tổng hợp và in báo cáo, không ghi DB")
    sub.add_parser("clear-sample", help="Xóa dữ liệu mẫu")
    args = parser.parse_args(argv)

    if args.cmd == "clone-cohort-programs":
        from app.config import API_DIR, get_settings
        from app.services.cohort_clone import clone_cohort_programs

        data_dir = get_settings().resolved_data_dir
        if data_dir == API_DIR.parent / "data" / "db":
            data_dir = data_dir.parent
        data_dir = args.data_dir or data_dir
        with SessionLocal() as db:
            if args.dry_run and db.get_bind().dialect.name == "postgresql":
                db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
            res = clone_cohort_programs(
                db,
                excel_dir=data_dir / "outlines_master" / "ctdt2023_excel",
                report_path=args.out or data_dir / "processed" / "k23_clone_report.csv",
                dry_run=args.dry_run,
            )
        print(json.dumps(res, ensure_ascii=False, default=str))
        return 0

    if args.cmd == "import-exchange-stats":
        from app.services.exchange_stats import import_exchange_stats

        data_dir = Path(args.dir)
        if not data_dir.is_dir():
            sys.exit(f"Không tìm thấy thư mục: {data_dir}")
        if args.dry_run:
            res = import_exchange_stats(None, data_dir, dry_run=True)
        else:
            init_db()
            with SessionLocal() as db:
                res = import_exchange_stats(db, data_dir, dry_run=False)
        print(json.dumps(res, ensure_ascii=False, indent=2, default=str))
        return 0

    ctdt_preview = args.cmd == "import-ctdt-files" and args.dry_run
    if not ctdt_preview:
        init_db()
    try:
        with SessionLocal() as db:
            if args.cmd == "import-classes":
                res = import_classes(db, extract_rows(_json(args.path)), semester=args.semester).model_dump()
            elif args.cmd == "import-dkhp-csv":
                from app.services.dkhp_csv_etl import load as load_dkhp_csv
                res = load_dkhp_csv(db, _path(args.path), force=args.force, dry_run=args.dry_run)
                if args.dry_run or res.get("status") == "already_loaded":
                    print(json.dumps(res, ensure_ascii=False, default=str))
                    return 0
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
            elif args.cmd == "repair-equivalent-edges":
                res = rebuild_equivalent_relations(db, dry_run=args.dry_run)
            elif args.cmd == "purge-old-programs":
                res = purge_old_programs(db, before=args.before, dry_run=args.dry_run)
            elif args.cmd == "import-portal-equivalents":
                from app.services.equivalents_repair import import_portal_equivalents
                data = _json(args.path)
                data = data.get("equivalentcourse", data) if isinstance(data, dict) else data  # file do máy chủ nhận ghi: {"equivalentcourse": [...]}
                res = import_portal_equivalents(db, data, repair=not args.no_repair)
            elif args.cmd == "build-catalog-programs":
                from app.services.catalog_programs import build_catalog_programs
                res = build_catalog_programs(db, cohort=args.cohort)
                classify_languages(db)  # môn mới tạo từ catalog cần phân loại ngôn ngữ
                log_run(db, "catalog_programs", None, res)
            elif args.cmd == "backfill-lesson-dates":
                from app.services.lesson_dates import backfill_lesson_dates
                res = backfill_lesson_dates(db, dry_run=args.dry_run)
            elif args.cmd == "fill-descriptions":
                from app.services.descriptions import fill_descriptions
                res = fill_descriptions(db)
            elif args.cmd == "fill-faculties":
                from app.services.faculty_names import fill_faculties
                res = fill_faculties(db)
            elif args.cmd == "audit-faculty":
                from app.services.faculty_names import audit_faculty_command
                res = audit_faculty_command(
                    db,
                    csv_path=Path(args.out),
                    rebuild_prefix_table=args.rebuild_prefix_table,
                    conflicts_csv_path=Path(args.conflicts_out),
                )
            elif args.cmd == "fix-module-faculty":
                from app.services.faculty_names import fix_module_faculties
                res = fix_module_faculties(
                    db,
                    dry_run=args.dry_run,
                    csv_path=Path(args.out),
                    rebuild_prefix_table=args.rebuild_prefix_table,
                    conflicts_csv_path=Path(args.conflicts_out),
                )
            elif args.cmd == "fill-english-names":
                from app.services.english_names import fill_english_names
                res = fill_english_names(db)
            elif args.cmd == "classify-languages":
                res = classify_languages(db)
            elif args.cmd == "export-language-split":
                res = export_language_split(db, Path(args.out))
            elif args.cmd == "parse-outlines":
                res = parse_outlines(db, _path(args.data_dir), limit=args.limit, workers=args.workers, only_ids=args.ids, force=args.force,
                                     include_ok=args.include_ok)
            elif args.cmd == "ocr-outlines":
                res = ocr_outline_texts(db, _path(args.data_dir), only_ids=args.ids, dpi=args.dpi)
            elif args.cmd == "import-colab-outlines":
                res = import_colab_results(db, _path(args.file), _path(args.data_dir))
            elif args.cmd == "link-outlines":
                res = link_outlines_to_modules(db)
            elif args.cmd == "import-regulations":
                res = import_regulation_catalog(db, _path(args.path))
            elif args.cmd == "import-academic-calendar":
                from app.services.academic_calendar import import_academic_calendar
                file_p = _path(args.file) if args.file else None
                res = import_academic_calendar(db, path=file_p)
            elif args.cmd == "aggregate-analytics":
                from app.services.analytics import aggregate_analytics
                res = aggregate_analytics(db, since_date=args.since)
            elif args.cmd == "purge-analytics":
                from app.services.analytics import purge_analytics
                res = {"deleted_events": purge_analytics(db, retention_days=args.retention_days)}
            elif args.cmd == "import-master-data":
                from app.services.master_data_import import import_master_data, import_master_module_details
                file_p = args.file or str(Path(__file__).resolve().parents[2] / "data" / "raw" / "Master_data.xlsx")
                preview_p = args.preview_out or str(Path(__file__).resolve().parents[2] / "data" / "processed" / "master_import_preview.csv")
                conflicts_p = args.conflicts_out or str(Path(__file__).resolve().parents[2] / "data" / "processed" / "module_faculty_conflicts.csv")
                if args.module_details_only:
                    res = import_master_module_details(db, file_p, dry_run=args.dry_run)
                else:
                    res = import_master_data(
                        db,
                        file_path=file_p,
                        dry_run=args.dry_run,
                        preview_out=preview_p,
                        conflicts_out=conflicts_p,
                    )
            elif args.cmd == "import-ctdt-files":
                from app.services.ctdt_files_import import import_ctdt_files
                if ctdt_preview and db.get_bind().dialect.name == "postgresql":
                    db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
                data_dir = Path(__file__).resolve().parents[2] / "data"
                dir_p = Path(args.dir) if args.dir else data_dir / "raw" / "ctdt_pdf"
                bdcl_p = Path(args.bdcl_dir) if args.bdcl_dir else data_dir / "raw" / "ctdt_bdcl"
                excel_p = Path(args.excel_2023_dir) if args.excel_2023_dir else data_dir / "outlines_master" / "ctdt2023_excel"
                preview_p = Path(args.preview_out) if args.preview_out else data_dir / "processed" / "ctdt_import_preview.csv"
                vs_db_p = Path(args.vs_db_out) if args.vs_db_out else data_dir / "processed" / "ctdt2023_vs_db.csv"
                res = import_ctdt_files(
                    db,
                    dir_path=dir_p,
                    bdcl_dir=bdcl_p,
                    excel_2023_dir=excel_p,
                    dry_run=args.dry_run,
                    only_pattern=args.only,
                    preview_csv=preview_p,
                    vs_db_csv=vs_db_p,
                )
                if ctdt_preview:
                    print(json.dumps(res, ensure_ascii=False, default=str))
                    return 0
            elif args.cmd == "diff-english-tracks":
                from app.services.english_track_diff import generate_english_track_diff
                data_dir = Path(__file__).resolve().parents[2] / "data"
                bdcl_p = Path(args.bdcl_dir) if args.bdcl_dir else data_dir / "raw" / "ctdt_bdcl"
                out_p = Path(args.out) if args.out else data_dir / "processed" / "english_track_diff.csv"
                res = generate_english_track_diff(db, bdcl_dir=bdcl_p, out_csv=out_p)
            elif args.cmd == "import-ths":
                from app.services.ths_import import import_ths_curricula
                data_dir = Path(__file__).resolve().parents[2] / "data"
                bdcl_p = Path(args.bdcl_dir) if args.bdcl_dir else data_dir / "raw" / "ctdt_bdcl"
                preview_p = Path(args.preview_out) if args.preview_out else data_dir / "processed" / "ths_import_preview.csv"
                res = import_ths_curricula(
                    db,
                    bdcl_dir=bdcl_p,
                    dry_run=args.dry_run,
                    preview_csv=preview_p,
                )
            elif args.cmd == "import-outlines-docx":
                from app.services.outline_docx import export_chan_quyen_csv, import_docx_outlines, replace_bff4009_outline
                data_dir = Path(__file__).resolve().parents[2] / "data"
                manifest_p = Path(args.manifest) if getattr(args, "manifest", None) else None
                res = import_docx_outlines(
                    db,
                    docx_dir=Path(args.dir),
                    ctdt_year=args.ctdt_year,
                    manifest_path=manifest_p,
                    dry_run=args.dry_run,
                )
                if getattr(args, "replace_bff4009", False) and args.ctdt_year == 2025:
                    manual_file = data_dir / "outlines_master" / "manual" / "BFF4009_K25.docx"
                    bff_res = replace_bff4009_outline(db, manual_file, dry_run=args.dry_run)
                    res["bff4009_replacement"] = bff_res
                if getattr(args, "export_chan_quyen", False):
                    manifest_2023 = data_dir / "outlines_master" / "manifest_ctdt2023.csv"
                    out_csv = data_dir / "processed" / "outlines_2023_chan_quyen.csv"
                    cq_cnt = export_chan_quyen_csv(manifest_2023, out_csv)
                    res["chan_quyen_exported"] = cq_cnt
            elif args.cmd == "replace-bff4009-outline":
                from app.services.outline_docx import replace_bff4009_outline
                data_dir = Path(__file__).resolve().parents[2] / "data"
                manual_p = Path(args.file) if getattr(args, "file", None) else data_dir / "outlines_master" / "manual" / "BFF4009_K25.docx"
                res = replace_bff4009_outline(db, manual_p, dry_run=args.dry_run)
            elif args.cmd == "export-chan-quyen-outlines":
                from app.services.outline_docx import export_chan_quyen_csv
                data_dir = Path(__file__).resolve().parents[2] / "data"
                manifest_2023 = Path(args.manifest) if getattr(args, "manifest", None) else data_dir / "outlines_master" / "manifest_ctdt2023.csv"
                out_csv = Path(args.out) if getattr(args, "out", None) else data_dir / "processed" / "outlines_2023_chan_quyen.csv"
                cq_cnt = export_chan_quyen_csv(manifest_2023, out_csv)
                res = {"status": "ok", "exported_count": cq_cnt, "out": str(out_csv)}
            elif args.cmd == "fill-description-en":
                from app.services.fill_description_en import fill_description_en
                data_dir = Path(args.data_dir) if getattr(args, "data_dir", None) else Path(__file__).resolve().parents[2] / "data"
                missing_csv = Path(args.missing_out) if getattr(args, "missing_out", None) else data_dir / "processed" / "E_modules_still_missing_description_en.csv"
                res = fill_description_en(
                    db,
                    data_dir=data_dir,
                    missing_out=missing_csv,
                    dry_run=args.dry_run,
                    only_missing=getattr(args, "only_missing", True),
                )
            elif args.cmd == "audit-x6":
                from app.services.x6_audit import run_x6_audit
                data_dir = Path(args.data_dir) if getattr(args, "data_dir", None) else Path(__file__).resolve().parents[2] / "data"
                res = run_x6_audit(
                    db,
                    processed_dir=data_dir / "processed",
                    missing_2023_csv=data_dir / "processed" / "outline_2023_con_thieu.csv",
                    master_file=data_dir / "raw" / "Master_data.xlsx",
                    apply_names=getattr(args, "apply_names", False),
                )
            elif args.cmd == "report-db-consolidated":
                from app.services.db_consolidated_report import generate_db_consolidated_report
                data_dir = Path(args.data_dir) if getattr(args, "data_dir", None) else Path(__file__).resolve().parents[2] / "data"
                res = generate_db_consolidated_report(
                    db,
                    out_path=data_dir / "processed" / "DB_CONSOLIDATED_REPORT.md",
                    pending_imports=getattr(args, "pending_imports", False),
                )
            elif args.cmd == "create-admin":
                import os
                import getpass
                from datetime import datetime, timezone
                from sqlalchemy import select, func
                from app.models import AdminUser
                from app.admin.security import hash_password, audit

                clean_email = args.email.strip().lower()
                password = os.environ.get("ADMIN_BOOTSTRAP_PASSWORD")
                if not password:
                    password = getpass.getpass("Nhập mật khẩu quản trị: ")
                    password_confirm = getpass.getpass("Xác nhận lại mật khẩu: ")
                    if password != password_confirm:
                        sys.exit("Lỗi: Mật khẩu xác nhận không khớp!")

                if len(password) < 8:
                    sys.exit("Lỗi: Mật khẩu phải có ít nhất 8 ký tự!")

                user = db.scalar(select(AdminUser).where(func.lower(AdminUser.email) == clean_email))
                now = datetime.now(timezone.utc)
                if user:
                    user.password_hash = hash_password(password)
                    user.role = args.role
                    user.is_active = True
                    user.failed_attempts = 0
                    user.locked_until = None
                    user.updated_at = now
                    action = "admin_user_updated"
                else:
                    user = AdminUser(
                        email=clean_email,
                        password_hash=hash_password(password),
                        role=args.role,
                        is_active=True,
                        failed_attempts=0,
                        created_at=now,
                        updated_at=now,
                    )
                    db.add(user)
                    action = "admin_user_created"
                db.commit()

                audit(
                    db,
                    actor="cli",
                    action=action,
                    entity_type="admin_user",
                    entity_id=str(user.id),
                    after={"email": user.email, "role": user.role},
                    actor_type="system",
                )
                res = {"status": "ok", "email": user.email, "role": user.role, "action": action}
            elif args.cmd == "reset-admin-password":
                from datetime import datetime, timezone
                from sqlalchemy import select, update, func
                from app.models import AdminSession, AdminUser
                from app.admin.security import generate_temp_password, hash_password, audit

                clean_email = args.email.strip().lower()
                user = db.scalar(select(AdminUser).where(func.lower(AdminUser.email) == clean_email))
                if not user:
                    sys.exit(f"Lỗi: Không tìm thấy tài khoản quản trị với email '{clean_email}'!")

                temp_password = generate_temp_password(16)
                now = datetime.now(timezone.utc)
                user.password_hash = hash_password(temp_password)
                user.failed_attempts = 0
                user.locked_until = None
                user.updated_at = now

                # Thu hồi mọi phiên đăng nhập đang hoạt động của người dùng
                db.execute(
                    update(AdminSession)
                    .where(AdminSession.user_id == user.id, AdminSession.revoked_at.is_(None))
                    .values(revoked_at=now)
                )
                db.commit()

                audit(
                    db,
                    actor="cli",
                    action="admin_password_reset",
                    entity_type="admin_user",
                    entity_id=str(user.id),
                    after={"email": user.email},
                    actor_type="system",
                )

                print(f"\nMật khẩu tạm thời cho {user.email}: {temp_password}")
                print("LƯU Ý: Mật khẩu này chỉ hiển thị MỘT LẦN duy nhất và KHÔNG được ghi vào file nào.")
                print("Vui lòng đổi mật khẩu ngay sau khi đăng nhập thành công.\n")
                res = {"status": "ok", "email": user.email, "message": "Mật khẩu tạm đã được tạo và in ra màn hình một lần."}
            elif args.cmd == "seed":
                res = run_seed(db, sample_only=args.sample)
            else:
                res = clear_sample_data(db)
            if args.cmd.startswith("import-") or args.cmd in ("seed", "parse-outlines"):
                classify_languages(db)  # luôn giữ cột language_track đồng bộ sau khi nạp dữ liệu
                from app.services.faculty_names import apply_outline_faculties
                apply_outline_faculties(db)  # chuẩn hóa khoa/bộ môn từ đề cương theo B6h
            if args.cmd in ("parse-outlines", "link-outlines"):
                from app.services.descriptions import fill_descriptions
                fill_descriptions(db)  # mô tả học phần VI/EN lấy từ đề cương: cập nhật khi đề cương đổi
                from app.services.faculty_names import apply_outline_faculties
                apply_outline_faculties(db)  # chuẩn hóa khoa/bộ môn từ đề cương
            # Nhật ký nguồn dữ liệu (không ghi cho dữ liệu cá nhân như TKB portal).
            if args.cmd.startswith("import-") and args.cmd != "import-portal-timetable" and isinstance(res, dict):
                src_path = Path(args.path) if getattr(args, "path", None) else (Path(args.file) if getattr(args, "file", None) else None)
                log_run(db, args.cmd[len("import-"):], src_path, res)
    except ImportFormatError as e:
        sys.exit(f"Lỗi định dạng: {e}")
    print(json.dumps(res, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
