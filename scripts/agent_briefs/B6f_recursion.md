# Brief B6f — RecursionError trong chuẩn hóa tên khoa

Không chạy lệnh shell, không commit. Chủ dự án chạy `cd api; .venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --ignore=tests/rag`.

Còn 1 test đỏ: `api/tests/test_fix_module_faculty.py::test_unmapped_faculty_name_preserved` với `RecursionError: maximum recursion depth exceeded` ("Recursion detected (same locals & position)"). Đây là lỗi code thật (hai hàm gọi lẫn nhau vô hạn, thường giữa các hàm chuẩn hóa/ánh xạ trong `api/app/services/faculty_names.py`, ví dụ `faculty_vi` ↔ hàm chuẩn hóa canonical, khi tên khoa không ánh xạ được). Tìm vòng gọi, phá vòng (trả giá trị gốc đã làm sạch khi không ánh xạ được, tuyệt đối không gọi ngược), đảm bảo test khớp quy tắc: tên không ánh xạ được thì giữ chuỗi sạch (hoặc "cần duyệt"), không crash. Rà các hàm cùng loại để không còn đường đệ quy vô hạn (thêm test với đầu vào lạ: chuỗi rỗng, rác, rất dài, chỉ gồm "Khoa").

Báo cáo cuối: vòng gọi đã tìm thấy và cách sửa.
