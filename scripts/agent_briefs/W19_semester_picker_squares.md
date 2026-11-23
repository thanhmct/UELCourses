# Brief W19 — Bộ chọn học kỳ: dạng "Kỳ 1 | Kỳ 2 | Kỳ 3" (ô vuông) theo từng năm học

Tự tìm file: bộ chọn học kỳ ở `web/src/app/timetable/page.tsx` (có nút "Đến kỳ hiện tại", mũi tên chuyển kỳ), `web/src/app/venues/page.tsx`, `web/src/app/planner/page.tsx`, `web/src/app/modules/page.tsx` (lọc "Học kỳ có lớp mở"), và component chọn kỳ nếu đã có (grep `sem.display`, `Học kỳ`, `semesterName`, `SemesterSelect`); hàm tên kỳ `web/src/i18n/names.ts` (`semesterName`); i18n vi/en. Không chạy lệnh shell, không commit, không sửa backend.

## Hiện trạng (chủ dự án gửi ảnh)
Danh sách thả xuống dài: tiêu đề nhóm "NĂM HỌC 2024–2025", dưới là từng dòng "Học kỳ 1, 2024-2025", "Học kỳ 2, 2024-2025"…; nhãn không đồng nhất giữa các năm ("Học kỳ 1, 2024-2025" vs "Học kỳ 1, năm học 2025–2026"); phải cuộn nhiều.

## Yêu cầu
1. Tạo component dùng chung `SemesterPicker` (`web/src/components/SemesterPicker.tsx`): nút mở ghi kỳ đang chọn dạng gọn "Kỳ 1 · 2026–2027" (EN "Term 1 · 2026–2027"); khi mở, bảng thả xuống (popover, đóng khi bấm ra ngoài/Esc) hiển thị **mỗi năm học là một hàng**: bên trái nhãn năm "2026–2027" (đậm, chiều rộng cố định), bên phải **ba ô vuông** `Kỳ 1`, `Kỳ 2`, `Kỳ 3` (EN `Term 1/2/3`) kích thước bằng nhau (≈44×44px, bo góc nhẹ, viền mảnh). Trạng thái: ô đang chọn nền màu thương hiệu chữ trắng; ô kỳ hiện tại (theo `is_current`) có chấm nhỏ/viền nổi bật; ô kỳ **không tồn tại trong dữ liệu** của năm đó (vd chưa có HK3) bị vô hiệu hóa (mờ, không bấm được); hover nền nhẹ; focus ring rõ; điều hướng bàn phím (mũi tên trái/phải/lên/xuống chuyển giữa các ô, Enter chọn, Esc đóng).
2. **Đồng bộ cho mọi năm học** hiện có và các năm sau: dựng danh sách năm từ dữ liệu `semesters` (API `/api/semesters`, gom theo năm học; sắp xếp năm mới nhất lên trên hoặc năm hiện tại ở giữa với cuộn tự động tới năm đang chọn); năm học mới thêm vào dữ liệu tự có hàng mới, không sửa code. Chỉ có đúng 3 kỳ mỗi năm (HK1, HK2, HK3; không có học kỳ hè).
3. Nhãn **đồng nhất ở mọi nơi**: dùng một hàm (`semesterShort(sem, lang)` → "Kỳ 1", `academicYearLabel(sem)` → "2026–2027", `semesterFull` → "Học kỳ 1, năm học 2026–2027" cho tiêu đề/tooltip). Bỏ sự khác nhau giữa "2024-2025" và "năm học 2025–2026". Dùng dấu gạch nối dài (–) thống nhất.
4. Thay bộ chọn cũ (select/dropdown dài) ở Thời khóa biểu, Phòng học, Kế hoạch (nếu có), và bộ lọc "Học kỳ có lớp mở" của trang Học phần (ở đó hiển thị dạng ô vuông nhỏ có thể chọn nhiều, kèm số lớp: `Kỳ 1 · 651`, theo năm học, chỉ cho các kỳ có lớp). Giữ nút "Đến kỳ hiện tại" và mũi tên trước/sau kỳ ở Thời khóa biểu/Phòng học; giữ hành vi lưu kỳ đã chọn.
5. Responsive (di động: popover toàn chiều ngang, ô đủ lớn để bấm), dark mode, song ngữ, `aria` (role="listbox"/radiogroup phù hợp, `aria-label` "Chọn học kỳ").
6. Test Vitest (cleanup(), within/role): hiển thị theo hàng năm với 3 ô; chọn ô gọi callback; ô thiếu dữ liệu disabled; năm mới thêm vào dữ liệu có hàng mới; nhãn VI/EN; phím mũi tên; Esc/click ngoài đóng; cập nhật test cũ dùng chuỗi "Học kỳ 1, 2024-2025".

Báo cáo cuối: file thay đổi, các trang đã dùng component mới. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
