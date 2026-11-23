"""Điền mô tả tiếng Anh (modules.description_en) cho các môn hệ E từ đề cương tiếng Anh (Brief D7).

Nguồn đề cương tiếng Anh (ưu tiên theo thứ tự):
  1. Đề cương đã nạp trong DB (outline_module_links → outline_courses + outline_sections + outline_documents)
     có teaching_language tiếng Anh hoặc phần mô tả viết bằng tiếng Anh.
  2. Đề cương mới tải nạp bởi D5: data/outlines_master/docs|pdf (Master_data) và
     data/outlines_master/ctdt2023/docs|pdf (CTĐT 2023 kèm manifest_ctdt2023.csv).
     Ưu tiên docx hơn PDF; "cập nhật" hơn "hiện tại".
  3. Đề cương của mã E đối ứng (counterpart_code) nằm cùng file với bản B nhưng có phần tiếng Anh.

Quy tắc:
  - Chỉ nhận đoạn tiếng Anh: không có ký tự tiếng Việt có dấu và có ít nhất 8 từ tiếng Anh thông dụng.
  - Không ghi đè mô tả EN đã có, không động đến description (tiếng Việt).
  - Đặt description_en_source = 'outline', cập nhật search_text.
  - Môn không tìm được nguồn tiếng Anh: để nguyên rỗng và ghi vào
    data/processed/E_modules_still_missing_description_en.csv kèm lý do cụ thể.
  - In bộ đếm trước và sau khi nạp.
"""

from __future__ import annotations

import csv
import logging
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.models import Module, OutlineCourse, OutlineDocument, OutlineModuleLink, OutlineSection
from app.services.descriptions import (
    normalize_description_line_breaks,
    strip_description_artifacts,
    strip_material_sections,
)
from app.services.outline_docx import extract_docx_content
from app.services.outline_parse import clean, fold, normalize_text
from app.services.text import normalize_search

log = logging.getLogger("uelcourses.description_en")

_VI_ACCENTED_CHARS = re.compile(
    r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]",
    re.IGNORECASE,
)

COMMON_ENGLISH_WORDS = {
    "the", "of", "and", "to", "in", "a", "is", "that", "for", "it", "as", "was",
    "with", "be", "by", "on", "not", "he", "i", "this", "are", "or", "his", "from",
    "at", "which", "but", "more", "an", "up", "one", "their", "about", "who", "they",
    "will", "would", "there", "can", "what", "so", "all", "if", "out", "other",
    "many", "then", "them", "these", "some", "her", "make", "like", "him", "into",
    "time", "has", "look", "two", "write", "go", "see", "number", "no", "way",
    "could", "people", "my", "than", "first", "water", "been", "call", "oil", "its",
    "now", "find", "long", "down", "day", "did", "get", "come", "made", "may",
    "part", "students", "student", "course", "courses", "knowledge", "skills",
    "learning", "module", "modules", "study", "studies", "program", "programs",
    "economics", "management", "business", "law", "finance", "accounting",
    "provide", "provides", "providing", "provided", "understand", "understanding",
    "apply", "applying", "applied", "practical", "overview", "introduction",
    "basic", "advanced", "topics", "issues", "theory", "theories", "practice",
    "develop", "develops", "developing", "development", "analytical", "analysis",
    "critical", "thinking", "solve", "solving", "problems", "case", "cases",
    "design", "designed", "methods", "concepts", "techniques", "equipped",
    "equips", "equipping", "aims", "aimed", "focus", "focuses", "field",
    "fields", "including", "includes", "such", "well", "both", "each", "how",
    "main", "major", "objective", "objectives", "outcome", "outcomes", "credit", "credits",
}

_NEXT_SECTION = re.compile(
    r"^(?:\d{1,2}\s*\.\s*)?(?:muc tieu|chuan dau ra|danh gia|ke hoach|quy dinh|noi dung|course (?:objectives?|goals?|learning outcomes?|assessment|schedule|content|rules)|"
    r"objectives|learning outcomes|assessment|teaching plan|general rules|workload|tong thoi luong)\b",
    re.IGNORECASE,
)

