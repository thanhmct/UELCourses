# Bảng hỏi khảo sát nhu cầu (Vòng 0 – Empathize)

**Tên biểu mẫu đề xuất:** *Khảo sát nhu cầu công cụ hỗ trợ lập kế hoạch học tập dành cho sinh viên UEL*

**Mục tiêu:** (1) đo mức độ phổ biến và mức độ nghiêm trọng của các khó khăn khi xếp thời khóa biểu (TKB), đăng ký học phần (ĐKHP), tra cứu học phần tương đương và tra cứu quy chế học vụ; (2) đo mức tin tưởng vào trợ lý AI; (3) đo ý định sử dụng một công cụ hỗ trợ; (4) tuyển người tham gia phỏng vấn sâu và thử nghiệm.

**Thời lượng trả lời dự kiến:** 7–9 phút. **Nền tảng:** Google Forms.

## 0. Hướng dẫn dựng trên Google Forms

1. **Tiêu đề mỗi câu bắt đầu bằng mã trong ngoặc vuông**, ví dụ `[C2] Bạn thường xếp TKB bằng cách nào?`. Script `research/analysis/analyze_survey.py` dựa vào mã này để nhận diện câu hỏi. Mã kết thúc bằng `_M` là câu chọn nhiều đáp án (hộp kiểm).
2. **Không dùng dấu phẩy trong nội dung lựa chọn** của câu hộp kiểm (Google Forms nối các lựa chọn bằng ", " khi xuất CSV). Dùng dấu gạch ngang hoặc dấu chấm phẩy thay thế.
3. Câu Likert dùng kiểu **"Phạm vi tuyến tính" (Linear scale) 1–5**; nhãn: 1 = *Hoàn toàn không đồng ý*, 5 = *Hoàn toàn đồng ý* (trừ khi ghi khác). Câu dạng lưới (grid) nên tách thành từng câu Linear scale riêng để CSV có một cột/ý (khuyến nghị), hoặc dùng "Lưới trắc nghiệm" với tiêu đề hàng chứa mã (script nhận mã trong `[...]` ở cả tiêu đề hàng).
4. Bật **"Thu thập địa chỉ email: Không"**; không yêu cầu đăng nhập Google để giảm rào cản, nhưng bật giới hạn một lần trả lời nếu khảo sát chỉ phát trong nhóm có tài khoản UEL (cân nhắc đánh đổi).
5. Chia biểu mẫu thành các **phần (section)** như dưới đây; dùng logic rẽ nhánh ở câu S1 (sàng lọc).
6. Xuất dữ liệu: *Câu trả lời → biểu tượng Google Sheets → Tệp → Tải xuống → CSV*.

## Phần 0 – Lời mời và đồng ý tham gia

> Xin chào bạn! Nhóm nghiên cứu là sinh viên Trường ĐH Kinh tế – Luật đang thực hiện khóa luận tốt nghiệp về một công cụ hỗ trợ sinh viên xếp thời khóa biểu, tra cứu học phần tương đương và tra cứu quy chế học vụ. Khảo sát mất khoảng 8 phút, **ẩn danh**, không thu thập MSSV hay mật khẩu. Dữ liệu chỉ dùng cho mục đích học thuật và được báo cáo ở dạng tổng hợp. Bạn có thể dừng bất kỳ lúc nào.

| Mã | Câu hỏi | Kiểu | Lựa chọn | Bắt buộc |
|---|---|---|---|---|
| S0 | Bạn đồng ý tham gia khảo sát này? | Trắc nghiệm | Đồng ý / Không đồng ý (→ gửi biểu mẫu) | Có |
| S1 | Bạn có phải là sinh viên hệ chính quy của Trường ĐH Kinh tế – Luật không? | Trắc nghiệm | Có / Không (→ kết thúc, cảm ơn) | Có |

## Phần A – Thông tin chung

