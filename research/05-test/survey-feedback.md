# Bảng hỏi sau thử nghiệm (Vòng 1, Vòng 2…)

**Tên biểu mẫu đề xuất:** *Đánh giá trải nghiệm UELPlan – Vòng [n]*

**Thời điểm:** ngay sau khi người tham gia hoàn thành các tác vụ trong `usability-test-plan.md` (hoặc sau ≥ 1 tuần sử dụng thật ở Vòng 3). **Thời lượng:** 6–8 phút.

## 0. Hướng dẫn dựng trên Google Forms

- **Tiêu đề mỗi câu bắt đầu bằng mã trong ngoặc vuông** (ví dụ `[SUS3] Tôi thấy UELPlan dễ sử dụng.`). Script `research/analysis/analyze_survey.py` nhận diện câu hỏi theo mã; nội dung sau mã có thể sửa tự do.
- Câu SUS: kiểu **Phạm vi tuyến tính 1–5**, nhãn 1 = *Hoàn toàn không đồng ý*, 5 = *Hoàn toàn đồng ý*, **bắt buộc** (SUS chỉ tính được khi đủ 10 câu). Giữ nguyên thứ tự và cách diễn đạt xen kẽ tích cực/tiêu cực – **không** đảo chiều các câu chẵn.
- Câu NPS: **Phạm vi tuyến tính 0–10**.
- Câu `[ROUND]` và `[PID]`: dùng **đường liên kết điền sẵn (pre-filled link)** cho mỗi vòng/người tham gia để tránh nhập sai. Nếu biểu mẫu không có `[ROUND]`, khai báo vòng khi chạy script (`V1=file.csv`).
- Mỗi vòng nên dùng **bản sao** của biểu mẫu (giữ nguyên mã câu hỏi) để dữ liệu so sánh được.

## Phần A – Thông tin

| Mã | Câu hỏi | Kiểu | Lựa chọn | Bắt buộc |
|---|---|---|---|---|
| ROUND | Vòng thử nghiệm | Trắc nghiệm (điền sẵn) | V1 / V2 / V3 | Có |
| PID | Mã người tham gia (do điều phối viên cung cấp, ví dụ P01) | Câu trả lời ngắn (điền sẵn) | | Có |
| COHORT | Khóa tuyển sinh | Trắc nghiệm | K46 / K47 / K48 / K49 / K50 / Khác | Có |
| DEVICE | Thiết bị bạn dùng trong buổi thử | Trắc nghiệm | Máy tính / Điện thoại | Có |

## Phần B – Thang đo khả dụng hệ thống (SUS)

Thang SUS gồm 10 câu của Brooke (1996), các câu lẻ mang nghĩa tích cực, câu chẵn mang nghĩa tiêu cực. Bản tiếng Việt dưới đây do nhóm chuyển ngữ, thay "hệ thống" bằng tên sản phẩm (Lewis & Sauro, 2009 cho thấy thay thế này không làm thay đổi tính chất thang đo). Khuyến nghị kiểm tra bằng **dịch ngược (back-translation)** bởi một người độc lập và chạy thử với 3–5 SV trước Vòng 1 (Brislin, 1970).

*Hướng dẫn hiển thị trên biểu mẫu:* "Vui lòng cho biết mức độ đồng ý của bạn với từng phát biểu dưới đây, dựa trên trải nghiệm vừa rồi với UELPlan. Hãy trả lời theo cảm nhận đầu tiên."

