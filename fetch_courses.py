"""Lấy danh sách lớp học phần UEL từ API tra cứu của dkhp.uel.edu.vn.

API: POST https://dkhpapi.uel.edu.vn/api/Schedule/GetAllScheduleStudyUnit
Body: {"ReqParam1": <từ khóa>, "ReqParam2": "0" (theo mã) | "1" (theo tên)}

API bắt buộc có từ khóa, nên script tìm lần lượt từng từ khóa rồi gộp và
bỏ trùng kết quả.

Token: đăng nhập dkhp.uel.edu.vn -> F12 -> Network -> bấm "Tìm kiếm" ở trang
Tra cứu học phần -> request GetAllScheduleStudyUnit -> Request Headers ->
copy phần sau "Bearer " trong Authorization. Rồi đặt vào biến môi trường
UEL_TOKEN hoặc file token.txt (đừng commit/chia sẻ file này).

Ví dụ:
    python fetch_courses.py                          # dùng bộ từ khóa mặc định (theo tên)
    python fetch_courses.py -k "Kinh tế" "Luật"      # từ khóa tự chọn
    python fetch_courses.py --by code -k ECO LAW     # tìm theo mã học phần
    python fetch_courses.py --keywords-file kw.txt   # mỗi dòng một từ khóa
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
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
    if not token:
        sys.exit(
            "Thiếu token. Đặt biến môi trường UEL_TOKEN hoặc tạo file "
            f"{token_file.name} chứa access token (xem hướng dẫn đầu file)."
        )
    return token


def search(session: requests.Session, keyword: str, by: str) -> list[dict]:
    body = {"ReqParam1": keyword, "ReqParam2": "0" if by == "code" else "1"}
    resp = session.post(API_URL, json=body, timeout=30)
    if resp.status_code in (401, 403):
        sys.exit(f"Lỗi {resp.status_code}: token hết hạn hoặc không hợp lệ. Lấy token mới rồi chạy lại.")
    resp.raise_for_status()
    data = resp.json()
    # Phòng trường hợp API bọc kết quả trong một object.
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Lấy danh sách lớp học phần UEL")
    parser.add_argument("-k", "--keywords", nargs="+", help="Từ khóa tìm kiếm")
    parser.add_argument("--keywords-file", type=Path, help="File từ khóa, mỗi dòng một từ")
    parser.add_argument("--by", choices=["name", "code"], default="name",
                        help="Tìm theo tên (mặc định) hay mã học phần")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="Số giây nghỉ giữa các request (mặc định 1)")
    parser.add_argument("--token-file", type=Path, default=Path("token.txt"))
    parser.add_argument("-o", "--out", default="data/courses",
                        help="Tiền tố file kết quả (tạo .json và .csv)")
    args = parser.parse_args()

    keywords: list[str] = []
    if args.keywords:
        keywords += args.keywords
    if args.keywords_file:
        keywords += [l.strip() for l in args.keywords_file.read_text(encoding="utf-8").splitlines() if l.strip()]
    if not keywords:
        keywords = DEFAULT_KEYWORDS

    token = load_token(args.token_file)
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": "https://dkhp.uel.edu.vn",
        "Referer": "https://dkhp.uel.edu.vn/",
    })

    results: dict[str, dict] = {}
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

    # Giữ các cột đã biết trước, thêm các cột khác API trả về (nếu có) ở cuối.
    extra = sorted({k for r in rows for k in r} - set(CSV_FIELDS))
    csv_path = out.with_suffix(".csv")
    with csv_path.open("w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig để Excel đọc đúng tiếng Việt
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS + extra, extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            writer.writerow({k: to_csv_value(r.get(k)) for k in CSV_FIELDS + extra})

    print(f"\nĐã lưu {len(rows)} lớp học phần vào {json_path} và {csv_path}")
    if not rows:
        print("Không có kết quả: thử từ khóa khác (--by code / --by name) hoặc kiểm tra token.")


if __name__ == "__main__":
    main()
