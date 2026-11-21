# Brief F5 — Chốt chặn production không bắt SESSION_SECRET toàn khoảng trắng

Chỉ sửa `api/app/config.py` (hàm `validate_production`). Không sửa test, không commit, không chạy shell.

Lỗi (đo bằng chạy thật): `tests/test_production_guard.py::test_production_rejects_whitespace_session_secret` → `DID NOT RAISE RuntimeError`. Điều kiện hiện tại `not settings.session_secret or settings.session_secret.strip() == "dev-only-change-me"` không bắt chuỗi chỉ gồm khoảng trắng (vd "   ") vì `not "   "` là False.
Sửa: chuẩn hóa `secret = (settings.session_secret or "").strip()` rồi từ chối khi `not secret` hoặc `secret == "dev-only-change-me"`. Có thể thêm: từ chối secret ngắn hơn 16 ký tự ở production (nêu trong thông báo lỗi) — chỉ nếu không làm hỏng test hiện có.

Tiêu chí xong: `cd api; python -m pytest -q --ignore=tests/rag` toàn bộ qua.
