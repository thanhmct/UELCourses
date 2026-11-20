"""Phân loại môn dạy bằng tiếng Anh ('en') / tiếng Việt ('vi') và ghép cặp bản Anh–Việt.

Quy ước thực tế của UEL (kiểm chứng trên dữ liệu, xem api/scripts/survey_code_languages.sql):
  * Mã hệ mới: 1 chữ + 2 chữ + số. Bản tiếng Anh bắt đầu bằng `E` (EEE1038), bản tiếng Việt bắt đầu bằng `B` (BEE1038).
  * Tên môn dạy bằng tiếng Anh có hậu tố "(E)".
  * Mã hệ cũ cũng bắt đầu bằng E nhưng KHÔNG phải tiếng Anh (EC01 "Nhập môn ngành Kinh tế học", EN21 "Tiếng Anh 1",
    EAUT028 "Kiểm toán 1 (CFAB)") — chỉ coi là tiếng Anh nếu tên có "(E)".

Căn cứ (language_basis):
  cntn_confirmed mã nằm trong danh sách CNTN tiếng Anh do chủ dự án xác nhận -> en (chắc chắn)
  code_and_name  mã dạng EXX#### VÀ tên có "(E)"            -> en (chắc chắn)
  code_pattern   mã dạng EXX#### (tên không có "(E)")         -> en (theo mã)
  name_marker    tên có "(E)" nhưng mã không phải EXX####     -> en (theo tên)
  legacy_e_code  mã bắt đầu bằng E (mã cũ), tên không có (E)  -> vi, CẦN RÀ SOÁT
  default        còn lại                                      -> vi
"""

from __future__ import annotations

import re

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import Module, OutlineCourse, OutlineDocument, ProgramCatalogEntry

CNTN_ENGLISH_CONFIRMED = frozenset("""ERBT039 ERBT040 EUUT071 EUUT072 EUUT073 EUUT082 EUUT101 EUUT102 EUUT103 EUUT151 EUUT152 EUUT153 EFFT071 EIET043 EIMT022 EIMT049 EKBT016 EKBT020 EKBT021 EKTT017 EKTT023 EKTT048 EKTT067 ELCT014 ELCT046 EAAT027 EAUT028 EBBT068 EBMT065""".split())  # chủ dự án xác nhận 2026-11-21: môn tiếng Anh của CNTN
_EN_CODE = re.compile(r"^E[A-Z]{2}T?\d")  # EEE1038 (chuẩn) và EKTT017 (chương trình tài năng, có chữ T)
_TALENT_CODE = re.compile(r"^[BE][A-Z]{2}T\d")
_TALENT_NAME = re.compile(r"CNTN|tài năng", re.I)
_NAME_E = re.compile(r"\(\s*E\s*\)\s*$", re.I)


def language_of(code: str | None, name: str | None) -> tuple[str, str]:
    c = re.sub(r"\s+", "", code or "").upper()
    if c in CNTN_ENGLISH_CONFIRMED:
        return "en", "cntn_confirmed"
    by_code = bool(_EN_CODE.match(c))
    by_name = bool(_NAME_E.search((name or "").strip()))
    if by_code and by_name:
        return "en", "code_and_name"
    if by_code:
        return "en", "code_pattern"
    if by_name:
        return "en", "name_marker"
    if c.startswith("E"):
        return "vi", "legacy_e_code"
    return "vi", "default"


def is_talent(code: str | None, name: str | None) -> bool:
    """Môn thuộc chương trình Cử nhân tài năng (CNTN): mã trong danh sách xác nhận, mã dạng [B|E]XXT###, hoặc tên có "CNTN"."""
    c = re.sub(r"\s+", "", code or "").upper()
    return c in CNTN_ENGLISH_CONFIRMED or bool(_TALENT_CODE.match(c)) or bool(_TALENT_NAME.search(name or ""))


def counterpart_of(code: str, all_codes: set[str]) -> str | None:
    """EEE1038 -> BEE1038 (nếu tồn tại) và ngược lại."""
    if re.match(r"^E[A-Z]{2}T?\d", code) and ("B" + code[1:]) in all_codes:
        return "B" + code[1:]
    if re.match(r"^B[A-Z]{2}T?\d", code) and ("E" + code[1:]) in all_codes:
        return "E" + code[1:]
    return None


