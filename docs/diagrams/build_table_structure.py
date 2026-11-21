"""Sinh sơ đồ draw.io CẤU TRÚC BẢNG chi tiết từ schema Postgres đang chạy (docker compose, service db).

Chạy: python docs/diagrams/build_table_structure.py
Đầu ra: docs/diagrams/uelcourses_cau_truc_bang.drawio
"""
import html
import subprocess
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "diagrams" / "uelcourses_cau_truc_bang.drawio"
DC = ["docker", "compose", "-f", "docker-compose.yml", "-f", "docker-compose.dev.yml"]
TYPE_SHORT = {
    "character varying": "varchar", "integer": "int", "bigint": "bigint", "smallint": "smallint", "text": "text",
    "date": "date", "timestamp with time zone": "timestamptz", "boolean": "bool", "double precision": "float8",
    "jsonb": "jsonb", "json": "json", "numeric": "numeric",
}
GROUPS = [
    ("Học phần & lịch học", ["modules", "class_sections", "lessons", "venues", "semesters", "module_offering_plans", "equivalents"]),
    ("Chương trình đào tạo", ["programs", "program_modules", "module_relations"]),
    ("Đề cương 2025 (PDF)", ["outline_documents", "outline_courses", "outline_sections", "outline_objectives", "outline_clos",
                              "outline_assessments", "outline_schedule", "outline_materials", "outline_module_links",
                              "outline_resources", "program_catalog_entries"]),
    ("Quy chế (RAG)", ["regulation_documents", "regulation_chunks"]),
    ("Tài khoản & đánh giá", ["users", "reviews"]),
    ("Hệ thống", ["import_runs", "feedback", "alembic_version"]),
]


def psql(sql: str) -> list[list[str]]:
    out = subprocess.run(DC + ["exec", "-T", "db", "psql", "-U", "uelplan", "-d", "uelplan", "-t", "-A", "-F", "|", "-c", sql],
                         cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True).stdout
    return [line.split("|") for line in out.splitlines() if line.strip()]


cols = defaultdict(list)
for t, c, ty, nullable, default in psql(
    "select table_name, column_name, data_type, is_nullable, coalesce(column_default,'') from information_schema.columns "
    "where table_schema='public' order by table_name, ordinal_position"
):
    d = default.split("::")[0][:24] if default else ""
    cols[t].append((c, TYPE_SHORT.get(ty, ty), nullable == "NO", d))
pks = defaultdict(set)
for t, c in psql("select tc.table_name, kcu.column_name from information_schema.table_constraints tc "
                 "join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name "
                 "where tc.constraint_type='PRIMARY KEY'"):
    pks[t].add(c)
fks = [tuple(r) for r in psql(
    "select tc.table_name, kcu.column_name, ccu.table_name, ccu.column_name from information_schema.table_constraints tc "
    "join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name "
    "join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name "
    "where tc.constraint_type='FOREIGN KEY'")]
idx = defaultdict(list)
for t, name, d in psql("select tablename, indexname, indexdef from pg_indexes where schemaname='public' and indexname not like '%_pkey'"):
    idx[t].append(name)
rows = {t: int(n) for t, n in psql("select relname, n_live_tup from pg_stat_user_tables")}
fk_cols = defaultdict(set)
for ch, c, _, _ in fks:
    fk_cols[ch].add(c)

_id = [1]


def nid():
    _id[0] += 1
    return f"n{_id[0]}"


def table_html(t):
    head = f"<b>{t}</b> <font color=#888888>· {rows.get(t, 0)} dòng · {len(idx[t])} index</font>"
    lines = []
    for c, ty, nn, d in cols[t]:
        if c in pks[t]:
            mark = "🔑"
        elif c in fk_cols[t]:
            mark = "→"
        else:
            mark = "&nbsp;"
        nulls = "NOT NULL" if nn else "NULL"
        dflt = f" = {html.escape(d)}" if d else ""
        lines.append(f"{mark} {html.escape(c)} <font color=#1F4E79>{ty}</font> <font color=#777777>{nulls}{dflt}</font>")
    return head + "<hr>" + "<br>".join(lines)


def table_height(t):
    return 28 + 15 * max(1, len(cols[t])) + 10


W = 360


def build():
    cells, ids = [], {}
    cells.append(f'<mxCell id="{nid()}" value="{html.escape("Cấu trúc bảng dữ liệu UELCourses (schema đọc từ Postgres, ngày " + datetime.now().strftime("%Y-%m-%d") + ")")}" '
                 'style="text;html=1;fontSize=16;align=left;" vertex="1" parent="1"><mxGeometry x="40" y="16" width="1200" height="30" as="geometry"/></mxCell>')
    gx, gy, gap = 40, 60, 40
    x = gx
    max_h = 0
    per_row = 3
    for i, (gname, tables) in enumerate(GROUPS):
        present = [t for t in tables if t in cols]
        if not present:
            continue
        # xếp 2 cột trong nhóm
        col_y = [60, 60]
        pos = {}
        for t in present:
            c = 0 if col_y[0] <= col_y[1] else 1
            pos[t] = (20 + c * (W + 20), col_y[c])
            col_y[c] += table_height(t) + 14
        gw = 2 * W + 60
        gh = max(col_y) + 10
        gid = nid()
        cells.append(f'<mxCell id="{gid}" value="{html.escape(gname)}" style="rounded=1;html=1;align=left;verticalAlign=top;spacing=8;fontSize=14;fillColor=#F5F7FB;strokeColor=#9AA9C2;dashed=1;arcSize=3;" vertex="1" parent="1"><mxGeometry x="{x}" y="{gy}" width="{gw}" height="{gh}" as="geometry"/></mxCell>')
        for t, (tx, ty) in pos.items():
            tid = nid()
            ids[t] = tid
            cells.append(f'<mxCell id="{tid}" value="{html.escape(table_html(t))}" style="rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacing=6;fontSize=11;fillColor=#FFFFFF;strokeColor=#44546A;" vertex="1" parent="1"><mxGeometry x="{x + tx}" y="{gy + ty}" width="{W}" height="{table_height(t)}" as="geometry"/></mxCell>')
        max_h = max(max_h, gh)
        if (i + 1) % per_row == 0:
            x = gx
            gy += max_h + gap
            max_h = 0
        else:
            x += gw + gap
    seen = set()
    for ch, c, pa, pc in fks:
        if ch in ids and pa in ids and (ch, c, pa) not in seen:
            seen.add((ch, c, pa))
            cells.append(f'<mxCell id="{nid()}" value="{html.escape(c)}" style="endArrow=ERmany;startArrow=ERone;startFill=0;endFill=0;html=1;strokeColor=#44546A;fontSize=9;fontColor=#555555;rounded=1;" edge="1" parent="1" source="{ids[ch]}" target="{ids[pa]}"><mxGeometry relative="1" as="geometry"/></mxCell>')
    body = "".join(cells)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<mxfile host="app.diagrams.net" agent="UELCourses" version="24.0.0"><diagram id="p1" name="Cấu trúc bảng">'
            '<mxGraphModel dx="1600" dy="1000" grid="1" gridSize="10" page="1" pageWidth="1400" pageHeight="2000">'
            f'<root><mxCell id="0"/><mxCell id="1" parent="0"/>{body}</root></mxGraphModel></diagram></mxfile>')


if __name__ == "__main__":
    xml = build()
    OUT.write_text(xml, encoding="utf-8")
    print("wrote", OUT, "tables:", len(cols), "fks:", len(fks))
