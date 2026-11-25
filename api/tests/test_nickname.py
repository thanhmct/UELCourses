"""Biệt danh công khai: đặt/xóa, kiểm tra hợp lệ, áp dụng cho đánh giá và bình luận."""

import pytest

from app.models import Module, ModuleComment, Review, User
from app.services import auth as svc
from app.services.nickname import ANONYMOUS_NAME, clean_nickname, public_name, validate_nickname

GOOD = "Môn học có nội dung thực tế, giảng viên giải thích rõ và bài tập nhóm hợp lý. Nên chuẩn bị kỹ trước khi thi."
CODE = "BAA4041"


def _module(db):
    if db.get(Module, CODE) is None:
        db.add(Module(code=CODE, name="Kế toán tài chính nâng cao 2", credits=3))
        db.commit()


def _login(client, db, subject="nick1", name="Nguyễn Văn Thật"):
    u = User(provider="google", subject=subject, display_name=name)
    db.add(u)
    db.commit()
    client.cookies.set(svc.SESSION_COOKIE, svc.make_session(u.id))
    return u


# ---- dịch vụ thuần ---------------------------------------------------------------------------------
def test_clean_nickname_collapses_spaces_and_blank_is_none():
    assert clean_nickname("  Gấu   Béo \n") == "Gấu Béo"
    assert clean_nickname("   ") is None
    assert clean_nickname(None) is None


@pytest.mark.parametrize("bad", [
    "a",                              # quá ngắn
    "x" * 31,                         # quá dài
    "Admin UEL",                      # giả danh
    "Quản trị viên",                  # giả danh (có dấu)
    "UELPATH Support",                # giả danh thương hiệu
    "xem https://spam.vn",            # liên kết
    "abc@gmail.com",                  # email
    "zalo 0912345678",                # số điện thoại
])
def test_validate_nickname_rejects(bad):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        validate_nickname(bad)
    assert exc.value.status_code == 422


@pytest.mark.parametrize("good", ["Gấu Béo", "K24_kế_toán", "Mèo Ú 2k4", "Minh"])
def test_validate_nickname_accepts(good):
    assert validate_nickname(good) == good


def test_public_name_default_is_anonymous():
    assert public_name(None) == ANONYMOUS_NAME
    assert public_name("Gấu Béo") == "Gấu Béo"


# ---- API tài khoản ---------------------------------------------------------------------------------
def test_nickname_requires_login(client):
    assert client.put("/api/auth/nickname", json={"nickname": "Gấu Béo"}).status_code == 401


def test_set_get_and_clear_nickname(client, db):
    u = _login(client, db)
    assert client.get("/api/auth/me").json()["user"]["nickname"] is None

    r = client.put("/api/auth/nickname", json={"nickname": "  Gấu   Béo "})
    assert r.status_code == 200
    assert r.json() == {"nickname": "Gấu Béo", "public_name": "Gấu Béo"}
    me = client.get("/api/auth/me").json()["user"]
    assert me["nickname"] == "Gấu Béo"
    # tên thật từ nhà cung cấp vẫn chỉ nằm ở display_name, không bị ghi đè
    assert me["display_name"] == "Nguyễn Văn Thật"

    cleared = client.put("/api/auth/nickname", json={"nickname": ""})
    assert cleared.status_code == 200 and cleared.json() == {"nickname": None, "public_name": ANONYMOUS_NAME}
    db.expire_all()
    assert db.get(User, u.id).nickname is None


def test_set_nickname_rejects_invalid_and_keeps_old(client, db):
    _login(client, db)
    assert client.put("/api/auth/nickname", json={"nickname": "Gấu Béo"}).status_code == 200
    bad = client.put("/api/auth/nickname", json={"nickname": "Admin hệ thống"})
    assert bad.status_code == 422
    assert client.get("/api/auth/me").json()["user"]["nickname"] == "Gấu Béo"


