# Brief A5 — Quản trị lịch năm học và học kỳ

Đọc trước `docs/PLAN_ADMIN.md` (mục 4 Lịch, mục 5 mục 6). A0, A1 xong. Lịch năm học có sẵn: model/migration 0016 `academic_events`, `api/app/services/academic_calendar.py`, `api/app/routers/calendar.py`, seed `api/seed/academic_calendar_2026_2027.json` (96 sự kiện, có 1 sự kiện chưa kiểm chứng). Học kỳ: model `Semester` (`is_current`, `start_date`, `end_date`; W21 có thể đã thêm `teaching_start`/`teaching_end` ở API). Đọc code hiện tại trước. Chỉ đọc/sửa file, không chạy shell, không commit.

## Backend (vai trò `admin` hoặc `data_editor`)
1. Nếu bảng sự kiện chưa có cột `verified` (bool), `source` (text), `updated_by`, `updated_at` thì thêm qua migration `0020_calendar_admin` (down_revision = head lúc đó — kiểm tra thư mục migrations); seed: sự kiện có ghi chú "chưa kiểm chứng" → `verified=false`, còn lại `true`. Nếu học kỳ chưa lưu `teaching_start`/`teaching_end` trong DB thì thêm cột (nullable) cùng migration; API công khai `/api/semesters` ưu tiên giá trị này khi có.
2. `GET /api/admin/calendar/events?year=&cohort=&type=&verified=`; `POST` (tạo), `PATCH /{id}`, `DELETE /{id}` (xóa mềm hoặc thật kèm audit); kiểm dữ liệu: ngày kết thúc ≥ ngày bắt đầu, `cohorts` hợp lệ (dạng K22…), loại sự kiện thuộc danh sách hiện có. `POST /api/admin/calendar/import` nhận JSON đúng định dạng seed (xem trước + xác nhận: `?dry_run=true` trả khác biệt).
3. `PATCH /api/admin/semesters/{id}`: `is_current` (đặt một kỳ là hiện tại → các kỳ khác false), `teaching_start`, `teaching_end`, `name` hiển thị; audit.
4. Mọi thay đổi xóa cache lịch nếu có.

## Web
5. `/admin/calendar`: tab "Sự kiện" — bảng (ngày bắt đầu–kết thúc, tên, loại, khóa áp dụng, học kỳ, đã kiểm chứng ✓/⚠), lọc năm học/khóa/loại/chưa kiểm chứng, sửa trong panel phải (form có chọn ngày, chọn nhiều khóa, loại), thêm mới, xóa (xác nhận trong panel, không dùng `window.confirm`), nút "Đánh dấu đã kiểm chứng"; xem dạng dòng thời gian tháng (tùy chọn, đơn giản). Tab "Học kỳ" — bảng học kỳ (tên, năm, kỳ, hiện tại, ngày học thật) với sửa tại chỗ, nút "Đặt làm kỳ hiện tại". Tab "Nhập JSON" — dán/tải file JSON → xem khác biệt → xác nhận.
6. Test pytest: CRUD + kiểm dữ liệu + quyền + audit + is_current duy nhất + import dry-run. Vitest: lọc chưa kiểm chứng, sửa sự kiện, đặt kỳ hiện tại.

Báo cáo cuối: file thay đổi, migration (nếu có). Claude chạy alembic/pytest/tsc/vitest.
