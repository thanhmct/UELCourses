from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.db import SessionLocal
from app.services.undergrad_json_import import import_undergrad_json


def main() -> None:
    parser = argparse.ArgumentParser(description="Nạp CTĐT bậc Đại học từ UEL_chuong_trinh_dao_tao.json")
    parser.add_argument("file", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--include-programs", action="store_true",
                        help="Tạo thêm CTĐT không có khóa; mặc định chỉ matching mã học phần để cập nhật đánh giá/tài liệu")
    args = parser.parse_args()
    with SessionLocal() as db:
        result = import_undergrad_json(db, args.file, dry_run=args.dry_run, include_programs=args.include_programs)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
