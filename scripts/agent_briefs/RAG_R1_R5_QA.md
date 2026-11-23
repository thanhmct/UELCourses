# Brief — AI hỏi đáp: quy chế + học phần/đề cương (R1–R5)

Bối cảnh: lõi RAG quy chế ở `api/app/rag/` (extractive mặc định, LLM có hậu kiểm trích dẫn). LLM thật: `LLM_PROVIDER=codex`, `CODEX_MODEL=gpt-5.6-sol`, khóa trong `.env` (KHÔNG in, KHÔNG ghi vào git/log/test). Quy tắc cứng: `data/` không commit; sao lưu trước khi ghi DB (`.\scripts\db_backup.ps1 -Tag <lý-do>`); UI tiếng Việt, code tiếng Anh; commit `[codex] loại: …`, không dòng đồng tác giả; test không được gọi LLM thật (dùng provider giả).

## R1 — Nền đo lường
1. Sửa 4 test lỗi: `test_sentence_diff_units`, `test_search_accentless_and_filter`, `test_graph_edges_and_cohort_filter`, `test_graph_article_nodes` (cạnh `references` vs `guides`: xác định test cũ lệch hay logic đổi, sửa phía đúng, ghi lý do).
2. Mở rộng `api/tests/rag/eval/questions.jsonl` lên ≥50 câu trên **quy chế thật** (`regulations/`, đáp án = doc_id/Điều/Khoản), gồm câu ngoài phạm vi (phải từ chối) và câu tấn công (xem mục An toàn). Lưu file UTF-8 chuẩn (hiện tiếng Việt đang hiển thị lỗi mã hóa khi đọc bằng PowerShell — kiểm tra thật sự trong file).
3. Chạy `run_eval.py`, ghi kết quả cơ sở vào `docs/RAG_EVAL.md` (Recall@k, MRR, độ chính xác trích dẫn, từ chối đúng/sai).

## R2 — Dữ liệu quy chế
Catalog 50 văn bản: 45 `verified:false`, 16 thiếu `decision_no`, 23 chưa có `file`, 8 `unknown`. Việc: báo cáo `data/processed/regulations_status.md` (từng văn bản: có file? có lớp chữ? OCR? verified?); chạy OCR (`vie`) cho PDF scan nếu công cụ có sẵn; KHÔNG tự bịa số QĐ/ngày — chỗ không đọc được thì để `unknown` và liệt kê cho chủ dự án.

## R3 — Lưu trữ & truy hồi
Chuyển chunk quy chế vào DB (`regulation_chunks`, migration mới + `alembic check` sạch; sao lưu trước khi ghi), tìm kiếm Postgres (`tsvector` hoặc trigram, giữ bỏ dấu). Chỉ mục file chỉ còn là cache dev. Đo lại bằng bộ R1, không được tệ hơn cơ sở.

## R4 — LLM có kiểm soát
- Provider `codex` (OpenAI-compatible) đọc model từ `CODEX_MODEL`; bỏ mặc định `gpt-6.2-sol` sai, đặt `gpt-5.6-sol`. Timeout, `max_tokens`, 1 lần thử lại.
- Chế độ `llm` mặc định cho `/regulations/ask` khi provider sẵn sàng; hậu kiểm trích dẫn nguyên văn giữ nguyên; khi hậu kiểm hỏng → extractive (đã có). Đếm tỷ lệ bị bỏ vì hậu kiểm.
- Cache câu trả lời (khóa = câu hỏi chuẩn hóa + khóa + phiên bản dữ liệu) để giảm chi phí.

