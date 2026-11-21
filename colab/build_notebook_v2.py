"""Sinh colab/outline_extract_v2.ipynb: Colab tự tải PDF đề cương từ các liên kết Drive công khai (không upload 715 MB).
Không chứa dữ liệu cá nhân: chỉ có mã file Drive của đề cương CTĐT công khai và tên file.
Chạy: python colab/build_notebook_v2.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "data" / "outlines_2025" / "download_report.json"
OUT = Path(__file__).resolve().parent / "outline_extract_v2.ipynb"

rep = json.loads(REPORT.read_text(encoding="utf-8"))
items, seen = [], set()
for url, info in rep["urls"].items():
    if info.get("status") not in ("cached", "downloaded") or not info.get("file"):
        continue
    m = re.search(r"drive\.google\.com/file/d/([A-Za-z0-9_-]+)", url)
    if not m:
        continue
    fname = Path(str(info["file"]).replace("\\", "/")).name
    if fname in seen:
        continue
    seen.add(fname)
    items.append({"id": m.group(1), "file": fname})
ITEMS_JSON = json.dumps(items, ensure_ascii=False)


def code(src: str) -> dict:
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [],
            "source": src.strip("\n").splitlines(keepends=True)}


def md(src: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": src.strip("\n").splitlines(keepends=True)}


cells = [
    md(f"""
# UELCourses — trích văn bản và bảng từ PDF đề cương (Colab, v2)

Colab tự tải **{len(items)} file PDF** từ các liên kết Google Drive công khai, trích văn bản và bảng, rồi ghi
`MyDrive/uelcourses/outline_results.jsonl` (mỗi dòng một PDF). Chạy lại được: file đã có kết quả sẽ bỏ qua.

**Runtime:** CPU (RAM cao nếu có). Việc này tốn CPU, không cần GPU.
"""),
    code('''
from google.colab import drive
drive.mount('/content/drive')
import os
BASE = '/content/drive/MyDrive/uelcourses'
OUT = f'{BASE}/outline_results.jsonl'
FAILS = f'{BASE}/download_failures.json'
PDF_DIR = '/content/pdfs'
os.makedirs(BASE, exist_ok=True)
os.makedirs(PDF_DIR, exist_ok=True)
'''),
    code('!pip -q install pymupdf gdown'),
    code(f'''
import json
ITEMS = {ITEMS_JSON}
print(len(ITEMS), "tệp cần tải")
'''),
    code('''
import gdown, time
fails = []
t0 = time.time()
for i, it in enumerate(ITEMS, 1):
    dst = os.path.join(PDF_DIR, it["file"])
    if os.path.exists(dst) and os.path.getsize(dst) > 1000:
        continue
    ok = False
    for attempt in range(3):
        try:
            gdown.download(id=it["id"], output=dst, quiet=True, fuzzy=True)
            with open(dst, "rb") as f:
                ok = f.read(5) == b"%PDF-"
            if ok:
                break
        except Exception as e:
            err = str(e)[:150]
        time.sleep(3 * (attempt + 1))
    if not ok:
        if os.path.exists(dst):
            os.remove(dst)
        fails.append({"id": it["id"], "file": it["file"]})
    if i % 50 == 0:
        print(i, "đã xử lý,", round(time.time() - t0), "giây")
json.dump(fails, open(FAILS, "w", encoding="utf-8"), ensure_ascii=False)
print("tải xong:", len(ITEMS) - len(fails), "/", len(ITEMS), "| lỗi:", len(fails))
'''),
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
                except Exception as e:
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

done = done_files()
todo = [os.path.join(PDF_DIR, f) for f in sorted(os.listdir(PDF_DIR))
        if f.lower().endswith(".pdf") and f not in done]
print("cần trích xuất:", len(todo))
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
'''),
]

nb = {"cells": cells,
      "metadata": {"colab": {"provenance": []}, "kernelspec": {"name": "python3", "display_name": "Python 3"},
                   "language_info": {"name": "python"}},
      "nbformat": 4, "nbformat_minor": 5}
OUT.write_text(json.dumps(nb, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", OUT, "items:", len(items))
