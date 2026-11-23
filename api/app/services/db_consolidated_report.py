"""Sinh báo cáo thống nhất DB cho X5 Bước E."""

from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.models import (
    ClassSection,
    Module,
    ModuleRelation,
    OutlineDocument,
    OutlineModuleLink,
    Program,
    ProgramModule,
    Semester,
)


def program_track(program_id: str) -> str:
    value = program_id.upper()
    if value.endswith("TE"):
        return "TE"
    if value.endswith("E"):
        return "E"
    if value.endswith("H"):
        return "H"
    if value.endswith("T"):
        return "T"
    return "chuẩn"


def _table(headers: list[str], rows: list[list[object]]) -> list[str]:
    result = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    result += ["| " + " | ".join(str(value) for value in row) + " |" for row in rows]
    return result


def generate_db_consolidated_report(db: Session, *, out_path: Path, pending_imports: bool = False) -> dict:
    revision = "không rõ"
    if inspect(db.get_bind()).has_table("alembic_version"):
        revision = db.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).scalar() or revision
    programs = db.scalars(select(Program).order_by(Program.id)).all()
    program_modules = db.scalars(select(ProgramModule)).all()
    modules = db.scalars(select(Module).order_by(Module.code)).all()
    documents = db.scalars(select(OutlineDocument)).all()
    links = db.scalars(select(OutlineModuleLink)).all()
    classes = db.scalars(select(ClassSection)).all()
    semesters = db.scalars(select(Semester)).all()
    relations = db.scalars(select(ModuleRelation)).all()

    pm_by_program: Counter[str] = Counter(row.program_id for row in program_modules)
    program_groups: dict[tuple[str, str, str, str], list[int]] = defaultdict(list)
    for program in programs:
        key = (program.cohort or "—", program.degree or "dai_hoc", program_track(program.id), program.source or "—")
        program_groups[key].append(pm_by_program[program.id])
    program_rows = []
    for key, counts in sorted(program_groups.items()):
        program_rows.append([*key, len(counts), sum(counts), f"{min(counts)}–{max(counts)}" if counts else "0"])

    module_codes = {item.code for item in modules}
    program_ids = {item.id for item in programs}
    linked_codes = {item.module_code for item in links}
    pm_codes = {item.module_code for item in program_modules}
    e_modules = [item for item in modules if item.code.startswith("E")]
    degree_counts = Counter(item.degree or "dai_hoc" for item in modules)
    equivalent_codes = {row.source for row in relations if row.type == "equivalent"} | {row.target for row in relations if row.type == "equivalent"}

    outline_groups = Counter((doc.ctdt_year or "NULL", doc.source_format or Path(doc.file_name).suffix.lstrip(".") or "không rõ") for doc in documents)
    years_by_module: dict[str, set[int]] = defaultdict(set)
    for link in links:
        if link.ctdt_year:
            years_by_module[link.module_code].add(int(link.ctdt_year))
    both_years = sorted(code for code, years in years_by_module.items() if {2023, 2025}.issubset(years))

    semester_rows = []
    classes_by_semester = Counter(row.semester_id or "NULL" for row in classes)
    for semester in semesters:
        semester_rows.append([semester.id, semester.year, semester.term, classes_by_semester.get(semester.id, 0)])
    if classes_by_semester.get("NULL"):
        semester_rows.append(["NULL", "—", "—", classes_by_semester["NULL"]])

    duplicate_pm = len(program_modules) - len({(row.program_id, row.module_code) for row in program_modules})
    orphan_pm_module = sum(row.module_code not in module_codes for row in program_modules)
    orphan_pm_program = sum(row.program_id not in program_ids for row in program_modules)
    orphan_classes = sum(row.module_code not in module_codes for row in classes)
    orphan_links = sum(row.module_code not in module_codes for row in links)
    empty_programs = sorted(program.id for program in programs if pm_by_program[program.id] == 0)
    unused_modules = sorted(module_codes - pm_codes)
    old_suffixes = sorted(program.id for program in programs if program.id.endswith("-V2") or program.id.endswith("-V3"))
    blank_faculty = sorted(item.code for item in modules if not (item.faculty or "").strip())

    student_groups = sorted({group for section in classes for group in (section.student_groups or []) if isinstance(group, str)})
    c608 = [group for group in student_groups if group.startswith("C") and len(group) >= 6 and group[3:6] == "608"]
    b50x = [group for group in student_groups if re_match_b50x(group)]

    lines = ["# Báo cáo thống nhất database", "", f"> Sinh từ DB ở migration `{revision}`. " + ("Các lượt nạp X5/X6 còn chờ backup vì Docker pipe bị từ chối quyền; số dưới đây là hiện trạng trước nạp." if pending_imports else "Số liệu là hiện trạng tại thời điểm chạy báo cáo."), ""]
    lines += ["## 1. Migration", "", f"- Alembic hiện tại: `{revision}`.", ""]
    lines += ["## 2. Chương trình đào tạo", ""]
    lines += _table(["Khóa", "Bậc", "Hệ", "Nguồn", "Số CTĐT", "Tổng dòng môn", "Môn/CTĐT"], program_rows)
    lines += ["", f"- Tổng chương trình: {len(programs)}; tổng quan hệ chương trình–môn: {len(program_modules)}.", ""]
    lines += ["## 3. Học phần", "", f"- Tổng: {len(modules)}; theo bậc: " + ", ".join(f"`{key}`={value}" for key, value in sorted(degree_counts.items())) + ".", f"- Khoa trống: {len(blank_faculty)}.", f"- Môn mã E: {len(e_modules)}; có mô tả EN: {sum(bool(item.description_en) for item in e_modules)}; thiếu mô tả EN: {sum(not bool(item.description_en) for item in e_modules)}.", f"- Môn tham gia quan hệ tương đương: {len(equivalent_codes)} (số cạnh: {sum(row.type == 'equivalent' for row in relations)}).", ""]
    lines += ["## 4. Đề cương", ""]
    lines += _table(["Năm CTĐT", "Định dạng", "Số tài liệu"], [[year, fmt, count] for (year, fmt), count in sorted(outline_groups.items(), key=lambda item: (str(item[0][0]), item[0][1]))])
    lines += ["", f"- Tổng tài liệu: {len(documents)}; liên kết môn–đề cương: {len(links)}.", f"- Môn có cả bản 2023 và 2025: {len(both_years)}.", f"- Môn đang thuộc ít nhất một CTĐT nhưng chưa có bất kỳ liên kết đề cương: {len(pm_codes - linked_codes)}.", ""]
    lines += ["## 5. Lớp học và học kỳ", "", f"- Tổng lớp học phần: {len(classes)}; tổng học kỳ: {len(semesters)}."]
    lines += _table(["Học kỳ", "Năm học", "Kỳ", "Số lớp"], semester_rows)
    lines += ["", "## 6. Kiểm toàn vẹn", "", f"- Mồ côi `program_modules → modules`: {orphan_pm_module}; `program_modules → programs`: {orphan_pm_program}; `class_sections → modules`: {orphan_classes}; liên kết đề cương tới mã chưa có trong `modules`: {orphan_links}.", f"- Quan hệ chương trình–môn trùng: {duplicate_pm}; mã môn trùng khóa chính: {len(modules) - len(module_codes)}.", f"- Chương trình không có môn: {len(empty_programs)}.", f"- Môn không thuộc CTĐT nào: {len(unused_modules)}.", f"- ID chương trình còn hậu tố `-V2/-V3`: {len(old_suffixes)}.", ""]
    lines += ["## 7. Việc còn tồn", "", "- Đề cương 2023 thiếu thật/chặn quyền: xem `outline_2023_con_thieu.csv` và `outline_can_nhap_tay.csv` (không dùng danh sách thô 427 dòng để yêu cầu tải lại 89 mã đã có bản dùng được).", f"- Môn chưa rõ khoa: {len(blank_faculty)} mã; xem audit dữ liệu để xử lý theo thứ tự nguồn đã chốt.", f"- Ngành 608: có {len(c608)} mã lớp thạc sĩ nhưng chưa có CTĐT 608 trong nguồn workbook.", f"- Nhóm mã lớp `B…50x` chưa rõ bậc/hệ: {len(b50x)} mã.", "- Các ngành K23 không có bằng chứng chính thức vẫn giữ nguồn K24 sao chép theo quyết định dự án; không suy diễn thêm."]
    if pending_imports:
        lines += ["- Chặn hạ tầng hiện tại: `db_backup.ps1` không truy cập được `//./pipe/docker_engine`; chưa được phép chạy các lượt ghi D3/D4/D5/D6/D7/X6."]
    lines.append("")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")
    return {"out": str(out_path), "revision": revision, "programs": len(programs), "program_modules": len(program_modules), "modules": len(modules), "outline_documents": len(documents), "class_sections": len(classes), "semesters": len(semesters), "integrity_errors": orphan_pm_module + orphan_pm_program + orphan_classes}


def re_match_b50x(value: str) -> bool:
    return len(value) >= 6 and value.startswith("B") and value[3:6].startswith("50")
