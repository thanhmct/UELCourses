# Brief B5 — Lớp có lịch "3 tầng ngày" bị thiếu (môn Ngân hàng đầu tư)

Đọc `AGENTS.md`. Chỉ sửa trong `api/` (parser lịch trong `api/app/services/` — tìm hàm phân tích trường `Schedules`/`schedule_raw`, ví dụ `schedule.py`/`importer.py`/`lessons`), thêm test. KHÔNG sửa web, KHÔNG chạy migration/nạp dữ liệu, không commit.

Vấn đề: học phần **Ngân hàng đầu tư** có lớp mà lịch gồm nhiều **tầng ngày** (nhiều đợt/khoảng ngày khác nhau, mỗi đợt có thứ/tiết/phòng riêng trong cùng một chuỗi `schedule_raw`) → hiện không tạo được `lessons` (hoặc mất một số tầng) nên giao diện thiếu lớp/buổi.

Việc cần làm:
1. Tìm trong DB các lớp thuộc môn Ngân hàng đầu tư (tìm theo `modules.name ILIKE '%ngân hàng đầu tư%'`, đọc `class_sections.schedule_raw` mẫu — dùng truy vấn SELECT chỉ-đọc qua `python -m app.cli`/script trong `scratch`, KHÔNG ghi DB) và các lớp có `schedule_raw` mà số `lessons` = 0 hoặc ít hơn số đoạn lịch trong chuỗi. Liệt kê vài mẫu thật trong `docs/` hoặc báo cáo cuối.
2. Xác định định dạng "3 tầng" (ví dụ nhiều dòng "Thứ X, tiết a–b, phòng …, từ dd/mm đến dd/mm" nối bằng ký tự phân tách nào) và sửa parser để tách **mọi tầng** thành các `Lesson` với `date_start/date_end`, `weekday`, `start_period/end_period`, `room`.
3. Test pytest dùng các chuỗi mẫu thật (rút gọn, không dữ liệu cá nhân); đảm bảo không làm hỏng các định dạng cũ (toàn bộ test hiện có vẫn qua).
4. Viết vào `docs/` hoặc cuối báo cáo **đúng lệnh** để Claude chạy nạp lại lịch sau khi sửa (vd `python -m app.cli backfill-lesson-dates`/lệnh nạp phù hợp) — chỉ liệt kê, không tự chạy.

Tiêu chí xong: `cd api; python -m pytest -q --ignore=tests/rag` qua.
