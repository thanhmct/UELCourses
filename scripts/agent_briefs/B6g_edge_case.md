# Brief B6g — Test biên cuối cùng của khoa

Không chạy lệnh shell, không commit. Chủ dự án chạy `cd api; .venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --ignore=tests/rag`.

Còn 1 test đỏ: `api/tests/test_fix_module_faculty.py::test_no_recursion_on_unmapped_and_edge_case_inputs` dòng ~637: `assert faculty_vi("Bộ môn") is None` nhưng thực tế trả "Bộ môn". Đã hết đệ quy (tốt). Các chuỗi chỉ gồm tiền tố/từ khung mà không có tên thật ("Bộ môn", "Khoa", "Faculty of", "Department of", "Bộ môn:", chuỗi chấm/gạch) KHÔNG phải tên khoa: `faculty_vi` phải trả None cho chúng (và `department_vi` trả None cho "Bộ môn"/"Khoa" trơn). Sửa code (chuẩn hóa sau khi bỏ tiền tố mà chuỗi rỗng → None, kể cả nhánh "đã là tiếng Việt thì giữ nguyên"), rồi chạy lại mọi assert biên trong test cho khớp; không làm yếu test.

Báo cáo cuối: nguyên nhân và dòng đã sửa.