_NEXT_SECTION_EN = re.compile(
    r"^(?:(?:\d{1,2}|[IVXLCDM]+)\.?\s*)?(?:course\s+(?:objectives?|goals?|learning\s+outcomes?|assessment|schedule|content|rules|policies|format|materials?)|"
    r"learning\s+outcomes|assessment\s+methods?|teaching\s+plan|study\s+materials?|textbooks?|references?)\b",
    re.IGNORECASE,
)

MIN_DESC_LEN = 40
MAX_DESC_LEN = 3500


def _load_translation_fallbacks() -> dict[str, tuple[str, str]]:
    """Bản dịch thủ công đã duyệt, chỉ dùng sau khi mọi nguồn đề cương đều thất bại."""
    path = Path(__file__).resolve().parents[2] / "seed" / "module_descriptions_en.tsv"
    if not path.is_file():
        return {}
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = csv.DictReader(stream, delimiter="\t")
        return {
            (row.get("code") or "").strip().upper(): (
                (row.get("description_en") or "").strip(),
                (row.get("source") or "translated").strip(),
            )
            for row in rows
            if (row.get("code") or "").strip() and (row.get("description_en") or "").strip()
        }


def is_english_description(text: str | None) -> bool:
    """Nhận dạng viết bằng tiếng Anh theo Brief D7:
    - Không có ký tự tiếng Việt có dấu.
    - Có ít nhất 8 từ tiếng Anh thông dụng (the, of, and, to, in, students, course, will...).
    """
    if not text:
        return False
    t = text.strip()
    if len(t) < MIN_DESC_LEN:
        return False
    # Không có ký tự tiếng Việt có dấu
    if _VI_ACCENTED_CHARS.search(t):
        return False
    words = re.findall(r"\b[a-zA-Z]+\b", t.lower())
    common_count = sum(1 for w in words if w in COMMON_ENGLISH_WORDS)
    return common_count >= 8


def clean_english_description(text: str | None) -> str | None:
    """Cắt gọn khoảng trắng, bỏ đánh số mục và tiêu đề đầu đoạn, loại phần nuốt mục tiếp theo."""
    sanitized = strip_material_sections(strip_description_artifacts(text))
    if not sanitized:
        return None
    t = re.sub(r"[ \t]+", " ", sanitized.replace("\r", "")).strip()
    t = re.sub(r"\n{3,}", "\n\n", t)

    # Bỏ đánh số mục và nhãn tiêu đề ở đầu
    t = re.sub(
        r"^(?:(?:\d{1,2}|[IVXLCDM]+)(?:\.\d+)*\.?\s*)?(?:Course\s+Description|Mô\s+tả\s+học\s+phần\s*(?:\([^)]*\))?|Course\s+Overview|Module\s+(?:Overview|Description)|Subject\s+Description|Course\s+Outlines?|Course\s+Summary|Brief\s+Description(?:\s+of\s+the\s+Course)?)\s*[:.\-–]?\s*",
        "",
        t,
        flags=re.IGNORECASE,
    )
    t = normalize_description_line_breaks(t) or ""

    # Cắt trước các mục tiếp theo nếu bị dính
    lines = t.splitlines()
    clean_lines: list[str] = []
    for line in lines:
        ln = line.strip()
        if not ln:
            clean_lines.append("")
            continue
        f = fold(ln)
        if len(ln) < 100 and (_NEXT_SECTION.match(f) or _NEXT_SECTION_EN.match(ln)):
            break
        clean_lines.append(ln)

    t = "\n".join(clean_lines).strip()
    if MIN_DESC_LEN <= len(t) <= MAX_DESC_LEN and is_english_description(t):
        return t
    return None


