# Brief T2 — Cài đặt: bảng màu thời khóa biểu (8 bộ + hex + đặt lại)

Tự tìm file (gợi ý `web/src/app/settings/page.tsx`, `web/src/lib/store.ts` `useSettings`, `web/src/components/TimetableGrid.tsx`, trang `timetable`, `today` nếu dùng màu môn). Không chạy lệnh shell, không commit, không sửa backend.

Yêu cầu (từ chủ dự án): thêm ở Cài đặt phần "Màu thời khóa biểu":
1. **8 bộ màu** chọn bằng thẻ xem trước: (1) "UEL" gradient cam–xanh theo nhận diện thương hiệu UEL (cam #F26522 → xanh dương #0B4A8F, các màu trung gian suy ra); (2) bộ tham khảo kiểu NUSMods (dải màu pastel nhiều sắc, tự định nghĩa hex của bạn, không sao chép nguyên bảng của họ); (3–8) sáu bộ do bạn đề xuất (vd Đại dương, Rừng, Hoàng hôn, Pastel, Tương phản cao, Đơn sắc xanh) — tên vi/en, mỗi bộ ≥ 8 màu, chữ trên nền đạt tương phản đọc được.
2. **Bảng nhập mã hex**: người dùng chỉnh từng màu của bộ đang chọn (ô `input type=color` + ô text hex, kiểm tra hợp lệ `#RRGGBB`), tạo bộ "Tùy chỉnh" lưu riêng.
3. Nút **Đặt lại mặc định** (về bộ UEL, xóa tùy chỉnh).
4. Lưu vào `useSettings` (persist localStorage cùng cơ chế sẵn có) và áp dụng ngay vào `TimetableGrid` (màu theo học phần, chọn màu theo chỉ số môn modulo số màu) và các chỗ khác dùng màu môn; hỗ trợ chế độ tối nếu app có.
5. Tách dữ liệu bộ màu ra `web/src/lib/timetableThemes.ts` (thuần, có test: đủ 8 bộ, mọi hex hợp lệ, hàm `colorForModule`, reset).
6. i18n vi/en đầy đủ.

Báo cáo cuối: file thay đổi. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