| Mã | Câu hỏi | Kiểu | Lựa chọn | Bắt buộc |
|---|---|---|---|---|
| A1 | Bạn thuộc khóa tuyển sinh nào? | Trắc nghiệm | K46 / K47 / K48 / K49 / K50 / Khác (ghi rõ) | Có |
| A2 | Bạn thuộc khoa/chương trình nào? | Menu thả xuống | Kinh tế / Kinh tế đối ngoại / Tài chính – Ngân hàng / Kế toán – Kiểm toán / Hệ thống thông tin / Quản trị kinh doanh / Toán kinh tế / Luật / Luật kinh tế / Khác | Có |
| A3 | Chương trình đào tạo | Trắc nghiệm | Chuẩn / Chất lượng cao – Tiếng Anh / Liên kết quốc tế / Khác | Có |
| A4 | Bạn đã trải qua bao nhiêu đợt đăng ký học phần tại UEL? | Trắc nghiệm | Chưa lần nào / 1–2 đợt / 3–5 đợt / Trên 5 đợt | Có |
| A5 | Bạn có từng học song ngành, học vượt, học lại/cải thiện, hoặc chuyển ngành/chuyển chương trình? | Hộp kiểm (`A5_M`) | Song ngành / Học vượt / Học lại hoặc cải thiện / Chuyển ngành hoặc chuyển chương trình / Không có | Có |
| A6 | Bạn hiện có đi làm thêm/thực tập bán thời gian? | Trắc nghiệm | Có – cố định lịch / Có – lịch linh hoạt / Không | Không |

> Lưu ý: danh sách khóa và khoa cần đối chiếu với cơ cấu hiện hành của UEL trước khi phát. `[GIẢ ĐỊNH – cập nhật sau khảo sát]`

## Phần B – Cách bạn đang xếp thời khóa biểu

| Mã | Câu hỏi | Kiểu | Lựa chọn | Bắt buộc |
|---|---|---|---|---|
| B1_M | Bạn thường xếp TKB dự kiến trước khi đăng ký học phần bằng cách nào? | Hộp kiểm | Xem trực tiếp trên trang ĐKHP / Excel hoặc Google Sheets / Giấy bút / Ứng dụng lịch (Google Calendar…) / Hỏi bạn bè hoặc dùng TKB của người khác / Công cụ do sinh viên khác làm / Không xếp trước – đăng ký trực tiếp / Khác | Có |
| B2 | Trung bình bạn mất bao lâu để xếp xong một TKB dự kiến cho một học kỳ? | Trắc nghiệm | Dưới 15 phút / 15–30 phút / 30–60 phút / 1–2 giờ / Trên 2 giờ | Có |
| B3 | Bạn thường chuẩn bị bao nhiêu phương án TKB dự phòng? | Trắc nghiệm | 0 / 1 / 2–3 / Trên 3 | Có |
| B4 | Tiêu chí quan trọng nhất khi bạn chọn lớp học phần (chọn tối đa 3) | Hộp kiểm (`B4_M`) | Không trùng lịch / Giảng viên / Gom lịch vào ít ngày / Tránh buổi sáng sớm hoặc buổi tối / Phù hợp lịch làm thêm / Học cùng bạn bè / Phòng học hoặc cơ sở gần / Còn chỗ trống | Có |

## Phần C – Khó khăn khi đăng ký học phần

Mức độ đồng ý (1 = Hoàn toàn không đồng ý … 5 = Hoàn toàn đồng ý):

| Mã | Phát biểu | Kiểu |
|---|---|---|
| C1 | Tôi gặp khó khăn khi phát hiện các lớp học phần bị trùng lịch trước khi đăng ký. | Linear 1–5 |
| C2 | Khi lớp dự định bị hết chỗ, tôi mất nhiều thời gian để tìm phương án thay thế không trùng lịch. | Linear 1–5 |
| C3 | Tôi khó hình dung TKB tổng thể của cả tuần khi chỉ xem danh sách lớp. | Linear 1–5 |
| C4 | Tôi không chắc mình nên học môn nào ở học kỳ nào để kịp tốt nghiệp đúng hạn. | Linear 1–5 |
| C5 | Tôi từng đăng ký nhầm hoặc thiếu môn vì không nắm rõ môn tiên quyết/chương trình đào tạo. | Linear 1–5 |
| C6 | Tôi muốn biết phòng học nào đang trống để tự học. | Linear 1–5 |
| C7 | Nhìn chung, việc lập kế hoạch và đăng ký học phần hiện nay gây căng thẳng cho tôi. | Linear 1–5 |
| C8 | Hãy mô tả lần đăng ký học phần gần nhất mà bạn thấy khó khăn nhất (điều gì đã xảy ra, bạn xử lý thế nào?). | Đoạn văn (không bắt buộc) |

## Phần D – Học phần tương đương

