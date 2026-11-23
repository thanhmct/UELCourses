# Brief W12 — Đổi mọi chữ "Một lần" thành "Một ngày"

Tự tìm file (grep `Một lần`, `one-off`, `Once`/`One time` trong `web/src` gồm `i18n/vi.ts`, `en.ts`, `timetable/*`, `TimetableGrid.tsx`, `venues`, `today`, `planner`, hàm định dạng lịch/tuần trong `web/src/lib/*` và test). Không chạy lệnh shell, không commit, không sửa backend (nếu chuỗi "Một lần" do API trả về thì ghi vào báo cáo cuối vị trí trong `api/`).

Yêu cầu: thống nhất mọi nơi hiển thị nhãn buổi học chỉ diễn ra một ngày (date_start = date_end) là **"Một ngày"** (VI) và **"One day"** (EN), ví dụ `Một ngày · 09/09/2026`. Không còn chuỗi "Một lần" nào trong giao diện (cũng bao gồm mô tả tuần/lặp lại như "Một lần" trong tooltip, danh sách lớp, xuất ICS mô tả, trang Phòng học, Hôm nay). Cập nhật test đang dùng chuỗi cũ; thêm 1 test khẳng định hàm định dạng trả "Một ngày"/"One day".

Báo cáo cuối: file thay đổi. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
