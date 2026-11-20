"""Convert the supplied 2025 curriculum-outline ZIP to traceable JSONL input.

Usage: python api/scripts/prepare_2025_outlines.py SOURCE.zip [OUTPUT_DIR]
This is a staging dataset, not the portal studyProgram import format.
"""

from __future__ import annotations

import io
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

import openpyxl


def clean(value):
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip() or None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def field(headers, row, *names):
    for name in names:
        for i, header in enumerate(headers):
            if header and header.casefold() == name.casefold() and i < len(row):
                return clean(row[i])
    return None


def header_row(rows):
    for number, row in enumerate(rows[:12], 1):
        values = [str(v).strip().casefold() if v is not None else "" for v in row]
        if any(v in ("mã môn", "mã môn (e)", "mã e/t", "mã môn (e)/(t)", "mã môn t", "mã môn (e)/(t)") for v in values):
            return number
    return None


def main(source: Path, output: Path):
    output.mkdir(parents=True, exist_ok=True)
    counts = Counter()
    sheets = []
    with zipfile.ZipFile(source) as archive, (output / "rows.jsonl").open("w", encoding="utf-8") as out:
        for member in archive.namelist():
            if not member.lower().endswith(".xlsx"):
                continue
            workbook = openpyxl.load_workbook(io.BytesIO(archive.read(member)), read_only=True, data_only=True)
            filename = Path(member).name
            program_name = re.sub(r"^\d+\.\s*Đề cương\s+|\.xlsx$", "", filename).strip()
            program_name = re.sub(r"^(?:CTĐT\s+)*ĐH\s+|^(?:CTĐT\s+)+|^ngành\s+|\s+2025$", "", program_name).strip()
            for sheet in workbook:
                rows = list(sheet.iter_rows(values_only=True))
                h = header_row(rows)
                if h is None:
                    sheets.append({"file": filename, "sheet": sheet.title, "status": "header_not_found"})
                    continue
                headers = [clean(v) for v in rows[h - 1]]
                n = 0
                for excel_row, values in enumerate(rows[h:], h + 1):
                    values = [clean(v) for v in values]
                    code = field(headers, values, "Mã Môn", "Mã môn", "Mã Môn (E)", "Mã E/T", "Mã môn (E)/(T)", "Mã môn T")
                    name = field(headers, values, "Tên Môn", "Tên HP")
                    if not isinstance(code, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9.]{2,31}", code) or not name:
                        continue
                    normalized = {
                        "program_label": program_name,
                        "track_label": sheet.title,
                        "course_code": code,
                        "course_code_english": field(headers, values, "Mã Môn (E)", "Mã E/T", "Mã môn (E)/(T)"),
                        "course_name": name,
                        "course_name_english": field(headers, values, "Tên Môn tiếng Anh", "Tên HP tiếng Anh"),
                        "term": field(headers, values, "HK", "K25", "Học Kỳ Thứ Tự"),
                        "academic_year": field(headers, values, "Năm Học"),
                        "required_raw": field(headers, values, "Bắt Buộc"),
                        "credits": field(headers, values, "Số TC"),
                        "department": field(headers, values, "Tên BM", "Tên bộ môn"),
                        "previous_raw": field(headers, values, "Học Trước"),
                    }
                    record = {
                        "source": {"archive": source.name, "file": filename, "sheet": sheet.title, "row": excel_row, "header_row": h},
                        "normalized": normalized,
                        "original": [{"column": i + 1, "header": headers[i], "value": value} for i, value in enumerate(values) if value is not None],
                    }
                    out.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
                    n += 1
                counts[filename] += n
                sheets.append({"file": filename, "sheet": sheet.title, "header_row": h, "rows": n})
            workbook.close()
    manifest = {"source": str(source), "file_count": len(counts), "sheet_count": len(sheets), "row_count": sum(counts.values()), "files": dict(counts), "sheets": sheets}
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: manifest[k] for k in ("file_count", "sheet_count", "row_count")}, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        raise SystemExit("Usage: python api/scripts/prepare_2025_outlines.py SOURCE.zip [OUTPUT_DIR]")
    main(Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) == 3 else Path("data/processed/ctdt_outlines_2025"))
