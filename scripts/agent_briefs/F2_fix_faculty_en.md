# Brief F2 — Sửa lỗi `faculty_en` trả tiếng Việt cho đầu vào tiếng Anh

Chỉ sửa `api/app/services/faculty_names.py`. Không sửa test, không commit, không chạy shell.

Lỗi: trong `faculty_en(vi)`, nhánh "đã là tiếng Anh" (khoảng dòng 200–208) vòng lặp `for orig_en in STATIC_FACULTY_EN_TO_VI` trả về `STATIC_FACULTY_EN_TO_VI[orig_en]` — đó là giá trị TIẾNG VIỆT. Hệ quả: `faculty_en("Faculty of Economics")` trả "Khoa Kinh tế" thay vì "Faculty of Economics" (test `api/tests/test_b3_brief.py::test_faculty_and_department_name_mappings` lỗi ở dòng đó).
Sửa: trả về chính khóa tiếng Anh chuẩn `orig_en` (dạng Title Case đã có trong bảng), không phải giá trị tiếng Việt. Kiểm tra `department_en` có cùng lỗi ở nhánh tương tự không và sửa nếu có.

Tiêu chí xong: `cd api; python -m pytest -q --ignore=tests/rag` — toàn bộ qua (hiện 276 qua, 1 lỗi).
