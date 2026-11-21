"""Chép classify_table từ api/app/services/outline_parse.py sang colab/outline_worker.py (worker Colab phải chạy độc lập,
không import được mã API). Chạy sau mỗi lần sửa luật nhận dạng bảng: python colab/sync_worker.py
tests/test_outline_worker_sync.py kiểm tra hai bản cho cùng kết quả."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
api = (ROOT / "api" / "app" / "services" / "outline_parse.py").read_text(encoding="utf-8")
worker_path = ROOT / "colab" / "outline_worker.py"
worker = worker_path.read_text(encoding="utf-8")

src = re.search(r"^def classify_table\(.*?(?=^\S)", api, re.M | re.S).group(0).rstrip() + "\n"
src = src.replace("def classify_table(header: list[str]) -> str | None:",
                  'def classify_table(header: list) -> str | None:\n    """Bản sao TỰ ĐỘNG của outline_parse.classify_table (colab/sync_worker.py)."""')
new = re.sub(r"^def classify_table\(.*?(?=^def page_tables)", src + "\n\n", worker, flags=re.M | re.S)
if "def fold_ns(" not in new:
    new = new.replace("\n\ndef clean(", '\n\ndef fold_ns(s: str) -> str:\n    return fold(s or "").replace(" ", "")\n\n\ndef clean(', 1)
worker_path.write_text(new, encoding="utf-8")
print("đã đồng bộ classify_table ->", worker_path)
