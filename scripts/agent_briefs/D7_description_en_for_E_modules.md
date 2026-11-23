# Brief D7 — Bổ sung mô tả tiếng Anh (`modules.description_en`) cho môn hệ E từ đề cương tiếng Anh

Chỉ đọc/sửa file bằng công cụ file, TUYỆT ĐỐI không chạy lệnh shell, không commit. Chạy SAU D5 (D5 đã thêm bộ đọc đề cương Word/PDF và cột `ctdt_year`). Chủ dự án (Claude) chạy lệnh CLI, pytest, tsc, vitest sau đó.

## Bối cảnh
Môn có mã bắt đầu bằng **E** là hệ tiếng Anh (mã B là hệ chuẩn). `modules` có `description_en`, `description_en_source` (`outline`|`counterpart`|NULL; có thể thêm giá trị mới), `counterpart_code`. Hiện: **383 môn E**, 156 đã có mô tả EN (135 từ đề cương, 21 từ môn tương ứng), **227 môn chưa có** (danh sách: `data/processed/E_modules_missing_description_en.txt`, mỗi dòng một mã).

## Nguồn đề cương tiếng Anh (ưu tiên theo thứ tự)
1. Đề cương đã nạp trong DB (`outline_module_links` → `outline_courses` + `outline_sections`) có `teaching_language` tiếng Anh/English (hoặc phần Mô tả/Course description viết bằng tiếng Anh): 41 trong 227 môn thiếu đã có liên kết đề cương, 30 là đề cương tiếng Anh nhưng chưa trích được mô tả (xem vì sao: tiêu đề mục lạ, bảng...).
2. Đề cương mới tải, nạp bởi D5: `data/outlines_master/docs|pdf` (Master_data, tên file `MÃ__id.ext`) và `data/outlines_master/ctdt2023/docs|pdf` (CTĐT 2023; có `manifest_ctdt2023.csv` kèm trạng thái ok/chan-quyen). Ưu tiên docx hơn PDF; "cập nhật" hơn "hiện tại". Mã E thường có file tiếng Anh riêng.
3. Đề cương của mã E đối ứng nằm cùng file với bản B nhưng có phần tiếng Anh: chỉ dùng khi phần mô tả đó THỰC SỰ viết bằng tiếng Anh.

## Việc cần làm
1. Viết lệnh CLI `fill-description-en` (api/app/cli.py + service riêng) với `--dry-run` và `--only-missing` (mặc định): với mỗi môn E có `description_en` rỗng, tìm đề cương theo thứ tự nguồn ở trên; lấy đoạn "Course description"/"Mô tả học phần" (tiếng Anh) làm `description_en` (cắt gọn như các mô tả hiện có, bỏ đánh số mục); đặt `description_en_source = 'outline'` và lưu mã tài liệu nguồn nếu có chỗ (vd `description_en_ref`/ghi chú), cập nhật `search_text`. Nhận dạng "viết bằng tiếng Anh": không có ký tự tiếng Việt có dấu và có ít nhất 8 từ tiếng Anh thông dụng (the, of, and, to, in, students, course, will…); đoạn tiếng Việt KHÔNG được dùng làm `description_en`.
2. Không ghi đè mô tả EN đã có, không động đến `description` (tiếng Việt). Môn không tìm được nguồn tiếng Anh: để nguyên rỗng và ghi vào `data/processed/E_modules_still_missing_description_en.csv` (mã, tên, mã B tương ứng, lý do: không có đề cương / đề cương chỉ tiếng Việt / file bị chặn quyền / không tách được mục mô tả) để chủ dự án quyết bước tiếp theo.
3. Chạy lại bộ đếm sau khi nạp: in số môn E có/không có `description_en` trước và sau, số theo nguồn.
4. Test pytest: tạo 2 đề cương mẫu nhỏ (một tiếng Anh, một tiếng Việt) trong test, chứng minh chỉ lấy bản tiếng Anh; không ghi đè khi đã có mô tả.
5. API/Web: trang chi tiết môn ở chế độ EN hiển thị `description_en` khi có (nếu đã có sẵn thì chỉ kiểm tra), nếu không có thì hiện mô tả tiếng Việt kèm nhãn nhỏ "Vietnamese description" (không để trống).

## Quy tắc ghi HANDOFF (thêm 2026-11-23): khi cập nhật docs/HANDOFF.md chỉ THÊM một dòng ngắn vào đúng mục (Đang làm dở / Việc tiếp theo / Chờ chủ dự án); KHÔNG dán lại khối lịch sử dài (lịch sử nằm ở docs/handoff/HISTORY.md). Đọc lại file hiện tại trước khi sửa.
