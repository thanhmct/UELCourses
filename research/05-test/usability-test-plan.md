# Kế hoạch kiểm thử khả dụng (Test – Vòng 1, Vòng 2…)

## 1. Mục tiêu và câu hỏi nghiên cứu

Kiểm thử khả dụng (usability testing) có điều phối, kết hợp phương pháp **nói to suy nghĩ (think-aloud)** (Ericsson & Simon, 1993; Nielsen, 1993), nhằm trả lời:

- **RQ1.** Sinh viên có hoàn thành được các tác vụ cốt lõi (xếp TKB không trùng, tìm học phần tương đương, hỏi AI quy chế) mà không cần trợ giúp không? → tỉ lệ hoàn thành ≥ 80%.
- **RQ2.** Họ mất bao lâu và gặp những lỗi gì? → thời gian, số lỗi, mức độ nghiêm trọng.
- **RQ3.** Câu trả lời của AI quy chế có **chính xác và đúng khóa** không, sinh viên có hiểu và tin trích dẫn không? → độ chính xác trích dẫn ≥ 95%.
- **RQ4.** Mức độ khả dụng tổng thể và mức sẵn lòng giới thiệu? → SUS ≥ 70, NPS (xem `survey-feedback.md`).

## 2. Người tham gia

- **Số lượng:** 8–15 sinh viên mỗi vòng (Nielsen & Landauer, 1993; Faulkner, 2003 cho thấy 10–15 người tăng đáng kể độ ổn định của tỉ lệ phát hiện vấn đề).
- **Tuyển chọn:** từ người chọn "Dùng thử" ở câu H3 của khảo sát nhu cầu, phân bổ theo persona: ≥ 3 người giống *Minh Anh* (năm 2–3, có lịch cá nhân cố định), ≥ 3 người giống *Quốc Huy* (năm cuối/học lại), ≥ 2 người giống *Thảo Vy* (năm nhất).
- **Vòng 2:** ít nhất 50% người tham gia mới (để tránh hiệu ứng học tập), phần còn lại là người cũ (để so sánh trong-chủ-thể).
- **Loại trừ:** thành viên nhóm phát triển và người đã tham gia thiết kế.

## 3. Thiết lập

| Mục | Chi tiết |
|---|---|
| Hình thức | Trực tiếp (ưu tiên) hoặc trực tuyến qua chia sẻ màn hình |
| Thời lượng | 45–60 phút/người |
| Thiết bị | Laptop có trình duyệt Chrome; 3 người dùng điện thoại cho tác vụ T1, T6 để kiểm tra giao diện di động |
| Phiên bản | Ghi rõ `app_version` của bản thử nghiệm (để đối chiếu với dữ liệu `POST /api/feedback`) |
| Dữ liệu | Dữ liệu học phần mẫu (`api/seed/*.json`) hoặc dữ liệu thật đã import; văn bản quy chế trong `regulations/`. Không yêu cầu người tham gia đăng nhập hay cung cấp token |
| Trạng thái ban đầu | Xóa localStorage trước mỗi người tham gia; chọn sẵn học kỳ hiện tại |
| Ghi hình | Ghi màn hình + âm thanh nếu được đồng ý (OBS hoặc tính năng ghi của Meet) |
| Vai trò | 1 người điều phối (moderator), 1 người ghi chép/bấm giờ |

## 4. Quy trình một buổi

| Bước | Nội dung | Thời gian |
|---|---|---|
| 1 | Chào, giải thích mục đích ("chúng mình kiểm tra sản phẩm, không kiểm tra bạn"), ký đồng ý | 3' |
| 2 | Câu hỏi nền: khóa, ngành, cách đang xếp TKB | 3' |
| 3 | Hướng dẫn think-aloud, cho tập thử với một trang web bất kỳ (1 phút) | 3' |
| 4 | Thực hiện tác vụ T1–T7 (thứ tự T1–T3 cố định; T4–T7 hoán vị giữa các người tham gia để giảm hiệu ứng thứ tự) | 30' |
| 5 | Sau mỗi tác vụ: câu SEQ "Nhìn chung, tác vụ này dễ hay khó?" (1 = Rất khó … 7 = Rất dễ) | trong bước 4 |
| 6 | Điền khảo sát sau thử nghiệm (`survey-feedback.md`: SUS, đánh giá tính năng, AI, NPS) | 8' |
| 7 | Phỏng vấn ngắn sau buổi (debrief): điều thích nhất, khó chịu nhất, điều muốn thay đổi | 5' |
| 8 | Cảm ơn, trao quà | 1' |

**Nguyên tắc điều phối:** không hướng dẫn cách làm; khi người tham gia hỏi, trả lời bằng câu hỏi ("Bạn nghĩ nên làm gì?"); nhắc "Bạn đang nghĩ gì?" khi họ im lặng quá 10 giây; chỉ can thiệp khi họ bế tắc quá thời gian tối đa (khi đó tác vụ tính là **thất bại có trợ giúp**).