def extract_description_from_text(full_text: str | None) -> str | None:
    """Trích xuất đoạn mô tả tiếng Anh từ toàn văn bản đề cương."""
    if not full_text:
        return None
    norm = normalize_text(full_text)
    m = re.search(
        r"(?:^|\n)[ \t]*"
        r"(?:(?:\d{1,2}|[IVXLCDM]+)(?:\.\d+)*\.?[ \t]+)?"
        r"(?:Course\s+Description|Course\s+Overview|Module\s+(?:Overview|Description)|Subject\s+Description|Course\s+Outlines?|Mô\s+tả\s+học\s+phần\s*\([^)]*English[^)]*\))"
        r"[ \t]*(?:[:.\-–][ \t]*)?(?:\n[ \t]*)?"
        r"(.*?)"
        r"(?="
        r"\n[ \t]*(?:(?:\d{1,2}|[IVXLCDM]+)(?:\.\d+)*\.?[ \t]+)?"
        r"(?:Course\s+Objectives?|Learning\s+Outcomes?|Objectives?|Assessment|Teaching\s+Plan|(?:Course|Study)\s+Materials?|Textbooks?|References?|Schedule|"
        r"Mục\s+tiêu|Chuẩn\s+đầu\s+ra|Đánh\s+giá|Kế\s+hoạch|Tài\s+liệu)\b"
        r"|\Z)",
        norm,
        re.DOTALL | re.IGNORECASE,
    )
    if m:
        cand = clean_english_description(m.group(1))
        if cand:
            return cand

    return None


def extract_bilingual_english_description(text: str | None) -> str | None:
    """Trích phần tiếng Anh từ một đoạn mô tả song ngữ (thường gặp ở đề cương mã B đối ứng)."""
    if not text:
        return None
    norm = normalize_text(text)

    # Tìm cụm tiếng Anh explicitly được đánh dấu
    patterns = [
        r"(?:Tiếng\s+Anh|English|Course\s+Description\s*\([^)]*English[^)]*\)|In\s+English)\s*[:.\-–]\s*(.*?)(?=(?:\n[ \t]*(?:Tiếng\s+Việt|Mục\s+tiêu|Chuẩn\s+đầu\s+ra|3\.|III\.|Course\s+Objectives?))|\Z)",
        r"(?:^|\n)[ \t]*(?:(?:\d{1,2}|[IVXLCDM]+)\.?[ \t]+)?(?:Course\s+Description|Course\s+Overview)\s*[:.\-–][ \t]*(.*?)(?=(?:\n[ \t]*(?:(?:\d{1,2}|[IVXLCDM]+)\.?[ \t]+[A-Z]|Mục\s+tiêu|Chuẩn\s+đầu\s+ra))|\Z)",
        r"(?:^|\n)[ \t]*(?:(?:\d{1,2}|[IVXLCDM]+)\.?[ \t]+)?(?:Course\s+Description|Course\s+Overview)\s*[:.\-–]?[ \t]*(?:\n|$)(.*?)(?=(?:\n[ \t]*(?:(?:\d{1,2}|[IVXLCDM]+)\.?[ \t]+[A-Z]|Mục\s+tiêu|Chuẩn\s+đầu\s+ra))|\Z)",
    ]
    for pat in patterns:
        m = re.search(pat, norm, re.DOTALL | re.IGNORECASE)
        if m:
            cand = clean_english_description(m.group(1))
            if cand and is_english_description(cand):
                return cand
    return None


def _linked_document_ids(db: Session, module_code: str) -> list[int]:
    """Lấy document_id mà vẫn chạy được khi DB thật chưa migrate cột D5 `ctdt_year`."""
    cache_key = "outline_module_links_has_ctdt_year"
    if cache_key not in db.info:
        columns = inspect(db.get_bind()).get_columns("outline_module_links")
        db.info[cache_key] = any(col["name"] == "ctdt_year" for col in columns)

    stmt = select(OutlineModuleLink.document_id).where(OutlineModuleLink.module_code == module_code)
    if db.info[cache_key]:
        stmt = stmt.order_by(OutlineModuleLink.ctdt_year.desc().nullslast())
    else:
        stmt = stmt.order_by(OutlineModuleLink.document_id.desc())
    return list(db.scalars(stmt).all())


def _outline_document_text(db: Session, document_id: int) -> tuple[str | None, str | None]:
    """Đọc language/text mà không SELECT các cột D5 chưa có trên DB migration 0023."""
    row = db.execute(
        select(OutlineDocument.language, OutlineDocument.text).where(OutlineDocument.id == document_id)
    ).one_or_none()
    return (row.language, row.text) if row else (None, None)