def classify_languages(db: Session) -> dict:
    """Tính lại language_track cho modules, program_catalog_entries, outline_courses và ghép cặp Anh–Việt. Idempotent."""
    codes = set(db.scalars(select(Module.code)))
    counts = {"modules_en": 0, "modules_vi": 0, "legacy_e_code": 0, "pairs": 0}
    for m in db.scalars(select(Module)):
        track, basis = language_of(m.code, m.name)
        cp = counterpart_of(m.code, codes)
        m.language_track, m.language_basis, m.counterpart_code = track, basis, cp
        m.is_talent_program = is_talent(m.code, m.name)
        counts["modules_en" if track == "en" else "modules_vi"] += 1
        counts["legacy_e_code"] += basis == "legacy_e_code"
        counts["pairs"] += cp is not None
    counts["pairs"] //= 2
    db.commit()
    # UPDATE theo khóa (không nạp ORM) để an toàn khi `parse-outlines` đang ghi song song.
    for eid, code, name in db.execute(select(ProgramCatalogEntry.id, ProgramCatalogEntry.module_code, ProgramCatalogEntry.module_name)).all():
        db.execute(update(ProgramCatalogEntry).where(ProgramCatalogEntry.id == eid).values(language_track=language_of(code, name)[0]))
    for did, code, name, lang in db.execute(select(OutlineCourse.document_id, OutlineCourse.course_code_norm, OutlineCourse.name_vi,
                                                   OutlineCourse.teaching_language)).all():
        track = language_of(code, name)[0]
        if track == "vi" and lang and "anh" in lang.lower() and "việt" not in lang.lower():
            track = "en"  # đề cương ghi rõ ngôn ngữ giảng dạy là tiếng Anh
        db.execute(update(OutlineCourse).where(OutlineCourse.document_id == did).values(language_track=track))
    db.commit()
    counts["imported"] = counts["modules_en"] + counts["modules_vi"]
    return counts


def export_language_split(db: Session, out_dir) -> dict:
    """Ghi CSV (UTF-8 có BOM, mở bằng Excel): môn tiếng Anh, môn tiếng Việt, môn cần rà soát, cặp Anh–Việt."""
    import csv
    from pathlib import Path

    from sqlalchemy import func

    from app.models import ClassSection

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    n_classes = dict(db.execute(select(ClassSection.module_code, func.count()).group_by(ClassSection.module_code)).all())
    n_catalog = dict(db.execute(select(ProgramCatalogEntry.module_code, func.count()).group_by(ProgramCatalogEntry.module_code)).all())
    cols = ["code", "name", "credits", "faculty", "department", "language_track", "language_basis", "counterpart_code",
            "classes_opened", "catalog_entries_2025"]

    def rows(where):
        for m in db.scalars(select(Module).where(where).order_by(Module.code)):
            yield [m.code, m.name, m.credits, m.faculty, m.department, m.language_track, m.language_basis, m.counterpart_code,
                   n_classes.get(m.code, 0), n_catalog.get(m.code, 0)]

    def write(name, header, data):
        data = list(data)
        with (out / name).open("w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(header)
            w.writerows(data)
        return len(data)

    res = {
        "modules_english.csv": write("modules_english.csv", cols, rows(Module.language_track == "en")),
        "modules_vietnamese.csv": write("modules_vietnamese.csv", cols, rows(Module.language_track == "vi")),
        "modules_language_review.csv": write("modules_language_review.csv", cols, rows(Module.language_basis == "legacy_e_code")),
        "modules_talent_program.csv": write("modules_talent_program.csv", cols, rows(Module.is_talent_program.is_(True))),
    }
    pairs = [[e.code, e.name, e.counterpart_code, b.name] for e in db.scalars(select(Module).where(Module.language_track == "en", Module.counterpart_code.is_not(None)).order_by(Module.code))
             if (b := db.get(Module, e.counterpart_code)) is not None]
    res["language_pairs.csv"] = write("language_pairs.csv", ["code_en", "name_en", "code_vi", "name_vi"], pairs)
    res["imported"] = res["modules_english.csv"] + res["modules_vietnamese.csv"]
    return res