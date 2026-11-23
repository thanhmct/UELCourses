# Brief A4 — Quản trị dữ liệu học phần (khoa/bộ môn) và độ phủ đề cương

Đọc trước `docs/PLAN_ADMIN.md` (D-A7, mục 4 Dữ liệu học phần + Đề cương, mục 5 mục 4–5). A0, A1 xong; chuẩn hóa khoa B6 (`api/app/services/faculty_names.py`: `apply_outline_faculties`, audit, bảng tiền tố `api/seed/prefix_to_faculty.tsv`, CSV `data/processed/module_faculty_audit.csv`, `module_faculty_prefix_conflicts.csv`) đã có — đọc code hiện tại, dùng lại hàm audit, KHÔNG viết lại logic. Chỉ đọc/sửa file, không chạy shell, không commit.

## Backend (vai trò `admin` hoặc `data_editor`)
1. Tôn trọng nguồn `admin`: trong `apply_outline_faculties`/`fix-module-faculty`, môn có `faculty_source='admin'` KHÔNG bị ghi đè bởi bất kỳ nguồn tự động nào; audit hiển thị nguồn `admin`. Khi quy trình tự động đặt khoa thì cũng ghi `faculty_source` tương ứng (`outline`, `counterpart_outline`, `prefix`). Test.
2. `GET /api/admin/data/faculty-review?kind=needs_review|prefix_conflict|no_source&q=&page=`: trả từng môn {code, name, credits, faculty hiện tại, department, faculty_source, đề xuất (khoa, nguồn, độ tin cậy), lý do, số lớp mở, có trong CTĐT nào (đếm)}; dữ liệu lấy từ hàm audit chạy trực tiếp trên DB (có cache ngắn 60s), không đọc CSV.
3. `PATCH /api/admin/modules/{code}` (faculty, department; kiểm faculty thuộc danh sách khoa chuẩn + "Phòng Đào tạo"; department tự do có gợi ý) → ghi `faculty_source='admin'`, `faculty_set_by`, `faculty_set_at`, cập nhật `search_text`, `audit_log` before/after. `POST /api/admin/data/faculty-review/bulk` `{codes:[…], action:"accept_suggestion"|"set", faculty?}`. `DELETE /api/admin/modules/{code}/faculty-override` (trả về chế độ tự động, chạy lại `apply` cho môn đó).
4. `GET /api/admin/faculties` (danh sách khoa chuẩn + bộ môn đã biết theo khoa, để làm dropdown).
5. Đề cương: `GET /api/admin/outlines/coverage` (tổng môn, có đề cương qua `outline_module_links` hoặc mã, % theo khoa, theo học kỳ có lớp mở); `GET /api/admin/outlines/missing?sort=open_classes` (môn thiếu đề cương, sắp theo số lớp mở giảm dần, có mã bản tương ứng và bản đó có đề cương không); `GET /api/admin/outlines/ocr-pending` (tài liệu `ocr_status='pending'`); `GET /api/admin/outlines/drive-links` (link Google Docs/Drive chưa tải, kèm môn liên quan) — chỉ liệt kê, KHÔNG tải.
6. Overview `data_review_pending` = số needs_review + prefix_conflict.

## Web
7. `/admin/data`: tab con "Cần duyệt khoa", "Xung đột tiền tố", "Chưa có nguồn", "Đã chỉnh tay"; bảng với cột như mục 2; mỗi dòng có dropdown chọn khoa (9 khoa chuẩn + Phòng Đào tạo) + ô bộ môn (gợi ý theo khoa) + nút Lưu; nút "Nhận đề xuất" cho dòng có đề xuất; chọn nhiều → "Nhận đề xuất cho N môn" / "Đặt khoa cho N môn"; lọc theo tiền tố mã/khoa/tìm kiếm; liên kết mã môn mở trang học phần ở tab mới. Sau lưu, dòng rời khỏi danh sách tại chỗ (không tải lại trang, không nhảy layout — giữ chỗ bằng hiệu ứng mờ dần).
8. `/admin/outlines`: thẻ độ phủ (% có đề cương tổng và theo khoa, thanh ngang SVG), bảng môn thiếu đề cương (số lớp mở, bản tương ứng có đề cương không), danh sách OCR chờ, danh sách link Drive chờ đồng ý (ghi chú: "Cần chủ dự án đồng ý trước khi tải").
9. Test pytest: PATCH ghi nguồn admin + audit; `fix-module-faculty` không ghi đè admin; bulk accept; override delete; quyền (moderator → 403); coverage số đúng trên dữ liệu test. Vitest: bảng hiển thị, chọn khoa lưu và dòng biến mất, bulk, lọc.

Báo cáo cuối: file thay đổi. Claude chạy pytest/tsc/vitest.
