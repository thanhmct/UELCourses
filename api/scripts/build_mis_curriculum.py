"""Build the standard MIS 2025 curriculum graph from staged outline rows."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path


SOURCE = Path("data/processed/ctdt_outlines_2025/rows.jsonl")
OUTPUT = Path("data/processed/ctdt_outlines_2025/mis_standard_curriculum.json")
WEB_OUTPUT = Path("web/src/data/mis_standard_curriculum.json")
WORKBOOK = "8. Đề cương CTĐT Hệ thống thông tin quản lý 2025.xlsx"


def main():
    records = [json.loads(line) for line in SOURCE.open(encoding="utf-8")]
    records = [r for r in records if r["source"]["file"] == WORKBOOK]
    primary = [r for r in records if r["source"]["sheet"] == "2. HTTQL"]
    raw = {r["normalized"]["course_code"]: r for r in records if r["source"]["sheet"] == "1. Dữ liệu gốc"}
    codes = {r["normalized"]["course_code"] for r in primary}
    successors = defaultdict(list)
    edges = []
    issues = []
    modules = []
    for record in primary:
        n = record["normalized"]
        code = n["course_code"]
        term_record = raw.get(code)
        term = term_record["normalized"]["term"] if term_record else None
        original = {v["header"]: v["value"] for v in record["original"] if v["header"]}
        previous = re.findall(r"\[([^\]]+)\]", str(n["previous_raw"] or ""))
        for prior in previous:
            edge = {"from": prior, "to": code, "type": "previous", "source_sheet": record["source"]["sheet"], "source_row": record["source"]["row"]}
            edges.append(edge)
            successors[prior].append(code)
            if prior not in codes:
                issues.append({"type": "missing_previous_code", "course_code": code, "referenced_code": prior, "source_row": record["source"]["row"]})
            elif term and raw[prior]["normalized"]["term"]:
                prior_term = raw[prior]["normalized"]["term"]
                if prior_term >= term:
                    issues.append({"type": "term_order_conflict", "course_code": code, "referenced_code": prior, "previous_term": prior_term, "course_term": term})
        modules.append({
            "code": code,
            "name": n["course_name"],
            "credits": n["credits"],
            "required": n["required_raw"] == "X",
            "required_raw": n["required_raw"],
            "suggested_term": term,
            "previous": previous,
            "next": [],
            "corequisite": [],
            "department": n["department"],
            "source": {"primary_sheet": record["source"]["sheet"], "primary_row": record["source"]["row"], "term_sheet": "1. Dữ liệu gốc", "term_row": term_record["source"]["row"] if term_record else None},
        })
    for module in modules:
        module["next"] = sorted(set(successors[module["code"]]))
    result = {
        "program": "Hệ thống thông tin quản lý",
        "track": "HTTQL chuẩn",
        "curriculum_year_label": 2025,
        "source_workbook": WORKBOOK,
        "counts": {"modules": len(modules), "required": sum(m["required"] for m in modules), "not_marked_required": sum(not m["required"] for m in modules), "previous_edges": len(edges), "corequisite_edges": 0},
        "semantics": {"previous": "Học Trước được ghi trực tiếp trong workbook; next là quan hệ đảo chiều suy ra", "corequisite": "Không có cột hoặc giá trị song hành trong sheet CTĐT 2025; danh sách rỗng nghĩa là chưa có dữ liệu, không khẳng định không có điều kiện", "required": "True khi cột Bắt Buộc có X; ô trống không đồng nghĩa chắc chắn được bỏ môn"},
        "modules": modules,
        "relations": edges,
        "review_issues": issues,
    }
    serialized = json.dumps(result, ensure_ascii=False, indent=2)
    OUTPUT.write_text(serialized, encoding="utf-8")
    WEB_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    WEB_OUTPUT.write_text(serialized, encoding="utf-8")
    print(json.dumps({**result["counts"], "review_issues": len(issues)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