## 5. Kịch bản tác vụ

Mỗi tác vụ được đưa dưới dạng **tình huống** (scenario) in trên thẻ, không chứa tên nút/menu để tránh gợi ý.

| Mã | Tình huống giao cho người tham gia | Tiêu chí thành công | Thời gian tối đa | Tính năng / HMW |
|---|---|---|---|---|
| **T1** | "Bạn phải học lại môn *[tên môn cũ đã ngừng mở]*. Hãy tìm xem bạn có thể học môn nào thay thế và môn đó có bao nhiêu tín chỉ." | Tìm đúng ≥ 1 học phần tương đương và đọc đúng số tín chỉ | 4' | F01, F02, F11 / HMW5 |
| **T2** | "Học kỳ này bạn cần học 5 môn: *[danh sách 5 mã môn]*. Bạn đi làm thêm tối thứ 3 và sáng thứ 7. Hãy xếp một TKB **không trùng lịch** và không đụng lịch làm thêm." | TKB có đủ 5 môn, 0 xung đột, không có lớp vào khung giờ cấm | 8' | F03 / HMW1 |
| **T3** | "Lớp *[mã lớp]* của môn *[X]* vừa hết chỗ. Hãy đổi sang một lớp khác của môn đó mà vẫn không trùng lịch." | Đổi thành công sang lớp hợp lệ, TKB vẫn 0 xung đột | 3' | F03, F04, F05 / HMW2–3 |
| **T4** | "Bạn là sinh viên khóa *[K46]*. Hãy hỏi hệ thống: *điều kiện để được xét tốt nghiệp* của khóa bạn là gì, và cho biết điều đó được quy định ở văn bản nào, Điều nào." | Người tham gia nêu được điều kiện **và** chỉ ra đúng số quyết định + Điều/Khoản; trích dẫn hệ thống trả về đúng khóa và còn hiệu lực | 5' | F13, F17 / HMW7–8 |
| **T5** | "Bạn muốn biết quy định về *học cải thiện điểm* có khác nhau giữa khóa *[K46]* và *[K49]* không, và văn bản nào sắp hết hiệu lực." | Chỉ ra được ít nhất một điểm khác biệt (hoặc kết luận "không khác" đúng) kèm nguồn; nhận ra cảnh báo hiệu lực | 5' | F12, F14, F15 / HMW8 |
| **T6** | "Hãy gửi TKB vừa xếp cho một người bạn và đưa nó vào lịch trên điện thoại của bạn." | Tạo được link chia sẻ **và** xuất được tệp ICS/PNG | 3' | F06, F07 / HMW4 |
| **T7** | "Hãy lập kế hoạch 2 học kỳ tới cho các môn *[danh sách]* và kiểm tra xem bạn có thiếu môn tiên quyết nào không." | Xếp đủ môn vào 2 kỳ, đọc đúng tổng tín chỉ, nhận ra cảnh báo tiên quyết (nếu có) | 5' | F09 / HMW10–11 |
| **T8** (tùy chọn) | "Bạn thấy một điểm chưa hợp lý trên trang này. Hãy gửi góp ý cho nhóm phát triển." | Gửi được feedback qua widget | 2' | F18 / HMW12 |

Ghi chú chuẩn bị:
- Các giá trị trong *[...]* phải chọn từ dữ liệu thật/mẫu **trước** buổi thử và ghi vào **đáp án chuẩn (answer key)**, đặc biệt cho T4–T5: đáp án gồm số quyết định, Điều, Khoản, nội dung trích nguyên văn và hiệu lực, được ít nhất 2 thành viên đối chiếu với văn bản gốc trong `regulations/`.
- Nếu tính năng nào chưa có ở bản thử (Should/Could), bỏ tác vụ tương ứng và ghi lại trong `iteration-log.md`.

## 6. Chỉ số đo lường

