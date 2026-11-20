# Ưu tiên tính năng (Ideate): MoSCoW + RICE

> **Trạng thái:** điểm số ban đầu là ước lượng của nhóm `[GIẢ ĐỊNH – cập nhật sau khảo sát]`. Sau Vòng 0, cập nhật **Reach** theo tỉ lệ SV gặp vấn đề (câu C, D, E) và **Impact** theo điểm hữu ích trung bình của câu G1–G9 trong `01-empathize/survey-needs.md`; sau mỗi vòng thử nghiệm, cập nhật **Confidence**.

## 1. Phương pháp

Hai kỹ thuật được kết hợp:

- **MoSCoW** (Clegg & Barker, 1994; DSDM Consortium): phân loại *Must have / Should have / Could have / Won't have (lần này)* để chốt phạm vi MVP.
- **RICE** (McBride, 2016 – Intercom): định lượng thứ tự ưu tiên trong từng nhóm:

$$\text{RICE} = \frac{\text{Reach} \times \text{Impact} \times \text{Confidence}}{\text{Effort}}$$

| Thành phần | Định nghĩa trong UELPlan | Thang |
|---|---|---|
| Reach (R) | % sinh viên dự kiến dùng tính năng trong một học kỳ | 0–100 |
| Impact (I) | Mức giảm khó khăn cho người dùng mỗi lần dùng | 3 = rất lớn, 2 = lớn, 1 = trung bình, 0,5 = nhỏ, 0,25 = rất nhỏ |
| Confidence (C) | Mức chắc chắn về R, I, E (có dữ liệu hay chỉ là cảm tính) | 100% / 80% / 50% / 30% |
| Effort (E) | Công sức phát triển ước tính (người-tuần) | ≥ 0,5 |

Quy tắc: tính năng **Must** do ràng buộc nghiên cứu/kỹ thuật (feedback, import dữ liệu) vẫn giữ Must dù điểm RICE thấp; RICE dùng để sắp thứ tự triển khai và để quyết định ranh giới Should/Could.

## 2. Bảng chấm điểm `[GIẢ ĐỊNH – cập nhật sau khảo sát]`

| # | Tính năng (theo ARCHITECTURE.md) | Câu khảo sát liên quan | R | I | C | E | **RICE** | **MoSCoW** |
|---|---|---|---|---|---|---|---|---|
| F18 | Widget feedback trên mọi trang (`POST /api/feedback`) | — (yêu cầu phương pháp) | 100 | 1 | 100% | 0,5 | **200,0** | Must |
| F17 | Cài đặt: chọn khóa tuyển sinh, chế độ tối | E2 | 70 | 0,5 | 100% | 0,5 | **70,0** | Must (khóa) / Could (chế độ tối) |
| F03 | TKB: chọn môn, chọn lớp, **phát hiện trùng lịch** | C1, C3, G2 | 85 | 3 | 80% | 3 | **68,0** | Must |
| F02 | Trang chi tiết học phần (kèm tương đương, tiên quyết) | G1, D5 | 80 | 1 | 80% | 1 | **64,0** | Must |
| F01 | Tra cứu học phần: tìm kiếm, lọc khoa/tín chỉ/loại | G1 | 90 | 1 | 80% | 1,5 | **48,0** | Must |
| F15 | Cảnh báo văn bản quy chế sắp hết hiệu lực/bị thay thế | E7, G9 | 30 | 1 | 80% | 0,5 | **48,0** | Should |
| F06 | Chia sẻ TKB qua URL | G4 | 50 | 1 | 80% | 1 | **40,0** | Should |
| F08 | Ẩn môn, đổi màu trên TKB | — | 50 | 0,5 | 80% | 0,5 | **40,0** | Should |
| F12 | Duyệt văn bản quy chế (lọc theo khóa, hiệu lực) | E3, E4 | 50 | 1 | 80% | 1 | **40,0** | Must |
| F11 | Tra cứu học phần tương đương | D2, D4, D5, G6 | 35 | 2 | 80% | 1,5 | **37,3** | Must |
| F04 | Kéo-thả đổi lớp trên TKB | C2, G3 | 60 | 2 | 50% | 2 | **30,0** | Should |
| F05 | Nhiều phương án TKB / nhiều học kỳ | B3, G3 | 50 | 1 | 50% | 1 | **25,0** | Should |
| F07 | Xuất TKB ra PNG và ICS | G4 | 45 | 1 | 80% | 1,5 | **24,0** | Should |
| F13 | **Hỏi AI quy chế** chế độ `extractive` (BM25, trích dẫn nguyên văn, lọc theo khóa) | E1, E4, F3, G8 | 60 | 3 | 50% | 4 | **22,5** | Must |
| F09 | Lập kế hoạch nhiều học kỳ: tổng tín chỉ, cảnh báo thiếu tiên quyết | C4, C5, G5 | 40 | 2 | 50% | 3 | **13,3** | Should |
| F10 | Phòng học: xem lịch trống | C6, G7 | 30 | 0,5 | 50% | 1 | **7,5** | Could |
| F14 | So sánh quy định giữa các khóa | E2, G9 | 25 | 1 | 50% | 2 | **6,3** | Could |
| F16 | Chế độ AI `llm` (Ollama/Claude, hậu kiểm trích dẫn) | F2–F4 | 60 | 1 | 30% | 3 | **6,0** | Won't (MVP) → xét ở Vòng 2 |
| F19 | Đồng bộ học phần tương đương qua token (`POST /api/sync/equivalents`, dùng một lần) | D3 | 35 | 0,5 | 50% | 1,5 | **5,8** | Could |
| F20 | Import JSON lớp học phần/tương đương (`POST /api/import/*`) | — (hạ tầng dữ liệu) | — | — | — | 1 | — | Must (hạ tầng) |