| Mã | Câu hỏi | Kiểu | Lựa chọn | Bắt buộc |
|---|---|---|---|---|
| D1 | Bạn có biết khái niệm "học phần tương đương/thay thế" trong chương trình đào tạo? | Trắc nghiệm | Biết rõ / Biết sơ qua / Không biết | Có |
| D2 | Bạn đã từng cần tìm học phần tương đương (ví dụ: môn cũ không còn mở, học lại, chuyển chương trình)? | Trắc nghiệm | Nhiều lần / Một vài lần / Chưa bao giờ | Có |
| D3_M | Bạn tra cứu học phần tương đương bằng cách nào? | Hộp kiểm | Cổng thông tin sinh viên / Hỏi phòng Đào tạo hoặc cố vấn học tập / Hỏi bạn bè hoặc nhóm Facebook / Văn bản thông báo của trường / Chưa từng tra cứu / Khác | Có |
| D4 | Tôi dễ dàng tìm được thông tin học phần tương đương mình cần. | Linear 1–5 | | Có |
| D5 | Tôi muốn khi tìm một học phần, hệ thống tự hiển thị các học phần tương đương của nó. | Linear 1–5 | | Có |

## Phần E – Hiểu biết và tra cứu quy chế học vụ

| Mã | Câu hỏi | Kiểu | Lựa chọn | Bắt buộc |
|---|---|---|---|---|
| E1 | Tôi hiểu rõ các điều kiện tốt nghiệp áp dụng cho khóa của mình (tín chỉ, chuẩn ngoại ngữ/tin học, điểm trung bình…). | Linear 1–5 | | Có |
| E2 | Tôi biết quy chế học vụ có thể khác nhau giữa các khóa tuyển sinh. | Linear 1–5 | | Có |
| E3_M | Bạn thường tra cứu quy chế/quy định học vụ ở đâu? | Hộp kiểm | Website hoặc cổng thông tin của trường / Sổ tay sinh viên / Hỏi cố vấn học tập hoặc phòng Đào tạo / Hỏi bạn bè hoặc nhóm Facebook / Tìm trên Google / Hỏi chatbot AI (ChatGPT…) / Chưa từng tra cứu | Có |
| E4 | Tôi dễ dàng tìm được đúng điều khoản quy chế mình cần. | Linear 1–5 | | Có |
| E5 | Tôi từng bị ảnh hưởng (mất cơ hội, bị cảnh báo, chậm tốt nghiệp…) vì hiểu sai hoặc không biết một quy định. | Trắc nghiệm | Có / Không / Không chắc | Có |
| E6_M | Những chủ đề quy chế bạn quan tâm nhất (chọn tối đa 3) | Hộp kiểm | Điều kiện tốt nghiệp / Học lại – cải thiện điểm / Cảnh báo học vụ – buộc thôi học / Chuẩn đầu ra ngoại ngữ – tin học / Học song ngành – học vượt / Bảo lưu – nghỉ học tạm thời / Miễn – công nhận tín chỉ / Xét học bổng / Khác | Có |
| E7 | Tôi biết khi nào một văn bản quy chế hết hiệu lực hoặc bị thay thế. | Linear 1–5 | | Có |

## Phần F – Mức tin tưởng vào AI

| Mã | Câu hỏi | Kiểu | Lựa chọn | Bắt buộc |
|---|---|---|---|---|
| F1 | Tần suất bạn dùng chatbot AI (ChatGPT, Gemini, Copilot…) cho việc học | Trắc nghiệm | Hằng ngày / Vài lần mỗi tuần / Vài lần mỗi tháng / Hiếm khi / Chưa bao giờ | Có |
| F2 | Tôi tin tưởng câu trả lời của AI về quy chế học vụ nếu AI **không** dẫn nguồn. | Linear 1–5 | | Có |
| F3 | Tôi tin tưởng câu trả lời của AI về quy chế học vụ nếu AI **trích dẫn nguyên văn** số quyết định, Điều, Khoản. | Linear 1–5 | | Có |
| F4 | Tôi sẽ tự kiểm tra lại văn bản gốc trước khi ra quyết định quan trọng dựa trên câu trả lời của AI. | Linear 1–5 | | Có |
| F5 | Điều gì khiến bạn **không** tin một câu trả lời của AI về quy định của trường? | Đoạn văn | | Không |

