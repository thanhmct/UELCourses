from sqlalchemy import func, select

from app.models import ClassSection, ImportRun, Lesson
from app.services.dkhp_csv_etl import load, transform

HEADER = "STT,Mã HP,Mã LHP,Tên HP,STC,Loại,Thông tin,Giảng viên,Giới hạn,Từ ngày,Đến ngày\n"
LINE = ('1,EIM5001,261EIM500101,An toàn thông tin (E),3,Lý thuyết,'
        '"Thứ 7, Tiết 1->4.5, 05/09/2026->07/11/2026, Phòng B1.406 *Giảng bằng Tiếng anh",A,20-40,05/09/2026,07/11/2026\n')


def _csv(tmp_path, text):
    p = tmp_path / "e.csv"
    p.write_text("﻿" + HEADER + text, encoding="utf-8")
    return p


def test_transform_dedupes_rows():
    rows = [{"Mã HP": "EIM5001", "Mã LHP": "261EIM500101", "Tên HP": "x", "Thông tin": "Thứ 7, Tiết 1->3, 05/09/2026->05/09/2026, Phòng A"}] * 2
    out, stats = transform(rows)
    assert len(out) == 1 and stats["duplicate_in_file"] == 1


def test_load_is_idempotent(db, tmp_path):
    p = _csv(tmp_path, LINE)
    first = load(db, p)
    assert first["status"] == "loaded" and first["new_sections"] == 1
    # lần hai: cùng tệp -> bỏ qua (cần có dòng nhật ký như CLI ghi)
    from app.services.lineage import log_run
    log_run(db, "dkhp-csv", p, first)
    assert load(db, p)["status"] == "already_loaded"
    # --force: upsert, không thêm lớp, không cộng dồn buổi học
    again = load(db, p, force=True)
    assert again["new_sections"] == 0
    assert db.scalar(select(func.count()).select_from(ClassSection)) == 1
    assert db.scalar(select(func.count()).select_from(Lesson)) == 1
    assert db.scalar(select(ClassSection.semester_id)) == "2026-2027-1"
    assert db.scalar(select(func.count()).select_from(ImportRun).where(ImportRun.source == "dkhp-csv")) == 1
