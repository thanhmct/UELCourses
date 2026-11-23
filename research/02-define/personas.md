# Persona người dùng UELPATH

> **Trạng thái:** bản nháp trước khảo sát. Toàn bộ persona dưới đây là **proto-persona** (Gothelf & Seiden, 2013) xây dựng từ hiểu biết của nhóm về sinh viên UEL, **chưa** dựa trên dữ liệu thực nghiệm. Mọi chi tiết mang nhãn `[GIẢ ĐỊNH – cập nhật sau khảo sát]` cho tới khi được xác nhận bằng khảo sát nhu cầu (`01-empathize/survey-needs.md`) và phỏng vấn sâu (`01-empathize/interview-guide.md`).

Persona là chân dung khái quát của một nhóm người dùng có chung mục tiêu và hành vi (Cooper, 1999), giúp nhóm phát triển ra quyết định thiết kế nhất quán. Tên và chi tiết đều là hư cấu.

## Persona 1 – "Người xếp lịch kỹ lưỡng": Minh Anh `[GIẢ ĐỊNH – cập nhật sau khảo sát]`

| Thuộc tính | Mô tả |
|---|---|
| Hồ sơ | Nữ, 20 tuổi, sinh viên năm 2, ngành Tài chính – Ngân hàng, chương trình chuẩn |
| Bối cảnh | Làm thêm cố định tối thứ 3, 5 và sáng thứ 7; muốn gom lịch học vào 3–4 ngày |
| Mục tiêu | Có TKB không trùng lịch, khớp lịch làm thêm, chuẩn bị sẵn 2–3 phương án dự phòng trước giờ mở ĐKHP |
| Hành vi hiện tại | Chép danh sách lớp sang Google Sheets, tô màu thủ công; mất 1–2 giờ mỗi học kỳ |
| Điểm đau | Lớp ưu tiên hết chỗ sau vài phút → phải dò lại toàn bộ để tìm lớp thay thế không trùng; khó nhìn tổng thể tuần |
| Câu nói đặc trưng (giả định) | "Chỉ cần lệch một lớp là phải xếp lại cả bảng." |
| Tính năng cần nhất | TKB trực quan + phát hiện trùng lịch, kéo-thả đổi lớp, nhiều phương án, ẩn môn |
| Thiết bị | Máy tính khi chuẩn bị; điện thoại khi đăng ký |

## Persona 2 – "Người cần lấp chỗ trống": Quốc Huy `[GIẢ ĐỊNH – cập nhật sau khảo sát]`

| Thuộc tính | Mô tả |
|---|---|
| Hồ sơ | Nam, 22 tuổi, sinh viên năm 4, ngành Hệ thống thông tin quản lý |
| Bối cảnh | Phải học lại 1 môn; môn đó đã đổi mã/không còn mở theo chương trình mới. Còn thiếu vài tín chỉ tự chọn để tốt nghiệp |
| Mục tiêu | Tìm đúng học phần tương đương để không bị chậm tốt nghiệp; chắc chắn mình đủ điều kiện xét tốt nghiệp |
| Hành vi hiện tại | Hỏi trong nhóm Facebook, chờ phản hồi email phòng Đào tạo; đọc lướt các văn bản PDF |
| Điểm đau | Thông tin học phần tương đương rải rác; không chắc văn bản nào áp dụng cho khóa mình; sợ sai sót không sửa được |
| Câu nói đặc trưng (giả định) | "Em không biết môn mới này có được tính thay cho môn cũ không." |
| Tính năng cần nhất | Tra cứu học phần tương đương; lập kế hoạch nhiều học kỳ với tổng tín chỉ; hỏi AI về điều kiện tốt nghiệp theo khóa |
| Thái độ với AI | Dùng ChatGPT nhưng không tin với quy định của trường vì "nó bịa"; cần thấy điều khoản gốc |

## Persona 3 – "Tân sinh viên bỡ ngỡ": Thảo Vy `[GIẢ ĐỊNH – cập nhật sau khảo sát]`

| Thuộc tính | Mô tả |
|---|---|
| Hồ sơ | Nữ, 18 tuổi, sinh viên năm 1, ngành Luật kinh tế |
| Bối cảnh | Lần đầu tự đăng ký học phần; chưa hiểu tín chỉ, tiên quyết, học phần tự chọn, cảnh báo học vụ |
| Mục tiêu | Đăng ký đúng, đủ, không bị cảnh báo; hiểu những quy định cơ bản |
| Hành vi hiện tại | Làm theo TKB của anh chị khóa trên hoặc bạn cùng lớp |
| Điểm đau | Thuật ngữ khó hiểu; ngại hỏi; không biết tìm quy chế ở đâu |
| Câu nói đặc trưng (giả định) | "Em chỉ đăng ký giống bạn cùng phòng cho chắc." |
| Tính năng cần nhất | Tìm kiếm học phần đơn giản, chia sẻ TKB qua URL, hỏi AI quy chế bằng ngôn ngữ tự nhiên, giao diện tiếng Việt thân thiện |
| Thiết bị | Chủ yếu điện thoại |

## Persona phụ – "Cố vấn học tập": ThS. Lan (người dùng gián tiếp) `[GIẢ ĐỊNH – cập nhật sau khảo sát]`

Cố vấn học tập trả lời lặp đi lặp lại các câu hỏi giống nhau về quy chế. Họ hưởng lợi gián tiếp nếu sinh viên tự tra được câu trả lời **có trích dẫn nguyên văn**, và có thể là người kiểm chứng độ chính xác của AI trong Vòng 1–2. Persona này không phải đối tượng thiết kế chính của MVP.

## Ma trận persona × tính năng (giả định)

| Tính năng (ARCHITECTURE.md) | Minh Anh | Quốc Huy | Thảo Vy |
|---|---|---|---|
| Tra cứu học phần | ●● | ●● | ●●● |
| Thời khóa biểu (trùng lịch, kéo-thả) | ●●● | ●● | ●● |
| Lập kế hoạch nhiều học kỳ | ● | ●●● | ●● |
| Học phần tương đương | ● | ●●● | ● |
| Quy chế + hỏi AI | ● | ●●● | ●●● |
| Phòng học trống | ●● | ● | ● |
| Chia sẻ URL / xuất PNG, ICS | ●● | ● | ●●● |

●●● rất quan trọng · ●● quan trọng · ● thứ yếu

## Cập nhật sau khảo sát

1. Dùng kết quả khảo sát (A1–A6, B1–B4, câu G) để **phân cụm** người trả lời (ví dụ theo năm học × tình huống đặc biệt × mức đi làm thêm) và kiểm tra các persona có tương ứng với cụm thực tế không.
2. Thay "câu nói đặc trưng" bằng trích dẫn thật (ẩn danh) từ phỏng vấn.
3. Bổ sung tỉ lệ ước tính mỗi persona trong tổng thể; bỏ persona không có cơ sở, thêm persona mới nếu phát hiện.
4. Xóa nhãn giả định ở từng dòng đã kiểm chứng; ghi ngày cập nhật và nguồn bằng chứng.

## Tài liệu tham khảo

- Cooper, A. (1999). *The Inmates Are Running the Asylum*. Sams.
- Gothelf, J., & Seiden, J. (2013). *Lean UX*. O'Reilly.
- Pruitt, J., & Adlin, T. (2006). *The Persona Lifecycle*. Morgan Kaufmann.