| Chỉ số | Cách đo | Mã hóa trong `sample_tasks.csv` |
|---|---|---|
| Hoàn thành tác vụ | 1 = thành công không trợ giúp; 0,5 = thành công một phần hoặc có trợ giúp nhỏ; 0 = thất bại/bỏ cuộc/hết giờ | `success` |
| Thời gian | Từ lúc đọc xong thẻ tình huống đến lúc người tham gia tuyên bố hoàn thành (giây); chỉ tính trung vị/trung bình hình học cho các lần thành công (Sauro & Lewis, 2016) | `time_sec` |
| Lỗi | Số thao tác sai dẫn ra khỏi đường đi đúng (click nhầm trang, chọn nhầm lớp, hiểu sai kết quả) | `errors` |
| SEQ | Câu hỏi đơn sau tác vụ, thang 1–7 (Sauro & Dumas, 2009) | `seq` |
| Độ chính xác trích dẫn AI (T4, T5) | Với mỗi trích dẫn hệ thống trả về: **đúng** nếu khớp văn bản gốc (số quyết định, Điều, Khoản, nguyên văn) **và** áp dụng cho khóa được hỏi **và** còn hiệu lực/được cảnh báo đúng. Độ chính xác = số trích dẫn đúng / tổng số trích dẫn | `ai_citations_total`, `ai_citations_correct` |
| Câu trả lời không nguồn | Số lần AI trả lời mà không có trích dẫn (mục tiêu 0) | ghi vào `notes` |
| Vấn đề khả dụng | Mô tả + mức độ nghiêm trọng (mục 7) | bảng vấn đề riêng |
| Think-aloud | Trích dẫn nguyên văn, biểu hiện bối rối/hài lòng | `notes` |

Mẫu phiếu quan sát (một dòng/tác vụ/người tham gia; nhập trực tiếp vào CSV cùng định dạng với `research/analysis/sample_tasks.csv`):

```
round,participant,task_id,success,time_sec,errors,seq,ai_citations_total,ai_citations_correct,notes
V1,P01,T2,1,312,1,5,,,"Không thấy cảnh báo trùng ở lần đầu"
V1,P01,T4,0.5,240,2,4,3,3,"Đọc trích dẫn nhưng nhầm Khoản"
```

## 7. Phân loại mức độ nghiêm trọng của vấn đề

Theo thang của Nielsen (1994):

| Mức | Ý nghĩa | Xử lý |
|---|---|---|
| 0 | Không phải vấn đề khả dụng | — |
| 1 | Thẩm mỹ – sửa khi có thời gian | Backlog |
| 2 | Nhỏ – ưu tiên thấp | Cải tiến nếu chi phí thấp |
| 3 | Lớn – ưu tiên cao | **Bắt buộc sửa trước vòng sau** |
| 4 | Thảm họa – chặn tác vụ, hoặc AI trả lời sai/không nguồn | **Sửa ngay** |

Mỗi vấn đề ghi: mã (U01…), tác vụ, mô tả, số người gặp / tổng số người, mức độ, bằng chứng (trích dẫn/thời điểm video), đề xuất sửa. Hai người đánh giá độc lập mức độ, sau đó thống nhất.

## 8. Phân tích và báo cáo

1. Nhập phiếu quan sát vào CSV; xuất khảo sát sau thử nghiệm từ Google Forms.
2. Chạy:
   ```powershell
   research\.venv\Scripts\python research\analysis\analyze_survey.py V1=<feedback_v1.csv> --tasks <tasks_v1.csv> --out research\analysis\output\v1
   ```
3. Tổng hợp vấn đề khả dụng theo tần suất × mức độ; sơ đồ tương đồng cho dữ liệu think-aloud và câu mở.
4. So sánh với tiêu chí thành công trong `research/README.md`; ghi phát hiện → thay đổi vào `iteration-log.md`.
5. Ở Vòng 2, chạy lại với cả hai vòng để có bảng so sánh trước/sau:
   ```powershell
   research\.venv\Scripts\python research\analysis\analyze_survey.py V1=<v1.csv> V2=<v2.csv> --tasks <tasks_v1_v2.csv> --out research\analysis\output\v1_v2
   ```

**Lưu ý diễn giải:** với n = 8–15, khoảng tin cậy của SUS và tỉ lệ hoàn thành khá rộng; báo cáo luôn kèm khoảng tin cậy 95% (script tự tính) và tránh kết luận khái quát hóa cho toàn bộ sinh viên UEL. Kiểm định so sánh giữa các vòng (Mann–Whitney U) chỉ mang tính tham khảo.

## Tài liệu tham khảo

- Ericsson, K. A., & Simon, H. A. (1993). *Protocol Analysis: Verbal Reports as Data* (rev. ed.). MIT Press.
- Faulkner, L. (2003). Beyond the five-user assumption. *Behavior Research Methods, Instruments, & Computers, 35*(3), 379–383.
- Nielsen, J. (1993). *Usability Engineering*. Academic Press.
- Nielsen, J. (1994). Severity ratings for usability problems. Nielsen Norman Group.
- Nielsen, J., & Landauer, T. K. (1993). A mathematical model of the finding of usability problems. *Proceedings of INTERCHI '93*, 206–213.
- Rubin, J., & Chisnell, D. (2008). *Handbook of Usability Testing* (2nd ed.). Wiley.
- Sauro, J., & Dumas, J. S. (2009). Comparison of three one-question, post-task usability questionnaires. *Proceedings of CHI 2009*, 1599–1608.
- Sauro, J., & Lewis, J. R. (2016). *Quantifying the User Experience* (2nd ed.). Morgan Kaufmann.
