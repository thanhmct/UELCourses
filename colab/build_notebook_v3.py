"""Sinh colab/outline_extract_v3.ipynb: xử lý PDF đã upload lên MyDrive/uelcourses/pdfs theo PATCH (50 file/patch).
Mỗi patch ghi ra MyDrive/uelcourses/results/patch_NN.jsonl; chạy lại được (bỏ qua patch đã xong, chỉ làm file lỗi).
Cuối cùng ghép thành MyDrive/uelcourses/outline_results.jsonl.
Không chứa dữ liệu cá nhân: chỉ có tên file đề cương CTĐT công khai (lấy từ data/outlines_upload_manifest.json).
Chạy: python colab/build_notebook_v3.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "outlines_upload_manifest.json"
OUT = Path(__file__).resolve().parent / "outline_extract_v3.ipynb"

names = [o["file"] for o in json.loads(MANIFEST.read_text(encoding="utf-8"))]
EXPECTED_SRC = "EXPECTED = " + json.dumps(names, ensure_ascii=False, indent=0)


def code(src: str) -> dict:
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [],
            "source": src.strip("\n").splitlines(keepends=True)}


def md(src: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": src.strip("\n").splitlines(keepends=True)}


cells = [
    md(f"""
# UELCourses: trích văn bản và bảng từ PDF đề cương (v3, theo patch)

Đầu vào: `MyDrive/uelcourses/pdfs/` ({len(names)} file đã upload).
Kết quả: `MyDrive/uelcourses/results/patch_NN.jsonl` (mỗi patch 50 file), ghép cuối cùng thành
`MyDrive/uelcourses/outline_results.jsonl`.

Chạy lại được: patch đã xong được bỏ qua; file lỗi được thử lại.
**Runtime:** CPU.
"""),
    code('''
from google.colab import drive
drive.mount('/content/drive')
import os, json, time, glob
BASE = '/content/drive/MyDrive/uelcourses'
PDF_DIR = f'{BASE}/pdfs'
RES_DIR = f'{BASE}/results'
os.makedirs(RES_DIR, exist_ok=True)
print('PDF trên Drive:', len(os.listdir(PDF_DIR)))
'''),
    code(EXPECTED_SRC),
    code('''
present = set(os.listdir(PDF_DIR))
missing = [n for n in EXPECTED if n not in present]
print('Danh sách mong đợi:', len(EXPECTED), '| đã có trên Drive:', len(EXPECTED) - len(missing), '| thiếu:', len(missing))
for n in missing:
    print('  thiếu:', n)
'''),
    code('''
!pip -q install pymupdf
import glob, os
OCR_OK = False
try:
    !apt-get -qq install -y tesseract-ocr tesseract-ocr-vie > /dev/null 2>&1
    tess = glob.glob('/usr/share/tesseract-ocr/*/tessdata/vie.traineddata') + glob.glob('/usr/share/tesseract-ocr/tessdata/vie.traineddata')
    if tess:
        os.environ['TESSDATA_PREFIX'] = os.path.dirname(tess[0])
        OCR_OK = True
except Exception as e:
    print('Không cài được OCR:', e)
print('OCR tiếng Việt:', 'có' if OCR_OK else 'không (file scan sẽ thiếu văn bản)')
'''),
    code('''
import pymupdf, unicodedata
from concurrent.futures import ProcessPoolExecutor, as_completed

KEYS = ("clo", "cdr", "tuan", "week", "buoi", "trong so", "weight", "muc tieu", "objective")

def fold(s):
    s = s.replace("đ", "d").replace("Đ", "D")
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return " ".join(s.lower().split())

def extract_one(path):
    doc = pymupdf.open(path)
    pages_text, tables, ocr_pages = [], [], 0
    try:
        for pno, page in enumerate(doc, 1):
            txt = page.get_text("text", sort=True)
            if OCR_OK and len(txt.strip()) < 30:
                try:
                    tp = page.get_textpage_ocr(language="vie", dpi=200, full=True)
                    txt = page.get_text("text", sort=True, textpage=tp)
                    ocr_pages += 1
                except Exception:
                    pass
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
        return {"file": os.path.basename(path), "pages": len(doc), "ocr_pages": ocr_pages,
                "text": "\\n\\f".join(pages_text), "tables": tables}
    finally:
        doc.close()
'''),
    code('''
PATCH = 50
workers = max(1, os.cpu_count() or 2)
print('số tiến trình:', workers, '| patch', PATCH, 'file')

def load_ok(path):
    """Các bản ghi đã thành công trong một patch (bỏ bản ghi lỗi để thử lại)."""
    ok = {}
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                if 'error' not in rec:
                    ok[rec['file']] = rec
    return ok

present = set(os.listdir(PDF_DIR))
todo_all = [n for n in EXPECTED if n in present]
patches = [todo_all[i:i + PATCH] for i in range(0, len(todo_all), PATCH)]
t0 = time.time()
for pi, batch in enumerate(patches):
    out_path = f'{RES_DIR}/patch_{pi:02d}.jsonl'
    done = load_ok(out_path)
    todo = [n for n in batch if n not in done]
    if not todo:
        continue
    n_err = 0
    results = dict(done)
    with ProcessPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(extract_one, os.path.join(PDF_DIR, n)): n for n in todo}
        for fut in as_completed(futs):
            n = futs[fut]
            try:
                results[n] = fut.result(timeout=1200)
            except Exception as e:
                n_err += 1
                results[n] = {'file': n, 'error': f"{type(e).__name__}: {e}"[:300]}
    tmp = out_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as out:
        for n in batch:
            if n in results:
                out.write(json.dumps(results[n], ensure_ascii=False) + '\\n')
    os.replace(tmp, out_path)
    print(f'patch {pi + 1}/{len(patches)}: xong {len(todo) - n_err}, lỗi {n_err}, {round(time.time() - t0)} giây', flush=True)
print('hoàn tất các patch')
'''),
    code('''
merged = f'{BASE}/outline_results.jsonl'
n = ok = err = 0
with open(merged, 'w', encoding='utf-8') as out:
    for p in sorted(glob.glob(f'{RES_DIR}/patch_*.jsonl')):
        with open(p, encoding='utf-8') as f:
            for line in f:
                out.write(line)
                n += 1
                try:
                    rec = json.loads(line)
                    if 'error' in rec:
                        err += 1
                    else:
                        ok += 1
                except ValueError:
                    err += 1
print('ghép xong:', n, 'bản ghi | thành công:', ok, '| lỗi:', err, '→', merged)
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
print("wrote", OUT, "files:", len(names))
