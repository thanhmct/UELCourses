"""Tải đề cương CTĐT 2023 (áp dụng K23, K24) theo data/outlines_master/ctdt2023_links.csv.

Quy tắc chủ dự án: mỗi mã môn chọn MỘT link: ưu tiên Google Docs/.doc/.docx hơn PDF; trong cùng loại ưu tiên
cột 'Link đề cương cập nhật' (cột sau cùng) hơn 'hiện tại'. Lớp E / Coop có mã riêng thì lấy link cột lớp E cho mã đó.
File nào bị chặn quyền (đăng nhập / 401 / 403) -> ghi 'chan-quyen' vào manifest để chủ dự án tự tải tay.
Chạy chậm: 1 luồng, nghỉ 1,5–3,5 giây, nghỉ dài sau mỗi 60 yêu cầu, dừng khi 429. Chạy lại được (bỏ qua file đã ok).
Kết quả: data/outlines_master/ctdt2023/{docs,pdf}/ + manifest_ctdt2023.csv
"""
import argparse, csv, hashlib, os, random, re, sys, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, "data", "outlines_master")
OUT = os.path.join(BASE, "ctdt2023")
UA = {"User-Agent": "Mozilla/5.0 (UELPATH research fetcher)"}
RANK_KIND = {"gdoc": 0, "word": 0, "drive-file?": 1, "pdf": 2}


def file_id(u):
    m = re.search(r"/d/([\w-]+)", u) or re.search(r"[?&]id=([\w-]+)", u)
    return m.group(1) if m else ""


def choose():
    rows = list(csv.DictReader(open(os.path.join(BASE, "ctdt2023_links.csv"), encoding="utf-8-sig")))
    best = {}
    for r in rows:
        for variant, code_key in (("chuan", "ma_mon"), ("E", "ma_mon_E_coop")):
            code = r.get(code_key, "").strip()
            if not code or not re.match(r"^[A-Z0-9]{5,8}$", code):
                continue
            for upd in ("capnhat", "hientai"):
                u = r.get(f"{variant}_{upd}_url", "")
                kind = r.get(f"{variant}_{upd}_loai", "")
                if not u or kind not in RANK_KIND or not file_id(u):
                    continue
                rank = (RANK_KIND[kind], 0 if upd == "capnhat" else 1)
                if code not in best or rank < best[code][0]:
                    best[code] = (rank, u, kind, upd, r["file"])
    return [(c, v[1], v[2], v[3], v[4]) for c, v in sorted(best.items())]


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
        return r.read(), r.headers.get("Content-Type", ""), r.headers.get("Content-Disposition", ""), r.geturl()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--codes", nargs="+", help="Chỉ tải các mã học phần này (vd EBB1067 EEE5017)")
    a = ap.parse_args()
    os.makedirs(os.path.join(OUT, "docs"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "pdf"), exist_ok=True)
    todo = choose()
    if a.codes:
        wanted = {c.strip().upper() for c in a.codes}
        todo = [item for item in todo if item[0].upper() in wanted]
    mp = os.path.join(BASE, "manifest_ctdt2023.csv")
    done = set()
    if os.path.exists(mp):
        done = {r["code"] for r in csv.DictReader(open(mp, encoding="utf-8")) if r["status"] == "ok"}
    todo = [t for t in todo if t[0] not in done]
    print(f"can tai: {len(todo)} ma mon", flush=True)
    new = not os.path.exists(mp)
    mf = open(mp, "a", encoding="utf-8", newline="")
    w = csv.writer(mf)
    if new:
        w.writerow(["code", "link_kind", "which", "source_file", "id", "status", "bytes", "sha256", "file", "url"])
    fails = 0
    for i, (code, url, kind, which, src) in enumerate(todo, 1):
        fid = file_id(url)
        status, fn, data = "loi", "", b""
        try:
            if kind == "gdoc":
                data, ct, cd, final = get(f"https://docs.google.com/document/d/{fid}/export?format=docx")
                ext = "docx"
            else:
                data, ct, cd, final = get(f"https://drive.google.com/uc?export=download&id={fid}")
                ext = "pdf" if data[:4] == b"%PDF" else ("docx" if data[:4] == b"PK\x03\x04" else ("doc" if data[:4] == b"\xd0\xcf\x11\xe0" else "bin"))
            blocked = "accounts.google.com" in final or ("text/html" in ct)
            if blocked or ext == "bin" or len(data) < 1500:
                status = "chan-quyen" if blocked else "khong-phai-file"
            else:
                status = "ok"
                sub = "docs" if ext in ("docx", "doc") else "pdf"
                fn = f"{code}__{fid}.{ext}"
                open(os.path.join(OUT, sub, fn), "wb").write(data)
            fails = 0 if status == "ok" else fails
        except urllib.error.HTTPError as e:
            status = "chan-quyen" if e.code in (401, 403, 404) and e.code != 429 else f"http-{e.code}"
            if e.code == 429:
                w.writerow([code, kind, which, src, fid, "http-429", 0, "", "", url]); mf.flush()
                print("DUNG: 429", flush=True)
                break
        except Exception as e:  # noqa: BLE001
            status = "loi:" + str(e)[:60]
            fails += 1
        w.writerow([code, kind, which, src, fid, status, len(data), hashlib.sha256(data).hexdigest() if status == "ok" else "", fn, url])
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
