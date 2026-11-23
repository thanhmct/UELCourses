# Brief W32 — Ô tìm môn ở Thời khóa biểu: dời nhãn "Không có lịch" và đổi màu nhãn "Tự chọn"

Tự tìm file: `web/src/components/TimetableModuleSearch.tsx` (ô "THÊM HỌC PHẦN VÀO THỜI KHÓA BIỂU"), các nhãn Bắt buộc/Tự chọn có thể dùng chung với `web/src/app/modules/page.tsx` và `web/src/app/modules/[code]/page.tsx` (xem W8), i18n `vi.ts`/`en.ts`, test trong `web/src/app/timetable/__tests__/` và `web/src/components/__tests__/`. Không chạy lệnh shell, không commit, không sửa backend.

## Hiện trạng
Mỗi dòng gợi ý trong ô tìm môn đang là:

`BAA2029  Kế toán tài chính  [Bắt buộc]  [Không có lịch]` …………………… `3 TC`

Hai vấn đề chủ dự án nêu:
1. Nhãn **"Không có lịch"** đang nằm ngay sau tên môn, lẫn với nhãn Bắt buộc/Tự chọn.
2. Nhãn **"Tự chọn"** đang dùng màu vàng/hổ phách **giống hệt** nhãn "Không có lịch", nhìn không phân biệt được.

## Yêu cầu
1. **Dời "Không có lịch" sang bên phải, đặt ngay cạnh số tín chỉ**, thành:

   `BAA2029  Kế toán tài chính  [Bắt buộc]` …………………… `[Không có lịch]  3 TC`

   Cụm bên phải (`Không có lịch` + `3 TC`) đi liền nhau, cách nhau một khoảng nhỏ, căn phải cùng hàng. Môn có lịch thì chỉ còn `3 TC` như cũ, **không để chỗ trống nhảy layout** (dành sẵn chỗ hoặc dùng `flex` co giãn, theo nguyên tắc khung cố định của W22).

2. **Đổi màu nhãn "Tự chọn"** cho khác hẳn "Không có lịch":
   - `Bắt buộc` — giữ nguyên **xanh lá nhạt** (nền `emerald-50`, chữ `emerald-700`, hoặc token tương đương đang dùng).
   - `Tự chọn` — chuyển sang **xanh dương/chàm nhạt** (nền `indigo-50`/`sky-50`, chữ `indigo-700`/`sky-700`): trung tính, không mang nghĩa cảnh báo.
   - `Không có lịch` — giữ **vàng/hổ phách** vì đây mới là thông tin cần chú ý.
   Ba nhãn phải phân biệt được cả khi nhìn nhanh lẫn với người mù màu đỏ-lục (khác nhau cả sắc độ, không chỉ khác màu).

3. Áp dụng màu mới của `Tự chọn` **nhất quán ở mọi nơi** đang hiện nhãn này: danh sách Học phần, trang chi tiết học phần, trang Chương trình đào tạo, ô tìm môn ở Kế hoạch. Nếu các trang đang định nghĩa màu riêng lẻ thì gom thành một component/hằng số dùng chung.

4. Hỗ trợ chế độ tối (dùng biến màu sẵn có), độ tương phản chữ trên nền đạt mức đọc được.

5. Test Vitest (`cleanup()`, `within`/role): dòng gợi ý có môn không lịch → nhãn "Không có lịch" nằm trong cụm bên phải cùng với "3 TC", không nằm cạnh tên môn; môn tự chọn → nhãn có lớp màu khác với nhãn "Không có lịch" (khẳng định bằng class hoặc `data-variant`, đừng khẳng định bằng mã màu thô); môn có lịch → không có nhãn "Không có lịch" và layout không đổi chiều cao.

Báo cáo cuối: file thay đổi, bảng ba nhãn kèm màu đã chọn. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
