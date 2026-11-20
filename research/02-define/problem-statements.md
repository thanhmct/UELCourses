# Phát biểu vấn đề và câu hỏi "How might we…"

> **Trạng thái:** giả định trước khảo sát – `[GIẢ ĐỊNH – cập nhật sau khảo sát]` áp dụng cho toàn bộ tài liệu.

Ở bước Define, nhóm tổng hợp các phát hiện thành **phát biểu quan điểm (Point of View – POV)** theo mẫu của d.school: *[Người dùng] cần [nhu cầu] vì [thấu hiểu]*, sau đó chuyển thành câu hỏi **"How might we…" (HMW – "Làm thế nào chúng ta có thể…")** đủ rộng để mở ra nhiều giải pháp nhưng đủ hẹp để hành động được (IDEO.org, 2015; d.school, 2010).

## 1. Phát biểu quan điểm (POV)

| # | POV | Persona | Bằng chứng cần thu thập |
|---|---|---|---|
| P1 | Sinh viên có lịch cá nhân cố định **cần** nhanh chóng tạo và điều chỉnh TKB không trùng lịch **vì** chỉ một lớp hết chỗ cũng buộc họ phải dò lại toàn bộ bảng bằng tay. `[GIẢ ĐỊNH – cập nhật sau khảo sát]` | Minh Anh | B2, B3, C1–C3, C7; phỏng vấn mục 4.3 |
| P2 | Sinh viên học lại/chuyển chương trình **cần** biết chắc học phần nào được tính tương đương **vì** thông tin rải rác và sai sót có thể làm chậm tốt nghiệp. `[GIẢ ĐỊNH – cập nhật sau khảo sát]` | Quốc Huy | D1–D5; phỏng vấn mục 4.4 |
| P3 | Sinh viên **cần** câu trả lời về quy chế **đúng với khóa của mình và có thể kiểm chứng** **vì** quy chế thay đổi theo khóa và theo thời gian, còn chatbot thông thường không dẫn nguồn. `[GIẢ ĐỊNH – cập nhật sau khảo sát]` | Quốc Huy, Thảo Vy | E1–E7, F2–F5; phỏng vấn mục 4.5 |
| P4 | Tân sinh viên **cần** một điểm bắt đầu đơn giản để hiểu và lập kế hoạch học tập **vì** họ chưa quen thuật ngữ và ngại hỏi. `[GIẢ ĐỊNH – cập nhật sau khảo sát]` | Thảo Vy | A4, E1, G12; phỏng vấn |
| P5 | Sinh viên **cần** nhìn thấy lộ trình nhiều học kỳ **vì** họ không chắc thứ tự môn học và sợ thiếu tiên quyết. `[GIẢ ĐỊNH – cập nhật sau khảo sát]` | Quốc Huy, Thảo Vy | C4, C5 |

## 2. Câu hỏi "How might we…"

### Nhóm TKB (từ P1)
- **HMW1.** Làm thế nào chúng ta có thể giúp sinh viên **thấy ngay** xung đột lịch khi chọn lớp, thay vì phát hiện khi đã đăng ký?
- **HMW2.** Làm thế nào chúng ta có thể giúp sinh viên **đổi sang lớp khác chỉ trong vài giây** khi lớp dự định hết chỗ?
- **HMW3.** Làm thế nào chúng ta có thể giúp sinh viên **chuẩn bị sẵn phương án dự phòng** mà không tốn gấp đôi công sức?
- **HMW4.** Làm thế nào chúng ta có thể giúp sinh viên **mang TKB theo** (điện thoại, lịch cá nhân, bạn bè) mà không phải nhập lại?

### Nhóm học phần tương đương (từ P2)
- **HMW5.** Làm thế nào chúng ta có thể khiến thông tin học phần tương đương **xuất hiện đúng lúc** sinh viên đang tìm một học phần?
- **HMW6.** Làm thế nào chúng ta có thể giúp sinh viên **tin tưởng** rằng dữ liệu tương đương là cập nhật và chính thức?

### Nhóm quy chế và AI (từ P3)
- **HMW7.** Làm thế nào chúng ta có thể trả lời câu hỏi quy chế **bằng chính lời văn của văn bản gốc**, kèm số quyết định, Điều, Khoản?
- **HMW8.** Làm thế nào chúng ta có thể đảm bảo câu trả lời **đúng khóa và đúng thời điểm hiệu lực**, đồng thời cảnh báo khi văn bản sắp hết hiệu lực hay đã bị thay thế?
- **HMW9.** Làm thế nào chúng ta có thể khiến việc AI nói **"không tìm thấy nguồn"** trở thành một trải nghiệm đáng tin thay vì gây thất vọng?

### Nhóm định hướng (từ P4, P5)
- **HMW10.** Làm thế nào chúng ta có thể giúp tân sinh viên **lập kế hoạch học tập đầu tiên** mà không cần hiểu hết thuật ngữ?
- **HMW11.** Làm thế nào chúng ta có thể cảnh báo **thiếu tiên quyết** trước khi sinh viên xếp môn vào học kỳ?

### Nhóm vòng lặp phản hồi (Design Thinking)
- **HMW12.** Làm thế nào chúng ta có thể thu thập phản hồi **ngay trong ngữ cảnh sử dụng** mà không làm phiền người dùng? (→ widget feedback trên mọi trang, `POST /api/feedback`)

## 3. Liên kết HMW → tính năng → chỉ số kiểm chứng

| HMW | Tính năng trong ARCHITECTURE.md | Tác vụ kiểm thử | Chỉ số |
|---|---|---|---|
| HMW1, HMW2 | TKB: phát hiện trùng lịch, kéo-thả đổi lớp | T2, T3 | Tỉ lệ hoàn thành, thời gian, SEQ |
| HMW3 | TKB nhiều phương án/nhiều học kỳ | T3 | Tỉ lệ hoàn thành |
| HMW4 | Chia sẻ URL, xuất PNG/ICS | T6 | Tỉ lệ hoàn thành |
| HMW5, HMW6 | Học phần tương đương, chi tiết học phần | T1 | Tỉ lệ hoàn thành, đánh giá tính năng |
| HMW7–HMW9 | Quy chế: hỏi AI extractive, trích dẫn, cảnh báo hiệu lực, so sánh khóa | T4, T5 | Độ chính xác trích dẫn ≥ 95%, đánh giá AI |
| HMW10, HMW11 | Lập kế hoạch nhiều học kỳ, cảnh báo tiên quyết | T7 | Tỉ lệ hoàn thành |
| HMW12 | Widget feedback | Mọi tác vụ | Số phản hồi, điểm trung bình |

Mã tác vụ T1–T7 tham chiếu `05-test/usability-test-plan.md`.

## Tài liệu tham khảo

- Hasso Plattner Institute of Design at Stanford. (2010). *Bootcamp Bootleg* (mục "Point-of-View Madlib", "How Might We Questions").
- IDEO.org. (2015). *The Field Guide to Human-Centered Design* (mục "Create Insight Statements", "How Might We").
