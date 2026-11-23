# Brief B6e — Sửa 2 test đỏ + làm rõ danh sách "cần duyệt" khoa

Không chạy lệnh shell, không commit. Chỉ sửa code/test/seed trong `api/`. Chủ dự án chạy `cd api; .venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --ignore=tests/rag` và `audit-faculty`.

## 1. Hai test đỏ (sau B6d)
`api/tests/test_fix_module_faculty.py::test_unmapped_faculty_name_preserved` (assert dòng ~398) và `::test_aliases_map_to_canonical_faculty`. Đọc lỗi, xác định test hay code sai; chỉ sửa test nếu hành vi code đúng theo quy tắc (khoa chỉ từ đề cương, chuẩn hóa về 9 khoa chuẩn "Khoa …", không bịa; rác → "Phòng Đào tạo"), còn lại sửa code. Lưu ý quy tắc B6d: tên khoa không ánh xạ được vẫn phải KHÔNG bị mất thông tin — nay `unmapped_names` rỗng nên rà lại test "preserved" khớp với danh sách chuẩn/ alias hiện có.

## 2. Danh sách "cần duyệt" (36 môn) trong audit hiện tại
`needs_review_list`: "TOÁN KINH TẾ" 19, "QUẢN TRỊ KINH DOANH" 4, "QUẢN LÝ KINH DOANH" 2, "Toán Kinh tế" 2, "MATHEMATICAL ECONOMICS" 2, "FINANCE AND BANKING" 2, "TÀI CHÍNH NGÂN HÀNG" 1, "LUẬT KINH TẾ" 1, "LUẬT" 1, "Toán Kinh tế & Hệ thống thông tin" 1, "MATHEMATICAL ECONOMICS & INFORMATION SYSTEMS" 1. Nhiều tên rõ ràng là alias của khoa chuẩn (TOÁN KINH TẾ, Toán Kinh tế, MATHEMATICAL ECONOMICS → Khoa Toán kinh tế; QUẢN TRỊ KINH DOANH → Khoa Quản trị kinh doanh; FINANCE AND BANKING, TÀI CHÍNH NGÂN HÀNG → Khoa Tài chính - Ngân hàng; LUẬT KINH TẾ → Khoa Luật Kinh tế; LUẬT → Khoa Luật) nhưng vẫn bị "cần duyệt". Xác định lý do thật (xung đột giữa nhiều đề cương cùng môn? hay alias thiếu?) và:
   - nếu do alias/chuẩn hóa thiếu → thêm alias vào `api/seed/faculty_canonical.tsv` để ánh xạ thẳng;
   - nếu do một môn có nhiều đề cương khác khoa → giữ "cần duyệt", ghi rõ trong CSV cột `lý do` và các khoa xung đột;
   - "QUẢN LÝ KINH DOANH" (2) và các tên ghép ("Toán Kinh tế & Hệ thống thông tin", "MATHEMATICAL ECONOMICS & INFORMATION SYSTEMS") giữ "cần duyệt" (không tự chọn).
   Số trong `academic_affairs` (926) và `by_faculty["Phòng Đào tạo"]` (899) đang khác nhau: làm rõ hoặc thống nhất (giải thích trong báo cáo: 27 môn "cần duyệt" tạm ghi Phòng Đào tạo hay giữ giá trị cũ?). Với môn "cần duyệt" mà chưa quyết được: KHÔNG ghi đè khoa hiện tại bằng giá trị đoán; quy tắc áp dụng ghi rõ trong báo cáo.
3. In thêm vào tóm tắt của `audit-faculty`: danh sách "cần duyệt" kèm mã môn mẫu (tối đa 5 mã mỗi tên) để chủ dự án xem.

Báo cáo cuối: nguyên nhân từng test đỏ, các alias đã thêm, số môn "cần duyệt" còn lại.
