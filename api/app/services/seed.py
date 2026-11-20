"""Nạp dữ liệu ban đầu. Idempotent (mọi bước đều upsert / thay thế theo khóa).

1. Nếu thư mục raw (RAW_DATA_DIR, mặc định DATA_DIR/raw, rồi <repo>/data/raw) có file thật của UEL:
   - UIS-DanhSachThongTinLHPDangKy_*.xlsx  (lớp học phần)
   - Thong_tin_mon_hoc_TA_*.xlsx           (kế hoạch mở môn tiếng Anh)
   - ctdt_programs.json                    (chương trình đào tạo + tiên quyết/học trước)
   thì nạp chúng.
2. Nếu không có file thật nào: nạp dữ liệu MẪU api/seed/*.json (is_sample=True).
"""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import API_DIR, SEED_DIR, get_settings
from app.services.ctdt_import import import_ctdt
from app.services.excel_import import import_ta_plan, import_uis_classes
from app.services.importer import import_classes, import_equivalents, upsert_modules, upsert_semesters

UIS_GLOB = "UIS-DanhSachThongTinLHPDangKy_*.xlsx"
TA_GLOB = "Thong_tin_mon_hoc_TA_*.xlsx"
CTDT_NAME = "ctdt_programs.json"


def _load(path: Path):
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def default_raw_dir() -> Path:
    """RAW_DATA_DIR nếu đặt; nếu không: DATA_DIR/raw; nếu không tồn tại: <repo>/data/raw."""
    s = get_settings()
    if s.raw_data_dir:
        return Path(s.raw_data_dir)
    primary = s.resolved_data_dir / "raw"
    if primary.is_dir():
        return primary
    return API_DIR.parent / "data" / "raw"


def real_files(raw_dir: Path | None = None) -> dict[str, list[Path]]:
    raw_dir = raw_dir or default_raw_dir()
    if not raw_dir.is_dir():
        return {"uis": [], "ta": [], "ctdt": []}
    ctdt = raw_dir / CTDT_NAME
    return {"uis": sorted(raw_dir.glob(UIS_GLOB)), "ta": sorted(raw_dir.glob(TA_GLOB)),
            "ctdt": [ctdt] if ctdt.is_file() else []}


def run_sample_seed(db: Session, seed_dir: Path = SEED_DIR) -> dict[str, int]:
    out = {
        "semesters": upsert_semesters(db, _load(seed_dir / "semesters.json"), is_sample=True),
        "modules": upsert_modules(db, _load(seed_dir / "modules.json"), is_sample=True),
    }
    out["classes"] = import_classes(db, _load(seed_dir / "classes.json"), is_sample=True).imported
    out["equivalents"] = import_equivalents(db, _load(seed_dir / "equivalents.json"), is_sample=True).imported
    ctdt = _load(seed_dir / "ctdt_sample.json")
    out["program_modules"] = import_ctdt(db, ctdt, is_sample=True).imported if ctdt else 0
    return out


def run_seed(db: Session, *, raw_dir: Path | None = None, sample_only: bool = False) -> dict:
    files = {"uis": [], "ta": [], "ctdt": []} if sample_only else real_files(raw_dir)
    if not any(files.values()):
        return {"source": "sample", **run_sample_seed(db)}
    out: dict = {"source": "real", "files": []}
    classes = plans = pmods = 0
    for p in files["uis"]:
        classes += import_uis_classes(db, p, filename=p.name).imported
        out["files"].append(p.name)
    for p in files["ta"]:
        plans += import_ta_plan(db, p, filename=p.name).imported
        out["files"].append(p.name)
    for p in files["ctdt"]:
        pmods += import_ctdt(db, json.loads(p.read_text(encoding="utf-8-sig"))).imported
        out["files"].append(p.name)
    out.update(classes=classes, offering_plans=plans, program_modules=pmods)
    return out
