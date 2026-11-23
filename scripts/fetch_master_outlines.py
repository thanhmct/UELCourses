"""Tải đề cương trong Master_data.xlsx (Sheet1, cột 'Link đề cương') còn thiếu so với DB.

- Google Docs  -> xuất .docx (có văn bản, không cần OCR)
- Drive file   -> tải nguyên file (thường là PDF)
Chạy chậm, 1 luồng, nghỉ ngẫu nhiên 1,5–3,5 giây, nghỉ dài sau mỗi 60 yêu cầu, dừng khi gặp 403/429.
Có thể chạy lại: bỏ qua file đã tải. Kết quả: data/outlines_master/ + manifest.csv.
Không lưu token/cookie; chỉ dùng link công khai ghi trong Master_data.

Dùng:  api\\.venv\\Scripts\\python.exe -X utf8 scripts\\fetch_master_outlines.py [--limit N] [--only docs|pdf]
Cần file data/outlines_master/db_known_ids.txt (mỗi dòng 1 ID Drive/Docs đã có file trong DB); nếu thiếu thì tải tất cả.
"""
import argparse, csv, hashlib, os, random, re, sys, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "outlines_master")
UA = {"User-Agent": "Mozilla/5.0 (UELPATH research fetcher)"}


def load_links():
    import openpyxl
    wb = openpyxl.load_workbook(os.path.join(ROOT, "data", "raw", "Master_data.xlsx"), data_only=True)
    ws = wb["Sheet1"]
    out = []
    for row in ws.iter_rows(min_row=2):
        c = row[18]
        u = str((c.hyperlink.target if c.hyperlink else None) or c.value or "")
        m = re.match(r"https://(?:docs|drive)\.google\.com/(document|file)/d/([\w-]+)", u)
        if m:
            out.append((str(row[0].value), "docs" if m.group(1) == "document" else "pdf", m.group(2)))
    return out


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read(), r.headers.get("Content-Type", ""), r.headers.get("Content-Disposition", "")


def fetch_pdf(fid):
    data, ct, cd = get(f"https://drive.google.com/uc?export=download&id={fid}")
    if "text/html" in ct:  # trang cảnh báo quét virus: lấy liên kết xác nhận
        html = data.decode("utf-8", "ignore")
        m = re.search(r'action="([^"]+)"', html)
        params = dict(re.findall(r'name="(id|export|confirm|uuid)" value="([^"]*)"', html))
        if m and params:
            q = "&".join(f"{k}={v}" for k, v in params.items())
            data, ct, cd = get(m.group(1).replace("&amp;", "&") + "?" + q)
    return data, ct


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", choices=["docs", "pdf"])
    ap.add_argument("--codes", nargs="+", help="Chỉ tải các mã học phần này (vd EBB1067 EEE5017)")
    a = ap.parse_args()
    os.makedirs(os.path.join(OUT, "docs"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "pdf"), exist_ok=True)
    known = set()
    kp = os.path.join(OUT, "db_known_ids.txt")
    if os.path.exists(kp):
        known = {l.strip() for l in open(kp, encoding="utf-8") if l.strip()}
    todo, seen = [], set()
    wanted = {c.strip().upper() for c in a.codes} if a.codes else None
    for code, kind, fid in load_links():
        if wanted and code.strip().upper() not in wanted:
            continue
        if fid in known or fid in seen or (a.only and kind != a.only):
            continue
        seen.add(fid)
        todo.append((code, kind, fid))
    mp = os.path.join(OUT, "manifest.csv")
    done_ids = set()
    if os.path.exists(mp):
        done_ids = {r["id"] for r in csv.DictReader(open(mp, encoding="utf-8")) if r["status"] == "ok"}
    todo = [t for t in todo if t[2] not in done_ids]
    if a.limit:
        todo = todo[: a.limit]
    print(f"can tai: {len(todo)}", flush=True)
    new = not os.path.exists(mp)
    mf = open(mp, "a", encoding="utf-8", newline="")
    w = csv.writer(mf)
    if new:
        w.writerow(["code", "kind", "id", "status", "bytes", "sha256", "file", "note"])
    fails = 0
    for i, (code, kind, fid) in enumerate(todo, 1):
        try:
            if kind == "docs":
                data, ct, _ = get(f"https://docs.google.com/document/d/{fid}/export?format=docx")
                ext = "docx"
            else:
                data, ct = fetch_pdf(fid)
                ext = "pdf" if data[:4] == b"%PDF" else ("docx" if data[:2] == b"PK" else "bin")
            ok = len(data) > 2000 and "text/html" not in ct
            fn = f"{code}__{fid}.{ext}"
            if ok:
                open(os.path.join(OUT, kind, fn), "wb").write(data)
            w.writerow([code, kind, fid, "ok" if ok else "khong-phai-file", len(data), hashlib.sha256(data).hexdigest() if ok else "", fn if ok else "", ct])
            fails = 0 if ok else fails + 1
        except urllib.error.HTTPError as e:
            w.writerow([code, kind, fid, f"http-{e.code}", 0, "", "", ""])
            mf.flush()
            if e.code in (403, 429):
                print(f"DUNG: HTTP {e.code} tai {code}", flush=True)
                break
            fails += 1
        except Exception as e:  # noqa: BLE001
            w.writerow([code, kind, fid, "loi", 0, "", "", str(e)[:120]])
            fails += 1
        mf.flush()
        if fails >= 8:
            print("DUNG: 8 loi lien tiep", flush=True)
            break
        if i % 25 == 0:
            print(f"{i}/{len(todo)}", flush=True)
        time.sleep(random.uniform(1.5, 3.5))
        if i % 60 == 0:
            time.sleep(random.uniform(45, 75))
    mf.close()
    print("xong", flush=True)


if __name__ == "__main__":
    sys.exit(main())
