from app.models import Module, ModuleComment


def _setup_module(db, code="BIM5001"):
    m = db.get(Module, code)
    if not m:
        m = Module(code=code, name="Cơ sở dữ liệu", faculty="Khoa Hệ thống thông tin")
        db.add(m)
        db.commit()
    return m


def _approved_comment(db, code="BIM5001", body="Bình luận tốt"):
    c = ModuleComment(module_code=code, body=body, rating=5, status="approved")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def test_like_then_unlike_toggles_count(client, db):
    _setup_module(db)
    c = _approved_comment(db)

    r1 = client.post(f"/api/modules/BIM5001/comments/{c.id}/like", json={"anon_id": "anon-1"})
    assert r1.status_code == 200
    assert r1.json() == {"liked": True, "like_count": 1}

    r2 = client.post(f"/api/modules/BIM5001/comments/{c.id}/like", json={"anon_id": "anon-1"})
    assert r2.status_code == 200
    assert r2.json() == {"liked": False, "like_count": 0}


def test_like_from_different_anon_ids_accumulate(client, db):
    _setup_module(db)
    c = _approved_comment(db)

    client.post(f"/api/modules/BIM5001/comments/{c.id}/like", json={"anon_id": "anon-a"})
    r = client.post(f"/api/modules/BIM5001/comments/{c.id}/like", json={"anon_id": "anon-b"})
    assert r.json()["like_count"] == 2


def test_like_unknown_comment_404(client, db):
    _setup_module(db)
    r = client.post("/api/modules/BIM5001/comments/99999/like", json={"anon_id": "anon-1"})
    assert r.status_code == 404


def test_report_does_not_require_login(client, db):
    _setup_module(db)
    c = _approved_comment(db)

    r = client.post(f"/api/modules/BIM5001/comments/{c.id}/report", json={"reason": "Nội dung công kích cá nhân"})
    assert r.status_code == 201
    assert r.json()["ok"] is True


def test_report_too_short_reason_rejected(client, db):
    _setup_module(db)
    c = _approved_comment(db)

    r = client.post(f"/api/modules/BIM5001/comments/{c.id}/report", json={"reason": "ok"})
    assert r.status_code == 422


def test_enough_reports_send_comment_back_to_pending(client, db):
    _setup_module(db)
    c = _approved_comment(db)

    for i in range(3):
        r = client.post(
            f"/api/modules/BIM5001/comments/{c.id}/report",
            json={"reason": f"Lý do báo cáo số {i + 1}, nội dung vi phạm nguyên tắc cộng đồng"},
        )
        assert r.status_code == 201

    db.refresh(c)
    assert c.status == "pending"
    assert "reported" in (c.flag_reasons or [])

    # Không còn hiển thị công khai sau khi bị chuyển về chờ duyệt
    public = client.get("/api/modules/BIM5001/comments").json()
    assert all(item["id"] != c.id for item in public["items"])
