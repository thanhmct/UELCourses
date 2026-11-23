# Brief X4 (Codex) — Sửa các ca pytest đang đỏ ở api/ (trước khi chạy nạp thật và trước khi commit)

Chạy SAU khi queue7 xong D5 (xem `queue2.log`: dòng `D5 CHECK OK`) để không giẫm lên agy đang sửa models/migrations/admin. Vùng sửa: `api/app/**` (chỉ chỗ cần), `api/tests/**`. Không sửa `web/`, `api/migrations` (trừ khi lỗi migration thật), `scripts/agent_briefs`, không commit, không dùng cờ bỏ qua quyền. KHÔNG làm yếu test để "xanh": chỉ sửa test khi hành vi đúng đã đổi có chủ đích (ghi lý do).

## Cách đo
`api\.venv\Scripts\python.exe -m pytest -q -rfE -p no:cacheprovider --rootdir api --ignore=api/tests/rag api/tests --tb=short` (SQLite tạm theo conftest). Chạy FULL, không chỉ theo file.

## Hiện trạng (host, 23/11 ~02:00): 22 ca đỏ sau khi đã khôi phục `Request` trong `api/app/admin/router.py`
(Lỗi gốc đã sửa 1 phần: `from fastapi import … Request` bị mất ở `admin/router.py` làm FastAPI coi `request` là tham số query → 422; kiểm tra các router khác trong `api/app/**` cũng có `from __future__ import annotations` + kiểu `Request`/`Response` chưa import.)
- `test_admin_auth.py::test_login_success_creates_session_and_cookie`, `test_admin_overview.py::test_admin_overview_and_me_success_when_dev_open`, `test_moderation.py::test_admin_overview_moderation_pending`, `test_system_admin.py::test_admin_settings_validation_and_audit`, `test_data_admin.py` (3 ca: `test_delete_faculty_override_recalculates_auto`, `test_outlines_ocr_pending_and_drive_links`, `test_get_faculties_endpoint`): xem lỗi cụ thể (có thể cùng gốc 422/thiếu import hoặc thay đổi API admin).
- `test_analytics.py` (7 ca): `sqlite3 NOT NULL constraint failed: analytics_events.id` — cột `id` BigInteger không tự tăng trên SQLite; dùng `BigInteger().with_variant(Integer, "sqlite")` (hoặc tương đương) cho khóa chính `analytics_events` và các bảng analytics khác trong `api/app/models.py`; PostgreSQL vẫn BigInteger (migration không đổi kiểu).
- `test_reviews_auth.py` (4 ca: `test_moderation_status[...]` ×2, `test_moderation_reasons_are_reported`, `test_review_flow_publish_pending_and_one_per_user`): sau thay đổi moderation/ẩn danh — xác định hành vi đúng rồi sửa code hoặc test.
- `test_semesters.py::test_semesters_normalized_from_lesson_dates` (lỗi FK ở bước dựng dữ liệu thử: lớp xếp vào kỳ chưa tạo), `test_catalog_programs.py::test_build_k25_from_catalog` (có lẽ do đổi mã -V2/-V3 sang hậu tố E/H của W31).
- `test_w31_program_suffix.py` (2 ca: `test_resolve_program_and_track_backward_compatibility`, `test_get_valid_groups_includes_canonical_and_degree`): ca của W31 mới viết mà đang đỏ — sửa code W31 hoặc test cho đúng yêu cầu W31 (bảng chuyển tiếp mã, `valid-groups` có mã chuẩn + bậc).
- `test_api_core.py::test_docs_available` (PydanticInvalidSchema khi sinh OpenAPI) đã qua sau khi sửa import, kiểm lại.

## Yêu cầu
1. Sửa tận gốc từng nhóm, chạy lại FULL pytest cho tới khi 0 ca đỏ (nếu còn ca tồn từ trước ngoài phạm vi thì liệt kê rõ).
2. Báo cáo: nguyên nhân từng nhóm, file đã sửa, test nào bị chỉnh assertion và vì sao.
3. Không thêm phụ thuộc mới; không đụng dữ liệu thật trong PostgreSQL.
