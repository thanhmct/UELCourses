# Brief W28 — Sửa tiêu đề học kỳ ở trang Kế hoạch bị vỡ bố cục

Tự tìm file: trang Kế hoạch `web/src/app/planner/page.tsx` (và component con nếu có trong `web/src/components/`), chuỗi i18n `web/src/i18n/vi.ts`/`en.ts` (khóa kiểu `sem.full`, `sem.display`, `planner.*`, tên học kỳ lấy từ dữ liệu `term`/`year`). Không chạy lệnh shell, không commit, không sửa backend.

## Lỗi (chủ dự án chụp ảnh)
Các thẻ cột theo học kỳ hiển thị tiêu đề như `HKHK01 năm học 2024-2025` rồi ngay bên phải là `5 môn · 14 TC` bị bóp hẹp, chữ tiêu đề ngắt dòng ("2024-" / "2025") còn "14 TC" bị xuống dòng thành "TC" lẻ loi. Nhìn lộn xộn, các cột thẻ không đều chiều cao.

## Sửa
1. **Nhãn học kỳ sai**: đang ra `HKHK01` (tiền tố "HK" bị lặp: nhãn "HK" + mã học kỳ đã có sẵn "HK01"). Chuẩn hóa thành `Học kỳ 1 · 2024-2025` (EN: `Semester 1 · 2024-2025`); lấy số kỳ từ mã (`HK01` → 1, `HK02` → 2, `HK03` → 3), năm học dạng `2024-2025`. Viết MỘT hàm dùng chung (vd trong `web/src/lib/` hoặc có sẵn nếu đã có, kiểm tra trước để không nhân bản) và dùng ở mọi nơi hiển thị tên học kỳ trong Kế hoạch (cột kế hoạch, chọn học kỳ, tooltip…). Không đổi giá trị lưu/URL, chỉ đổi chuỗi hiển thị.
2. **Bố cục tiêu đề thẻ**: tách thành hai dòng cố định, không ngắt giữa chừng: dòng 1 tên học kỳ (`whitespace-nowrap`, có `truncate` + `title` nếu quá hẹp), dòng 2 chữ phụ nhỏ xám `5 môn · 14 TC` (`whitespace-nowrap`; số và đơn vị không bao giờ bị tách ra dòng khác; EN: `5 courses · 14 credits`). Không để hai khối ép cạnh nhau trên cùng một hàng. Chiều cao tiêu đề các thẻ bằng nhau (cùng 2 dòng).
3. Kiểm tra mọi chỗ khác dùng cùng mẫu (tiêu đề học kỳ + tổng môn/tín chỉ) và sửa tương tự; giữ bố cục cố định, không nhảy khi dữ liệu đổi.
4. Test Vitest: hàm nhãn học kỳ (`HK01`+`2024-2025` → "Học kỳ 1 · 2024-2025"; EN), không còn chuỗi "HKHK"; tiêu đề thẻ có hai phần tử riêng (tên / thống kê) và thống kê chứa "5 môn · 14 TC" trong một phần tử duy nhất. Cập nhật test cũ tìm chuỗi cũ.

Báo cáo cuối: file thay đổi. Chủ dự án chạy tsc/vitest và xem bằng mắt.