def extract_from_docx(file_path: Path) -> str | None:
    """Đọc file .docx và trích đoạn Course Description tiếng Anh (qua bảng, đoạn văn, và full_text)."""
    try:
        import docx
    except ImportError:
        return None

    try:
        doc = docx.Document(file_path)
    except Exception as e:
        log.warning("Không đọc được file docx %s: %s", file_path, e)
        return None

    # 1. Quét các bảng (dạng 2 cột nhãn -> giá trị)
    for tbl in doc.tables:
        for row in tbl.rows:
            if len(row.cells) >= 2:
                label = fold(row.cells[0].text)
                if "course description" in label or "mo ta hoc phan" in label or "course overview" in label:
                    # Lấy ô giá trị
                    val = row.cells[1].text
                    cand = clean_english_description(val)
                    if cand and is_english_description(cand):
                        return cand
                    bilingual = extract_bilingual_english_description(val)
                    if bilingual:
                        return bilingual

    # 2. Quét qua toàn văn bản đã nối thứ tự (đoạn + bảng)
    full_text, _ = extract_docx_content(file_path)
    cand = extract_description_from_text(full_text)
    if cand:
        return cand

    return extract_bilingual_english_description(full_text)


def extract_from_pdf(file_path: Path) -> str | None:
    """Đọc file .pdf và trích đoạn Course Description tiếng Anh bằng pypdf."""
    try:
        import pypdf
    except ImportError:
        return None

    try:
        reader = pypdf.PdfReader(str(file_path))
    except Exception as e:
        log.warning("Không đọc được file pdf %s: %s", file_path, e)
        return None

    # Đọc tối đa 6 trang đầu (mô tả luôn nằm ở phần đầu)
    text_parts: list[str] = []
    num_pages = min(len(reader.pages), 6)
    for i in range(num_pages):
        try:
            ptxt = reader.pages[i].extract_text() or ""
            text_parts.append(ptxt)
        except Exception:
            pass

    full_text = "\n".join(text_parts)
    cand = extract_description_from_text(full_text)
    if cand:
        return cand

    return extract_bilingual_english_description(full_text)


def _scan_outline_master_files(data_dir: Path) -> dict[str, list[Path]]:
    """Quét các thư mục data/outlines_master để lập danh mục file theo mã học phần."""
    files_by_code: dict[str, list[Path]] = defaultdict(list)
    dirs = [
        data_dir / "outlines_master" / "docs",
        data_dir / "outlines_master" / "ctdt2023" / "docs",
        data_dir / "outlines_master" / "pdf",
        data_dir / "outlines_master" / "ctdt2023" / "pdf",
    ]
    for d in dirs:
        if not d.is_dir():
            continue
        for p in d.glob("*.*"):
            suf = p.suffix.lower()
            if suf not in (".docx", ".pdf"):
                continue
            # Tên file dạng MÃ__id.ext hoặc MÃ.ext hoặc MÃ_K25.ext
            m = re.match(r"^([A-Z]{2,4}\d{3,4}[A-Za-z]?)", p.stem.upper())
            code = m.group(1) if m else p.stem.split("__")[0].split("_")[0].upper()
            if code:
                files_by_code[code].append(p)
    return files_by_code


