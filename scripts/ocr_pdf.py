"""OCR PDF/ảnh tiếng Việt bằng Tesseract (vie) -> text có đánh dấu trang.

Dùng:  api\\.venv\\Scripts\\python.exe -X utf8 scripts/ocr_pdf.py <đầu_vào.pdf|thư_mục_ảnh> [--out data/processed/ocr_text] [--pages 1-5]
Yêu cầu: Tesseract (C:\\Program Files\\Tesseract-OCR) + dữ liệu vie ở data/tessdata (TESSDATA_PREFIX tự đặt).
Chỉ đọc đầu vào; ghi <out>/<tên>.txt (dạng '=== Trang N ===') và <out>/<tên>.ocr.json (độ tin cậy từng trang).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import fitz  # pymupdf

ROOT = Path(__file__).resolve().parents[1]
TESS = os.environ.get("TESSERACT_EXE", r"C:\Program Files\Tesseract-OCR\tesseract.exe")
TESSDATA = os.environ.get("TESSDATA_PREFIX", str(ROOT / "data" / "tessdata"))


def ocr_png(png: Path) -> tuple[str, float]:
    env = dict(os.environ, TESSDATA_PREFIX=TESSDATA)
    txt = subprocess.run([TESS, str(png), "stdout", "-l", "vie", "--psm", "4", "--oem", "1"],
                         capture_output=True, env=env, check=True).stdout.decode("utf-8", "replace")
    return txt.strip(), 0.0  # Tesseract CLI không trả độ tin cậy gọn; kiểm tay các trang quan trọng


def page_images(src: Path, pages: set[int] | None, dpi: int, tmp: Path):
    if src.is_dir():
        for i, p in enumerate(sorted(x for x in src.iterdir() if x.suffix.lower() in (".png", ".jpg", ".jpeg")), 1):
            if not pages or i in pages:
                yield i, p
        return
    doc = fitz.open(src)
    for i, page in enumerate(doc, 1):
        if pages and i not in pages:
            continue
        out = tmp / f"p{i:04d}.png"
        page.get_pixmap(dpi=dpi).save(out)
        yield i, out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "processed" / "ocr_text")
    ap.add_argument("--pages", default=None, help="vd. 1-5 hoặc 3,7")
    ap.add_argument("--dpi", type=int, default=300)
    a = ap.parse_args()
    pages: set[int] | None = None
    if a.pages:
        pages = set()
        for part in a.pages.split(","):
            lo, _, hi = part.partition("-")
            pages.update(range(int(lo), int(hi or lo) + 1))
    a.out.mkdir(parents=True, exist_ok=True)
    name = a.src.stem if a.src.is_file() else a.src.name
    chunks, stats = [], []
    with tempfile.TemporaryDirectory() as td:
        for i, png in page_images(a.src, pages, a.dpi, Path(td)):
            text, conf = ocr_png(png)
            chunks.append(f"\n\n=== Trang {i} ===\n{text}")
            stats.append({"page": i, "chars": len(text), "conf": round(conf, 1)})
            print(f"{name} tr.{i}: {len(text)} ký tự, tin cậy {conf:.0f}", flush=True)
    (a.out / f"{name}.txt").write_text("".join(chunks), encoding="utf-8")
    (a.out / f"{name}.ocr.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