> F2 và F3 tạo thành một cặp so sánh trong-chủ-thể (within-subject): chênh lệch F3 − F2 đo giá trị cảm nhận của cơ chế trích dẫn, là cơ sở cho nguyên tắc "không có nguồn thì không trả lời" trong `ARCHITECTURE.md`.

## Phần G – Mức độ sẵn lòng sử dụng

Mức độ hữu ích nếu một công cụ cung cấp tính năng sau (1 = Hoàn toàn không hữu ích … 5 = Rất hữu ích):

| Mã | Tính năng | Kiểu |
|---|---|---|
| G1 | Tìm kiếm và lọc học phần (theo khoa, số tín chỉ, loại học phần) | Linear 1–5 |
| G2 | Xếp TKB trực quan, tự cảnh báo trùng lịch | Linear 1–5 |
| G3 | Kéo-thả để đổi lớp, lưu nhiều phương án TKB | Linear 1–5 |
| G4 | Chia sẻ TKB qua đường link, xuất ảnh PNG hoặc lịch ICS | Linear 1–5 |
| G5 | Lập kế hoạch nhiều học kỳ, cảnh báo thiếu môn tiên quyết | Linear 1–5 |
| G6 | Tra cứu học phần tương đương | Linear 1–5 |
| G7 | Xem phòng học trống | Linear 1–5 |
| G8 | Hỏi AI về quy chế học vụ theo khóa, có trích dẫn nguyên văn | Linear 1–5 |
| G9 | So sánh quy định giữa các khóa, cảnh báo văn bản sắp hết hiệu lực | Linear 1–5 |

| Mã | Câu hỏi | Kiểu | Lựa chọn | Bắt buộc |
|---|---|---|---|---|
| G10 | Tôi sẽ sử dụng một công cụ như vậy trong đợt đăng ký học phần tới. | Linear 1–5 | | Có |
| G11 | Tôi sẽ giới thiệu công cụ như vậy cho bạn bè. | Linear 1–5 | | Có |
| G12 | Thiết bị bạn chủ yếu dùng để xếp TKB | Trắc nghiệm | Máy tính / Điện thoại / Cả hai như nhau | Có |
| G13 | Mối lo ngại lớn nhất của bạn khi dùng công cụ không chính thức của trường (chọn tối đa 2) | Hộp kiểm (`G13_M`) | Dữ liệu không chính xác hoặc không cập nhật / Bảo mật tài khoản / Phải nhập nhiều thông tin / Không biết có lâu dài không / Không lo ngại / Khác | Có |

## Phần H – Câu hỏi mở và tuyển người tham gia

| Mã | Câu hỏi | Kiểu | Bắt buộc |
|---|---|---|---|
| H1 | Nếu có một "cây đũa thần" giúp việc lập kế hoạch học tập dễ hơn, bạn muốn nó làm gì? | Đoạn văn | Không |
| H2 | Góp ý khác cho nhóm nghiên cứu | Đoạn văn | Không |
| H3 | Bạn có sẵn lòng tham gia phỏng vấn (30–45 phút) hoặc dùng thử sản phẩm? | Trắc nghiệm: Phỏng vấn / Dùng thử / Cả hai / Không | Có |
| H4 | Nếu có, vui lòng để lại email để nhóm liên hệ (thông tin này được tách riêng, không dùng khi phân tích) | Câu trả lời ngắn (xác thực email) | Không |

---

## Cỡ mẫu đề xuất

**Tổng thể (N):** sinh viên đại học hệ chính quy đang học tại UEL. Nhóm cần lấy số liệu chính thức từ báo cáo ba công khai hoặc phòng Đào tạo; tính toán dưới đây dùng **N ≈ 12.000** `[GIẢ ĐỊNH – cập nhật sau khảo sát]`.

**Công thức Cochran (1977)** cho ước lượng tỉ lệ, chọn độ tin cậy 95% (Z = 1,96), sai số cho phép e = 5%, p = 0,5 (giả định bảo thủ cho phương sai lớn nhất):

$$n_0 = \frac{Z^2\,p(1-p)}{e^2} = \frac{1{,}96^2 \times 0{,}5 \times 0{,}5}{0{,}05^2} \approx 384{,}2$$

Hiệu chỉnh tổng thể hữu hạn:

$$n = \frac{n_0}{1 + \frac{n_0 - 1}{N}} = \frac{384{,}2}{1 + \frac{383{,}2}{12\,000}} \approx 372{,}3 \;\Rightarrow\; n = 373$$

