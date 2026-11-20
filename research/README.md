# Nghiên cứu người dùng UELCourses theo Design Thinking

Thư mục này chứa toàn bộ tài liệu nghiên cứu người dùng (UX research) của khóa luận **UELCourses**, nền tảng lập kế hoạch học tập cho sinh viên Trường Đại học Kinh tế – Luật (UEL), ĐHQG-HCM. Tài liệu được viết để có thể trích trực tiếp vào chương Phương pháp nghiên cứu và chương Đánh giá của khóa luận.

> Quy ước: mọi nội dung đánh dấu **`[GIẢ ĐỊNH – cập nhật sau khảo sát]`** là giả thuyết làm việc của nhóm, **chưa** được kiểm chứng bằng dữ liệu thật. Dữ liệu trong `analysis/sample_*.csv` và `analysis/sample_feedback_stats.json` là **dữ liệu giả lập** chỉ dùng để chạy thử script, tuyệt đối không đưa vào kết quả khóa luận.

## 1. Khung phương pháp

Nghiên cứu áp dụng quy trình Design Thinking năm bước của Hasso Plattner Institute of Design tại Stanford (d.school, 2010) – **Thấu cảm (Empathize) → Xác định vấn đề (Define) → Lên ý tưởng (Ideate) → Tạo mẫu (Prototype) → Thử nghiệm (Test)** – theo tinh thần thiết kế lấy con người làm trung tâm của IDEO (Brown, 2008; IDEO.org, 2015). Quy trình không tuyến tính: kết quả của bước Thử nghiệm được đưa ngược về Define/Ideate để tạo vòng lặp cải tiến (iterative design, Nielsen, 1993).

Cách tiếp cận là **phương pháp hỗn hợp (mixed methods)**: định lượng (khảo sát diện rộng, SUS, NPS, chỉ số tác vụ) kết hợp định tính (phỏng vấn sâu, think-aloud, câu hỏi mở được phân tích theo chủ đề – Braun & Clarke, 2006).

| Bước | Hoạt động trong UELCourses | Tài liệu |
|---|---|---|
| Empathize | Khảo sát nhu cầu diện rộng; phỏng vấn sâu 5–8 SV | `01-empathize/survey-needs.md`, `01-empathize/interview-guide.md` |
| Define | Persona, hành trình người dùng, phát biểu vấn đề "How might we…" | `02-define/personas.md`, `02-define/journey-map.md`, `02-define/problem-statements.md` |
| Ideate | Liệt kê và ưu tiên tính năng (MoSCoW + RICE) | `03-ideate/feature-prioritization.md` |
| Prototype | MVP web (thư mục `web/`, `api/` – do các agent khác phát triển); ghi chú thiết kế, ảnh chụp các phiên bản lưu tại `04-prototype/` (hiện trống) | `04-prototype/` |
| Test | Kiểm thử khả dụng với nhóm nhỏ, khảo sát sau thử nghiệm, widget feedback trong ứng dụng | `05-test/usability-test-plan.md`, `05-test/survey-feedback.md` |
| Phân tích & lặp | Script phân tích, nhật ký vòng lặp | `analysis/analyze_survey.py`, `iteration-log.md` |

## 2. Lộ trình các vòng

| Vòng | Mục tiêu | Hoạt động chính | Đối tượng | Thời gian gợi ý |
|---|---|---|---|---|
| **Vòng 0 – Khảo sát nhu cầu** | Xác nhận vấn đề có thật và đủ phổ biến; xác định nhóm tính năng ưu tiên | Khảo sát Google Forms (n ≈ 380–400), phỏng vấn sâu 5–8 SV | SV chính quy UEL, mọi khóa | Tuần 1–3 |
| **Define + Ideate** | Chốt persona, HMW, danh sách tính năng MVP | Workshop nội bộ, chấm RICE | Nhóm thực hiện + GVHD | Tuần 4 |
| **MVP (Prototype)** | Phiên bản chạy được với dữ liệu mẫu/thật: tra cứu học phần, TKB, học phần tương đương, hỏi AI quy chế (extractive), widget feedback | Phát triển `web/` + `api/` | — | Tuần 5–9 |
| **Vòng 1 – Thử nghiệm nhóm nhỏ** | Phát hiện vấn đề khả dụng lớn; đo chỉ số nền (baseline) | Usability test 8–15 SV (think-aloud), khảo sát SUS/NPS, thu feedback trong app | SV tuyển theo persona | Tuần 10–11 |
| **Cải tiến 1** | Sửa các vấn đề mức độ nghiêm trọng 3–4, điều chỉnh tính năng | Phân tích, ghi `iteration-log.md`, phát hành bản mới | — | Tuần 12–13 |
| **Vòng 2 – Thử nghiệm lại** | Kiểm chứng cải tiến; so sánh trước/sau | Lặp lại kịch bản Vòng 1 (≥ 50% người tham gia mới), cùng bộ công cụ đo | 8–15 SV | Tuần 14–15 |
| **Vòng 3 (tùy chọn) – Thử nghiệm mở rộng** | Đánh giá trong bối cảnh thật (mùa đăng ký học phần) | Mở bản beta, thu feedback qua widget + `GET /api/feedback/stats` | SV tự nguyện | Mùa ĐKHP kế tiếp |
| **Tổng hợp** | Viết chương Đánh giá | Bảng so sánh các vòng, biểu đồ từ script | — | Tuần 16 |

