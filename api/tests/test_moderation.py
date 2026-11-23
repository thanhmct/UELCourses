"""Test kiểm duyệt nội dung, bình luận học phần và từ cấm (Brief A3, D-A6)."""

from __future__ import annotations

from datetime import datetime, timezone
import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.config import get_settings
from app.models import AdminSetting, AuditLog, BannedTerm, Feedback, Module, ModuleComment, Review, User
from app.services.moderation import (
    check_content,
    normalize_for_moderation,
    validate_content_length,
)


def _setup_module(db, code="BIM5001", name="Cơ sở dữ liệu"):
    m = db.get(Module, code)
    if not m:
        m = Module(code=code, name=name, faculty="Khoa Hệ thống thông tin")
        db.add(m)
        db.commit()
    return m


def test_moderation_normalization_and_variants():
    """Bộ lọc chuẩn hóa bắt chính xác các biến thể: dấu tiếng Việt, ký tự xen kẽ và ký tự lặp."""
    # 1. Ký tự xen kẽ kiểu 'đ.ụ' -> 'du', 'd-m' -> 'dm'
    clean1, coll1 = normalize_for_moderation("đ.ụ")
    assert "du" in coll1

    clean2, coll2 = normalize_for_moderation("d-m")
    assert "dm" in coll2

    clean3, coll3 = normalize_for_moderation("d.m.m.m")
    assert "dm" in coll3

    # 2. Ký tự lặp 'looooooon' -> 'lon', 'vclllll' -> 'vcl'
    clean4, coll4 = normalize_for_moderation("looooooon")
    assert coll4 == "lon"

    clean5, coll5 = normalize_for_moderation("vclllll")
    assert coll5 == "vcl"


def test_moderation_block_and_flag(db):
    """severity='block' từ chối ngay (422), severity='flag' gắn cờ 'banned_term'."""
    # Thêm từ cấm tùy biến vào DB
    db.add(BannedTerm(term="cam_dac_biet", severity="block"))
    db.add(BannedTerm(term="luu_y_dac_biet", severity="flag"))
    db.commit()

    # Block: ném 422
    with pytest.raises(HTTPException) as exc_info:
        check_content("Nội dung chứa từ cam_dac_biet rất nguy hiểm", db=db)
    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "Nội dung chưa phù hợp"

    # Flag: không ném lỗi, trả cờ banned_term
    flags = check_content("Nội dung này có luu_y_dac_biet cần xem lại", db=db)
    assert "banned_term" in flags

    # Kiểm tra biến thể xen kẽ của từ block mẫu 'du' ("đ.ụ")
    with pytest.raises(HTTPException) as exc_info:
        check_content("Môn học này như đ.ụ vậy", db=db)
    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "Nội dung chưa phù hợp"


def test_moderation_contact_and_links(db):
    """Phát hiện số điện thoại, email và link -> gắn cờ contact_info và link."""
    # Số điện thoại VN
    flags_phone = check_content("Vui lòng gọi 0901234567 để trao đổi nhé", db=db)
    assert "contact_info" in flags_phone

    # Email
    flags_email = check_content("Gửi phản hồi qua sinhvien@st.uel.edu.vn", db=db)
    assert "contact_info" in flags_email

    # Link
    flags_link = check_content("Tải đề thi tại https://uel.edu.vn/de-thi", db=db)
    assert "link" in flags_link

    # Kết hợp nhiều cờ
    flags_both = check_content("Liên hệ 0987654321 hoặc xem https://bit.ly/tailieu", db=db)
    assert "contact_info" in flags_both
    assert "link" in flags_both


def test_moderation_content_length():
    """Độ dài nội dung phải từ 5 đến 1000 ký tự."""
    # Quá ngắn (< 5 ký tự)
    with pytest.raises(HTTPException) as exc_short:
        validate_content_length("abc")
    assert exc_short.value.status_code == 422

    # Hợp lệ (5 ký tự)
    assert validate_content_length("12345") == "12345"

    # Quá dài (> 1000 ký tự)
    with pytest.raises(HTTPException) as exc_long:
        validate_content_length("a" * 1001)
    assert exc_long.value.status_code == 422


def test_module_comments_rate_limit(client, db):
    """Rate limit: tối đa 3 bình luận / 10 phút / anon_id."""
    _setup_module(db, "BIM5001")
    anon_id = "test-anon-uuid-rate-limit"

    # 3 bình luận đầu thành công (201)
    for i in range(3):
        res = client.post(
            "/api/modules/BIM5001/comments",
            json={"body": f"Bình luận số {i+1} hợp lệ từ sinh viên", "rating": 5, "anon_id": anon_id},
        )
        assert res.status_code == 201

    # Bình luận thứ 4 bị chặn (429)
    res_block = client.post(
        "/api/modules/BIM5001/comments",
        json={"body": "Bình luận thứ 4 sẽ bị chặn vì vượt quá rate limit", "rating": 4, "anon_id": anon_id},
    )
    assert res_block.status_code == 429
    assert "quá nhiều bình luận" in res_block.json()["detail"]


