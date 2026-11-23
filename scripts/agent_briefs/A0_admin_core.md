# Brief A0 — Lõi quản trị: tài khoản, phiên, vai trò, nhật ký (backend)

Đọc trước `docs/PLAN_ADMIN.md` (mục 2 quyết định D-A2, D-A3, D-A7, D-A8; mục 3; mục 4 phần Auth; mục 7). Chỉ đọc/sửa file, TUYỆT ĐỐI không chạy lệnh shell, không commit. Chủ dự án (Claude) sẽ chạy migration và test.

## Phạm vi file
`api/app/models.py`, migration mới `api/migrations/versions/0017_admin_core.py` (down_revision = head hiện tại 0016 — kiểm tra file migration mới nhất trong thư mục), `api/app/admin/` (package mới: `auth.py`, `deps.py`, `router.py`, `security.py`), `api/app/main.py` (gắn router), `api/app/cli.py` (lệnh `create-admin`, `reset-admin-password`), `api/app/config.py` (thêm cấu hình), `.env.example`, `api/requirements*.txt`/`pyproject` (thêm `argon2-cffi`), `api/tests/test_admin_auth.py`, `api/README.md`, `docs/DECISIONS.md`.

## Yêu cầu
1. **Model + migration 0017**: `admin_users`, `admin_sessions`, `audit_log`, `admin_settings` đúng cột ở PLAN mục 3; thêm vào `modules` các cột `faculty_source` (varchar null), `faculty_set_by` (int null FK admin_users), `faculty_set_at` (timestamptz null) nếu chưa có. Migration có `downgrade` đầy đủ. Model khớp migration (để `alembic check` sạch).
2. **Bảo mật** (`security.py`): băm/kiểm mật khẩu argon2id; sinh token phiên 32 byte (`secrets.token_urlsafe`), lưu **SHA-256** của token; CSRF token riêng (lưu băm); so sánh hằng thời gian.
3. **Auth** (`auth.py`, `router.py`): `POST /api/admin/login` (email, password) → kiểm khóa (`locked_until`), sai thì tăng `failed_attempts`, ≥5 lần → khóa 15 phút; đúng → tạo phiên 8 giờ, đặt cookie `uel_admin` `HttpOnly; Secure` (Secure tắt khi `ENV=development`), `SameSite=Strict`, `Path=/api/admin`; trả `{email, role, csrf_token}`. `POST /api/admin/logout` thu hồi phiên. `GET /api/admin/me` trả người dùng + vai trò + csrf_token mới nếu cần. Thông báo lỗi chung chung ("Email hoặc mật khẩu không đúng").
4. **Phụ thuộc** (`deps.py`): `require_admin(roles=…)` đọc cookie, kiểm phiên chưa hết hạn/chưa thu hồi, kiểm vai trò; với phương thức ghi (POST/PATCH/PUT/DELETE, trừ login) bắt buộc header `X-CSRF-Token` khớp. 401 khi thiếu phiên, 403 khi sai vai trò/CSRF.
5. **Nhật ký**: hàm `audit(db, actor, action, entity_type, entity_id, before, after)`; gọi cho login thành công/thất bại (không lưu mật khẩu), logout, mọi thao tác ghi sau này.
6. **CLI**: `python -m app.cli create-admin --email X --role admin` lấy mật khẩu từ biến môi trường `ADMIN_BOOTSTRAP_PASSWORD` hoặc `getpass` (không nhận mật khẩu qua đối số dòng lệnh, không in mật khẩu); `reset-admin-password --email X` sinh mật khẩu tạm và in **một lần** ra màn hình. Không ghi mật khẩu vào file nào.
7. `admin_settings`: hàm get/set có giá trị mặc định (`moderation.mode = "pre"`, `analytics.enabled = true`, `analytics.retention_days = 180`).
8. **Bảo vệ production**: `validate_production` (đã có trong `config.py`) thêm điều kiện: khi `ENV=production` cookie phải Secure; cảnh báo nếu chưa có admin nào.
9. **Test pytest** (`test_admin_auth.py`, mật khẩu sinh ngẫu nhiên trong test): tạo admin; login đúng/sai; khóa sau 5 lần; phiên hết hạn; logout thu hồi; `/me` 401 khi không cookie; route mẫu yêu cầu vai trò `admin` trả 403 với `moderator`; thao tác ghi thiếu CSRF → 403; nhật ký ghi đúng; token lưu băm (không có token thô trong DB).
10. Ghi quyết định vào `docs/DECISIONS.md`, hướng dẫn vào `api/README.md`, biến mới vào `.env.example` (không có giá trị bí mật thật).

Báo cáo cuối: file thay đổi, tên revision migration, lệnh để chủ dự án chạy (`alembic upgrade head`, `alembic check`, pytest, `create-admin`).