Cỡ mẫu nhóm nhỏ 8–15 người dựa trên lập luận rằng khoảng 5 người dùng phát hiện phần lớn vấn đề khả dụng của một nhóm người dùng đồng nhất (Nielsen & Landauer, 1993; Virzi, 1992), và nên tăng lên khi có nhiều nhóm người dùng khác nhau (các khóa, các ngành) hoặc khi cần ước lượng chỉ số định lượng như SUS (Sauro & Lewis, 2016).

## 3. Tiêu chí thành công đo được

| # | Chỉ số | Ngưỡng đạt | Công cụ đo | Nguồn tham chiếu |
|---|---|---|---|---|
| 1 | Điểm SUS trung bình | **≥ 70** (trên mức trung bình 68) | `05-test/survey-feedback.md` phần B | Brooke (1996); Sauro (2011); Bangor và cộng sự (2008) |
| 2 | Tỉ lệ hoàn thành tác vụ (trung bình các tác vụ) | **≥ 80%** | Phiếu quan sát `05-test/usability-test-plan.md` | Sauro & Lewis (2016) |
| 3 | Độ chính xác trích dẫn của AI quy chế (trích dẫn đúng văn bản, Điều, Khoản và đúng khóa/hiệu lực) | **≥ 95%** | Đối chiếu thủ công trong tác vụ T4–T5 | Nguyên tắc AI trong `ARCHITECTURE.md` |
| 4 | Câu trả lời AI "không có nguồn" bị trả về | **0** | Quan sát + log | `ARCHITECTURE.md` |
| 5 | Thời gian xếp một TKB 5 môn không trùng lịch | **≤ 5 phút** (trung vị) | Bấm giờ | So với cách làm hiện tại (Vòng 0) |
| 6 | Điểm SEQ (độ dễ từng tác vụ, 1–7) | **≥ 5,5** mỗi tác vụ | Câu hỏi sau từng tác vụ | Sauro & Dumas (2009) |
| 7 | NPS | **≥ 0** ở Vòng 1, **tăng** ở Vòng 2 | `05-test/survey-feedback.md` phần E | Reichheld (2003) |
| 8 | Điểm đánh giá trung bình widget feedback | **≥ 4,0/5** | `GET /api/feedback/stats` | — |
| 9 | Cải tiến giữa các vòng | SUS Vòng 2 > Vòng 1; số vấn đề mức 3–4 giảm ≥ 50% | `analysis/analyze_survey.py`, `iteration-log.md` | — |

## 4. Phân tích dữ liệu

Script: `analysis/analyze_survey.py` (Python + pandas + matplotlib). Môi trường ảo riêng tại `research/.venv`.

```powershell
# Cài đặt lần đầu (từ thư mục gốc dự án)
python -m venv research\.venv
research\.venv\Scripts\pip install -r research\analysis\requirements.txt

# Chạy thử với dữ liệu giả lập
research\.venv\Scripts\python research\analysis\analyze_survey.py `
    research\analysis\sample_responses.csv `
    --tasks research\analysis\sample_tasks.csv `
    --feedback-json research\analysis\sample_feedback_stats.json `
    --out research\analysis\output\sample

# Dữ liệu thật: nhiều file CSV xuất từ Google Forms, mỗi file một vòng
research\.venv\Scripts\python research\analysis\analyze_survey.py `
    V1=research\data\feedback_vong1.csv V2=research\data\feedback_vong2.csv `
    --tasks research\data\tasks_v1_v2.csv --out research\analysis\output\v1_v2

# Khảo sát nhu cầu Vòng 0 (chỉ thống kê mô tả + biểu đồ)
research\.venv\Scripts\python research\analysis\analyze_survey.py V0=research\data\needs_vong0.csv --out research\analysis\output\v0

# Kiểm thử script
research\.venv\Scripts\python -m unittest discover -s research\analysis -v

# Sinh lại bộ dữ liệu giả lập
research\.venv\Scripts\python research\analysis\analyze_survey.py --make-sample research\analysis
```

`research/data/` và `research/analysis/output/` nằm trong `research/.gitignore` để tránh commit dữ liệu thật có thể chứa thông tin cá nhân.

