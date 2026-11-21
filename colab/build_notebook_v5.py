"""Sinh colab/outline_extract_v5.ipynb — bản tối ưu tốc độ của v4.

Khác v4:
- Dò bảng nhanh: find_tables(use_layout=False), chỉ dùng mô hình layout ONNX cho trang có bảng mới thấy dòng tiêu đề
  (PyMuPDF 2.x mặc định chạy layout: ~14 giây nạp + vài giây/trang -> chậm 5–80 lần). Ghim pymupdf==2.1 giống máy local.
- Tải PDF song song (nhiều luồng) và chạy song song với bước xử lý; chỉ tải file của phần (shard) mình.
- Mỗi file có timeout (pebble giết tiến trình treo); quá giờ thì vẫn lấy văn bản, bỏ bảng.
- Mỗi patch xong là ghi lên Drive (MyDrive/uelcourses/results_v5/patch_NNN.jsonl): runtime bị ngắt vẫn chạy tiếp được.
- Chia việc cho nhiều notebook chạy cùng lúc: NUM_SHARDS / SHARD.
- Ghi thời gian từng file, tốc độ và thời gian còn lại sau mỗi patch.
Mã trích một file nằm ở colab/outline_worker.py (nhúng vào notebook). Chạy: python colab/build_notebook_v5.py
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
MANIFEST = ROOT / "data" / "outlines_upload_manifest.json"
OUT = HERE / "outline_extract_v5.ipynb"
WORKER_SRC = (HERE / "outline_worker.py").read_text(encoding="utf-8")

names = [o["file"] for o in json.loads(MANIFEST.read_text(encoding="utf-8"))]
PDF_FOLDER_ID = "1v-oPVegihpSGMZABVTaGaTiv_BNxnEdF"     # MyDrive/uelcourses/pdfs
PARENT_ID = "1bCgZwx-7EVwcLM-Sfo8tfuMHQSCvIPQw"          # MyDrive/uelcourses


def code(src: str) -> dict:
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [],
            "source": src.strip("\n").splitlines(keepends=True)}


def md(src: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": src.strip("\n").splitlines(keepends=True)}


CONFIG = r'''
# ==== CẤU HÌNH ====
SHARD = 0            # notebook này làm phần số mấy (0 .. NUM_SHARDS-1)
NUM_SHARDS = 1       # chạy song song: đặt 2 hoặc 3, mở thêm bản sao notebook với SHARD = 1, 2
PATCH = 40           # số file mỗi patch (mỗi patch xong là ghi lên Drive)
FILE_TIMEOUT = 300   # giây/file; quá thì chỉ lấy văn bản, bỏ bảng
DL_THREADS = 8       # số luồng tải PDF từ Drive
OCR_DPI = 200        # độ phân giải OCR cho trang scan
PDF_FOLDER_ID = "__PDF__"   # MyDrive/uelcourses/pdfs
PARENT_ID = "__PARENT__"    # MyDrive/uelcourses
assert 0 <= SHARD < NUM_SHARDS
'''.replace("__PDF__", PDF_FOLDER_ID).replace("__PARENT__", PARENT_ID)

SETUP = r'''
import subprocess, os, glob
# pymupdf 2.1 giống máy local (kéo theo pymupdf-layout + onnxruntime cho bước dò bảng dự phòng); pebble: timeout từng file.
subprocess.run("pip -q install pymupdf==2.1 pebble", shell=True, check=True)
OCR_OK = False
r = subprocess.run("apt-get -qq install -y tesseract-ocr tesseract-ocr-vie > /dev/null 2>&1", shell=True)
tess = glob.glob('/usr/share/tesseract-ocr/*/tessdata/vie.traineddata') + glob.glob('/usr/share/tesseract-ocr/tessdata/vie.traineddata')
if tess:
    os.environ['TESSDATA_PREFIX'] = os.path.dirname(tess[0])
    OCR_OK = True
print('OCR tiếng Việt:', 'có' if OCR_OK else 'không', '| CPU:', os.cpu_count())
'''

DRIVE = r'''
from google.colab import auth
auth.authenticate_user()
import io, json, time, threading
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaFileUpload

_tl = threading.local()
def svc():  # httplib2 không an toàn đa luồng: mỗi luồng một client
    if not hasattr(_tl, 's'):
        _tl.s = build('drive', 'v3', cache_discovery=False)
    return _tl.s

def list_folder(folder_id):
    out, page = {}, None
    while True:
        r = svc().files().list(q=f"'{folder_id}' in parents and trashed = false",
                               fields='nextPageToken, files(id, name, size)', pageSize=1000, pageToken=page).execute(num_retries=5)
        for f in r.get('files', []):
            out[f['name']] = f
        page = r.get('nextPageToken')
        if not page:
            return out

def ensure_folder(name, parent):
    q = (f"name = '{name}' and '{parent}' in parents and trashed = false "
         "and mimeType = 'application/vnd.google-apps.folder'")
    r = svc().files().list(q=q, fields='files(id)').execute(num_retries=5)
    if r['files']:
        return r['files'][0]['id']
    body = {'name': name, 'parents': [parent], 'mimeType': 'application/vnd.google-apps.folder'}
    return svc().files().create(body=body, fields='id').execute(num_retries=5)['id']

def download(file_id, dst, size):
    if os.path.exists(dst) and os.path.getsize(dst) == size:
        return False
    tmp = dst + '.part'
    with io.FileIO(tmp, 'wb') as fh:
        dl = MediaIoBaseDownload(fh, svc().files().get_media(fileId=file_id), chunksize=16 * 1024 * 1024)
        done = False
        while not done:
            _, done = dl.next_chunk(num_retries=5)
    os.replace(tmp, dst)
    return True

def put_file(local, name, folder_id, existing_id=None):
    media = MediaFileUpload(local, mimetype='application/octet-stream', resumable=False)
    if existing_id:
        return svc().files().update(fileId=existing_id, media_body=media, fields='id').execute(num_retries=5)['id']
    return svc().files().create(body={'name': name, 'parents': [folder_id]}, media_body=media,
                                fields='id').execute(num_retries=5)['id']

PDF_DIR, RES_DIR = '/content/pdfs', '/content/results_v5'
os.makedirs(PDF_DIR, exist_ok=True)
os.makedirs(RES_DIR, exist_ok=True)
listing = list_folder(PDF_FOLDER_ID)
RESULTS_ID = ensure_folder('results_v5', PARENT_ID)
missing_on_drive = [n for n in EXPECTED if n not in listing]
print('PDF trên Drive:', len(listing), '| mong đợi:', len(EXPECTED), '| thiếu:', len(missing_on_drive))
for n in missing_on_drive[:20]:
    print('  thiếu:', n)
'''

RUN = r'''
import sys
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FTimeout
from pebble import ProcessPool
sys.path.insert(0, '/content')
import outline_worker as W

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

patches = [EXPECTED[i:i + PATCH] for i in range(0, len(EXPECTED), PATCH)]
mine = [pi for pi in range(len(patches)) if pi % NUM_SHARDS == SHARD]

# Chạy tiếp: lấy các patch đã ghi lên Drive (từ lần chạy trước, kể cả runtime khác).
remote = list_folder(RESULTS_ID)
for pi in mine:
    name = f'patch_{pi:03d}.jsonl'
    if name in remote and not os.path.exists(f'{RES_DIR}/{name}'):
        download(remote[name]['id'], f'{RES_DIR}/{name}', int(remote[name].get('size', -1)))

need = [n for pi in mine for n in patches[pi]
        if n in listing and n not in load_ok(f'{RES_DIR}/patch_{pi:03d}.jsonl')]
print(f'shard {SHARD}/{NUM_SHARDS}: {len(mine)} patch, cần xử lý {len(need)} file')

# Tải song song, theo thứ tự patch -> bước xử lý chạy ngay khi patch đầu tải xong.
dl_pool = ThreadPoolExecutor(DL_THREADS)
dl = {n: dl_pool.submit(download, listing[n]['id'], f'{PDF_DIR}/{n}', int(listing[n].get('size', -1))) for n in need}

WORKERS = max(1, os.cpu_count() or 2)
T0 = time.time()
n_done = 0
slow = []
with ProcessPool(max_workers=WORKERS, max_tasks=200) as pool:
    for k, pi in enumerate(mine, 1):
        name = f'patch_{pi:03d}.jsonl'
        out_path = f'{RES_DIR}/{name}'
        results = load_ok(out_path)
        todo = [n for n in patches[pi] if n in listing and n not in results]
        if not todo:
            if name not in remote and os.path.exists(out_path):
                remote[name] = {'id': put_file(out_path, name, RESULTS_ID)}
            continue
        t_patch = time.time()
        n_err = n_to = 0
        futs = {}
        for n in todo:
            try:
                dl[n].result()
            except Exception as e:
                results[n] = {'file': n, 'error': f'download {type(e).__name__}: {e}'[:300]}
                n_err += 1
                continue
            futs[n] = pool.schedule(W.extract_one, args=[f'{PDF_DIR}/{n}'],
                                    kwargs={'ocr': OCR_OK, 'ocr_dpi': OCR_DPI}, timeout=FILE_TIMEOUT)
        for n, f in futs.items():
            try:
                results[n] = f.result()
            except FTimeout:
                n_to += 1
                try:  # vẫn giữ văn bản, bỏ bảng
                    rec = pool.schedule(W.extract_one, args=[f'{PDF_DIR}/{n}'],
                                        kwargs={'with_tables': False, 'ocr': OCR_OK, 'ocr_dpi': OCR_DPI}, timeout=180).result()
                    rec['tables_timeout'] = True
                    results[n] = rec
                except Exception as e:
                    results[n] = {'file': n, 'error': f'timeout, text-only failed: {type(e).__name__}: {e}'[:300]}
                    n_err += 1
            except Exception as e:
                results[n] = {'file': n, 'error': f'{type(e).__name__}: {e}'[:300]}
                n_err += 1
        tmp = out_path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as out:
            for n in patches[pi]:
                if n in results:
                    out.write(json.dumps(results[n], ensure_ascii=False) + '\n')
        os.replace(tmp, out_path)
        remote[name] = {'id': put_file(out_path, name, RESULTS_ID, (remote.get(name) or {}).get('id'))}
        n_done += len(todo)
        slow += [(r.get('sec', 0), n) for n, r in results.items() if n in futs and 'sec' in r]
        el = time.time() - T0
        rate = n_done / el * 60
        left = (len(need) - n_done) / max(rate, 1e-6)
        print(f'patch {k}/{len(mine)} (#{pi}): {len(todo)} file trong {time.time() - t_patch:.0f}s, lỗi {n_err}, timeout {n_to} '
              f'| tổng {el / 60:.1f} phút, {rate:.1f} file/phút, còn ~{left:.0f} phút', flush=True)
dl_pool.shutdown()
print('XONG shard', SHARD, '| file chậm nhất:', sorted(slow, reverse=True)[:8])
'''

MERGE = r'''
# Chạy SAU KHI mọi shard đã xong (ở bất kỳ notebook nào): gom mọi patch trên Drive -> outline_results.jsonl
remote = list_folder(RESULTS_ID)
merged, recs = '/content/outline_results.jsonl', {}
for name in sorted(n for n in remote if n.startswith('patch_') and n.endswith('.jsonl')):
    p = f'{RES_DIR}/{name}'
    download(remote[name]['id'], p, int(remote[name].get('size', -1)))
    with open(p, encoding='utf-8') as f:
        for line in f:
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            recs[rec['file']] = rec
ok = sum(1 for r in recs.values() if 'error' not in r)
err = [n for n, r in recs.items() if 'error' in r]
absent = [n for n in EXPECTED if n not in recs]
with open(merged, 'w', encoding='utf-8') as out:
    for n in EXPECTED:
        if n in recs:
            out.write(json.dumps(recs[n], ensure_ascii=False) + '\n')
print(f'bản ghi: {len(recs)} | thành công: {ok} | lỗi: {len(err)} | chưa xử lý: {len(absent)} / {len(EXPECTED)}')
print('timeout bảng:', sum(1 for r in recs.values() if r.get('tables_timeout')), '| trang OCR:', sum(r.get('ocr_pages', 0) for r in recs.values()))
if absent:
    print('CHƯA ĐỦ: chạy lại shard còn thiếu rồi gộp lại. Ví dụ:', absent[:5])
existing = list_folder(PARENT_ID).get('outline_results.jsonl')
fid = put_file(merged, 'outline_results.jsonl', PARENT_ID, existing and existing['id'])
print('đã ghi MyDrive/uelcourses/outline_results.jsonl, id:', fid)
'''

cells = [
    md(f"""
