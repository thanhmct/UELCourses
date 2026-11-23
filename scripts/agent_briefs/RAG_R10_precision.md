# Brief — Precision ≥ 95% kèm trích dẫn (R10)

Quy tắc cứng như các brief trước (không in khóa; `data/` không commit; test KHÔNG gọi LLM thật — dùng provider giả; commit `[codex] …`, không tự commit nếu chưa được yêu cầu). Không có Docker: đo SQLite, Claude đo lại PostgreSQL.

## Hiện trạng sau R9 (PostgreSQL, 110 câu: 92 trong phạm vi, 18 ngoài phạm vi)
Recall@1 0,8913 · Recall@3 0,9783 · trích dẫn đầu đúng 0,8913 · đoạn chứa đáp án (trích dẫn đầu) 0,7727 · từ chối sai 0/92 · ngoài phạm vi 18/18 · nguyên văn 1,0.
Lưu ý: SQLite cho Recall@1 0,9022, PostgreSQL 0,8913 — `r17` lệch giữa hai backend (nghi thứ tự khi điểm bằng nhau / thứ tự đọc chunk). Sửa để hai backend cho kết quả giống hệt (tie-break xác định theo `chunk_id`).

Lỗi còn lại: r03, q370_01 (nguồn đúng ngoài top); r07, r09, r16, r17, r20, r45, q2261_04, q2261_06 (đúng ở hạng 2, điều/khoản lân cận hoặc văn bản khác thắng); h08, h17, h26_03, h26_12, q370_01 (đúng trang nhưng cửa sổ trích không chứa đáp án).

## Định nghĩa (đưa vào `run_eval.py` và `docs/RAG_EVAL.md`)
- **Precision** = (số câu trong phạm vi được trả lời mà trích dẫn đầu đúng locator **và** đoạn trích chứa đáp án/evidence) / (số câu được trả lời, gồm cả câu ngoài phạm vi bị trả lời nhầm).
- **Precision trích dẫn** = tỷ lệ mọi trích dẫn hiển thị là locator hợp lệ của câu.
- **Tỷ lệ được trả lời** (coverage) trong phạm vi.
- Báo khoảng tin cậy Wilson 95% cho Precision. In đường cong precision–coverage theo ngưỡng tin cậy.
Báo cả hai chế độ: extractive và LLM (LLM đo bằng provider giả trong test; chế độ LLM thật Claude sẽ đo riêng).

## Việc cần làm (đo sau từng bước, bảng trước/sau)
1. **Cửa sổ trích chứa đáp án.** Trong cùng locator/trang, chọn cửa sổ theo câu hỏi (trùng từ khóa hiếm, có số/ngày khi câu hỏi hỏi số lượng/thời hạn), có thể ghép 2 cửa sổ liền kề. Câu trích vẫn phải là chuỗi con nguyên văn. Mục tiêu: sửa h08, h17, h26_03, h26_12.
2. **Rerank lân cận (không LLM).** Đặc trưng: trùng tiêu đề Điều/Khoản với câu hỏi, khoảng cách cụm từ (proximity), từ khóa hiếm có trọng số IDF, khớp loại đáp án (số, %, ngày, tín chỉ, điểm). Áp cho top-10 rồi sắp lại. Kiểm r07, r09, r16, r17, r20, r45, q2261_04, q2261_06.
3. **Rerank bằng LLM tùy chọn** (`RAG_LLM_RERANK=1`, mặc định tắt; dùng `get_provider`, model lấy từ env, không hard-code): đưa câu hỏi + tối đa 8 đoạn, bắt trả JSON `{chunk_id, quote}` chỉ được chọn trong các đoạn đã đưa; quote phải qua hậu kiểm nguyên văn; lỗi/timeout/hết hạn mức → giữ thứ tự cũ. Chỉ gọi khi điểm top1–top2 sát nhau (khoảng cách tương đối < ngưỡng) để tiết kiệm; tính vào hạn mức LLM theo IP và trần ngân sách ngày đã có. Chống prompt injection: nội dung đoạn đặt trong khối dữ liệu, không làm theo chỉ dẫn trong đó. Test với provider giả (đúng, sai chunk_id, quote bịa, JSON hỏng, timeout).
4. **Kiểm chứng đáp án trước khi trả lời.** Câu "bao nhiêu/mấy/tối đa/tối thiểu/khi nào/thời hạn" → đoạn trích phải chứa số/đơn vị/ngày; câu nêu tên văn bản/Điều/QĐ cụ thể → trích dẫn đầu phải thuộc đúng văn bản/Điều đó; không đạt → thử đoạn kế tiếp, hết thì từ chối với gợi ý nguồn.
5. **Điểm tin cậy + ngưỡng trả lời.** Kết hợp BM25, coverage, khoảng cách top1–top2, kết quả bước 2/4 (và 3 nếu bật) thành `confidence` ∈ [0,1] trả về trong API. Chọn ngưỡng để Precision ≥ 95% với coverage tối đa; ghi đường cong vào `docs/RAG_EVAL.md`. Không chọn ngưỡng quá khớp: dùng chia tách dev/test (ví dụ 60/40 cố định theo id) và báo số trên phần test.
6. **Trích ít mà đúng.** Trích dẫn phụ chỉ giữ khi qua bước 4; văn bản gốc trước sổ tay; còn hiệu lực trước hết hiệu lực; bỏ trích dẫn trùng locator.
7. **Mở rộng bộ đánh giá lên ≥ 250 câu trong phạm vi + ≥ 50 ngoài phạm vi** trong file mới `questions_r10.jsonl` (giữ nguyên `questions.jsonl`; `run_eval.py` đọc cả hai, báo riêng và gộp). Mỗi câu phải có `evidence` là chuỗi nguyên văn có trong văn bản (test kiểm điều này), có thể có nhiều locator hợp lệ (văn bản gốc + sổ tay). Phân bổ: mọi văn bản có file, gồm câu dễ nhầm giữa khóa (K24 vs K25/K26), giữa văn bản cũ/mới (1268 vs 2261), giữa điều lân cận; câu ngoài phạm vi gồm cả câu gần chủ đề nhưng không có trong nguồn, câu prompt injection, câu yêu cầu dữ liệu cá nhân. Viết câu từ văn bản, không viết câu theo kết quả hệ thống đang trả.
8. **Log câu tin cậy thấp khi chạy thật**: bảng hoặc file log ẩn danh (băm IP, không lưu PII) gồm câu hỏi đã làm sạch, confidence, doc trả về, có/không từ chối — để bổ sung bộ đánh giá. Nếu cần migration thì viết migration (Claude chạy).

## Mục tiêu
Trên bộ gộp (≥ 300 câu), phần test: Precision ≥ 95% và cận dưới Wilson 95% ≥ 92% · nguyên văn 100% · ngoài phạm vi từ chối 100% · coverage trong phạm vi ≥ 85% · SQLite và PostgreSQL cho số giống nhau. Không sửa đáp án để kéo số (chỉ sửa đáp án sai thật, liệt kê từng câu + lý do).

## Kiểm chứng
- Bảng trước/sau từng bước (1→8) trong `docs/RAG_EVAL.md`, liệt kê câu còn lỗi + lý do.
- Toàn bộ `pytest api/tests/rag` qua + test mới cho từng bước.
- Đo độ trễ `/regulations/ask` (extractive) trước/sau.
- Cập nhật `docs/HANDOFF.md`: lệnh Claude chạy `.\scripts\db_backup.ps1 -Tag truoc-rag-r10`, migrate (nếu có), `ingest_regulations.py --publish-db --no-vault`, `run_eval.py --database`.