def test_banned_user_cannot_change_nickname(client, db):
    from datetime import datetime, timezone

    u = _login(client, db)
    u.ban_level = "permanent"
    u.ban_reason = "vi phạm"
    u.banned_at = datetime.now(timezone.utc)
    db.commit()
    assert client.put("/api/auth/nickname", json={"nickname": "Gấu Béo"}).status_code == 403


# ---- đánh giá --------------------------------------------------------------------------------------
def _review_name(db):
    db.expire_all()
    return db.query(Review).order_by(Review.id.desc()).first().display_name


def test_review_uses_account_nickname_then_override_then_anonymous(client, db):
    _module(db)
    _login(client, db, "r1")
    # chưa có biệt danh -> ẩn danh (tuyệt đối không dùng tên thật)
    assert client.post(f"/api/modules/{CODE}/reviews", json={"rating": 4, "content": GOOD}).status_code == 201
    assert _review_name(db) == ANONYMOUS_NAME

    _login(client, db, "r2")
    client.put("/api/auth/nickname", json={"nickname": "Gấu Béo"})
    assert client.post(f"/api/modules/{CODE}/reviews", json={"rating": 4, "content": GOOD}).status_code == 201
    assert _review_name(db) == "Gấu Béo"

    _login(client, db, "r3")
    client.put("/api/auth/nickname", json={"nickname": "Gấu Béo"})
    ok = client.post(f"/api/modules/{CODE}/reviews", json={"rating": 5, "content": GOOD, "display_name": "Cú Đêm"})
    assert ok.status_code == 201 and _review_name(db) == "Cú Đêm"


def test_review_rejects_impersonating_name_override(client, db):
    _module(db)
    _login(client, db, "r4")
    bad = client.post(f"/api/modules/{CODE}/reviews", json={"rating": 4, "content": GOOD, "display_name": "Quản trị viên"})
    assert bad.status_code == 422


# ---- bình luận -------------------------------------------------------------------------------------
def test_comment_anonymous_without_login(client, db):
    _module(db)
    r = client.post(f"/api/modules/{CODE}/comments", json={"body": "Môn này dạy dễ hiểu, nên học.", "anon_id": "dev-1"})
    assert r.status_code == 201 and r.json()["author_name"] == ANONYMOUS_NAME


def test_comment_uses_nickname_when_logged_in(client, db):
    _module(db)
    _login(client, db, "c1")
    client.put("/api/auth/nickname", json={"nickname": "Gấu Béo"})
    r = client.post(f"/api/modules/{CODE}/comments", json={"body": "Môn này dạy dễ hiểu, nên học.", "anon_id": "dev-2"})
    assert r.status_code == 201 and r.json()["author_name"] == "Gấu Béo"
    db.expire_all()
    assert db.query(ModuleComment).order_by(ModuleComment.id.desc()).first().author_name == "Gấu Béo"


def test_comment_logged_in_without_nickname_stays_anonymous(client, db):
    _module(db)
    _login(client, db, "c2")
    r = client.post(f"/api/modules/{CODE}/comments", json={"body": "Môn này dạy dễ hiểu, nên học.", "anon_id": "dev-3"})
    assert r.status_code == 201 and r.json()["author_name"] == ANONYMOUS_NAME


def test_listing_shows_snapshot_name_after_nickname_change(client, db):
    _module(db)
    _login(client, db, "c3")
    client.put("/api/auth/nickname", json={"nickname": "Tên Cũ"})
    client.post(f"/api/modules/{CODE}/comments", json={"body": "Bình luận số một khá dài.", "anon_id": "dev-4"})
    client.put("/api/auth/nickname", json={"nickname": "Tên Mới"})
    # moderation mặc định 'auto': bình luận sạch được duyệt ngay
    items = client.get(f"/api/modules/{CODE}/comments").json()["items"]
    assert [i["author_name"] for i in items] == ["Tên Cũ"]
