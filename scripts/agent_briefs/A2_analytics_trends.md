# Brief A2 — Thu thập xu hướng (ẩn danh) + trang "Xu hướng chọn môn"

Đọc trước `docs/PLAN_ADMIN.md` (D-A5, mục 3 bảng analytics_*, mục 4 Xu hướng + `POST /api/analytics/events`, mục 5 mục 2, mục 7). A0, A1 đã xong. Chỉ đọc/sửa file, không chạy shell, không commit.

## Backend
1. Migration `0018_analytics` (down_revision = 0017): `analytics_events`, `analytics_daily`, `analytics_pairs` + index như PLAN. Model khớp.
2. `POST /api/analytics/events` (công khai, không cần đăng nhập): nhận `{anon_id, events:[{type, module_code?, class_code?, semester_id?, program_code?, query?, filters?, page?, ts?}]}`, tối đa 50 sự kiện/lô; kiểm `type` thuộc danh sách cho phép: `module_view`, `timetable_add`, `timetable_remove`, `timetable_swap_class`, `planner_add`, `planner_remove`, `search`, `search_no_result`, `filter_use`, `program_set`, `ics_export`, `share_link`; cắt `query` 64 ký tự; bỏ trường lạ; `program_code` chỉ nhận dạng mã lớp/CTĐT (regex `^K\d{2}\d{3}[A-Z0-9]*$`); không lưu IP/user-agent; rate limit trong bộ nhớ 10 sự kiện/giây/anon_id và 600/phút/IP (trả 429 nhẹ); `analytics.enabled=false` → 204 bỏ qua. Trả 204.
3. Tổng hợp: hàm + CLI `python -m app.cli aggregate-analytics [--since DATE]` dựng `analytics_daily` và `analytics_pairs` (cặp môn cùng có trong một TKB: dùng sự kiện `timetable_add` theo anon_id+semester, tính tập môn hiện tại của mỗi anon_id rồi đếm cặp), idempotent; `purge-analytics` xóa sự kiện thô cũ hơn `analytics.retention_days`. Thêm vào lệnh định kỳ nếu dự án có (ghi cách chạy cron trong README; Render free có thể chạy khi khởi động).
4. API xu hướng (vai trò `admin` hoặc `data_editor`): `/api/admin/trends/modules`, `/pairs`, `/slots` (đếm theo thứ × tiết của các lớp được thêm — lấy lessons của class_code), `/conflicts` (tỷ lệ anon_id có TKB trùng lịch/ranh giới tiết — dùng lại logic xung đột ở backend nếu có, nếu không thì tính từ lessons), `/search` (top `search_no_result`), `/classes?module=`; tham số `semester`, `program` (mã CTĐT hoặc tiền tố khóa), `from`, `to`; mỗi endpoint có `?format=csv`. Ngưỡng ẩn danh: không trả nhóm có < 5 anon_id khác nhau (k-anonymity) — thay bằng "<5".
5. Overview (A1) lấy số thật từ bảng mới.

## Web sinh viên
6. `web/src/lib/analytics.ts`: tạo `anon_id` (UUID, localStorage, try/catch), hàng đợi trong bộ nhớ, gửi lô mỗi 10 giây hoặc khi ẩn trang (`navigator.sendBeacon`), bỏ qua khi `navigator.doNotTrack === "1"` hoặc người dùng tắt; không gửi khi `NEXT_PUBLIC_USE_MOCKS=true` hoặc chạy test. Không bao giờ gửi tên/email/mã sinh viên.
7. Gắn sự kiện: trang chi tiết học phần (`module_view`), ModuleActions/timetable (`timetable_add/remove/swap_class`), planner (`planner_add/remove`), ô tìm kiếm học phần (debounce 1s; `search` + `search_no_result` khi 0 kết quả), bộ lọc (`filter_use` tên nhóm/giá trị), lưu chương trình (`program_set` chỉ mã CTĐT), xuất ICS, chia sẻ.
8. Cài đặt: công tắc "Chia sẻ dữ liệu sử dụng ẩn danh để cải thiện UELPATH" + mô tả ngắn + liên kết "Tìm hiểu thêm" (trang/khối giải thích dữ liệu thu thập gì, không thu thập gì, giữ 180 ngày). Hộp thoại lần đầu (FirstVisitModal/ProgramProfileDialog) có một dòng nhỏ thông báo + công tắc (không popup riêng, không chặn).

## Web quản trị
9. Trang `/admin/trends`: bộ lọc cố định trên cùng (học kỳ — dùng SemesterPicker nếu có, khóa/CTĐT, khoảng thời gian 7/30/90 ngày/tùy chọn); các khối: (a) bảng Top môn (lượt thêm TKB, thêm kế hoạch, lượt xem, xu hướng ▲▼ so với khoảng trước, nút xem lớp); (b) bản đồ nhiệt Thứ × Tiết (SVG tự vẽ, không thêm thư viện nặng; màu theo mức, có chú giải và tooltip số); (c) cặp môn hay đi cùng; (d) lớp được chọn nhiều của môn đang chọn; (e) từ khóa tìm không ra kết quả; (f) tỷ lệ TKB có xung đột; (g) biểu đồ đường hoạt động theo ngày (SVG). Mỗi khối có "Xuất CSV". Khung cố định, skeleton đúng kích thước.
10. Tổng quan thêm biểu đồ hoạt động 30 ngày.

## Test
pytest: nhận lô hợp lệ; loại type lạ/trường lạ; cắt query; regex program_code; rate limit 429; tắt analytics → bỏ qua; aggregate idempotent; cặp môn đúng; k-anonymity ẩn nhóm <5; trends yêu cầu vai trò; CSV đúng cột; purge xóa đúng. Vitest (cleanup()): analytics không gửi khi DNT/tắt/mock; gửi lô; công tắc Cài đặt lưu; trang trends hiển thị từ mock; heatmap vẽ đúng số ô.

Báo cáo cuối: file thay đổi, migration, lệnh CLI. Claude chạy alembic/pytest/tsc/vitest.
