# Bản đồ hành trình người dùng (Journey Map)

> **Trạng thái:** bản nháp giả định, toàn bộ nội dung mang nhãn `[GIẢ ĐỊNH – cập nhật sau khảo sát]`. Bản đồ mô tả trải nghiệm **hiện tại (as-is)** – trước khi có UELPlan – để xác định cơ hội thiết kế (Kalbach, 2016). Sau Vòng 1, lập thêm bản đồ **tương lai (to-be)** với UELPlan để so sánh.

## Hành trình 1 – Chuẩn bị và đăng ký học phần một học kỳ (Persona: Minh Anh) `[GIẢ ĐỊNH – cập nhật sau khảo sát]`

| Giai đoạn | 1. Nhận thông báo | 2. Tìm hiểu học phần | 3. Xếp TKB dự kiến | 4. Đăng ký (giờ mở cổng) | 5. Xử lý sự cố | 6. Hoàn tất & theo dõi |
|---|---|---|---|---|---|---|
| **Hành động** | Đọc thông báo lịch ĐKHP trên website/nhóm lớp | Xem chương trình đào tạo, danh sách lớp mở | Chép lớp sang Sheets, tô màu, kiểm tra trùng thủ công | Đăng nhập, đăng ký nhanh từng lớp | Lớp hết chỗ → tìm lớp khác, kiểm tra lại trùng | Chụp TKB, nhập vào lịch điện thoại |
| **Điểm chạm** | Website trường, Facebook/Zalo | Cổng thông tin, file PDF CTĐT | Trang ĐKHP, Google Sheets | Trang ĐKHP | Trang ĐKHP, nhóm bạn bè | Ảnh chụp màn hình, Google Calendar |
| **Suy nghĩ** | "Đợt này mở lúc mấy giờ?" | "Môn nào bắt buộc kỳ này?" | "Lớp này có đè lên giờ làm thêm không?" | "Phải nhanh trước khi hết chỗ!" | "Giờ đổi lớp này thì lớp kia có trùng không?" | "Mong là không sai chỗ nào." |
| **Cảm xúc (−2…+2)** | 0 Trung tính | −1 Bối rối | −1 Mệt, tốn thời gian | −2 Căng thẳng cao | −2 Bực bội – **điểm thấp nhất** | +1 Nhẹ nhõm |
| **Điểm đau** | Thông tin phân tán | Khó liên kết môn – lớp – tiên quyết | Kiểm tra trùng thủ công dễ sai; không có góc nhìn cả tuần | Áp lực thời gian | Phải xếp lại từ đầu; không có phương án dự phòng sẵn | Nhập lịch thủ công |
| **Cơ hội (UELPlan)** | — (ngoài phạm vi) | Tra cứu + lọc học phần, trang chi tiết | TKB trực quan, **tự phát hiện trùng**, màu, ẩn môn | Danh sách lớp đã chọn sẵn để đối chiếu (không tự động đăng ký – theo `CLAUDE.md`) | **Kéo-thả đổi lớp**, nhiều phương án TKB | Xuất **PNG/ICS**, chia sẻ qua URL |

## Hành trình 2 – Tìm học phần thay thế và kiểm tra điều kiện tốt nghiệp (Persona: Quốc Huy) `[GIẢ ĐỊNH – cập nhật sau khảo sát]`

| Giai đoạn | 1. Phát hiện vấn đề | 2. Tìm học phần tương đương | 3. Tìm quy định liên quan | 4. Xác minh | 5. Lập kế hoạch các kỳ còn lại |
|---|---|---|---|---|---|
| **Hành động** | Thấy môn cần học lại không còn mở | Hỏi nhóm Facebook, tra cổng thông tin | Tìm văn bản quy chế, hỏi ChatGPT | Email phòng Đào tạo/cố vấn, chờ trả lời | Tự tính tín chỉ còn thiếu trên giấy |
| **Điểm chạm** | Trang ĐKHP | Cổng thông tin, Facebook | Website trường, PDF, ChatGPT | Email | Giấy, Excel |
| **Suy nghĩ** | "Giờ phải học môn gì thay?" | "Thông tin này còn đúng không?" | "Văn bản này áp dụng cho K46 hay chỉ khóa sau?" | "Sao lâu trả lời vậy?" | "Liệu có kịp tốt nghiệp đúng hạn?" |
| **Cảm xúc (−2…+2)** | −1 Lo lắng | −1 Không chắc chắn | −2 Quá tải – **điểm thấp nhất** | 0 Chờ đợi | −1 Lo lắng kéo dài |
| **Điểm đau** | Không có cảnh báo sớm | Nguồn không chính thức, dễ lỗi thời | Nhiều văn bản, nhiều lần sửa đổi; AI chung chung có thể bịa | Phản hồi chậm | Không có công cụ tổng hợp tín chỉ |
| **Cơ hội (UELPlan)** | Cảnh báo thiếu tiên quyết trong kế hoạch nhiều kỳ | **Trang học phần tương đương**, hiển thị ngay ở chi tiết học phần | **Hỏi AI theo khóa, trích dẫn nguyên văn**, lọc theo hiệu lực | Liên kết tới văn bản gốc; cảnh báo văn bản hết hiệu lực/bị thay thế | **Kế hoạch nhiều học kỳ**, tổng tín chỉ |

## Đường cảm xúc (tóm tắt)

```
Cảm xúc   +  |                                                    ●  (6) Hoàn tất
             |   ● (1)                                          /
          0  |-----\------------------------------------------/-------
             |      ● (2)                                    /
             |            \                                 /
          -  |             ● (3)          ● (4)            /
             |                    ‾‾‾‾‾‾‾‾      \         /
             |                                   ● (5) Xử lý sự cố – thấp nhất
             +--------------------------------------------------------> Giai đoạn
```

`[GIẢ ĐỊNH – cập nhật sau khảo sát]` – vẽ lại đường cảm xúc dựa trên mức căng thẳng (C7) và mô tả tình huống khó khăn nhất (C8) của khảo sát cùng cảm xúc ghi nhận trong phỏng vấn.

## Cách cập nhật sau khảo sát/phỏng vấn

1. Thay hành động và điểm chạm bằng những gì người tham gia thực sự kể/vẽ lại (mục 4.3 của hướng dẫn phỏng vấn).
2. Xác định **giai đoạn có cảm xúc thấp nhất** theo dữ liệu thật – đó là ưu tiên thiết kế số một.
3. Gắn số liệu định lượng vào từng điểm đau (ví dụ "x% SV đồng ý C2").
4. Sau Vòng 1, lập bản đồ to-be và đánh dấu điểm đau nào đã được giải quyết, điểm nào còn tồn tại (ghi vào `iteration-log.md`).

## Tài liệu tham khảo

- Kalbach, J. (2016). *Mapping Experiences: A Complete Guide to Creating Value through Journeys, Blueprints, and Diagrams*. O'Reilly.
- Stickdorn, M., & Schneider, J. (2011). *This Is Service Design Thinking*. BIS Publishers.