Quy ước để script tự nhận diện câu hỏi: **mỗi tiêu đề câu hỏi trên Google Forms bắt đầu bằng mã trong ngoặc vuông**, ví dụ `[SUS1] Tôi nghĩ rằng tôi sẽ muốn sử dụng UELCourses thường xuyên.` hoặc `[NPS] …`. Mã của từng câu đã ghi sẵn trong các bảng hỏi. Kết quả gồm `summary.md`, `summary.json`, các bảng CSV và biểu đồ PNG.

**Dữ liệu thật** (CSV phản hồi có thông tin cá nhân) nên đặt ngoài thư mục được chia sẻ công khai hoặc ẩn danh hóa trước (xóa cột email/liên hệ); không commit dữ liệu có thông tin định danh.

Script đọc được JSON xuất từ `GET /api/feedback/stats` theo hai dạng: (a) có danh sách bản ghi thô (`items`/`feedback`/`records`: `{page, rating, category, message, app_version, created_at}`), hoặc (b) dạng tổng hợp (`total`, `average_rating`, `by_page`, `by_category`, `rating_distribution`). Do hợp đồng API mới ghi "tổng hợp cho phân tích", nhóm đề xuất backend trả về cả hai phần (xem ví dụ `analysis/sample_feedback_stats.json`).

## 5. Đạo đức nghiên cứu

- Tham gia tự nguyện, có trang đồng ý tham gia (informed consent) ở đầu mọi bảng hỏi và buổi phỏng vấn; người tham gia có thể dừng bất kỳ lúc nào.
- Không thu thập MSSV, token đăng nhập hay mật khẩu cổng thông tin. Email liên hệ là tùy chọn và được tách khỏi dữ liệu phân tích.
- Ghi âm/ghi màn hình chỉ khi người tham gia đồng ý; tệp được xóa sau khi bảo vệ khóa luận.
- Kết quả chỉ báo cáo ở dạng tổng hợp hoặc trích dẫn ẩn danh (P01, P02…).

## 6. Tài liệu tham khảo phương pháp

- Bangor, A., Kortum, P. T., & Miller, J. T. (2008). An empirical evaluation of the System Usability Scale. *International Journal of Human–Computer Interaction, 24*(6), 574–594.
- Bangor, A., Kortum, P., & Miller, J. (2009). Determining what individual SUS scores mean: Adding an adjective rating scale. *Journal of Usability Studies, 4*(3), 114–123.
- Braun, V., & Clarke, V. (2006). Using thematic analysis in psychology. *Qualitative Research in Psychology, 3*(2), 77–101.
- Brooke, J. (1996). SUS: A "quick and dirty" usability scale. In P. W. Jordan et al. (Eds.), *Usability Evaluation in Industry* (pp. 189–194). Taylor & Francis.
- Brown, T. (2008). Design thinking. *Harvard Business Review, 86*(6), 84–92.
- Clegg, D., & Barker, R. (1994). *Case Method Fast-Track: A RAD Approach*. Addison-Wesley. (nguồn gốc kỹ thuật MoSCoW)
- Cochran, W. G. (1977). *Sampling Techniques* (3rd ed.). Wiley.
- Cooper, A. (1999). *The Inmates Are Running the Asylum*. Sams. (persona)
- Ericsson, K. A., & Simon, H. A. (1993). *Protocol Analysis: Verbal Reports as Data* (rev. ed.). MIT Press. (think-aloud)
- Hasso Plattner Institute of Design at Stanford (d.school). (2010). *An Introduction to Design Thinking: Process Guide*; *Bootcamp Bootleg*.
- IDEO.org. (2015). *The Field Guide to Human-Centered Design*. IDEO.org.
- Kalbach, J. (2016). *Mapping Experiences*. O'Reilly. (journey map)
- Likert, R. (1932). A technique for the measurement of attitudes. *Archives of Psychology, 140*, 1–55.
- McBride, S. (2016). *RICE: Simple prioritization for product managers*. Intercom.
- Nielsen, J. (1993). *Usability Engineering*. Academic Press.
- Nielsen, J., & Landauer, T. K. (1993). A mathematical model of the finding of usability problems. *Proceedings of INTERCHI '93*, 206–213.
- Reichheld, F. F. (2003). The one number you need to grow. *Harvard Business Review, 81*(12), 46–54.
- Sauro, J. (2011). *A Practical Guide to the System Usability Scale*. Measuring Usability LLC.
- Sauro, J., & Dumas, J. S. (2009). Comparison of three one-question, post-task usability questionnaires. *Proceedings of CHI 2009*, 1599–1608.
- Sauro, J., & Lewis, J. R. (2016). *Quantifying the User Experience* (2nd ed.). Morgan Kaufmann.
- Virzi, R. A. (1992). Refining the test phase of usability evaluation: How many subjects is enough? *Human Factors, 34*(4), 457–468.
- Yamane, T. (1967). *Statistics: An Introductory Analysis* (2nd ed.). Harper & Row. (công thức thường gọi là Slovin)