| Mã | Phát biểu (tiếng Việt) | Bản gốc (Brooke, 1996) |
|---|---|---|
| SUS1 | Tôi nghĩ rằng tôi sẽ muốn sử dụng UELPlan thường xuyên. | I think that I would like to use this system frequently. |
| SUS2 | Tôi thấy UELPlan phức tạp một cách không cần thiết. | I found the system unnecessarily complex. |
| SUS3 | Tôi thấy UELPlan dễ sử dụng. | I thought the system was easy to use. |
| SUS4 | Tôi nghĩ rằng tôi sẽ cần sự hỗ trợ của người am hiểu kỹ thuật để có thể sử dụng UELPlan. | I think that I would need the support of a technical person to be able to use this system. |
| SUS5 | Tôi thấy các chức năng của UELPlan được kết hợp với nhau tốt. | I found the various functions in this system were well integrated. |
| SUS6 | Tôi thấy UELPlan có quá nhiều điểm thiếu nhất quán. | I thought there was too much inconsistency in this system. |
| SUS7 | Tôi nghĩ rằng hầu hết mọi người sẽ học cách sử dụng UELPlan rất nhanh. | I would imagine that most people would learn to use this system very quickly. |
| SUS8 | Tôi thấy UELPlan rất rườm rà, bất tiện khi sử dụng. | I found the system very cumbersome to use. |
| SUS9 | Tôi cảm thấy rất tự tin khi sử dụng UELPlan. | I felt very confident using the system. |
| SUS10 | Tôi cần học nhiều thứ trước khi có thể bắt đầu sử dụng UELPlan. | I needed to learn a lot of things before I could get going with this system. |

**Cách tính điểm (Brooke, 1996):** với mỗi người trả lời, câu lẻ đóng góp *(điểm − 1)*, câu chẵn đóng góp *(5 − điểm)*; tổng 10 đóng góp (0–40) nhân 2,5 → điểm SUS 0–100. Điểm SUS **không phải phần trăm**. Diễn giải: trung bình của nhiều nghiên cứu ≈ 68 (Sauro, 2011); thang tính từ của Bangor và cộng sự (2009) và thang xếp hạng chữ cái A–F của Sauro & Lewis (2016) được script tự gán. Có thể báo cáo thêm hai thành phần *Khả dụng* (8 câu) và *Khả năng học* (SUS4, SUS10) theo Lewis & Sauro (2009).

## Phần C – Đánh giá từng tính năng

"Mức độ hữu ích của từng tính năng đối với bạn" (1 = Hoàn toàn không hữu ích … 5 = Rất hữu ích). Không bắt buộc – bỏ trống nếu bạn chưa dùng tính năng đó.

| Mã | Tính năng | Mã trong `feature-prioritization.md` |
|---|---|---|
| FT_SEARCH | Tìm kiếm và lọc học phần | F01, F02 |
| FT_TIMETABLE | Xếp thời khóa biểu, cảnh báo trùng lịch | F03 |
| FT_DRAG | Kéo-thả đổi lớp, nhiều phương án TKB | F04, F05 |
| FT_SHARE | Chia sẻ link, xuất PNG/ICS | F06, F07 |
| FT_PLANNER | Lập kế hoạch nhiều học kỳ | F09 |
| FT_EQUIV | Tra cứu học phần tương đương | F11 |
| FT_REG | Duyệt văn bản quy chế, cảnh báo hiệu lực | F12, F15 |
| FT_AI | Hỏi AI về quy chế | F13 |
| FT_VENUE | Xem phòng học trống | F10 |

| Mã | Câu hỏi | Kiểu | Bắt buộc |
|---|---|---|---|
| FT_BEST | Tính năng bạn thấy giá trị nhất là gì? Tại sao? | Đoạn văn | Không |
| FT_WORST | Tính năng nào khiến bạn khó chịu hoặc bối rối nhất? | Đoạn văn | Không |

## Phần D – Đánh giá trợ lý AI quy chế

Mức độ đồng ý (1 = Hoàn toàn không đồng ý … 5 = Hoàn toàn đồng ý):

| Mã | Phát biểu | Ý nghĩa đo lường |
|---|---|---|
| AI_ACCURATE | Câu trả lời của AI đúng với điều tôi cần biết. | Độ chính xác cảm nhận |
| AI_COHORT | Câu trả lời áp dụng đúng cho khóa của tôi. | Lọc theo khóa |
| AI_CITATION | Phần trích dẫn (số quyết định, Điều, Khoản) giúp tôi kiểm chứng câu trả lời. | Giá trị của trích dẫn |
| AI_UNDERSTAND | Tôi hiểu được câu trả lời mà không cần hỏi thêm người khác. | Dễ hiểu (đặc biệt ở chế độ extractive trả nguyên văn) |
| AI_TRUST | Tôi tin tưởng câu trả lời của AI trong UELPlan. | Mức tin tưởng |
| AI_USEFUL | AI quy chế giúp tôi tiết kiệm thời gian so với tự tìm văn bản. | Hữu ích |
| AI_NOSOURCE | Khi AI không tìm thấy nguồn và từ chối trả lời, tôi thấy điều đó hợp lý. | Chấp nhận nguyên tắc "không có nguồn thì không trả lời" |
| AI_WARNING | Cảnh báo văn bản hết hiệu lực/bị thay thế rõ ràng và hữu ích. | Cảnh báo hiệu lực |

