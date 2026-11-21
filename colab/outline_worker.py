"""Trích văn bản + bảng thô từ MỘT PDF đề cương; dùng trong notebook Colab v5 (được nhúng vào /content/outline_worker.py).

Đầu ra khớp với api/app/services/outline_colab.py (import-colab-outlines):
  {"file", "pages", "ocr_pages", "table_pages", "sec", "text", "tables": [{"page", "rows"} | {"page", "error"}]}

Cách dò bảng giống api/app/services/outline_parse.py (page_tables): PyMuPDF >= 2.x mặc định chạy mô hình layout ONNX
(~14 giây nạp + vài giây/trang). Ở đây dò theo đường kẻ trước (use_layout=False), chỉ chạy lại với layout cho trang có bảng
mới thấy dòng tiêu đề. Chạy thử: python colab/outline_worker.py file1.pdf [file2.pdf ...]
"""
import os
import re
import sys
import time
import unicodedata

for _k in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):  # trước khi numpy được nạp
    os.environ.setdefault(_k, "1")

import pymupdf  # noqa: E402

try:  # mô hình layout ONNX mặc định dùng mọi lõi -> ép 1 luồng (mỗi worker là một tiến trình riêng)
    import onnxruntime as _ort

    _BaseSO = _ort.SessionOptions

    def _one_thread_options():
        so = _BaseSO()
        so.intra_op_num_threads = 1
        so.inter_op_num_threads = 1
        return so

    _ort.SessionOptions = _one_thread_options
except ImportError:
    pass

KEYS = ("clo", "cdr", "tuan", "week", "buoi", "trong so", "weight", "muc tieu", "objective")


def fold(s: str) -> str:
    s = s.replace("đ", "d").replace("Đ", "D")
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return " ".join(s.lower().split())


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("​", "")).strip()


def classify_table(header: list) -> str | None:
    """Bản sao classify_table trong api/app/services/outline_parse.py (giữ đồng bộ)."""
    h = fold(" ".join(header)).replace(" ", "")
    if (("muctieu" in h or "objective" in h) and ("clo" in h or "cdr" in h) and ("mota" in h or "description" in h)) or (
        "cox" in h and "clox" in h
    ):
        return "objectives"
    if ("motacdr" in h or "motachuandaura" in h) or ("cdr" in h and ("mucdogiangday" in h or "teachinglevel" in h)) or (
        "clox" in h and "cox" not in h and ("teachinglevel" in h or "description" in h)
    ):
        return "clos"
    if "thanhphandanhgia" in h or ("baidanhgia" in h and "trongso" in h) or ("assessment" in h and "weight" in h):
        return "assessments"
    if ("tuan" in h or "week" in h or "buoi" in h) and ("noidung" in h or "content" in h):
        return "schedule"
    return None


def page_tables(page) -> list:
    try:
        tabs = page.find_tables(use_layout=False).tables
    except TypeError:  # PyMuPDF cũ: không có use_layout (và không có mô hình layout)
        return page.find_tables().tables

    def cell_text(c) -> str:
        return clean(page.get_text("text", clip=pymupdf.Rect(c), sort=True)) if c else ""

    def wanted_but_empty(t) -> bool:
        # Giống outline_parse.page_tables: bảng cần lấy mà thân gần như rỗng -> thử lại với layout.
        if not t.rows or len(t.rows) > 4 or classify_table([cell_text(c) for c in t.rows[0].cells]) is None:
            return False
        body = t.rows[1:]
        return sum(1 for r in body for c in r.cells if cell_text(c)) <= len(body)

    if any(wanted_but_empty(t) for t in tabs):
        try:
            alt = page.find_tables().tables
        except Exception:  # noqa: BLE001
            alt = []
        if sum(len(t.rows) for t in alt) > sum(len(t.rows) for t in tabs):
            return alt
    return tabs


def extract_one(path: str, with_tables: bool = True, ocr: bool = False, ocr_dpi: int = 200) -> dict:
    t0 = time.time()
    doc = pymupdf.open(path)
    pages_text, tables, ocr_pages, table_pages = [], [], 0, 0
    try:
        for pno, page in enumerate(doc, 1):
            plain = page.get_text("text")
            txt = page.get_text("text", sort=True)
            if ocr and len(txt.strip()) < 30:  # trang scan: OCR tiếng Việt
                try:
                    tp = page.get_textpage_ocr(language="vie", dpi=ocr_dpi, full=True)
                    txt = page.get_text("text", sort=True, textpage=tp)
                    ocr_pages += 1
                except Exception:  # noqa: BLE001
                    pass
            pages_text.append(txt)
            if not with_tables or not any(k in fold(plain) for k in KEYS):
                continue
            table_pages += 1
            try:
                for t in page_tables(page):
                    rows = [[page.get_text("text", clip=pymupdf.Rect(c), sort=True).strip() if c else "" for c in row.cells]
                            for row in t.rows]
                    if rows:
                        tables.append({"page": pno, "rows": rows})
            except Exception as e:  # noqa: BLE001
                tables.append({"page": pno, "error": f"{type(e).__name__}: {e}"[:200]})
        return {"file": os.path.basename(path), "pages": len(doc), "ocr_pages": ocr_pages, "table_pages": table_pages,
                "sec": round(time.time() - t0, 1), "text": "\n\f".join(pages_text), "tables": tables}
    finally:
        doc.close()


if __name__ == "__main__":
    import json
    for p in sys.argv[1:]:
        r = extract_one(p)
        print(json.dumps({k: r[k] for k in ("file", "pages", "table_pages", "sec")} | {"tables": len(r["tables"])}))