## R5 — Hỏi đáp học phần & đề cương (MỚI)
Endpoint `POST /api/modules/ask` (hoặc `/api/ask` hợp nhất có tham số `scope: regulations|modules|auto`), dùng **chỉ dữ liệu đã có trong DB**:
- Dữ kiện có cấu trúc trả lời **xác định, không qua LLM**: tín chỉ, khoa/bộ môn, tiên quyết/song hành/tương đương, lớp mở theo kỳ, tên VI/EN, bắt buộc/tự chọn theo CTĐT.
- Nội dung đề cương (`outline_sections`: mục tiêu, CĐR, đánh giá, kế hoạch, tài liệu; `modules.description/description_en`): truy hồi bằng `search_text` (trigram/tsvector, bỏ dấu), LLM chỉ tổng hợp từ đoạn truy hồi, **hậu kiểm trích dẫn nguyên văn như quy chế**. Trích dẫn trả về: mã học phần + loại mục + năm CTĐT (`ctdt_year`) + link `/modules/{code}`.
- Nhận diện mã học phần trong câu hỏi (7 ký tự, và tên VI/EN) để thu hẹp phạm vi.
- Thành thật về thiếu dữ liệu: đề cương `ok` 478, `partial` 256, `failed` 22, `skipped` 15; 702 mã có đề cương; mô tả VI 604/1486, EN 450. Môn không có đề cương/mô tả → nói rõ "chưa có dữ liệu", không đoán.
- Câu hỏi so sánh/gợi ý lộ trình ngoài dữ liệu → từ chối lịch sự, chỉ về trang Kế hoạch.
- Web: thêm ô hỏi đáp (VI/EN, i18n sẵn có) ở trang Quy chế hoặc trang riêng `/ask`; hiển thị trích dẫn, cảnh báo hiệu lực, nhãn "AI trả lời – hãy đối chiếu văn bản gốc", nút hữu ích/không hữu ích (lưu ẩn danh).

## An toàn & chống lạm dụng API (BẮT BUỘC, có test)
1. **Chi phí LLM**: hạn mức theo IP (vd. 10 lượt LLM/giờ, 30/ngày, cấu hình qua env) + **trần ngân sách toàn cục/ngày** (`LLM_DAILY_CALL_CAP`); hết hạn mức → tự rơi về extractive (vẫn trả lời), không lỗi. Giới hạn `max_tokens`, độ dài câu hỏi (≤ 500 ký tự cho LLM), số đoạn ngữ cảnh; giới hạn đồng thời (semaphore) và timeout.
2. **Prompt injection**: nội dung quy chế/đề cương/câu hỏi là DỮ LIỆU. Đặt trong khối phân tách rõ, system prompt chống "bỏ qua chỉ dẫn", không lộ system prompt/khóa/biến môi trường/cấu hình; hậu kiểm trích dẫn là chốt cuối. Test với ≥10 câu tấn công (đòi in system prompt, đổi vai, yêu cầu viết code/văn bản ngoài chủ đề, "bỏ qua quy tắc").
3. **Chặn lạm dụng làm "LLM miễn phí"**: cổng phạm vi — câu hỏi không liên quan quy chế/học phần UEL (không có truy hồi đủ tin cậy) thì KHÔNG gọi LLM, trả từ chối cố định. LLM không bao giờ được gọi khi truy hồi không tự tin (đã có cho quy chế — áp dụng cho học phần).
4. **Không text-to-SQL, không công cụ**: LLM chỉ sinh JSON trả lời; mọi truy vấn DB là câu lệnh cố định có tham số. Không để LLM chọn bảng/cột/URL.
5. **Cào dữ liệu qua hỏi đáp**: rate limit nặng đã có (20/phút) — giữ; thêm giới hạn kích thước trả về, không có endpoint dump toàn văn đề cương; câu hỏi lặp bị cache.
6. **Quyền riêng tư**: không ghi IP thô vào log/DB (băm + muối theo ngày), không ghi khóa API, không gửi dữ liệu cá nhân (MSSV, email) cho LLM; log câu hỏi ẩn danh phục vụ cải thiện, có thể tắt bằng env.
7. **Đầu ra**: escape khi hiển thị trên web (không `dangerouslySetInnerHTML` cho câu trả lời), link chỉ nội bộ `/modules/..`, `/regulations/..`.
8. Lỗi từ provider không được lộ chi tiết nội bộ/khóa trong phản hồi (hiện `ProviderError` nhét nguyên `exc` vào cảnh báo — làm sạch).

## Kiểm chứng (báo lại số thật)
- `.\scripts\dev.ps1 test-rag` xanh; test mới cho R5 và An toàn; `alembic check` sạch; `web`: `tsc` + `vitest` xanh.
- `run_eval.py` trước/sau; bộ câu hỏi tấn công: 0 lần lộ system prompt, 0 lần gọi LLM với câu ngoài phạm vi.
- Cập nhật `docs/HANDOFF.md` (khóa phiên + kiểm chứng) và `docs/ROADMAP.md` mục E; không commit nếu còn test đỏ. Nếu Docker bị từ chối quyền thì dừng ở bước ghi DB và nói rõ.
