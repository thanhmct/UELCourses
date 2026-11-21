"""Sinh colab/outline_extract_v4.ipynb: KHÔNG mount Drive (DriveFS lỗi "mount failed").
Dùng Drive API (google.colab.auth) để tải PDF từ MyDrive/uelcourses/pdfs về /content/pdfs,
xử lý theo patch (50 file), rồi upload outline_results.jsonl lên MyDrive/uelcourses.
Chỉ có tên file đề cương công khai (lấy từ data/outlines_upload_manifest.json). Chạy: python colab/build_notebook_v4.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "outlines_upload_manifest.json"
OUT = Path(__file__).resolve().parent / "outline_extract_v4.ipynb"

names = [o["file"] for o in json.loads(MANIFEST.read_text(encoding="utf-8"))]
EXPECTED_SRC = "EXPECTED = " + json.dumps(names, ensure_ascii=False, indent=0)
PDF_FOLDER_ID = "1v-oPVegihpSGMZABVTaGaTiv_BNxnEdF"     # uelcourses/pdfs
PARENT_ID = "1bCgZwx-7EVwcLM-Sfo8tfuMHQSCvIPQw"          # uelcourses


def code(src: str) -> dict:
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [],
            "source": src.strip("\n").splitlines(keepends=True)}


def md(src: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": src.strip("\n").splitlines(keepends=True)}


cells = [
    md(f"""
# UELCourses: trích văn bản và bảng từ PDF đề cương (v4, Drive API, theo patch)

Tải {len(names)} PDF từ `MyDrive/uelcourses/pdfs` bằng Drive API (không mount), trích văn bản + bảng theo patch 50 file,
rồi upload `outline_results.jsonl` lên `MyDrive/uelcourses`. Chạy lại được.
**Runtime:** CPU.
"""),
    code('''
from google.colab import auth
auth.authenticate_user()
import os, io, json, time
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaFileUpload
drive = build('drive', 'v3', cache_discovery=False)
PDF_FOLDER_ID = "''' + PDF_FOLDER_ID + '''"
PARENT_ID = "''' + PARENT_ID + '''"
PDF_DIR = '/content/pdfs'
RES_DIR = '/content/results'
os.makedirs(PDF_DIR, exist_ok=True)
os.makedirs(RES_DIR, exist_ok=True)

listing = {}
page = None
while True:
    r = drive.files().list(q=f"'{PDF_FOLDER_ID}' in parents and trashed = false",
                           fields='nextPageToken, files(id, name, size)', pageSize=200, pageToken=page).execute()
    for f in r.get('files', []):
        listing[f['name']] = f
    page = r.get('nextPageToken')
    if not page:
        break
print('Trên Drive:', len(listing), 'file')
'''),
    code(EXPECTED_SRC),
    code('''
missing_on_drive = [n for n in EXPECTED if n not in listing]
print('Mong đợi:', len(EXPECTED), '| thiếu trên Drive:', len(missing_on_drive))
for n in missing_on_drive:
    print('  thiếu:', n)
'''),
    code('''
t0 = time.time()
got = skipped = 0
for n in EXPECTED:
    if n not in listing:
        continue
    dst = os.path.join(PDF_DIR, n)
    size = int(listing[n].get('size', -1))
    if os.path.exists(dst) and os.path.getsize(dst) == size:
        skipped += 1
        continue
    req = drive.files().get_media(fileId=listing[n]['id'])
    with io.FileIO(dst, 'wb') as fh:
        dl = MediaIoBaseDownload(fh, req, chunksize=8 * 1024 * 1024)
        finished = False
        while not finished:
            _, finished = dl.next_chunk()
    got += 1
    if got % 50 == 0:
        print('đã tải', got, 'file,', round(time.time() - t0), 'giây', flush=True)
print('tải xong:', got, '| đã có sẵn:', skipped, '| thời gian:', round(time.time() - t0), 'giây')
'''),
    code('''
!pip -q install pymupdf
import pymupdf, unicodedata, glob
from concurrent.futures import ProcessPoolExecutor, as_completed
OCR_OK = False
try:
    !apt-get -qq install -y tesseract-ocr tesseract-ocr-vie > /dev/null 2>&1
    tess = glob.glob('/usr/share/tesseract-ocr/*/tessdata/vie.traineddata') + glob.glob('/usr/share/tesseract-ocr/tessdata/vie.traineddata')
    if tess:
        os.environ['TESSDATA_PREFIX'] = os.path.dirname(tess[0])
        OCR_OK = True
except Exception as e:
    print('Không cài được OCR:', e)
print('OCR tiếng Việt:', 'có' if OCR_OK else 'không')
'''),
    code('''
KEYS = ("clo", "cdr", "tuan", "week", "buoi", "trong so", "weight", "muc tieu", "objective")

def fold(s):
    s = s.replace("đ", "d").replace("Đ", "D")
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return " ".join(s.lower().split())

def extract_one(path):
    import pymupdf
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

todo_all = [n for n in EXPECTED if os.path.exists(os.path.join(PDF_DIR, n))]
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
                results[n] = fut.result(timeout=1800)
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
import glob
merged = '/content/outline_results.jsonl'
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
print('ghép xong:', n, 'bản ghi | thành công:', ok, '| lỗi:', err)
media = MediaFileUpload(merged, mimetype='application/json', resumable=True)
up = drive.files().create(body={'name': 'outline_results.jsonl', 'parents': [PARENT_ID]},
                          media_body=media, fields='id,name,size').execute()
print('đã upload lên Drive:', up)
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
