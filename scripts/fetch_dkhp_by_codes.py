"""Crawl chậm lớp học phần từ API dkhp theo danh sách mã môn (chỉ đọc: GetAllScheduleStudyUnit).

Dùng:  python scripts/fetch_dkhp_by_codes.py <codes.txt> [--out data/dkhp_by_codes] [--fresh]
Token: biến môi trường UEL_DKHP_TOKEN hoặc file token.txt (dòng đầu; có/không tiền tố "Bearer "). Không in, không ghi ra file.

Quy tắc an toàn: 1 luồng, nghỉ 1,5–3,5 s, nghỉ thêm 15–25 s sau mỗi 60 request.
Lỗi: một mã lỗi -> ghi nhận, thử mã kế tiếp; nếu mã kế tiếp cũng lỗi -> dừng (checkpoint giữ nguyên, chạy lại sẽ tiếp tục).
401/403/429 -> dừng ngay. Chỉ giữ dòng có CurriculumID đúng bằng mã đã hỏi (API khớp chuỗi con).
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from pathlib import Path

import requests

URL = "https://dkhpapi.uel.edu.vn/api/Schedule/GetAllScheduleStudyUnit"


def load_token() -> str:
    tok = os.environ.get("UEL_DKHP_TOKEN", "").strip()
    if not tok and Path("token.txt").exists():
        tok = Path("token.txt").read_text(encoding="utf-8-sig").splitlines()[0].strip()
    if not tok:
        sys.exit("Thiếu token: đặt UEL_DKHP_TOKEN hoặc token.txt (dòng đầu).")
    return tok.removeprefix("Bearer ").strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("codes")
    ap.add_argument("--out", default="data/dkhp_by_codes")
    ap.add_argument("--fresh", action="store_true")
    a = ap.parse_args()
    codes = [c.strip() for c in Path(a.codes).read_text(encoding="utf-8-sig").splitlines() if c.strip()]
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    ck_path = out / "checkpoint.json"
    ck = {"done": {}, "errors": []}
    if ck_path.exists() and not a.fresh:
        ck = json.loads(ck_path.read_text(encoding="utf-8"))
    headers = {"Authorization": "Bearer " + load_token(), "Content-Type": "application/json"}
    s = requests.Session()
    n_req = 0
    consecutive = 0
    stopped = None
    for code in codes:
        if code in ck["done"]:
            continue
        try:
            r = s.post(URL, headers=headers, json={"ReqParam1": code, "ReqParam2": "0"}, timeout=60)
            if r.status_code in (401, 403, 429):
                stopped = f"HTTP {r.status_code} tại {code}"
                break
            if r.status_code == 400:  # không có kết quả cũng trả 400 theo hành vi đã đo; coi là rỗng
                rows = []
            else:
                r.raise_for_status()
                rows = r.json()
            consecutive = 0
        except Exception as e:  # noqa: BLE001
            ck["errors"].append(f"{code}: {type(e).__name__}")
            consecutive += 1
            if consecutive >= 2:
                stopped = f"2 mã liên tiếp lỗi (đến {code})"
                break
            continue  # thử mã kế tiếp
        exact = [x for x in rows if str(x.get("CurriculumID", "")).strip().upper() == code.upper()]
        ck["done"][code] = {"n": len(exact), "raw_n": len(rows), "truncated": len(rows) >= 100, "items": exact}
        n_req += 1
        if n_req % 20 == 0:
            ck_path.write_text(json.dumps(ck, ensure_ascii=False), encoding="utf-8")
            print(f"{len(ck['done'])}/{len(codes)}", flush=True)
        time.sleep(1.5 + random.random() * 2 + (15 + random.random() * 10 if n_req % 60 == 0 else 0))
    ck_path.write_text(json.dumps(ck, ensure_ascii=False), encoding="utf-8")
    items = {x["ScheduleStudyUnitID"]: x for v in ck["done"].values() for x in v["items"]}
    (out / "classes_raw.json").write_text(
        json.dumps(sorted(items.values(), key=lambda x: x["ScheduleStudyUnitID"]), ensure_ascii=False), encoding="utf-8")
    report = {"codes_total": len(codes), "codes_done": len(ck["done"]), "codes_empty": sum(1 for v in ck["done"].values() if not v["n"]),
              "truncated": [c for c, v in ck["done"].items() if v["truncated"]], "unique_classes": len(items),
              "errors": ck["errors"], "stopped": stopped}
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: (v if k != "errors" else len(v)) for k, v in report.items()}, ensure_ascii=False))
    return 1 if stopped else 0


if __name__ == "__main__":
    raise SystemExit(main())
