"""Điền tên tiếng Anh cho học phần (modules.name_en) để giao diện EN hiển thị đúng.

Nguồn, theo thứ tự ưu tiên (nguồn trước thắng):
  1. outline  — tên trong đề cương đã phân tích (outline_courses.name_en, liên kết qua outline_module_links)
  2. catalog  — danh mục CTĐT 2025 (program_catalog_entries.module_name_en)
  3. seed_table — bảng đối chiếu do chủ dự án cung cấp (api/seed/module_names_en.tsv), khớp theo TÊN tiếng Việt đã chuẩn hóa

Giá trị rác (vd "v", "Machine Learning....") bị loại bằng `is_clean_english`. Không bịa: học phần không có nguồn
nào thì name_en = NULL và giao diện dùng tên tiếng Việt. Chạy lại bao nhiêu lần cũng được (idempotent); không ghi đè
tên do người nhập tay (name_en có giá trị nhưng name_en_source rỗng).
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Module, OutlineCourse, OutlineModuleLink, ProgramCatalogEntry

SEED_TSV = Path(__file__).resolve().parents[2] / "seed" / "module_names_en.tsv"

_PAREN = re.compile(r"\([^)]*\)")
_TRAILING = re.compile(r"(?:\s(?:lop vet|vet|nganh 2|an giang|hoc ghep.*|test psc|\d+\s?tc))+$")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize_vi(name: str) -> str:
    """Khóa so khớp tên Việt: bỏ dấu, chữ thường, bỏ phần trong ngoặc ((4TC), (404CA), (E)…) và hậu tố lớp vét/ngành 2."""
    s = _PAREN.sub(" ", name or "")
    s = unicodedata.normalize("NFD", s.replace("đ", "d").replace("Đ", "D"))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    s = _NON_ALNUM.sub(" ", s).strip()
    prev = None
    while prev != s:  # gỡ nhiều hậu tố liên tiếp
        prev, s = s, _TRAILING.sub("", s).strip()
    return s


def is_clean_english(text: str | None) -> bool:
    """Loại giá trị rác: quá ngắn ('v'), còn dấu tiếng Việt, có '...', hoặc gần như không có chữ cái."""
    if not text:
        return False
    t = text.strip()
    if len(t) < 4 or "..." in t or "…" in t:
        return False
    if re.search(r"[^\x00-\x7F]", t) and re.search(r"[àáảãạăâđêôơưèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]", t.lower()):
        return False  # còn tiếng Việt
    letters = sum(c.isalpha() for c in t)
    return letters >= 3 and letters / len(t) >= 0.5


def load_seed_table(path: Path = SEED_TSV) -> dict[str, str]:
    """{tên Việt chuẩn hóa: tên Anh}. Nhiều bản dịch cho cùng một tên → chọn bản xuất hiện nhiều nhất (hòa → bản đầu tiên)."""
    if not path.exists():
        return {}
    votes: dict[str, Counter] = {}
    first: dict[tuple[str, str], int] = {}
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines()[1:]):
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        vi, en = parts[0].strip(), parts[1].strip()
        if not vi or not is_clean_english(en):
            continue
        key = normalize_vi(vi)
        if not key:
            continue
        votes.setdefault(key, Counter())[en] += 1
        first.setdefault((key, en), i)
    return {k: min(c, key=lambda en: (-c[en], first[(k, en)])) for k, c in votes.items()}


def fill_english_names(db: Session, seed_path: Path = SEED_TSV) -> dict:
    outline: dict[str, str] = {}
    for code, name in db.execute(
        select(OutlineModuleLink.module_code, OutlineCourse.name_en)
        .join(OutlineCourse, OutlineCourse.document_id == OutlineModuleLink.document_id)
        .where(OutlineCourse.name_en.is_not(None)).order_by(OutlineModuleLink.module_code, OutlineCourse.document_id)
    ).all():
        if code and code not in outline and is_clean_english(name):
            outline[code] = name.strip()

    catalog: dict[str, str] = {}
    for code, name in db.execute(
        select(ProgramCatalogEntry.module_code, ProgramCatalogEntry.module_name_en)
        .where(ProgramCatalogEntry.module_code.is_not(None), ProgramCatalogEntry.module_name_en.is_not(None))
        .order_by(ProgramCatalogEntry.module_code, ProgramCatalogEntry.id)
    ).all():
        if code not in catalog and is_clean_english(name):
            catalog[code] = name.strip()

    seed = load_seed_table(seed_path)
    by_source: Counter = Counter()
    kept_manual = missing = 0
    for m in db.scalars(select(Module)).all():
        if m.name_en and not m.name_en_source:
            kept_manual += 1  # người nhập tay: không ghi đè
            continue
        if m.code in outline:
            en, src = outline[m.code], "outline"
        elif m.code in catalog:
            en, src = catalog[m.code], "catalog"
        elif normalize_vi(m.name) in seed:
            en, src = seed[normalize_vi(m.name)], "seed_table"
        else:
            en = src = None
        if en is None:
            missing += 1
        by_source[src or "none"] += 0 if en is None else 1
        m.name_en, m.name_en_source = en, src
    db.commit()
    return {"modules_with_name_en": sum(by_source.values()), "by_source": dict(by_source),
            "without_name_en": missing, "kept_manual": kept_manual, "seed_table_size": len(seed)}
