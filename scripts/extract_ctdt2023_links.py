"""Trích danh sách môn + link đề cương từ 17 Excel CTĐT 2023 (thư mục Drive của Khoa) -> CSV.

Mỗi dòng Excel = một môn của một ngành. Cột link: 'Link đề cương hiện tại' / 'Link đề cương cập nhật' cho lớp chuẩn,
và bản '(lớp E)' tương ứng. Quy tắc ưu tiên của chủ dự án: link 'cập nhật' (cột sau cùng) hơn 'hiện tại'; Google Docs/.doc/.docx hơn PDF.
Kết quả: data/outlines_master/ctdt2023_links.csv  (UTF-8, có BOM để Excel mở đúng)
"""
import csv, glob, os, re
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "outlines_master", "ctdt2023_excel")
OUT = os.path.join(ROOT, "data", "outlines_master", "ctdt2023_links.csv")


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def url_of(c):
    t = c.hyperlink.target if c.hyperlink else None
    v = str(c.value or "")
    u = t or (v if v.startswith("http") else "")
    return u.strip()


def kind_of(u, text):
    if not u:
        return ""
    if "docs.google.com/document" in u:
        return "gdoc"
    ext = os.path.splitext(str(text or "").lower())[1]
    if ext in (".doc", ".docx"):
        return "word"
    if ext == ".pdf":
        return "pdf"
    if "drive.google.com/file" in u:
        return "drive-file?"
    if "drive.google.com/drive" in u:
        return "folder"
    return "other"


def main():
    rows = []
    for p in sorted(glob.glob(os.path.join(SRC, "*.xlsx"))):
        wb = openpyxl.load_workbook(p, data_only=True)
        ws = wb.worksheets[0]
        hrow = 1
        for ri in range(1, 6):
            cand = [norm(c.value) for c in next(ws.iter_rows(min_row=ri, max_row=ri))]
            if any(h.startswith("mã") for h in cand) and any(h.startswith("link đề c") for h in cand):
                hrow = ri
                break
        hdr = [norm(c.value) for c in next(ws.iter_rows(min_row=hrow, max_row=hrow))]
        def col(pred):
            return [i for i, h in enumerate(hdr) if pred(h)]
        c_code = [i for i in col(lambda h: re.match(r"^(mã môn( lớp chuẩn| chuẩn)?|mã hp)$", h))]
        c_e = col(lambda h: "mã môn lớp e" in h or "mã môn coop" in h or h == "mã coop")
        c_name = col(lambda h: h.startswith("tên môn") or h == "tên hp")
        c_bm = col(lambda h: h == "tên bm" or h.startswith("khoa chủ quản"))
        c_hk = col(lambda h: h.startswith("học kỳ k"))
        c_major = col(lambda h: h == "mã ngành")
        c_tc = col(lambda h: h == "số tc")
        c_req = col(lambda h: h.startswith("bắt buộc"))
        # Cột link theo THỨ TỰ: [hiện tại, cập nhật] lớp chuẩn rồi [hiện tại, cập nhật] lớp E (bỏ qua Pearson)
        raw_links = [(i, h) for i, h in enumerate(hdr) if re.match(r"^link\b", h) and "pearson" not in h]
        links = []
        n_cur_seen = 0
        for i, h in raw_links:
            upd = bool(re.search(r"cập nhật|cường cập|link cập", h))
            e_flag = bool(re.search(r"lớp e|\(e\)", h)) or h.endswith("(lớp")
            if not upd:
                n_cur_seen += 1
            if not e_flag and n_cur_seen >= 2 and not any(x in h for x in ("chuẩn", "chuan")):
                e_flag = True  # cặp link thứ hai = lớp E / Coop
            links.append((i, h, e_flag, upd))
        if not c_code or not links:
            print("BO QUA (khong thay cot):", os.path.basename(p), hdr[:14])
            continue
        for r in ws.iter_rows(min_row=hrow + 1):
            code = str(r[c_code[0]].value or "").strip()
            if not re.match(r"^[A-Z]{3}\d{3,4}$|^[A-Z]{3,5}\d{2,4}[A-Z]?$", code):
                continue
            rec = {
                "file": os.path.basename(p),
                "ma_mon": code,
                "ma_mon_E_coop": (str(r[c_e[0]].value or "").strip() if c_e else "") or next((str(x.value).strip() for x in r[:9] if isinstance(x.value, str) and re.match(r"^[EH][A-Z]{2}[A-Z0-9]\d{3}$", x.value.strip()) and x.value.strip() != code), ""),
                "ten_mon": str(r[c_name[0]].value or "").strip() if c_name else "",
                "ten_bm": str(r[c_bm[0]].value or "").strip() if c_bm else "",
                "bat_buoc": str(r[c_req[0]].value or "").strip() if c_req else "",
                "tin_chi": str(r[c_tc[0]].value or "").strip() if c_tc else "",
                "hk": ";".join(f"{hdr[i]}={r[i].value}" for i in c_hk if r[i].value),
            }
            for i, h, is_e, upd in links:
                key = ("E_" if is_e else "chuan_") + ("capnhat" if upd else "hientai")
                u = url_of(r[i])
                rec[key + "_url"] = u
                rec[key + "_ten"] = str(r[i].value or "").strip()[:80] if not str(r[i].value or "").startswith("http") else ""
                rec[key + "_loai"] = kind_of(u, rec[key + "_ten"])
            rows.append(rec)
    keys = ["file", "ma_mon", "ma_mon_E_coop", "ten_mon", "ten_bm", "bat_buoc", "tin_chi", "hk"]
    for pre in ("chuan_", "E_"):
        for k in ("capnhat", "hientai"):
            keys += [f"{pre}{k}_url", f"{pre}{k}_ten", f"{pre}{k}_loai"]
    with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print("dong:", len(rows), "->", OUT)


if __name__ == "__main__":
    main()