| Mã | Câu hỏi | Kiểu | Bắt buộc |
|---|---|---|---|
| AI_WRONG | Bạn có gặp câu trả lời nào sai, lỗi thời hoặc không đúng khóa không? Nếu có, hãy mô tả câu hỏi và câu trả lời. | Đoạn văn | Không |

> Độ chính xác **khách quan** của trích dẫn (tiêu chí ≥ 95%) được đo bằng đối chiếu đáp án chuẩn trong phiếu quan sát (`ai_citations_correct / ai_citations_total`), không dựa vào cảm nhận ở phần này. Phần D đo **cảm nhận** để so sánh với chỉ số khách quan.

## Phần E – Mức độ sẵn lòng giới thiệu (NPS)

| Mã | Câu hỏi | Kiểu | Bắt buộc |
|---|---|---|---|
| NPS | Bạn có khả năng giới thiệu UELPlan cho một người bạn cùng trường ở mức nào? (0 = Hoàn toàn không, 10 = Chắc chắn có) | Linear 0–10 | Có |
| NPS_WHY | Lý do chính cho điểm số trên là gì? | Đoạn văn | Không |

**Cách tính (Reichheld, 2003):** *Người ủng hộ* (Promoters) 9–10, *Trung lập* (Passives) 7–8, *Người phản đối* (Detractors) 0–6. NPS = %Promoters − %Detractors, trong khoảng −100 đến +100. Với mẫu nhỏ (n < 30), NPS biến động rất mạnh; báo cáo kèm phân bố và chỉ dùng như chỉ báo bổ trợ.

## Phần F – Câu hỏi mở

| Mã | Câu hỏi | Kiểu | Bắt buộc |
|---|---|---|---|
| OPEN_LIKE | Điều bạn thích nhất ở UELPlan? | Đoạn văn | Không |
| OPEN_IMPROVE | Nếu chỉ được cải thiện **một** điều, bạn sẽ chọn điều gì? | Đoạn văn | Không |
| OPEN_MISSING | Có tính năng nào bạn mong đợi nhưng chưa thấy? | Đoạn văn | Không |
| OPEN_NEXT | Bạn có muốn tham gia vòng thử nghiệm tiếp theo? | Trắc nghiệm: Có / Không | Không |

Câu mở được phân tích theo chủ đề (Braun & Clarke, 2006): hai người mã hóa độc lập, thống nhất bộ mã, đếm tần suất chủ đề theo vòng và đưa vào cột "Phát hiện" của `iteration-log.md`. Script xuất toàn bộ câu trả lời mở ra `open_answers.csv` để thuận tiện mã hóa.

## Tài liệu tham khảo

- Bangor, A., Kortum, P., & Miller, J. (2009). Determining what individual SUS scores mean: Adding an adjective rating scale. *Journal of Usability Studies, 4*(3), 114–123.
- Braun, V., & Clarke, V. (2006). Using thematic analysis in psychology. *Qualitative Research in Psychology, 3*(2), 77–101.
- Brislin, R. W. (1970). Back-translation for cross-cultural research. *Journal of Cross-Cultural Psychology, 1*(3), 185–216.
- Brooke, J. (1996). SUS: A "quick and dirty" usability scale. In P. W. Jordan, B. Thomas, B. A. Weerdmeester, & I. L. McClelland (Eds.), *Usability Evaluation in Industry* (pp. 189–194). Taylor & Francis.
- Lewis, J. R., & Sauro, J. (2009). The factor structure of the System Usability Scale. *Proceedings of HCII 2009*, 94–103.
- Reichheld, F. F. (2003). The one number you need to grow. *Harvard Business Review, 81*(12), 46–54.
- Sauro, J. (2011). *A Practical Guide to the System Usability Scale*. Measuring Usability LLC.
- Sauro, J., & Lewis, J. R. (2016). *Quantifying the User Experience* (2nd ed.). Morgan Kaufmann.
