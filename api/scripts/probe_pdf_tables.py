"""Thử nhận diện bảng trong PDF đề cương bằng PyMuPDF (find_tables) và lấy chữ theo vùng ô.

    python scripts/probe_pdf_tables.py <đường dẫn pdf> [--rows 3] [--pages 3,4]
"""
from __future__ import annotations

import argparse
import sys
import time
import warnings

warnings.filterwarnings("ignore")
import pymupdf  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")


def clean(c) -> str:
    return " ".join(str(c or "").split())


def cell_text(page, bbox) -> str:
    if not bbox:
        return ""
    return clean(page.get_text("text", clip=pymupdf.Rect(bbox), sort=True))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--rows", type=int, default=3)
    ap.add_argument("--pages", default="")
    a = ap.parse_args()
    only = {int(x) for x in a.pages.split(",") if x}
    t0 = time.time()
    doc = pymupdf.open(a.pdf)
    print(f"pages={len(doc)}")
    for pno, page in enumerate(doc, 1):
        if only and pno not in only:
            continue
        for ti, t in enumerate(page.find_tables().tables):
            print(f"p{pno} table{ti}: {t.row_count} rows x {t.col_count} cols")
            for row in t.rows[: a.rows]:
                print("    ", [cell_text(page, c)[:46] for c in row.cells])
    print(f"seconds={time.time() - t0:.1f}")


if __name__ == "__main__":
    main()
