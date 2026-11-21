"""Mô tả học phần song ngữ: điền `modules.description` (tiếng Việt) và `modules.description_en` (tiếng Anh).

Nguồn: phần "Mô tả học phần" của đề cương đã phân tích (`outline_courses.description`, liên kết qua `outline_module_links`).
Ngôn ngữ theo loại tài liệu:
  - Nếu đề cương tiếng Anh (`outline_courses.doc_type='syllabus_en'`) -> luôn xếp vào tiếng Anh (`modules.description_en`).
  - Nếu đề cương tiếng Việt (`outline_courses.doc_type='syllabus_vi'`) -> luôn xếp vào tiếng Việt (`modules.description`).
  - Loại khác: nhận diện theo văn bản (chữ cái tiếng Việt có dấu -> vi, ngược lại -> en).
Bước 2: học phần chưa có một bản thì chép từ bản Anh<->Việt tương ứng (`counterpart_code`, cùng một môn học ở hai ngôn ngữ giảng dạy)
và ghi `*_source = 'counterpart'`.

Đồng thời điền `modules.faculty` và `modules.department` khi rỗng/không khớp từ đề cương và bản đối ứng (fill_faculties).

Idempotent. Không ghi đè mô tả nhập tay (có nội dung nhưng `*_source` NULL). Đề cương có `parse_status = failed` vẫn được dùng nếu
đoạn mô tả có độ dài hợp lý (60–2500 ký tự): lỗi phân tích thường ở các mục khác; đoạn quá dài thường là phân tích nuốt thêm mục khác.
"""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Module, OutlineCourse, OutlineModuleLink
from app.services.faculty_names import fill_faculties

_VI_CHARS = re.compile(r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]", re.I)
MIN_LEN, MAX_LEN = 60, 2500
_RANK = {"ok": 0, "partial": 1}


def detect_lang(text: str) -> str:
    return "vi" if len(_VI_CHARS.findall(text)) >= 3 else "en"


def clean_description(text: str | None) -> str | None:
    """Gọn khoảng trắng; loại đoạn quá ngắn/quá dài (phân tích lỗi)."""
    if not text:
        return None
    t = re.sub(r"[ \t]+", " ", text.replace("\r", "")).strip()
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t if MIN_LEN <= len(t) <= MAX_LEN else None


def fill_descriptions(db: Session) -> dict:
    cand: dict[str, dict[str, str]] = {}  # module_code -> {"vi": ..., "en": ...} (đề cương tốt nhất cho từng ngôn ngữ)
    rows = db.execute(
        select(
            OutlineModuleLink.module_code,
            OutlineCourse.description,
            OutlineCourse.parse_status,
            OutlineCourse.document_id,
            OutlineCourse.doc_type,
        )
        .join(OutlineCourse, OutlineCourse.document_id == OutlineModuleLink.document_id)
        .where(OutlineCourse.description.is_not(None))
    ).all()
    for code, desc, status, doc_id, doc_type in sorted(rows, key=lambda r: (r[0], _RANK.get(r[2], 2), r[3])):
        d = clean_description(desc)
        if d:
            if doc_type == "syllabus_en":
                lang = "en"
            elif doc_type == "syllabus_vi":
                lang = "vi"
            else:
                lang = detect_lang(d)
            cand.setdefault(code, {}).setdefault(lang, d)

    mods = {m.code: m for m in db.scalars(select(Module))}
    manual_vi = manual_en = 0
    # Bước 1: từ đề cương của chính học phần
    plan: dict[str, dict[str, tuple[str, str]]] = {c: {} for c in mods}
    for code, langs in cand.items():
        if code in plan:
            for lang, d in langs.items():
                plan[code][lang] = (d, "outline")
    # Bước 2: chép chéo từ bản Anh<->Việt tương ứng (chỉ khi thiếu)
    for code, m in mods.items():
        other = mods.get(m.counterpart_code) if m.counterpart_code else None
        if other is None:
            continue
        for lang in ("vi", "en"):
            if lang not in plan[code] and lang in plan.get(other.code, {}) and plan[other.code][lang][1] == "outline":
                plan[code][lang] = (plan[other.code][lang][0], "counterpart")

    stats = {"vi": {"outline": 0, "counterpart": 0}, "en": {"outline": 0, "counterpart": 0}}
    for code, m in mods.items():
        for lang, text_attr, src_attr in (("vi", "description", "description_source"), ("en", "description_en", "description_en_source")):
            if getattr(m, text_attr) and not getattr(m, src_attr):  # nhập tay: không đụng
                manual_vi += lang == "vi"
                manual_en += lang == "en"
                continue
            val = plan[code].get(lang)
            setattr(m, text_attr, val[0] if val else None)
            setattr(m, src_attr, val[1] if val else None)
            if val:
                stats[lang][val[1]] += 1

    # Đồng thời điền faculty/department khi rỗng/không khớp từ đề cương và counterpart
    fill_faculties(db)

    db.commit()
    return {"modules": len(mods), "vi": stats["vi"], "en": stats["en"],
            "vi_total": sum(stats["vi"].values()) + manual_vi, "en_total": sum(stats["en"].values()) + manual_en,
            "kept_manual": {"vi": manual_vi, "en": manual_en}}
