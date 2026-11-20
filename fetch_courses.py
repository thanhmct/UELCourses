"""Lấy danh sách lớp học phần và học phần UEL từ API tra cứu của dkhp.uel.edu.vn hoặc từ dữ liệu thực tế tại data/raw.

Cách 1: Cào trực tiếp từ API dkhp.uel.edu.vn (yêu cầu Token):
    - Đăng nhập dkhp.uel.edu.vn -> F12 -> Network -> Bấm "Tìm kiếm" ở trang Tra cứu học phần
    - Chọn request GetAllScheduleStudyUnit -> Headers -> Authorization -> copy token sau 'Bearer '
    - Lưu vào file token.txt hoặc đặt biến môi trường UEL_TOKEN.
    - Chạy: python fetch_courses.py

Cách 2: Trích xuất tự động từ dữ liệu UIS và CTĐT thực tế trong data/raw/ (Offline, không cần token):
    - Chạy: python fetch_courses.py --from-raw (hoặc chạy khi chưa có token)
    - Tự động tạo:
        + data/courses.json & data/courses.csv (225 lớp học phần thực tế kèm lịch học, giảng viên, phòng, sĩ số)
        + data/modules.json & data/modules.csv (794 học phần từ 86 chương trình đào tạo kèm khối kiến thức, tiên quyết)
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

API_URL = "https://dkhpapi.uel.edu.vn/api/Schedule/GetAllScheduleStudyUnit"

DEFAULT_KEYWORDS = [
    "Kinh tế", "Luật", "Quản trị", "Tài chính", "Kế toán", "Kiểm toán",
    "Ngân hàng", "Marketing", "Thương mại", "Kinh doanh", "Quốc tế",
    "Hệ thống", "Dữ liệu", "Phân tích", "Lập trình", "Toán", "Thống kê",
    "Tiếng Anh", "Triết", "Chính trị", "Pháp luật", "Tư tưởng", "Lịch sử",
    "Giáo dục", "Nhập môn", "Nguyên lý", "Quản lý", "Đầu tư", "Bảo hiểm",
    "Logistics", "Thuế", "Hợp đồng", "Dân sự", "Hình sự", "Hành chính",
]

# Cột xuất ra CSV (theo các cột trang Tra cứu học phần hiển thị).
CSV_FIELDS = [
    "CurriculumID", "ScheduleStudyUnitAlias", "ScheduleStudyUnitName",
    "Credits", "StudyUnitTypeName", "ProfessorName", "StudentQuotas",
    "BeginDate", "EndDate", "Schedules",
]


def load_token(token_file: Path) -> str:
    token = os.environ.get("UEL_TOKEN", "").strip()
    if not token and token_file.exists():
        token = token_file.read_text(encoding="utf-8").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    return token


def search(session: requests.Session, keyword: str, by: str) -> list[dict]:
    body = {"ReqParam1": keyword, "ReqParam2": "0" if by == "code" else "1"}
    resp = session.post(API_URL, json=body, timeout=30)
    if resp.status_code in (401, 403):
        sys.exit(f"Lỗi {resp.status_code}: token hết hạn hoặc không hợp lệ. Lấy token mới rồi chạy lại.")
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, dict):
        for key in ("data", "Data", "result", "Result", "items"):
            if isinstance(data.get(key), list):
                return data[key]
        return []
    return data if isinstance(data, list) else []


def record_key(item: dict) -> str:
    alias = item.get("ScheduleStudyUnitAlias") or item.get("ScheduleStudyUnitID")
    return str(alias) if alias else json.dumps(item, sort_keys=True, ensure_ascii=False)


def to_csv_value(value):
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return value


def export_classes_and_modules_from_raw(out_prefix: str) -> tuple[int, int]:
    """Trích xuất từ các file UIS Excel và CTĐT JSON trong data/raw/."""
    try:
        import openpyxl
    except ImportError:
        sys.exit("Vui lòng cài đặt openpyxl: pip install openpyxl")

    data_dir = Path("data")
    raw_dir = data_dir / "raw"
    if not raw_dir.is_dir():
        sys.exit(f"Không tìm thấy thư mục {raw_dir}")

    uis_files = sorted(raw_dir.glob("UIS-DanhSachThongTinLHPDangKy_*.xlsx"))
    ctdt_file = raw_dir / "ctdt_programs.json"

    # 1. Trích xuất Lớp học phần
    classes: list[dict] = []
    for uis_file in uis_files:
        wb = openpyxl.load_workbook(uis_file, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        for r in rows[2:]:  # Bỏ 2 dòng tiêu đề
            if len(r) < 17:
                continue
            faculty, code, name, credits, alias, typ, student_class, min_quota, max_quota, registered, available, rooms, _diff, begin_date, end_date, schedules, professor = r[:17]
            if not alias or not str(alias).strip():
                continue
            item = {
                "CurriculumID": str(code).strip() if code else "",
                "ScheduleStudyUnitAlias": str(alias).strip() if alias else "",
                "ScheduleStudyUnitName": str(name).strip() if name else "",
                "Credits": int(credits) if credits is not None else 0,
                "StudyUnitTypeName": str(typ).strip() if typ else "Lý thuyết",
                "ProfessorName": str(professor).strip() if professor else "",
                "StudentQuotas": int(max_quota) if max_quota is not None else 0,
                "BeginDate": begin_date.isoformat() if isinstance(begin_date, datetime) else str(begin_date or ""),
                "EndDate": end_date.isoformat() if isinstance(end_date, datetime) else str(end_date or ""),
                "Schedules": str(schedules).strip() if schedules else "",
                "Faculty": str(faculty).strip() if faculty else "",
                "ClassStudent": str(student_class).strip() if student_class else "",
                "MinStudentQuotas": int(min_quota) if min_quota is not None else 0,
                "RegisteredStudents": int(registered) if registered is not None else 0,
                "AvailableSeats": int(available) if available is not None else 0,
                "Rooms": str(rooms).strip() if rooms else "",
            }
            classes.append(item)

    classes.sort(key=lambda x: (x["CurriculumID"], x["ScheduleStudyUnitAlias"]))
    out = Path(out_prefix)
    out.parent.mkdir(parents=True, exist_ok=True)

    json_path = out.with_suffix(".json")
    json_path.write_text(json.dumps(classes, ensure_ascii=False, indent=2), encoding="utf-8")

    extra = sorted({k for r in classes for k in r} - set(CSV_FIELDS))
    csv_path = out.with_suffix(".csv")
    with csv_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS + extra, extrasaction="ignore")
        writer.writeheader()
        for r in classes:
            writer.writerow({k: to_csv_value(r.get(k)) for k in CSV_FIELDS + extra})

    print(f"-> Đã lưu {len(classes)} lớp học phần vào {json_path} và {csv_path}")

    # 2. Trích xuất Học phần CTĐT nếu có ctdt_programs.json
    modules_count = 0
    if ctdt_file.is_file():
        programs = json.loads(ctdt_file.read_text(encoding="utf-8-sig"))
        modules_map: dict[str, dict] = {}
        for pid, p_rows in programs.items():
            for r in p_rows:
                code = str(r.get("MaHP") or "").strip()
                if not code:
                    continue
                if code not in modules_map:
                    modules_map[code] = {
                        "ModuleCode": code,
                        "ModuleName": str(r.get("TenHP") or "").strip(),
                        "Credits": r.get("STC") or 0,
                        "Faculty": str(r.get("TenKhoaChuyenMon") or "").strip(),
                        "KnowledgeBlock": str(r.get("TenKhoiKienThuc") or "").strip(),
                        "ParentBlock": str(r.get("TenKhoaKienThucCha") or "").strip(),
                        "Required": str(r.get("BatBuoc") or "").strip(),
                        "Prerequisites": str(r.get("HPTienQuyet") or "").strip(),
                        "Previous": str(r.get("HPHocTruoc") or "").strip(),
                        "CoRequisites": str(r.get("HPSongHanh") or "").strip(),
                        "Programs": [],
                    }
                if pid not in modules_map[code]["Programs"]:
                    modules_map[code]["Programs"].append(pid)

        modules_list = sorted(modules_map.values(), key=lambda m: m["ModuleCode"])
        modules_count = len(modules_list)
        mod_json = data_dir / "modules.json"
        mod_json.write_text(json.dumps(modules_list, ensure_ascii=False, indent=2), encoding="utf-8")

        mod_csv = data_dir / "modules.csv"
        mod_fields = [
            "ModuleCode", "ModuleName", "Credits", "Faculty", "KnowledgeBlock",
            "ParentBlock", "Required", "Prerequisites", "Previous", "CoRequisites", "Programs",
        ]
        with mod_csv.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=mod_fields)
            writer.writeheader()
            for m in modules_list:
                row = dict(m)
                row["Programs"] = ", ".join(row["Programs"])
                writer.writerow(row)
        print(f"-> Đã lưu {modules_count} học phần từ 86 CTĐT vào {mod_json} và {mod_csv}")

    return len(classes), modules_count


def fetch_live_api(args, token: str) -> None:
    keywords: list[str] = []
    if args.keywords:
        keywords += args.keywords
    if args.keywords_file:
        keywords += [l.strip() for l in args.keywords_file.read_text(encoding="utf-8").splitlines() if l.strip()]
    if not keywords:
        keywords = DEFAULT_KEYWORDS

    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": "https://dkhp.uel.edu.vn",
        "Referer": "https://dkhp.uel.edu.vn/",
    })

    results: dict[str, dict] = {}
    print(f"Bắt đầu cào trực tiếp từ API dkhp.uel.edu.vn ({len(keywords)} từ khóa)...")
    for i, kw in enumerate(keywords, 1):
        try:
            items = search(session, kw, args.by)
        except requests.RequestException as e:
            print(f"[{i}/{len(keywords)}] '{kw}': lỗi {e}", file=sys.stderr)
            continue
        new = 0
        for item in items:
            key = record_key(item)
            if key not in results:
                results[key] = item
                new += 1
        print(f"[{i}/{len(keywords)}] '{kw}': {len(items)} kết quả, {new} mới (tổng {len(results)})")
        if i < len(keywords):
            time.sleep(args.delay)

    rows = sorted(results.values(), key=lambda r: (str(r.get("CurriculumID", "")), str(r.get("ScheduleStudyUnitAlias", ""))))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    json_path = out.with_suffix(".json")
    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    extra = sorted({k for r in rows for k in r} - set(CSV_FIELDS))
    csv_path = out.with_suffix(".csv")
    with csv_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS + extra, extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            writer.writerow({k: to_csv_value(r.get(k)) for k in CSV_FIELDS + extra})

    print(f"\nĐã lưu {len(rows)} lớp học phần vào {json_path} và {csv_path}")
    if not rows:
        print("Không có kết quả: thử từ khóa khác (--by code / --by name) hoặc kiểm tra token.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Lấy danh sách lớp học phần và học phần UEL")
    parser.add_argument("-k", "--keywords", nargs="+", help="Từ khóa tìm kiếm (khi cào live)")
    parser.add_argument("--keywords-file", type=Path, help="File từ khóa, mỗi dòng một từ")
    parser.add_argument("--by", choices=["name", "code"], default="name",
                        help="Tìm theo tên (mặc định) hay mã học phần")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="Số giây nghỉ giữa các request (mặc định 1)")
    parser.add_argument("--token-file", type=Path, default=Path("token.txt"))
    parser.add_argument("-o", "--out", default="data/courses",
                        help="Tiền tố file kết quả (tạo .json và .csv)")
    parser.add_argument("--from-raw", action="store_true",
                        help="Trích xuất trực tiếp từ file UIS/CTĐT trong data/raw thay vì gọi API")
    parser.add_argument("--live", action="store_true",
                        help="Bắt buộc cào trực tiếp từ API dkhpapi.uel.edu.vn (cần token)")
    args = parser.parse_args()

    token = load_token(args.token_file)

    if args.from_raw:
        print("Trích xuất dữ liệu học phần từ data/raw/...")
        export_classes_and_modules_from_raw(args.out)
        return

    if token:
        print("Đã phát hiện token hợp lệ. Tiến hành cào trực tiếp từ API...")
        fetch_live_api(args, token)
        return

    if args.live:
        sys.exit(
            "Thiếu token! Đặt biến môi trường UEL_TOKEN hoặc tạo file token.txt "
            "chứa access token (xem hướng dẫn ở đầu file)."
        )

    print("=" * 70)
    print("CHƯA PHÁT HIỆN TOKEN ĐỂ CÀO TRỰC TIẾP TỪ dkhpapi.uel.edu.vn")
    print("Để cào live từ server trường:")
    print("  1. Đăng nhập https://dkhp.uel.edu.vn")
    print("  2. Bấm F12 -> Network -> Bấm 'Tìm kiếm' ở trang Tra cứu học phần")
    print("  3. Chọn request GetAllScheduleStudyUnit -> copy Authorization Bearer")
    print("  4. Lưu token vào file 'token.txt' rồi chạy lại 'python fetch_courses.py'")
    print("-" * 70)
    print("Đang tự động trích xuất toàn bộ học phần & lớp học phần từ dữ liệu thực tế tại data/raw/...")
    print("=" * 70)
    export_classes_and_modules_from_raw(args.out)


if __name__ == "__main__":
    main()