def test_moderation_pre_and_post_mode(client, db):
    """admin_settings.moderation.mode = 'pre' -> pending, 'post' -> approved."""
    _setup_module(db, "BIM5001")

    # 1. Chế độ mặc định hoặc 'pre': bình luận mới có status='pending'
    db.add(AdminSetting(key="moderation.mode", value={"mode": "pre"}))
    db.commit()

    res1 = client.post(
        "/api/modules/BIM5001/comments",
        json={"body": "Bình luận ở chế độ tiền kiểm duyệt", "rating": 5, "anon_id": "anon-pre-1"},
    )
    assert res1.status_code == 201
    assert res1.json()["status"] == "pending"

    # Không hiển thị ở danh sách công khai
    res_pub1 = client.get("/api/modules/BIM5001/comments")
    assert len(res_pub1.json()["items"]) == 0

    # 2. Chuyển sang chế độ 'post': bình luận mới có status='approved'
    setting = db.scalar(select(AdminSetting).where(AdminSetting.key == "moderation.mode"))
    setting.value = {"mode": "post"}
    db.commit()

    res2 = client.post(
        "/api/modules/BIM5001/comments",
        json={"body": "Bình luận ở chế độ hậu kiểm duyệt", "rating": 4, "anon_id": "anon-post-1"},
    )
    assert res2.status_code == 201
    assert res2.json()["status"] == "approved"

    # Hiển thị ngay ở danh sách công khai
    res_pub2 = client.get("/api/modules/BIM5001/comments")
    assert len(res_pub2.json()["items"]) == 1
    assert res_pub2.json()["items"][0]["body"] == "Bình luận ở chế độ hậu kiểm duyệt"


def test_public_module_comments_only_approved_and_avg_rating(client, db):
    """GET /api/modules/{code}/comments chỉ trả bình luận approved và tính điểm trung bình."""
    _setup_module(db, "BIM5001")

    db.add(ModuleComment(module_code="BIM5001", body="Bình luận tốt 1", rating=5, status="approved"))
    db.add(ModuleComment(module_code="BIM5001", body="Bình luận tốt 2", rating=4, status="approved"))
    db.add(ModuleComment(module_code="BIM5001", body="Bình luận chờ duyệt", rating=1, status="pending"))
    db.add(ModuleComment(module_code="BIM5001", body="Bình luận bị từ chối", rating=1, status="rejected"))
    db.commit()

    res = client.get("/api/modules/BIM5001/comments")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    assert data["average_rating"] == 4.5
    for it in data["items"]:
        assert it["status"] == "approved"
        assert it["author_name"] == "Sinh viên ẩn danh"


def test_feedback_moderation(client, db):
    """POST /api/feedback đi qua cùng bộ lọc nội dung và lưu status='pending'."""
    # 1. Feedback chứa từ block -> 422
    res_block = client.post(
        "/api/feedback",
        json={"page": "/timetable", "rating": 1, "category": "Lỗi", "message": "Nội dung blockword không hợp lệ"},
    )
    assert res_block.status_code == 422

    # 2. Feedback có link -> được lưu với cờ 'link' và status='pending'
    res_ok = client.post(
        "/api/feedback",
        json={"page": "/planner", "rating": 5, "category": "Giao diện", "message": "Tham khảo tại https://uel.edu.vn"},
    )
    assert res_ok.status_code == 201
    fb_id = res_ok.json()["id"]

    fb = db.get(Feedback, fb_id)
    assert fb.status == "pending"
    assert "link" in fb.flag_reasons


def test_admin_moderation_queue_and_permissions(client, monkeypatch, db):
    """API quản trị: require_admin_dev bảo vệ và cho phép moderator truy cập hàng đợi."""
    settings = get_settings()
    monkeypatch.setattr(settings, "env", "development")

    # 1. Khi ADMIN_DEV_OPEN=false: trả 404
    monkeypatch.setattr(settings, "admin_dev_open", False)
    assert client.get("/api/admin/moderation/queue").status_code == 404

    # 2. Khi ADMIN_DEV_OPEN=true: truy cập thành công
    monkeypatch.setattr(settings, "admin_dev_open", True)

    db.add(Feedback(page="/home", rating=5, category="Khen", message="Web rất tốt", status="pending"))
    db.add(ModuleComment(module_code="BIM5001", body="Môn học hay", rating=5, status="pending", flag_reasons=["link"]))
    db.commit()

    res = client.get("/api/admin/moderation/queue")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 2
    assert data["counts"]["feedback"] >= 1
    assert data["counts"]["comment"] >= 1

    # Lọc theo type=comment
    res_comment = client.get("/api/admin/moderation/queue?type=comment")
    assert res_comment.status_code == 200
    assert all(it["type"] == "comment" for it in res_comment.json()["items"])

    # Lọc theo flagged=true
    res_flag = client.get("/api/admin/moderation/queue?flagged=true")
    assert res_flag.status_code == 200
    assert all(len(it["flag_reasons"]) > 0 for it in res_flag.json()["items"])