**Công thức Slovin/Yamane (1967)**, e = 5%:

$$n = \frac{N}{1 + N e^2} = \frac{12\,000}{1 + 12\,000 \times 0{,}05^2} \approx 387{,}1 \;\Rightarrow\; n = 388$$

Hai công thức cho kết quả gần nhau vì N lớn; cỡ mẫu gần như không đổi khi N thay đổi trong khoảng 8.000–20.000 (Cochran: 367–377). **Đề xuất: thu tối thiểu 385 phiếu hợp lệ, đặt mục tiêu ~420 phiếu** để dự phòng khoảng 8–10% phiếu bị loại (trả lời không phải SV UEL, trả lời đồng loạt một mức, thời gian quá ngắn).

Nếu nguồn lực hạn chế, có thể nới e = 7% (Cochran: n ≈ 192) và nêu rõ đây là hạn chế của nghiên cứu.

**Phương pháp chọn mẫu:** chọn mẫu thuận tiện có kiểm soát theo hạn mức (quota) **theo khóa và khoa**, sao cho tỉ lệ mỗi khóa/khoa trong mẫu xấp xỉ tỉ lệ trong tổng thể (sai lệch ≤ 5 điểm phần trăm). Theo dõi hạn mức hằng ngày trong thời gian phát; nếu một nhóm thiếu, tăng cường kênh phát vào nhóm đó. Cần thừa nhận trong khóa luận rằng đây là mẫu phi xác suất nên khả năng suy rộng có giới hạn.

**Làm sạch dữ liệu:** loại phiếu S0 = "Không đồng ý" hoặc S1 = "Không"; loại phiếu trả lời cùng một mức cho toàn bộ câu Likert (straight-lining); loại phiếu trùng lặp. Ghi lại số phiếu bị loại theo từng lý do.

**Độ tin cậy thang đo:** tính Cronbach's α cho nhóm C1–C7 (khó khăn ĐKHP) và G1–G9 (giá trị cảm nhận của tính năng); chấp nhận α ≥ 0,7 (Nunnally, 1978).

## Kênh phát

| Kênh | Cách làm | Nhóm hướng tới |
|---|---|---|
| Nhóm Facebook/Zalo theo lớp, khóa, khoa | Nhờ ban cán sự lớp đăng, ghim bài | Toàn bộ, theo quota |
| Đoàn – Hội sinh viên, CLB học thuật | Xin phép chia sẻ trên fanpage | Toàn bộ |
| Cố vấn học tập / giảng viên hướng dẫn | Nhờ chuyển tiếp qua email lớp hoặc LMS (nếu được phép) | Khóa thiếu quota |
| Trực tiếp tại thư viện, căng tin (mã QR) | Phát phiếu QR trong 2–3 buổi | Cân bằng mẫu |
| Thời điểm | Ưu tiên **1–2 tuần trước hoặc trong đợt ĐKHP** để khó khăn còn "nóng" | — |

Thời gian mở khảo sát đề xuất: 2 tuần. Nên chạy thử (pilot) với 10–15 SV trước khi phát chính thức để kiểm tra độ rõ của câu hỏi và thời lượng; dữ liệu pilot không gộp vào mẫu chính.

## Gắn kết với phân tích

| Nhóm câu | Câu hỏi nghiên cứu | Chỉ số |
|---|---|---|
| B2, C1–C3, C7 | Mức độ nghiêm trọng của vấn đề xếp TKB | % đồng ý (4–5), trung bình, so sánh theo khóa |
| D2, D4, D5 | Nhu cầu tra cứu học phần tương đương | % đã từng cần, khoảng cách D5 − D4 |
| E1, E4, E5, E7 | Khoảng trống hiểu biết quy chế | % đồng ý, % từng bị ảnh hưởng |
| F2, F3 | Giá trị của trích dẫn nguồn | Chênh lệch trung bình F3 − F2 (kiểm định Wilcoxon) |
| G1–G9 | Ưu tiên tính năng | Xếp hạng trung bình → đầu vào trường *Impact* của RICE |
| G10, G11 | Ý định sử dụng | % đồng ý |

Phân tích nhanh bằng script: `research\.venv\Scripts\python research\analysis\analyze_survey.py V0=<file.csv> --out research\analysis\output\v0`.

### Tài liệu tham khảo bổ sung

- Nunnally, J. C. (1978). *Psychometric Theory* (2nd ed.). McGraw-Hill.
