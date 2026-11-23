# Brief B6h — Mượn khoa từ đề cương của bản tương ứng; môn không có đề cương giữ nguyên giá trị cũ

Không chạy lệnh shell (chủ dự án chạy), không commit. Sửa `api/app/services/faculty_names.py` (hàm `apply_outline_faculties` và lệnh `fix-module-faculty`/`audit-faculty` trong `api/app/cli.py`), test `api/tests/test_fix_module_faculty.py` và các test liên quan. Chủ dự án chạy `cd api; .venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --ignore=tests/rag`.

## SỬA QUAN TRỌNG VỀ "ĐỀ CƯƠNG CỦA MỘT MÔN" (phát hiện khi kiểm DB)
Cách tìm đề cương hiện tại trong `apply_outline_faculties`/audit là khớp `outline_courses.course_code(_norm) == module.code` — SAI/THIẾU. Liên kết thật giữa học phần và đề cương nằm ở bảng **`outline_module_links(document_id, module_code, source)`** (nguồn `catalog`: từ bảng `program_catalog_entries`/`outline_resources`, link Drive), rồi nối `outline_courses.document_id = outline_module_links.document_id` để lấy `faculty`, `department`. Ví dụ BKB4060 "Luật sở hữu trí tuệ": không có `outline_courses` nào mang `course_code='BKB4060'`, nhưng `outline_module_links` trỏ tới document 33/191, đề cương đó ghi `course_code` = BKB4020 (mã cũ), faculty "LUẬT KINH TẾ"/"ECONOMIC LAW", department "LUẬT KINH DOANH"/"BUSINESS LAW" → khoa phải là Khoa Luật Kinh tế, bộ môn Bộ môn Luật kinh doanh. Đây chính là hàm `_modules_with_outline_subquery()` trong `api/app/routers/modules.py` (dùng `OutlineModuleLink`) — `has_outline` của API dựa vào nó.
→ Nguồn đề cương cho một học phần = HỢP của: (1) `outline_module_links` của mã đó → `outline_courses` theo `document_id`; (2) `outline_courses` khớp trực tiếp `course_code_norm`. Nhiều đề cương cho cùng môn: bản VI/EN của cùng tài liệu (như hai dòng LUẬT KINH TẾ / ECONOMIC LAW của BKB4060) KHÔNG phải xung đột — chuẩn hóa về khoa chuẩn rồi so; chỉ khi khác khoa chuẩn mới cần duyệt. Số liệu kiểm: trong 816 môn khoa trống, theo cách này chỉ còn ~638 môn không có nguồn khoa (thay vì 740).

## Quy tắc mới (chủ dự án quyết, thay quy tắc "Phòng Đào tạo")
1. Khoa/bộ môn của một học phần lấy theo thứ tự: (a) **đề cương của chính mã đó**; (b) nếu không có, **đề cương của bản tương ứng Anh↔Việt** (`counterpart_code`, khi chính đề cương đó có khoa; dùng khoa/bộ môn ghi trong ĐỀ CƯƠNG của bản kia, không dùng giá trị khoa đang lưu trong bảng `modules` của nó). Nguồn ghi trong cột `nguồn` của CSV: `outline`, `counterpart_outline`.
2. Môn **không có đề cương của mình lẫn của bản tương ứng**: **KHÔNG ghi "Phòng Đào tạo"**, KHÔNG đổi gì — giữ nguyên giá trị khoa/bộ môn đang có trong DB (kể cả trống). (Bỏ hoàn toàn nhánh gán "Phòng Đào tạo" trong lệnh sửa; trong CSV ghi kết luận `giữ nguyên`.) Với các môn khoa hiện tại có giá trị nhưng KHÔNG có nguồn đề cương xác nhận (vd BBB1068 "Kỹ năng lãnh đạo" đang ghi sai Khoa Tài chính - Ngân hàng): cũng giữ nguyên, nhưng đánh dấu trong CSV `không có đề cương – chưa kiểm chứng` để theo dõi.
3. Đề cương mâu thuẫn nhau (cần duyệt): giữ nguyên giá trị hiện tại như B6e đã làm.
4. Không suy luận bằng bộ môn/tiền tố/CTĐT như đã quy định ở B6b. Khi mượn từ bản tương ứng chỉ mượn một bước (không bắc cầu).
5. Idempotent; không ghi đè khoa đã đúng; cập nhật `search_text`.

## Yêu cầu
- `audit-faculty` in thêm: số môn lấy từ `outline`, số môn từ `counterpart_outline`, số môn `giữ nguyên` (trong đó còn trống, còn có giá trị chưa kiểm chứng). Bỏ chỉ số "academic_affairs"/"Phòng Đào tạo" khỏi tóm tắt (nhưng 4 môn hiện đã ghi "Phòng Đào tạo" từ trước thì giữ nguyên như mọi giá trị cũ).
- Cập nhật test: EFF2045-like vẫn đúng; bản E không có đề cương mà bản VI có đề cương ghi khoa → nhận khoa đó (nguồn counterpart_outline); không có cả hai → giữ nguyên giá trị cũ (test trống và test có giá trị cũ); không bắc cầu; idempotent. Sửa các test trước đây kỳ vọng "Phòng Đào tạo".
- Cập nhật `docs/DECISIONS.md` (mục B6: quy tắc mới thay thế "Phòng Đào tạo") và README `api/`.

Báo cáo cuối: nêu lệnh chạy (audit → dry-run → thật) và thay đổi chính.
