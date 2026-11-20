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
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Quản trị dữ liệu UELPlan")
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
            elif args.cmd == "seed":
                res = run_seed(db, sample_only=args.sample)
            else:
                res = clear_sample_data(db)
    except ImportFormatError as e:
        sys.exit(f"Lỗi định dạng: {e}")
    print(json.dumps(res, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
