"""Góp ý học phần theo học kỳ: tự duyệt khi không vi phạm, chống trùng theo học kỳ (migration 0031)."""

from __future__ import annotations

from sqlalchemy import select

from app.models import AdminSetting, Module, Semester


def _setup(db, code="BIM5001"):
    if not db.get(Module, code):
        db.add(Module(code=code, name="Cơ sở dữ liệu", faculty="Khoa Hệ thống thông tin"))
    for sem_id, year, term in (("2025-2026-2", "2025-2026", 2), ("2026-2027-1", "2026-2027", 1)):
        if not db.get(Semester, sem_id):
            db.add(Semester(id=sem_id, name=f"Học kỳ {term} {year}", year=year, term=term))
    db.commit()


def test_auto_mode_is_default_and_approves_clean_comment(client, db):
    """Không có cài đặt moderation.mode -> mặc định 'auto': nội dung sạch được duyệt ngay."""
    _setup(db)
    res = client.post(
        "/api/modules/BIM5001/comments",
        json={"body": "Môn học bổ ích, giảng viên dạy dễ hiểu", "rating": 5, "anon_id": "anon-auto-1"},
    )
    assert res.status_code == 201
    assert res.json()["status"] == "approved"

    public = client.get("/api/modules/BIM5001/comments").json()
    assert public["total"] == 1


def test_auto_mode_sends_flagged_comment_to_pending(client, db):
    """Nội dung có link vi phạm quy tắc (cờ 'link') -> pending chờ quản trị viên, không hiện công khai."""
    _setup(db)
    res = client.post(
        "/api/modules/BIM5001/comments",
        json={"body": "Xem thêm tài liệu tại https://example.com/tai-lieu nhé", "rating": 4, "anon_id": "anon-auto-2"},
    )
    assert res.status_code == 201
    assert res.json()["status"] == "pending"
    assert client.get("/api/modules/BIM5001/comments").json()["total"] == 0


def test_auto_mode_ai_flagged_content_goes_to_pending_not_rejected(client, db, monkeypatch):
    """Nội dung bị mô hình kiểm duyệt AI gắn cờ -> chờ duyệt, không còn bị từ chối ngay (422)."""
    _setup(db)
    from app.services import moderation as mod_svc

    monkeypatch.setattr(mod_svc, "ai_flag_categories", lambda text: ["self-harm"] if "kys" in text.lower() else [])

    res = client.post(
        "/api/modules/BIM5001/comments",
        json={"body": "Môn này làm mình muốn kys thật sự", "rating": 1, "anon_id": "anon-auto-3"},
    )
    assert res.status_code == 201
    assert res.json()["status"] == "pending"
    assert client.get("/api/modules/BIM5001/comments").json()["total"] == 0


def test_auto_mode_explicit_setting_and_invalid_value(client, db):
    """Giá trị 'auto' được lưu đúng; giá trị không rõ thì rơi về 'pre' (mọi bình luận chờ duyệt)."""
    _setup(db)
    db.add(AdminSetting(key="moderation.mode", value={"mode": "auto"}))
    db.commit()
    res_auto = client.post(
        "/api/modules/BIM5001/comments",
        json={"body": "Bình luận sạch khi chế độ tự duyệt", "rating": 5, "anon_id": "anon-mode-1"},
    )
    assert res_auto.json()["status"] == "approved"

    setting = db.scalar(select(AdminSetting).where(AdminSetting.key == "moderation.mode"))
    setting.value = {"mode": "lạ"}
    db.commit()
    res_unknown = client.post(
        "/api/modules/BIM5001/comments",
        json={"body": "Bình luận sạch khi cài đặt không rõ", "rating": 5, "anon_id": "anon-mode-2"},
    )
    assert res_unknown.json()["status"] == "pending"


def test_semester_comment_is_saved_and_one_per_semester(client, db):
    """Góp ý theo học kỳ được lưu kèm học kỳ; cùng sinh viên + môn + học kỳ chỉ góp ý một lần (409)."""
    _setup(db)
    payload = {"body": "Nội dung góp ý học kỳ hiện tại", "rating": 4, "anon_id": "anon-sem-1", "semester": "2026-2027-1"}
    res = client.post("/api/modules/BIM5001/comments", json=payload)
    assert res.status_code == 201
    assert res.json()["semester"] == "2026-2027-1"

    res_dup = client.post("/api/modules/BIM5001/comments", json=payload)
    assert res_dup.status_code == 409

    # Học kỳ khác của cùng môn vẫn góp ý được
    res_other = client.post(
        "/api/modules/BIM5001/comments",
        json={**payload, "body": "Nội dung góp ý học kỳ trước", "semester": "2025-2026-2"},
    )
    assert res_other.status_code == 201


def test_semester_requires_valid_semester_and_anon_id(client, db):
    """Có học kỳ thì bắt buộc anon_id; học kỳ không tồn tại trả 422."""
    _setup(db)
    no_anon = client.post(
        "/api/modules/BIM5001/comments",
        json={"body": "Góp ý nhưng thiếu mã thiết bị", "rating": 3, "semester": "2026-2027-1"},
    )
    assert no_anon.status_code == 422

    bad_semester = client.post(
        "/api/modules/BIM5001/comments",
        json={"body": "Góp ý với học kỳ không tồn tại", "rating": 3, "anon_id": "anon-sem-2", "semester": "9999-9999-9"},
    )
    assert bad_semester.status_code == 422
