# Brief C2 — Hiển thị lịch năm học 2026-2027 trên web

Tự tìm file. Không chạy lệnh shell, không commit, không sửa backend. API đã có (xem `api/app/routers/calendar.py`, `api/app/services/academic_calendar.py`, kiểu dữ liệu trong schemas): lịch sự kiện năm học theo khóa/học kỳ (96 sự kiện: đăng ký học phần, bắt đầu/kết thúc học kỳ, thi, nghỉ lễ Tết, công bố điểm…). Thêm hàm client trong `web/src/lib/api.ts` + kiểu trong `types.ts` (mock bật khi NEXT_PUBLIC_USE_MOCKS=true: thêm vài sự kiện mẫu).

Yêu cầu:
1. Trang mới `/calendar` ("Lịch năm học" / "Academic calendar"): chọn năm học + khóa (mặc định khóa từ chương trình của người dùng), hiển thị dạng lịch tháng và danh sách theo thời gian, lọc theo loại sự kiện, ghi rõ Thứ/ngày/tháng; thêm vào thanh điều hướng (Header) và i18n vi/en.
2. Trang Hôm nay (`today`): hiện banner nhỏ nếu hôm nay/vài ngày tới có sự kiện quan trọng (đăng ký học phần, thi, nghỉ lễ).
3. Trang Thời khóa biểu/Phòng học: đánh dấu tuần nghỉ lễ/thi theo lịch (nếu dữ liệu cho phép) — mức tối thiểu: chú thích dưới lưới khi tuần đang xem có sự kiện nghỉ lễ.
4. Test Vitest cho hàm lọc/nhóm sự kiện theo tháng và hiển thị trang (cleanup()).

Báo cáo cuối: file thay đổi. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
