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


def test_moderation_banned_term_flags_but_never_blocks(db):
    """Từ cấm do quản trị viên tự thêm chỉ gắn cờ 'banned_term', dù severity='block' hay 'flag'
    (không còn chặn cứng 422 — việc duyệt/từ chối nay thuộc về quản trị viên trong hàng đợi)."""
    db.add(BannedTerm(term="cam_dac_biet", severity="block"))
    db.add(BannedTerm(term="luu_y_dac_biet", severity="flag"))
    db.commit()

    flags_block_severity = check_content("Nội dung chứa từ cam_dac_biet rất nguy hiểm", db=db)
    assert "banned_term" in flags_block_severity

    flags_flag_severity = check_content("Nội dung này có luu_y_dac_biet cần xem lại", db=db)
    assert "banned_term" in flags_flag_severity

    # Nội dung không khớp từ cấm nào -> không có cờ banned_term
    flags_clean = check_content("Nội dung hoàn toàn bình thường không liên quan", db=db)
    assert "banned_term" not in flags_clean


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
    """Rate limit: tối đa 10 bình luận / 10 phút / anon_id."""
    _setup_module(db, "BIM5001")
    anon_id = "test-anon-uuid-rate-limit"

    # 10 bình luận đầu thành công (201)
    for i in range(10):
        res = client.post(
            "/api/modules/BIM5001/comments",
            json={"body": f"Bình luận số {i+1} hợp lệ từ sinh viên", "rating": 5, "anon_id": anon_id},
        )
        assert res.status_code == 201

    # Bình luận thứ 11 bị chặn (429)
    res_block = client.post(
        "/api/modules/BIM5001/comments",
        json={"body": "Bình luận thứ 11 sẽ bị chặn vì vượt quá rate limit", "rating": 4, "anon_id": anon_id},
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
    """POST /api/feedback đi qua cùng bước kiểm tra nội dung (chỉ gắn cờ, không chặn) và lưu status='pending'."""
    # Feedback có link -> được lưu với cờ 'link' và status='pending'
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


def test_moderation_queue_includes_reviews_and_actions(client, monkeypatch, db):
    """Hàng đợi kiểm duyệt hỗ trợ type=review và duyệt/từ chối/ẩn Review có ghi AuditLog."""
    settings = get_settings()
    monkeypatch.setattr(settings, "env", "development")
    monkeypatch.setattr(settings, "admin_dev_open", True)

    u = User(provider="google", subject="rev-q-user", display_name="SV Test")
    db.add(u)
    db.flush()

    r1 = Review(
        module_code="BIM5001",
        user_id=u.id,
        display_name="SV Test",
        professor="Thầy A",
        rating=2,
        content="Nội dung cần kiểm tra lại về thầy A",
        status="pending",
        moderation_reasons=["harassment_personal"],
    )
    r2 = Review(
        module_code="BIM5002",
        user_id=u.id,
        display_name="SV Test",
        rating=5,
        content="Môn học rất hay và bổ ích",
        status="approved",
    )
    db.add_all([r1, r2])
    db.commit()
    db.refresh(r1)

    # Lọc type=review&flagged=true
    res_q = client.get("/api/admin/moderation/queue?type=review&flagged=true")
    assert res_q.status_code == 200
    q_data = res_q.json()
    assert q_data["counts"]["review"] >= 1
    assert q_data["counts"]["all"] >= q_data["counts"]["review"]
    matching = [it for it in q_data["items"] if it["id"] == f"review_{r1.id}"]
    assert len(matching) == 1
    assert matching[0]["type"] == "review"
    assert matching[0]["title"] == "Đánh giá môn BIM5001 - GV Thầy A"
    assert matching[0]["flag_reasons"] == ["harassment_personal"]

    # Tìm kiếm theo tên giảng viên
    res_search = client.get("/api/admin/moderation/queue?type=review&q=Thầy A")
    assert res_search.status_code == 200
    assert any(it["item_id"] == r1.id for it in res_search.json()["items"])

    # Approve review
    res_app = client.post(f"/api/admin/moderation/review/{r1.id}/approve", json={"note": "Hợp lệ"})
    assert res_app.status_code == 200
    assert res_app.json()["status"] == "approved"
    db.refresh(r1)
    assert r1.status == "approved"
    audit_app = db.scalar(
        select(AuditLog).where(
            AuditLog.entity_type == "review",
            AuditLog.entity_id == str(r1.id),
            AuditLog.action == "moderation_approve_review",
        )
    )
    assert audit_app is not None
    assert audit_app.after["status"] == "approved"

    # Hide review -> rejected
    res_hide = client.post(f"/api/admin/moderation/review/{r1.id}/hide")
    assert res_hide.status_code == 200
    assert res_hide.json()["status"] == "rejected"
    db.refresh(r1)
    assert r1.status == "rejected"


def test_admin_bans_list_lift_escalate_and_notify(client, monkeypatch, db):
    """Quản trị ban: GET /bans, POST /lift, /escalate, /notify và dịch vụ SMTP."""
    from datetime import timedelta
    from app.models import BannedIp
    from app.services import notify as notify_svc

    settings = get_settings()
    monkeypatch.setattr(settings, "env", "development")
    monkeypatch.setattr(settings, "admin_dev_open", True)

    now = datetime.now(timezone.utc)
    u_active = User(
        provider="google",
        subject="ban-active-1",
        display_name="SV Vi Phạm",
        email="sv@st.uel.edu.vn",
        ban_level="temporary",
        ban_reason="Vi phạm 3 lần",
        banned_at=now - timedelta(days=1),
        ban_expires_at=now + timedelta(days=29),
    )
    u_expired = User(
        provider="facebook",
        subject="ban-expired-1",
        display_name="SV Hết Hạn",
        email=None,
        ban_level="temporary",
        ban_reason="Hết hạn",
        banned_at=now - timedelta(days=31),
        ban_expires_at=now - timedelta(days=1),
    )
    u_clean = User(provider="google", subject="clean-1", display_name="SV Sạch")
    db.add_all([u_active, u_expired, u_clean])
    db.flush()

    ip_sys = BannedIp(
        ip_hash="hash_sys_active",
        level="temporary",
        reason="Auto ban",
        created_by="system",
        created_at=now - timedelta(days=1),
        expires_at=now + timedelta(days=29),
        related_user_id=u_active.id,
    )
    ip_admin = BannedIp(
        ip_hash="hash_adm_lifted",
        level="permanent",
        reason="Manual ban",
        created_by="admin@uel.edu.vn",
        created_at=now - timedelta(days=5),
        lifted_at=now - timedelta(days=1),
        lifted_by="admin@uel.edu.vn",
    )
    db.add_all([ip_sys, ip_admin])
    db.commit()

    # 1. GET /admin/bans?status=active
    res_active = client.get("/api/admin/bans?status=active")
    assert res_active.status_code == 200
    d_active = res_active.json()
    assert [u["user_id"] for u in d_active["users"]] == [u_active.id]
    assert [ip["ip_hash"] for ip in d_active["banned_ips"]] == ["hash_sys_active"]

    # 2. GET /admin/bans?status=expired
    res_exp = client.get("/api/admin/bans?status=expired")
    assert res_exp.status_code == 200
    assert [u["user_id"] for u in res_exp.json()["users"]] == [u_expired.id]

    # 3. GET /admin/bans?status=lifted&scope=admin
    res_lifted = client.get("/api/admin/bans?status=lifted&scope=admin")
    assert res_lifted.status_code == 200
    assert [ip["ip_hash"] for ip in res_lifted.json()["banned_ips"]] == ["hash_adm_lifted"]

    # 4. POST /admin/bans/{user_id}/notify khi chưa cấu hình SMTP
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "smtp_from", "")
    res_no_smtp = client.post(f"/api/admin/bans/{u_active.id}/notify")
    assert res_no_smtp.status_code == 200
    assert res_no_smtp.json()["success"] is False
    assert "Chưa cấu hình SMTP" in res_no_smtp.json()["message"]

    # Khi user không có email
    res_no_email = client.post(f"/api/admin/bans/{u_expired.id}/notify")
    assert res_no_email.status_code == 200
    assert res_no_email.json()["success"] is False
    assert "chưa cấp email" in res_no_email.json()["message"]

    # Khi gửi email thành công (mock SMTP)
    sent_messages = []

    class DummySMTP:
        def __init__(self, host, port, timeout=10):
            self.host = host
            self.port = port

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def ehlo(self):
            pass

        def has_extn(self, name):
            return False

        def login(self, user, password):
            pass

        def send_message(self, msg):
            sent_messages.append(msg)

    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_from", "noreply@uelpath.local")
    monkeypatch.setattr(notify_svc.smtplib, "SMTP", DummySMTP)
    res_sent = client.post(f"/api/admin/bans/{u_active.id}/notify")
    assert res_sent.status_code == 200
    assert res_sent.json()["success"] is True
    assert len(sent_messages) == 1
    assert "Thông báo khóa tài khoản UELPath" in sent_messages[0]["Subject"]
    db.refresh(u_active)
    assert u_active.ban_notified_email_at is not None

    # 5. POST /admin/bans/{user_id}/escalate -> permanent
    assert client.post(f"/api/admin/bans/{u_clean.id}/escalate").status_code == 400
    res_esc = client.post(f"/api/admin/bans/{u_active.id}/escalate", json={"note": "Tái phạm nhiều lần"})
    assert res_esc.status_code == 200
    assert res_esc.json()["ban_level"] == "permanent"
    db.refresh(u_active)
    assert u_active.ban_level == "permanent"
    assert u_active.ban_expires_at is None
    assert "Tái phạm nhiều lần" in (u_active.ban_reason or "")

    # 6. POST /admin/bans/{user_id}/lift -> gỡ ban user + IP liên quan + đặt ban_cycle_reset_at
    res_lift = client.post(f"/api/admin/bans/{u_active.id}/lift")
    assert res_lift.status_code == 200
    assert res_lift.json()["success"] is True
    db.refresh(u_active)
    db.refresh(ip_sys)
    assert u_active.ban_level is None
    assert u_active.ban_reason is None
    assert u_active.banned_at is None
    assert u_active.ban_expires_at is None
    assert u_active.ban_cycle_reset_at is not None
    assert ip_sys.lifted_at is not None
    assert ip_sys.lifted_by == "dev@uelcourses.local"


def test_guidelines_include_constructive_criticism_and_autoban_policy(client):
    """Nguyên tắc cộng đồng nêu rõ phê bình chuyên môn được giữ và cơ chế khóa tự động."""
    res = client.get("/api/reviews/guidelines")
    assert res.status_code == 200
    joined = " ".join(res.json()["items"]).lower()
    assert "chuyên môn" in joined and "xây dựng" in joined
    assert "công kích cá nhân" in joined
    assert "3 lần" in joined and "30 ngày" in joined
    assert "vĩnh viễn" in joined
    assert "không kiểm duyệt" in joined
