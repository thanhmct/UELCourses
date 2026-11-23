# Brief D1 — Tìm trên mạng đơn vị phụ trách các học phần mã DG (CHỈ nghiên cứu, không sửa DB/code)

Chỉ đọc file, tìm kiếm trên web và GHI ĐÚNG MỘT file kết quả `data/processed/dg_faculty_suggestions.md`. Tuyệt đối không chạy lệnh shell, không sửa mã nguồn, không sửa DB, không commit.

Bối cảnh: Trường Đại học Kinh tế – Luật (UEL, ĐHQG-HCM). Mã DG = học phần đại cương (B = hệ Việt, E = hệ tiếng Anh). Danh sách 44 môn kèm khoa/bộ môn hiện tại trong DB nằm ở `data/processed/dg_modules_list.txt` (cột: code|name|faculty|department|có đề cương).

## Việc cần làm
Với MỖI môn trong danh sách, tìm nguồn công khai (website uel.edu.vn và các trang khoa/bộ môn/trung tâm của UEL, đề cương học phần công khai, thông báo kế hoạch giảng dạy, trang giới thiệu đơn vị) để xác định **khoa/đơn vị và bộ môn phụ trách giảng dạy môn đó**. Chủ dự án đã khẳng định các dòng sau là SAI, cần ưu tiên tìm đúng:
- BDG1001 Triết học Mác – Lênin; BDG1003 Chủ nghĩa xã hội khoa học; BDG1004 Tư tưởng Hồ Chí Minh; BDG1005 Lịch sử Đảng CSVN (hiện ghi Khoa Tài chính - Ngân hàng, bộ môn Kinh tế học – sai)
- BDG1009 Quan hệ quốc tế, EDG1009 Quan hệ quốc tế (E)
- BDG1012, BDG1013 Giáo dục thể chất 1, 2; BDG1014 Giáo dục quốc phòng
- EDG1011 Logic học (E) (đối chiếu với BDG1011 Logic học), EDG1016 Trách nhiệm xã hội và phục vụ cộng đồng (E) (đối chiếu BDG1016)
- Toàn bộ nhóm ngoại ngữ EDG1017–EDG1035 (tiếng Trung HSK, Nhật, Hàn, Pháp DELF, IELTS) và EDG1007/EDG1008 (lớp vét): đơn vị nào phụ trách (vd Trung tâm Ngoại ngữ – Tin học, Khoa/Bộ môn Ngoại ngữ, Viện Quốc tế…).
- Các môn còn lại (BDG1006–1008, 1010, 1015, 1070–1077…): kiểm tra xem khoa hiện tại có đúng không.

## Quy tắc
- Phải có BẰNG CHỨNG: ghi URL nguồn + trích ngắn (dưới 15 từ) hoặc mô tả nguồn. Không suy đoán; nếu không tìm được nguồn thì ghi "không tìm thấy nguồn" và độ tin cậy "thấp", đừng bịa.
- Tên đơn vị chuẩn hóa theo tên chính thức của UEL (vd "Khoa Lý luận chính trị", "Trung tâm Ngoại ngữ - Tin học"…). Ghi đúng như nguồn; nếu môn bản tiếng Anh (E) trùng nội dung với bản tiếng Việt (B) thì cho cùng đơn vị và nói rõ.
- Không đưa "Phòng Đào tạo" làm đơn vị giảng dạy trừ khi nguồn nói rõ.

## Định dạng file kết quả
Bảng Markdown: `Mã | Tên môn | Hiện tại (khoa / bộ môn) | Đề xuất (khoa / bộ môn) | Độ tin cậy (cao/trung bình/thấp) | Nguồn (URL + ghi chú)`, sắp theo mã, rồi cuối file mục "Tóm tắt thay đổi đề xuất" liệt kê các môn đề xuất đổi và các môn không tìm được nguồn.
