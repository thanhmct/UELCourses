"""Khảo sát đề mục của các đề cương đã trích văn bản (outline_documents.text) — dùng để thiết kế/kiểm tra bộ phân tích.

    python scripts/survey_outline_headings.py [--show-doc ID] [--from-heading "Đánh giá"]
"""
from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from collections import Counter

from sqlalchemy import select

from app.db import SessionLocal
from app.models import OutlineDocument

sys.stdout.reconfigure(encoding="utf-8")


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.replace("đ", "d").replace("Đ", "D"))
    return re.sub(r"\s+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn")).strip().lower()


HEAD = re.compile(r"^\s{0,8}(\d{1,2})\.\s+([A-ZÀ-Ỹa-zà-ỹ][^\n]{2,90}?)\s*$", re.M)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--show-doc", type=int)
    ap.add_argument("--from-heading", help="in văn bản từ đề mục có chứa chuỗi này (không dấu)")
    ap.add_argument("--chars", type=int, default=6000)
    a = ap.parse_args()
    with SessionLocal() as db:
        if a.show_doc:
            d = db.get(OutlineDocument, a.show_doc)
            text = d.text or ""
            if a.from_heading:
                i = fold(text).find(fold(a.from_heading))
                text = text[max(0, i):] if i >= 0 else text
            print(text[: a.chars])
            return
        docs = db.execute(select(OutlineDocument.id, OutlineDocument.text).where(OutlineDocument.text_status == "extracted")).all()
        top: Counter = Counter()
        kw = {k: 0 for k in ["thong tin tong quat", "mo ta hoc phan", "tai lieu hoc tap", "muc tieu hoc phan", "chuan dau ra", "danh gia hoc phan",
                              "ke hoach giang day", "noi dung", "ma hoc phan", "so tin chi", "hoc phan tien quyet", "cdr", "clo1", "co1"]}
        for _id, text in docs:
            f = fold(text)
            for k in kw:
                kw[k] += k in f
            seen = set()
            for m in HEAD.finditer(text):
                key = (int(m.group(1)), fold(m.group(2))[:48])
                if key not in seen:
                    seen.add(key)
                    top[key] += 1
        print(f"{len(docs)} đề cương có văn bản\n--- từ khóa xuất hiện (số đề cương):")
        for k, v in kw.items():
            print(f"  {v:4d}  {k}")
        print("--- đề mục đánh số cấp 1 phổ biến nhất:")
        for (n, title), c in top.most_common(45):
            print(f"  {c:4d}  {n}. {title}")


if __name__ == "__main__":
    main()