def test_admin_moderation_actions_and_audit(client, monkeypatch, db):
    """POST /api/admin/moderation/{type}/{id}/{action} duyệt/từ chối/ẩn và ghi audit_log."""
    settings = get_settings()
    monkeypatch.setattr(settings, "env", "development")
    monkeypatch.setattr(settings, "admin_dev_open", True)

    mc = ModuleComment(module_code="BIM5001", body="Bình luận chờ xử lý", rating=5, status="pending")
    db.add(mc)
    db.commit()
    db.refresh(mc)

    # 1. Duyệt (Approve)
    res_app = client.post(
        f"/api/admin/moderation/comment/{mc.id}/approve",
        json={"note": "Đã kiểm tra nội dung tốt"},
    )
    assert res_app.status_code == 200
    assert res_app.json()["status"] == "approved"

    db.refresh(mc)
    assert mc.status == "approved"
    assert mc.moderation_note == "Đã kiểm tra nội dung tốt"

    # Kiểm tra audit_log
    audit = db.scalar(select(AuditLog).where(AuditLog.entity_id == str(mc.id), AuditLog.action == "moderation_approve_comment"))
    assert audit is not None
    assert audit.after["status"] == "approved"

    # 2. Từ chối (Reject)
    res_rej = client.post(f"/api/admin/moderation/comment/{mc.id}/reject")
    assert res_rej.status_code == 200
    db.refresh(mc)
    assert mc.status == "rejected"

    # 3. Ẩn (Hide)
    res_hide = client.post(f"/api/admin/moderation/comment/{mc.id}/hide")
    assert res_hide.status_code == 200
    db.refresh(mc)
    assert mc.status == "hidden"


def test_admin_moderation_bulk(client, monkeypatch, db):
    """POST /api/admin/moderation/bulk thao tác hàng loạt trên nhiều mục và ghi audit_log."""
    settings = get_settings()
    monkeypatch.setattr(settings, "env", "development")
    monkeypatch.setattr(settings, "admin_dev_open", True)

    fb = Feedback(page="/p1", rating=4, category="Giao diện", message="Góp ý 1", status="pending")
    mc = ModuleComment(module_code="BIM5001", body="Bình luận 1", rating=4, status="pending")
    db.add_all([fb, mc])
    db.commit()

    res = client.post(
        "/api/admin/moderation/bulk",
        json={
            "items": [
                {"type": "feedback", "id": fb.id},
                {"type": "comment", "id": mc.id},
            ],
            "action": "approve",
            "note": "Duyệt hàng loạt",
        },
    )
    assert res.status_code == 200
    assert res.json()["updated_count"] == 2

    db.refresh(fb)
    db.refresh(mc)
    assert fb.status == "approved"
    assert mc.status == "approved"


def test_admin_banned_terms_crud(client, monkeypatch, db):
    """GET/POST/DELETE /api/admin/banned-terms quản lý từ cấm và ghi nhật ký."""
    settings = get_settings()
    monkeypatch.setattr(settings, "env", "development")
    monkeypatch.setattr(settings, "admin_dev_open", True)

    # 1. Thêm từ cấm
    res_create = client.post(
        "/api/admin/banned-terms",
        json={"term": "tu_cam_moi", "severity": "block"},
    )
    assert res_create.status_code == 201
    term_id = res_create.json()["id"]

    # 2. Lấy danh sách
    res_list = client.get("/api/admin/banned-terms")
    assert res_list.status_code == 200
    terms = [t["term"] for t in res_list.json()]
    assert "tu_cam_moi" in terms

    # 3. Xóa từ cấm
    res_del = client.delete(f"/api/admin/banned-terms/{term_id}")
    assert res_del.status_code == 200

    assert db.get(BannedTerm, term_id) is None


def test_admin_overview_moderation_pending(client, monkeypatch, db):
    """GET /api/admin/overview: moderation_pending lấy tổng số thực tế chờ duyệt."""
    settings = get_settings()
    monkeypatch.setattr(settings, "env", "development")
    monkeypatch.setattr(settings, "admin_dev_open", True)

    db.add(Feedback(page="/a", rating=5, category="c", message="m1", status="pending"))
    db.add(Feedback(page="/b", rating=5, category="c", message="m2", status="pending"))
    db.add(ModuleComment(module_code="BIM5001", body="c1", status="pending"))
    reviewer = User(provider="google", subject="moderation-reviewer", display_name="Sinh viên")
    db.add(reviewer)
    db.flush()
    db.add(Review(module_code="BIM5001", user_id=reviewer.id, rating=5, content="r1", status="pending"))
    # Approved items should not count towards pending
    db.add(Feedback(page="/c", rating=5, category="c", message="m3", status="approved"))
    db.commit()

    res = client.get("/api/admin/overview")
    assert res.status_code == 200
    data = res.json()
    assert data["moderation_pending"] == 4
