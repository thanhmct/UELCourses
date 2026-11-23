# Brief A6 — Hệ thống, nhật ký, tài khoản quản trị, cài đặt quản trị

Đọc trước `docs/PLAN_ADMIN.md` (D-A2, D-A3, mục 4 Hệ thống/Người dùng, mục 5 mục 7–9, mục 7). A0, A1 xong. Chỉ đọc/sửa file, không chạy shell, không commit.

## Backend
1. `GET /api/admin/system` (vai trò `admin`): phiên bản app (từ biến môi trường hoặc `pyproject`), alembic revision hiện tại của DB và head trong mã (cảnh báo nếu lệch), kích thước các bảng lớn (Postgres `pg_total_relation_size`; SQLite trả null), số dòng các bảng chính (modules, class_sections, lessons, outline_documents, analytics_events…), lần import gần nhất (đọc bảng/nhật ký import nếu có, nếu không thì `max(updated_at)` của bảng liên quan), số lỗi 24h (nếu có middleware ghi lỗi; nếu chưa có thì thêm middleware nhẹ ghi lỗi 5xx vào `audit_log` với `actor_type='system'` — không ghi body/request nhạy cảm), cấu hình an toàn (ENV, CORS_ORIGINS, LLM_PROVIDER — không trả bí mật).
2. `GET /api/admin/audit-log?actor=&action=&entity_type=&from=&to=&page=` (vai trò `admin`), xuất CSV.
3. `GET/POST/PATCH /api/admin/users` (chỉ `admin`): tạo tài khoản (email, vai trò) → sinh mật khẩu tạm 16 ký tự trả về **một lần** trong phản hồi; PATCH đổi vai trò/kích hoạt/khóa; `POST /api/admin/users/{id}/reset-password` (mật khẩu tạm một lần); `POST /api/admin/me/password` đổi mật khẩu của mình (cần mật khẩu cũ). Không cho tự hạ quyền/tắt tài khoản admin cuối cùng. Đổi mật khẩu → thu hồi các phiên khác. Audit.
4. `GET/PATCH /api/admin/settings` (chỉ `admin`): `moderation.mode` (pre/post), `analytics.enabled`, `analytics.retention_days` (30–365), kiểm giá trị. Audit.

## Web
5. `/admin/system`: các thẻ tình trạng (DB, migration, import, lỗi 24h) với màu trạng thái; bảng kích thước bảng.
6. `/admin/audit`: bảng nhật ký có lọc, xem chi tiết before/after dạng JSON so sánh (diff đơn giản), xuất CSV.
7. `/admin/users` (chỉ `admin`): bảng tài khoản, thêm tài khoản (panel), mật khẩu tạm hiển thị một lần trong hộp có nút sao chép và cảnh báo "chỉ hiển thị một lần"; đổi vai trò, khóa/mở; mục "Tài khoản của tôi": đổi mật khẩu.
8. `/admin/settings`: form các cài đặt trên, lưu với phản hồi gọn trong form.
9. Test pytest: system trả đúng khóa, không lộ bí mật; audit lọc; tạo user trả mật khẩu tạm một lần (không lưu thô); không tắt admin cuối; đổi mật khẩu thu hồi phiên; settings kiểm giá trị; quyền. Vitest: các trang hiển thị từ mock, mật khẩu tạm chỉ hiện một lần, form cài đặt.

Báo cáo cuối: file thay đổi. Claude chạy pytest/tsc/vitest.
