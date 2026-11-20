"""In dữ liệu có cấu trúc đã phân tích của một đề cương (để kiểm tra bằng mắt).

    python scripts/show_outline.py <outline_documents.id>
"""
from __future__ import annotations

import sys

from sqlalchemy import select

from app.db import SessionLocal
from app.models import OutlineAssessment, OutlineClo, OutlineObjective, OutlineScheduleItem

sys.stdout.reconfigure(encoding="utf-8")


def cut(s, n=70):
    s = " ".join(str(s or "").split())
    return s if len(s) <= n else s[: n - 1] + "…"


with SessionLocal() as db:
    i = int(sys.argv[1])
    print("-- objectives")
    for o in db.scalars(select(OutlineObjective).where(OutlineObjective.document_id == i).order_by(OutlineObjective.id)):
        print(f"  {o.code} | {cut(o.description, 60)} | clo={o.clo_codes} | {o.competency_level}")
    print("-- clos")
    for o in db.scalars(select(OutlineClo).where(OutlineClo.document_id == i).order_by(OutlineClo.id)):
        print(f"  {o.code} | {cut(o.description, 60)} | {o.teaching_levels}")
    print("-- assessments")
    for o in db.scalars(select(OutlineAssessment).where(OutlineAssessment.document_id == i).order_by(OutlineAssessment.ord)):
        print(f"  {o.item_code} | {cut(o.component, 28)} | {cut(o.item_name, 40)} | clo={o.clo_codes} | w={o.weight_pct} sub={o.sub_weight_pct} | {cut(o.duration, 22)}")
    print("-- schedule")
    for o in db.scalars(select(OutlineScheduleItem).where(OutlineScheduleItem.document_id == i).order_by(OutlineScheduleItem.ord)):
        print(f"  [{o.week_label}] {cut(o.content, 50)} | clo={o.clo_codes} | {cut(o.assessment, 30)}")
