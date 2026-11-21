# Brief B1 — Tab "Hôm nay"

Đọc `AGENTS.md`. Tiếng Việt cho giao diện. Chỉ sửa: `web/src/app/today/**`, component mới nếu cần trong `web/src/components/`, khóa i18n trong `web/src/i18n/vi.ts` và `en.ts` (CHỈ thêm/sửa đúng các khóa liên quan bằng chỉnh sửa nhỏ, đọc lại file ngay trước khi sửa vì có agent khác cũng sửa file này), test mới trong `__tests__`. Không commit.

Yêu cầu (trang `/today`):
1. Khi hôm nay không có lịch học: thay "Không có lịch học vào {day}! Kiểm tra các ngày khác hoặc ghé thăm trang Học phần…" bằng **"Chúc mừng bạn đã được nghỉ ngơi!"** (EN: "Enjoy your day off!").
2. Dòng "Bây giờ là HH:MM": thêm **đồng hồ giờ:phút:giây chạy mỗi giây** ở bên phải ô đó (giờ địa phương; dọn interval khi unmount; không gây lỗi hydration — chỉ render sau khi mounted).
3. Bỏ dòng phụ đề "Xem nhanh các tiết học trong ngày, phòng học và giảng viên phụ trách." (khóa `today.subtitle` — không hiển thị nữa).
4. Danh sách lịch **từ hôm nay đến ngày mai** của tuần này (nếu hôm nay là Chủ nhật thì chỉ hôm nay). Mỗi ngày ghi rõ **thứ + ngày/tháng**: "Thứ hai, 23/11" (Thứ hai, Thứ ba, Thứ tư, Thứ năm, Thứ sáu, Thứ bảy, Chủ nhật; EN: Monday…). **Cỡ chữ của phần danh sách tăng 30%** (dùng `text-[1.3em]` hoặc scale tương đương trên phần nội dung, không làm vỡ bố cục mobile).
5. Bên dưới thêm **tab "Tuần sau"** (cạnh tab hiện tại, ví dụ "Hôm nay & mai" | "Tuần sau"): liệt kê lịch **Thứ hai → Chủ nhật của tuần kế tiếp**, mỗi ngày ghi thứ + ngày/tháng; ngày không có lớp ghi "Không có lịch".
6. "Để mũi tên bên phải": các mũi tên chuyển ngày/tuần (nếu có) đặt ở **bên phải** tiêu đề.
7. Dùng dữ liệu lịch hiện có của trang (store thời khóa biểu + hàm ngày trong `web/src/lib/dates.ts`, `schedule.ts`); không đổi API.

Tiêu chí xong: `cd web; npx tsc --noEmit` và `npx vitest run` qua; thêm test cho hàm tính danh sách ngày (hôm nay/mai/tuần sau, biên Chủ nhật) và nhãn thứ-ngày.