Ghi chú về điểm số:
- F13 có Impact cao nhất nhưng Confidence thấp vì chất lượng truy xuất phụ thuộc vào văn bản quy chế thu thập được; Effort lớn do cần chunking cấp Điều/Khoản và bộ kiểm thử độ chính xác.
- F17 có điểm cao do Effort rất thấp; phần **chọn khóa** là điều kiện tiên quyết cho F13 (lọc theo `applies_to_cohorts`).
- F09 có Confidence 50% vì dữ liệu tiên quyết chưa chắc có sẵn từ API của trường.

## 3. Phạm vi MVP theo MoSCoW

| Nhóm | Tính năng | Lý do |
|---|---|---|
| **Must have** | F01, F02, F03, F11, F12, F13, F17 (chọn khóa), F18, F20 | Giải quyết trực tiếp POV P1–P3; đủ để chạy các tác vụ T1–T5 của Vòng 1 |
| **Should have** | F04, F05, F06, F07, F08, F09, F15 | Tăng hiệu quả nhưng không chặn tác vụ cốt lõi; triển khai nếu kịp trước Vòng 1, nếu không đưa vào cải tiến 1 |
| **Could have** | F10, F14, F17 (chế độ tối), F19 | Giá trị thấp hơn hoặc phụ thuộc dữ liệu chưa chắc chắn |
| **Won't have (lần này)** | F16 (LLM) ở MVP; tự động đăng ký/hủy học phần; tài khoản đăng nhập; lưu token sinh viên | F16 chờ đánh giá độ chính xác extractive; tự động ĐKHP và lưu token bị cấm theo `CLAUDE.md`; MVP lưu trạng thái ở localStorage |

## 4. Thứ tự triển khai đề xuất

1. Hạ tầng: F20 → F01 → F02 → F17 (khóa) → F18
2. Giá trị cốt lõi: F03 → F11 → F12 → F13
3. Trước Vòng 1 nếu kịp: F06 → F08 → F04 → F15
4. Cải tiến 1 (dựa trên phát hiện Vòng 1): F05, F07, F09, các sửa lỗi khả dụng
5. Vòng 2+: F10, F14, F16, F19

## 5. Cập nhật sau dữ liệu

| Thời điểm | Cập nhật | Nguồn |
|---|---|---|
| Sau Vòng 0 | R = % đồng ý (4–5) ở câu vấn đề tương ứng; I quy đổi từ trung bình G (≥ 4,5 → 3; 4,0–4,49 → 2; 3,5–3,99 → 1; 3,0–3,49 → 0,5; < 3 → 0,25); C nâng lên 80% với tính năng có bằng chứng | `analysis/output/v0/summary.md` |
| Sau Vòng 1 | Điều chỉnh I theo đánh giá tính năng (phần C của `survey-feedback.md`) và tỉ lệ hoàn thành tác vụ; E theo thực tế phát triển | `analysis/output/v1/summary.md`, `iteration-log.md` |

## Tài liệu tham khảo

- Clegg, D., & Barker, R. (1994). *Case Method Fast-Track: A RAD Approach*. Addison-Wesley.
- DSDM Consortium. (2014). *The DSDM Agile Project Framework* (mục "MoSCoW Prioritisation").
- McBride, S. (2016). *RICE: Simple prioritization for product managers*. Intercom Blog.
