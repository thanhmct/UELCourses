# Brief F7 — Lệch nullable cột `academic_events.cohorts` (alembic check)

Chỉ sửa `api/app/models.py` (lớp `AcademicEvent`, cột `cohorts`) HOẶC `api/migrations/versions/0016_academic_events.py` — chọn MỘT cho đồng nhất, ưu tiên sửa model cho khớp migration đã áp dụng vào DB. Không chạy shell, không commit, không tạo migration mới.

Lỗi đo thật: `alembic check` → `modify_nullable academic_events.cohorts … True, False`: trong DB (theo migration 0016) cột `cohorts` là NOT NULL (JSONB) còn model khai báo cho phép NULL. Seed và mã luôn ghi danh sách khóa nên NOT NULL là đúng → sửa model thành `nullable=False` (kiểm tra `default`/`server_default` nếu có). Đảm bảo code nạp (`academic_calendar.py`) luôn gán `cohorts` (mặc định `["all"]`) và test hiện có vẫn qua.

Tiêu chí xong: `cd api; python -m pytest -q --ignore=tests/rag` toàn bộ qua; ghi trong báo cáo lệnh `alembic check` Claude cần chạy để xác nhận "No new upgrade operations detected".
