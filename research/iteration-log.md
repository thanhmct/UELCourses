# Nhật ký vòng lặp Design Thinking

Mỗi vòng thử nghiệm ghi một mục theo mẫu dưới đây, theo trình tự **Phát hiện → Thay đổi → Chỉ số trước/sau**. Nhật ký là bằng chứng truy vết (traceability) cho thấy mọi thay đổi sản phẩm đều xuất phát từ dữ liệu người dùng – nội dung có thể đưa trực tiếp vào chương Đánh giá của khóa luận.

Quy ước:
- Mã phát hiện: `R<vòng>-F<số>` (ví dụ R1-F03); mã thay đổi: `R<vòng>-C<số>`; mã vấn đề khả dụng U01… lấy từ `05-test/usability-test-plan.md` mục 7.
- Mức độ nghiêm trọng theo thang Nielsen (1994): 0–4.
- Số liệu lấy từ `analysis/output/<vòng>/summary.md`; ghi rõ đường dẫn tệp kết quả.
- Không ghi tên thật của người tham gia; dùng P01, P02…

---

## Mẫu một vòng (sao chép cho mỗi vòng)

### Vòng [n] – [tên vòng] ([ngày bắt đầu] → [ngày kết thúc])

**1. Bối cảnh**

| Mục | Nội dung |
|---|---|
| Phiên bản thử nghiệm (`app_version`) | |
| Người tham gia | n = …; phân bổ persona: Minh Anh …, Quốc Huy …, Thảo Vy …; người mới/người cũ: … / … |
| Hình thức | Trực tiếp / trực tuyến; thiết bị |
| Tác vụ thực hiện | T1 … T8 (ghi rõ tác vụ bị bỏ và lý do) |
| Dữ liệu | Khảo sát: `…csv`; phiếu quan sát: `…csv`; feedback API: `…json` |
| Kết quả phân tích | `research/analysis/output/<thư mục>/summary.md` |

**2. Phát hiện**

| Mã | Phát hiện | Bằng chứng (định lượng / trích dẫn ẩn danh) | Số người gặp / n | Mức độ (0–4) | Tác vụ / tính năng | HMW liên quan |
|---|---|---|---|---|---|---|
| R[n]-F01 | | | / | | | |
| R[n]-F02 | | | / | | | |

**3. Quyết định thay đổi**

| Mã | Thay đổi | Phát hiện xử lý | Loại (sửa lỗi / thiết kế lại / tính năng mới / bỏ tính năng) | Ưu tiên (MoSCoW) / RICE cập nhật | Thư mục chịu trách nhiệm (`web/`, `api/`, `api/app/rag/`…) | Trạng thái |
|---|---|---|---|---|---|---|
| R[n]-C01 | | R[n]-F01 | | | | Đề xuất / Đang làm / Xong |

Phát hiện **không** xử lý ở vòng này và lý do: …

**4. Chỉ số trước/sau**

| Chỉ số | Mục tiêu | Vòng trước | Vòng này | Δ | Đạt? |
|---|---|---|---|---|---|
| SUS trung bình (CI 95%) | ≥ 70 | | | | |
| Tỉ lệ hoàn thành tác vụ | ≥ 80% | | | | |
| Độ chính xác trích dẫn AI | ≥ 95% | | | | |
| Câu trả lời AI không có nguồn | 0 | | | | |
| Thời gian trung vị T2 (xếp TKB 5 môn) | ≤ 5 phút | | | | |
| SEQ trung bình | ≥ 5,5 | | | | |
| NPS | ≥ 0, tăng | | | | |
| Điểm widget feedback | ≥ 4,0 | | | | |
| Số vấn đề mức 3–4 | giảm ≥ 50% | | | | |

Kiểm định so sánh (nếu có): Mann–Whitney U cho SUS, p = …, r = … (lưu ý cỡ mẫu nhỏ).

**5. Bài học và giả định được cập nhật**

- Giả định đã được xác nhận / bác bỏ (ghi rõ tài liệu đã cập nhật, ví dụ xóa nhãn `[GIẢ ĐỊNH – cập nhật sau khảo sát]` trong `02-define/personas.md`):
- Thay đổi về phương pháp cho vòng sau (kịch bản tác vụ, câu hỏi, tuyển người):

**6. Quyết định tiếp theo**

☐ Tiếp tục vòng [n+1] với thay đổi trên ☐ Quay lại Define/Ideate ☐ Dừng lặp – đạt tiêu chí

---

## Vòng 0 – Khảo sát nhu cầu (chưa thực hiện)

| Mục | Nội dung |
|---|---|
| Công cụ | `01-empathize/survey-needs.md`, `01-empathize/interview-guide.md` |
| Mục tiêu cỡ mẫu | ≥ 385 phiếu hợp lệ (mục tiêu ~420); 5–8 phỏng vấn sâu |
| Kết quả | _Điền sau khi thu thập_ |
| Cập nhật tài liệu Define/Ideate | _Danh sách giả định được xác nhận/bác bỏ_ |

## Vòng 1 – Thử nghiệm nhóm nhỏ (chưa thực hiện)

_Sao chép mẫu ở trên._

## Ví dụ minh họa cách điền (DỮ LIỆU GIẢ LẬP – xóa khi có dữ liệu thật)

Ví dụ dưới đây dùng số liệu từ `analysis/sample_*.csv` (giả lập) chỉ để minh họa định dạng.

| Mã | Phát hiện | Bằng chứng | Số người / n | Mức độ |
|---|---|---|---|---|
| R1-F01 | Cảnh báo trùng lịch khó nhận ra khi TKB nhiều môn | T2 hoàn thành 67% (giả lập); trích "Cảnh báo trùng lịch khó thấy, nên tô đỏ rõ hơn." | 5/12 | 3 |
| R1-F02 | Người dùng khó định vị Khoản trong câu trả lời AI dài | T4 hoàn thành 67%; độ chính xác trích dẫn 86,2% (giả lập) | 4/12 | 4 |

| Mã | Thay đổi | Phát hiện | Thư mục |
|---|---|---|---|
| R1-C01 | Tô nền đỏ ô trùng lịch + biểu tượng cảnh báo trên đầu TKB | R1-F01 | `web/` |
| R1-C02 | Hiển thị thẻ trích dẫn tách riêng (số QĐ – Điều – Khoản), làm nổi đoạn khớp | R1-F02 | `web/`, `api/app/rag/` |

| Chỉ số | Mục tiêu | V1 | V2 | Δ |
|---|---|---|---|---|
| SUS | ≥ 70 | 63,1 | 75,6 | +12,5 |
| Hoàn thành tác vụ | ≥ 80% | 75,6% | 89,9% | +14,3 điểm % |
| Độ chính xác trích dẫn AI | ≥ 95% | 86,2% | 98,6% | +12,4 điểm % |
| NPS | ≥ 0 | −8 | +50 | +58 |

## Tài liệu tham khảo

- Nielsen, J. (1993). *Usability Engineering* (chương "Iterative Design"). Academic Press.
- Nielsen, J. (1994). Severity ratings for usability problems. Nielsen Norman Group.
