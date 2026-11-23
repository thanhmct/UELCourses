# Brief B6c — Sửa 5 test pytest đỏ sau B6b

Không chạy lệnh shell, không commit. Chủ dự án chạy `cd api; .venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --ignore=tests/rag`. Mục tiêu: toàn bộ xanh. QUY TẮC CỦA CHỦ DỰ ÁN (B6b) giữ nguyên: khoa/bộ môn chỉ từ đề cương; không có đề cương → "Phòng Đào tạo", bộ môn NULL; không suy đoán. Chỉ sửa test cho khớp quy tắc đúng; chỉ sửa code nếu hành vi thật sự sai.

Các test đỏ:
1. `tests/test_fix_module_faculty.py::test_eff2045_like_outline_overrides_ctdt` (dòng ~52) và `::test_no_outline_becomes_academic_affairs` (dòng ~79): assert kiểm `search_text` có chuỗi CÓ DẤU ('Khoa Tài chính - Ngân hàng', 'Phòng Đào tạo') nhưng `search_text` đã được chuẩn hóa KHÔNG DẤU, chữ thường ('eff2045 quan tri tai chinh (e) khoa tai chinh - ngan hang bo mon tai chinh'). Sửa assert dùng `normalize_search(...)` của cùng module (hoặc chuỗi không dấu); hành vi đúng.
2. `tests/test_b3_brief.py::test_fill_faculties_from_outline_and_counterpart` (dòng ~60): test cũ kỳ vọng khoa copy từ bản tương ứng Anh↔Việt ("Khoa Kinh tế") — hành vi này đã bị bỏ theo quy tắc mới. Đổi tên và kỳ vọng: môn có đề cương → khoa từ đề cương; môn KHÔNG có đề cương (kể cả có counterpart có khoa) → "Phòng Đào tạo". Giữ phần kiểm chuẩn hóa/ánh xạ tên EN→VI từ đề cương.
3. `tests/test_real_formats.py::test_import_uis_api` (dòng ~171) và `::test_import_ta_plan_api` (dòng ~227): kỳ vọng khoa/bộ môn nạp từ file import ("Khoa Giả định", "Bộ môn Giả định 1") được lưu vào học phần. Theo quy tắc mới, import KHÔNG ghi khoa/bộ môn vào `modules` (chỉ đề cương) → sau import không có đề cương: faculty = "Phòng Đào tạo" (hoặc chưa đặt cho tới khi chạy `apply_outline_faculties`; kiểm tra luồng import thật gọi bước chuẩn hóa hay không và test cho khớp), department = None. Sửa kỳ vọng test cho đúng; nếu bài test còn kiểm tra rằng dữ liệu khoa trong file được đọc (parser), kiểm ở tầng parser (dòng đọc được) thay vì bảng `modules`.

Cuối cùng rà các test khác còn kỳ vọng khoa từ import/CTĐT/counterpart (grep `faculty` trong `api/tests`) để không còn mâu thuẫn quy tắc.

Báo cáo cuối: test đã sửa và lý do.
