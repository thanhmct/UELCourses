"""Sinh file colab/outline_extract.ipynb (không chứa dữ liệu cá nhân). Chạy: python colab/build_notebook.py"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent / "outline_extract.ipynb"


def code(src: str) -> dict:
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [],
            "source": src.strip("\n").splitlines(keepends=True)}


def md(src: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": src.strip("\n").splitlines(keepends=True)}


cells = [
    md("""
# UELCourses — trích văn bản và bảng từ PDF đề cương (chạy trên Colab)

**Trước khi chạy:** tải thư mục PDF lên Google Drive tại `MyDrive/uelcourses/pdfs/` (chỉ đề cương công khai, không có dữ liệu cá nhân).

**Runtime:** chọn **CPU** (RAM cao nếu có). Việc này chủ yếu tốn CPU, không cần A100/GPU, nên không tốn đơn vị tính toán.

**Kết quả:** file `MyDrive/uelcourses/outline_results.jsonl`, mỗi dòng là một PDF. Chạy lại được: file nào đã có kết quả sẽ bỏ qua.
"""),
    code('''
from google.colab import drive
drive.mount('/content/drive')
import os
BASE = '/content/drive/MyDrive/uelcourses'
PDF_DIR = f'{BASE}/pdfs'
OUT = f'{BASE}/outline_results.jsonl'
os.makedirs(BASE, exist_ok=True)
print(len([f for f in os.listdir(PDF_DIR) if f.lower().endswith('.pdf')]), 'PDF trong', PDF_DIR)
'''),
    code('!pip -q install pymupdf'),
    code('''
import json, os, time, unicodedata
import pymupdf
from concurrent.futures import ProcessPoolExecutor, as_completed

KEYS = ("clo", "cdr", "tuan", "week", "buoi", "trong so", "weight", "muc tieu", "objective")

def fold(s):
    s = s.replace("đ", "d").replace("Đ", "D")
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return " ".join(s.lower().split())

def extract_one(path):
    """Trả về văn bản từng trang + bảng ở các trang có từ khóa (CO/CLO/đánh giá/kế hoạch tuần)."""
    doc = pymupdf.open(path)
    pages_text, tables = [], []
    try:
        for pno, page in enumerate(doc, 1):
            txt = page.get_text("text", sort=True)
            pages_text.append(txt)
            if any(k in fold(txt) for k in KEYS):
                try:
                    for t in page.find_tables().tables:
                        rows = []
                        for row in t.rows:
                            rows.append([
                                page.get_text("text", clip=pymupdf.Rect(c), sort=True).strip() if c else ""
                                for c in row.cells
                            ])
                        tables.append({"page": pno, "rows": rows})
                except Exception as e:  # bảng lỗi: bỏ qua, giữ văn bản
                    tables.append({"page": pno, "error": str(e)[:200]})
        return {"file": os.path.basename(path), "pages": len(doc),
                "text": "\\n\\f".join(pages_text), "tables": tables}
    finally:
        doc.close()
'''),
    code('''
def done_files():
    s = set()
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            for line in f:
                try:
                    s.add(json.loads(line)["file"])
                except Exception:
                    pass
    return s

todo = [os.path.join(PDF_DIR, f) for f in sorted(os.listdir(PDF_DIR))
        if f.lower().endswith(".pdf") and f not in done_files()]
print("cần xử lý:", len(todo))
workers = max(1, os.cpu_count() or 2)
print("số tiến trình:", workers)

start, n = time.time(), 0
with ProcessPoolExecutor(max_workers=workers) as ex, open(OUT, "a", encoding="utf-8") as out:
    futs = {ex.submit(extract_one, p): p for p in todo}
    for fut in as_completed(futs):
        p = futs[fut]
        try:
            rec = fut.result(timeout=900)
        except Exception as e:
            rec = {"file": os.path.basename(p), "error": str(e)[:300]}
        out.write(json.dumps(rec, ensure_ascii=False) + "\\n")
        out.flush()
        n += 1
        if n % 25 == 0:
            print(n, "xong,", round(time.time() - start), "giây")
print("hoàn tất:", n, "file trong", round(time.time() - start), "giây")
'''),
    code('''
rows = [json.loads(l) for l in open(OUT, encoding="utf-8")]
bad = [r for r in rows if "error" in r]
print(len(rows), "bản ghi trong", OUT, "|", len(bad), "lỗi")
for r in bad[:5]:
    print(r["file"], r["error"][:120])
'''),
]

nb = {
    "cells": cells,
    "metadata": {"colab": {"provenance": []}, "kernelspec": {"name": "python3", "display_name": "Python 3"},
                 "language_info": {"name": "python"}},
    "nbformat": 4,
    "nbformat_minor": 5,
}
OUT.write_text(json.dumps(nb, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", OUT)