def _load_manifest_ctdt2023(data_dir: Path) -> dict[str, list[dict[str, str]]]:
    """Đọc manifest_ctdt2023.csv: mã học phần -> danh sách dòng manifest."""
    manifest_map: dict[str, list[dict[str, str]]] = defaultdict(list)
    manifest_p = data_dir / "outlines_master" / "manifest_ctdt2023.csv"
    if manifest_p.is_file():
        with manifest_p.open("r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for r in reader:
                cd = (r.get("code") or "").strip().upper()
                if cd:
                    manifest_map[cd].append(r)
    return manifest_map


def _sort_candidate_files(files: list[Path], manifest_entries: list[dict[str, str]]) -> list[Path]:
    """Sắp xếp file ứng viên theo thứ tự ưu tiên:
    1. docx trước pdf
    2. 'capnhat' trước 'hientai'
    3. Thư mục 2025 trước 2023
    """
    file_status: dict[str, str] = {}
    file_which: dict[str, str] = {}
    for me in manifest_entries:
        fn = (me.get("file") or "").strip()
        if fn:
            file_status[fn] = (me.get("status") or "").strip()
            file_which[fn] = (me.get("which") or "").strip()

    def sort_key(p: Path) -> tuple[int, int, int]:
        is_docx = 0 if p.suffix.lower() == ".docx" else 1
        which = file_which.get(p.name, "")
        is_capnhat = 0 if which == "capnhat" else 1
        # Thư mục 2025 (Master_data) ưu tiên hơn ctdt2023
        is_ctdt2023 = 1 if "ctdt2023" in str(p) else 0
        return (is_docx, is_capnhat, is_ctdt2023)

    return sorted(files, key=sort_key)


def find_description_for_module(
    db: Session,
    m: Module,
    data_dir: Path,
    manifest_map: dict[str, list[dict[str, str]]],
    files_by_code: dict[str, list[Path]],
) -> tuple[str | None, str | None, str]:
    """Tìm mô tả tiếng Anh cho môn hệ E theo 3 nguồn ưu tiên.

    Trả về: (description_en, source, reason_if_not_found)
    """
    code = m.code.strip().upper()
    b_code = m.counterpart_code.strip().upper() if m.counterpart_code else ("B" + code[1:] if code.startswith("E") else None)

    has_db_link = False
    db_has_english = False
    has_local_file = False
    file_has_english = False

    # -------------------------------------------------------------------------
    # Nguồn 1: Đề cương đã nạp trong DB (của chính mã E)
    # -------------------------------------------------------------------------
    document_ids = _linked_document_ids(db, code)
    if document_ids:
        has_db_link = True
        for doc_id in document_ids:
            course = db.get(OutlineCourse, doc_id)
            if course:
                if course.doc_type == "syllabus_en" or (course.teaching_language and "anh" in course.teaching_language.lower() or "english" in (course.teaching_language or "").lower()):
                    db_has_english = True
                if course.description:
                    cand = clean_english_description(course.description)
                    if cand:
                        return cand, "outline", "ok"

            # Tìm trong OutlineSection
            sections = list(
                db.scalars(
                    select(OutlineSection)
                    .where(OutlineSection.document_id == doc_id)
                    .order_by(OutlineSection.ord)
                ).all()
            )
            for sec in sections:
                is_desc_sec = sec.kind == "description" or (sec.heading and re.search(r"course description|description|mo ta", sec.heading, re.I))
                if is_desc_sec:
                    cand = clean_english_description(sec.text)
                    if cand:
                        return cand, "outline", "ok"
                    # Kiểm tra xem có đoạn song ngữ không
                    bi = extract_bilingual_english_description(sec.text)
                    if bi:
                        return bi, "outline", "ok"

            # Tìm trong toàn văn OutlineDocument.text
            doc_language, doc_text = _outline_document_text(db, doc_id)
            if doc_text:
                if doc_language == "en":
                    db_has_english = True
                cand = extract_description_from_text(doc_text)
                if cand:
                    return cand, "outline", "ok"

    # -------------------------------------------------------------------------
    # Nguồn 2: Đề cương mới tải nạp bởi D5 (file .docx/.pdf của chính mã E)
    # -------------------------------------------------------------------------
    e_files = files_by_code.get(code, [])
    # Bổ sung file từ manifest nếu manifest có ghi file status=ok
    e_manifest = manifest_map.get(code, [])
    for me in e_manifest:
        if (me.get("status") or "").strip() == "ok":
            fn = (me.get("file") or "").strip()
            if fn:
                sub = "docs" if fn.endswith(".docx") else "pdf"
                cand_p = data_dir / "outlines_master" / "ctdt2023" / sub / fn
                if cand_p.is_file() and cand_p not in e_files:
                    e_files.append(cand_p)

    if e_files:
        has_local_file = True
        sorted_files = _sort_candidate_files(e_files, e_manifest)
        for fp in sorted_files:
            suf = fp.suffix.lower()
            if suf == ".docx":
                cand = extract_from_docx(fp)
                if cand:
                    return cand, "outline", "ok"
            elif suf == ".pdf":
                cand = extract_from_pdf(fp)
                if cand:
                    return cand, "outline", "ok"

    # -------------------------------------------------------------------------
    # Nguồn 3: Đề cương của mã đối ứng (counterpart B-code)
    # -------------------------------------------------------------------------
    if b_code:
        b_document_ids = _linked_document_ids(db, b_code)
        if b_document_ids:
            for doc_id in b_document_ids:
                course = db.get(OutlineCourse, doc_id)
                if course and course.description:
                    cand = clean_english_description(course.description)
                    if cand:
                        return cand, "outline", "ok"
                    bi = extract_bilingual_english_description(course.description)
                    if bi:
                        return bi, "outline", "ok"

                sections = list(
                    db.scalars(
                        select(OutlineSection)
                        .where(OutlineSection.document_id == doc_id)
                        .order_by(OutlineSection.ord)
                    ).all()
                )
                for sec in sections:
                    bi = extract_bilingual_english_description(sec.text)
                    if bi:
                        return bi, "outline", "ok"

                _doc_language, doc_text = _outline_document_text(db, doc_id)
                if doc_text:
                    bi = extract_bilingual_english_description(doc_text)
                    if bi:
                        return bi, "outline", "ok"

        # Kiểm tra file của counterpart B-code
        b_files = files_by_code.get(b_code, [])
        b_manifest = manifest_map.get(b_code, [])
        for me in b_manifest:
            if (me.get("status") or "").strip() == "ok":
                fn = (me.get("file") or "").strip()
                if fn:
                    sub = "docs" if fn.endswith(".docx") else "pdf"
                    cand_p = data_dir / "outlines_master" / "ctdt2023" / sub / fn
                    if cand_p.is_file() and cand_p not in b_files:
                        b_files.append(cand_p)

        if b_files:
            sorted_b = _sort_candidate_files(b_files, b_manifest)
            for fp in sorted_b:
                suf = fp.suffix.lower()
                if suf == ".docx":
                    bi = extract_from_docx(fp)
                    if bi:
                        return bi, "outline", "ok"
                elif suf == ".pdf":
                    bi = extract_from_pdf(fp)
                    if bi:
                        return bi, "outline", "ok"

    # -------------------------------------------------------------------------
    # Không tìm được nguồn tiếng Anh: xác định lý do cụ thể
    # -------------------------------------------------------------------------
    # 1. Kiểm tra xem file có bị chặn quyền không
    manifest_entries = list(manifest_map.get(code, []))
    if b_code:
        manifest_entries.extend(manifest_map.get(b_code, []))

    for me in manifest_entries:
        st = (me.get("status") or "").strip().lower()
        if "chan-quyen" in st or "chan_quyen" in st or "403" in st or "block" in st:
            return None, None, "file bị chặn quyền"

    # 2. Nếu có đề cương tiếng Anh nhưng không tách được mô tả
    if db_has_english or file_has_english:
        return None, None, "không tách được mục mô tả"

    # 3. Nếu đã có đề cương (trong DB hoặc file) nhưng chỉ là tiếng Việt
    if has_db_link or has_local_file:
        return None, None, "đề cương chỉ tiếng Việt"

    # 4. Kiểm tra xem counterpart có đề cương tiếng Việt không
    if b_code and (files_by_code.get(b_code) or db.scalar(select(OutlineModuleLink.id).where(OutlineModuleLink.module_code == b_code).limit(1))):
        return None, None, "đề cương chỉ tiếng Việt"

    # 5. Mặc định: không có đề cương
    return None, None, "không có đề cương"


def fill_description_en(
    db: Session,
    *,
    data_dir: Path | None = None,
    missing_out: Path | None = None,
    dry_run: bool = False,
    only_missing: bool = True,
) -> dict[str, Any]:
    """Điền mô tả tiếng Anh cho môn hệ E và xuất báo cáo môn còn thiếu."""
    if data_dir is None:
        data_dir = Path(__file__).resolve().parents[3] / "data"
    if missing_out is None:
        missing_out = data_dir / "processed" / "E_modules_still_missing_description_en.csv"

    # Tập hợp danh sách môn hệ E (mã bắt đầu bằng E)
    all_e_modules = list(
        db.scalars(
            select(Module)
            .where(Module.code.like("E%"))
            .order_by(Module.code)
        ).all()
    )
    total_e = len(all_e_modules)

    # Thống kê TRƯỚC
    before_with_en = 0
    before_without_en = 0
    before_by_source: Counter[str] = Counter()
    for m in all_e_modules:
        if m.description_en and m.description_en.strip():
            before_with_en += 1
            before_by_source[m.description_en_source or "none"] += 1
        else:
            before_without_en += 1

    # Nạp chỉ mục file và manifest
    manifest_map = _load_manifest_ctdt2023(data_dir)
    files_by_code = _scan_outline_master_files(data_dir)
    translation_fallbacks = _load_translation_fallbacks()

    # Xác định danh sách môn cần xử lý
    targets = [m for m in all_e_modules if not (m.description_en and m.description_en.strip())] if only_missing else all_e_modules

    newly_filled = 0
    still_missing_rows: list[dict[str, str]] = []
    reason_counts: Counter[str] = Counter()
    new_sources: Counter[str] = Counter()

    for m in targets:
        # Không ghi đè nếu đã có mô tả EN
        if m.description_en and m.description_en.strip():
            continue

        desc_en, src, status = find_description_for_module(
            db, m, data_dir, manifest_map, files_by_code
        )

        if not desc_en and (m.description or "").strip() and m.code in translation_fallbacks:
            translated, translated_source = translation_fallbacks[m.code]
            desc_en = clean_english_description(translated)
            if desc_en:
                src = translated_source
                status = "ok"

        if desc_en:
            m.description_en = desc_en
            m.description_en_source = src or "outline"
            m.search_text = normalize_search(f"{m.code} {m.name} {m.name_en or ''} {m.faculty or ''} {m.department or ''}")
            newly_filled += 1
            new_sources[m.description_en_source] += 1
        else:
            b_code = m.counterpart_code or ("B" + m.code[1:] if m.code.startswith("E") else "")
            reason = status or "không có đề cương"
            reason_counts[reason] += 1
            still_missing_rows.append({
                "code": m.code,
                "name": m.name or "",
                "counterpart_code": b_code,
                "reason": reason,
            })

    # Thống kê SAU
    after_with_en = before_with_en + newly_filled
    after_without_en = total_e - after_with_en
    after_by_source: Counter[str] = Counter(before_by_source)
    after_by_source.update(new_sources)

    if not dry_run:
        db.commit()
    else:
        db.rollback()

    # Xuất file CSV các môn vẫn thiếu
    missing_out.parent.mkdir(parents=True, exist_ok=True)
    with missing_out.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["code", "name", "counterpart_code", "reason"])
        writer.writeheader()
        writer.writerows(still_missing_rows)

    stats = {
        "total_e_modules": total_e,
        "processed_targets": len(targets),
        "dry_run": dry_run,
        "before": {
            "with_description_en": before_with_en,
            "without_description_en": before_without_en,
            "by_source": dict(before_by_source),
        },
        "after": {
            "with_description_en": after_with_en,
            "without_description_en": after_without_en,
            "by_source": dict(after_by_source),
        },
        "newly_filled": newly_filled,
        "still_missing_count": len(still_missing_rows),
        "still_missing_by_reason": dict(reason_counts),
        "still_missing_csv": str(missing_out),
    }

    # In kết quả dạng bảng rõ ràng ra stdout
    print("=" * 65)
    print(" BỘ ĐẾM MÔN HỆ E TRƯỚC VÀ SAU KHI NẠP MÔ TẢ TIẾNG ANH (Brief D7)")
    print("=" * 65)
    print(f"Tổng số môn hệ E: {total_e}")
    print(f"Chế độ: {'DRY-RUN (chạy thử, không lưu DB)' if dry_run else 'THỰC THI (đã ghi DB)'}")
    print("-" * 65)
    print("TRƯỚC KHI NẠP:")
    print(f"  - Đã có description_en : {before_with_en:3d} (nguồn: {dict(before_by_source)})")
    print(f"  - Chưa có description_en: {before_without_en:3d}")
    print("-" * 65)
    print("KẾT QUẢ XỬ LÝ:")
    print(f"  - Số môn vừa được bổ sung: {newly_filled:3d}")
    print(f"  - Số môn vẫn còn thiếu   : {len(still_missing_rows):3d}")
    for rsn, cnt in sorted(reason_counts.items(), key=lambda x: -x[1]):
        print(f"      • {rsn}: {cnt}")
    print("-" * 65)
    print("SAU KHI NẠP:")
    print(f"  - Đã có description_en : {after_with_en:3d} (nguồn: {dict(after_by_source)})")
    print(f"  - Chưa có description_en: {after_without_en:3d}")
    print(f"  - File xuất môn thiếu   : {missing_out}")
    print("=" * 65)

    return stats