# UELCourses: trích văn bản và bảng từ {len(names)} PDF đề cương (v5, tối ưu tốc độ)

**Runtime: CPU** (Thời gian chạy → Thay đổi loại thời gian chạy → CPU). GPU/TPU không giúp gì: PyMuPDF và Tesseract chỉ chạy CPU.

Cách chạy: **Thời gian chạy → Chạy tất cả**, cho phép truy cập Google Drive khi được hỏi.
- Mỗi patch {40} file xong là ghi lên `MyDrive/uelcourses/results_v5/`. Bị ngắt kết nối thì chỉ cần *Chạy tất cả* lại: phần đã xong được bỏ qua.
- Muốn nhanh hơn: đặt `NUM_SHARDS = 2` (hoặc 3) ở ô cấu hình, rồi *Tệp → Lưu bản sao trong Drive* và đặt `SHARD = 1` (2) ở bản sao; chạy các bản cùng lúc.
- Ô cuối gộp mọi patch thành `MyDrive/uelcourses/outline_results.jsonl` (chạy khi mọi shard đã xong).

Nạp vào DB trên máy: tải `outline_results.jsonl` về `data/raw/colab/`, rồi trong `api/`:
`python -m app.cli import-colab-outlines --file ..\\data\\raw\\colab\\outline_results.jsonl --data-dir ..\\data`
"""),
    code(CONFIG),
    code("EXPECTED = " + json.dumps(names, ensure_ascii=False, indent=0)),
    code(SETUP),
    code("%%writefile /content/outline_worker.py\n" + WORKER_SRC),
    code(DRIVE),
    code(RUN),
    code(MERGE),
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
