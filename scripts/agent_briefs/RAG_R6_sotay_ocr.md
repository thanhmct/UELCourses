# Brief — Nạp sổ tay K24/K25/K26 vào RAG + OCR văn bản quy chế (R6)

Quy tắc cứng như các brief trước (không in khóa; `data/` không commit; test không gọi LLM thật; commit `[codex] …`). Bạn KHÔNG có Docker: chỉ viết code + chạy test SQLite + OCR cục bộ; việc ghi PostgreSQL Claude làm sau.

## Phần A — Sổ tay sinh viên làm nguồn RAG
Đầu vào có sẵn: `data/processed/sotay_sv_text/{K24_STSV_2024,K25_STSV_2025_0925,K26_STSV_2026}.txt` (đánh dấu `=== Trang N ===`, lớp chữ tốt, dấu đủ), PDF gốc ở `data/raw/sotay_sv/`. Báo cáo: `data/processed/sotay_sv_report.md`.
1. Sổ tay KHÔNG có cấu trúc Điều/Khoản. Thêm kiểu nguồn `handbook` vào pipeline RAG (`api/app/rag/`): chia đoạn theo mục/tiêu đề trong sổ tay và theo trang (đoạn ≤ ~1.200 ký tự, giữ `page`, `heading`, `chapter`), không ép về Điều/Khoản. Trích dẫn trả về: "Sổ tay SV K25, tr. N — <tiêu đề mục>", `chunk_id` ổn định.
2. Catalog (`regulations/catalog.json`): thêm 3 mục `uel-sotay-sv-k24`, `-k25`, `-k26` (title, issuer UEL, `applies_to_cohorts` ["K24"] / ["K25"] / ["K26"], `status` active, `verified` false, notes "tóm tắt, không thay thế văn bản gốc"). Thay mục cũ `uel-sotay-sv-2025` bằng `-k25` nếu trùng nội dung. Copy/đặt file văn bản vào chỗ pipeline đọc được (ví dụ `regulations/manual/<doc_id>.txt` — kiểm tra `manual_override`), KHÔNG sửa PDF gốc.
3. Quy tắc trả lời: sổ tay chỉ là nguồn thứ cấp — khi cùng chủ đề có văn bản gốc (Quyết định/Quy chế) thì ưu tiên văn bản gốc, sổ tay hiển thị sau với nhãn "Nguồn tóm tắt: sổ tay". Lọc theo khóa như hiện nay (câu hỏi K25 → sổ tay K25). Câu trả lời chỉ dựa vào sổ tay phải có cảnh báo "Tóm tắt trong sổ tay sinh viên; đối chiếu văn bản gốc".
4. Hậu kiểm trích nguyên văn (`verify`) vẫn áp dụng với chunk sổ tay. Thêm ≥ 15 câu vào `api/tests/rag/eval/questions.jsonl` có đáp án nằm trong sổ tay (học bổng, rèn luyện, ký túc xá, bảo hiểm y tế, vay vốn, miễn giảm học phí, CLB/đoàn hội, quy trình xác nhận giấy tờ…), kèm cột nguồn. Chạy `run_eval.py` và ghi vào `docs/RAG_EVAL.md` (số trước/sau; quy chế cũ không được tệ đi).
5. Test mới cho: chia đoạn sổ tay, lọc khóa, ưu tiên văn bản gốc, trích dẫn có số trang.

## Phần B — OCR (Tesseract đã cài; ĐÃ được chủ dự án duyệt chạy)
Công cụ: `api\.venv\Scripts\python.exe -X utf8 scripts/ocr_pdf.py <pdf> --out data/processed/ocr_text` (Tesseract `C:\Program Files\Tesseract-OCR`, dữ liệu `vie` ở `data/tessdata`; script tự đặt TESSDATA_PREFIX). Thử ở `data/processed/ocr_test/QD118_2024.txt`: dấu tiếng Việt đúng. Nếu Tesseract bị sandbox chặn thì dừng và báo, đừng đổi công cụ.
Chạy OCR (chạy nền nhiều tiến trình nhỏ, không quá 3 song song) theo thứ tự ưu tiên:
1. 9 PDF ở `data/raw/quyche_pdt/` (QD118, 1268, 142, 472, 494, 558, 621, 786, 857) — lớp chữ cũ mất dấu.
2. 15 PDF trong `regulations/raw/` còn lại ở danh sách B của `data/processed/sotay_sv_report.md` mục 4 (và bảng `data/processed/regulations_status.md`: "PDF dạng ảnh", "lớp chữ mất dấu", "lớp chữ lỗi").
3. Trang chỉ-ảnh của 3 sổ tay: K24 tr.1,60; K25 tr.1,65; K26 tr.1-7,15,40,41,63-65,83,114,128 (dùng `--pages`).
Hậu xử lý: kiểm tỷ lệ ký tự có dấu (> 0,15 là hợp lý), nối dòng/bỏ số trang lặp, tìm số hiệu/ngày để điền bổ sung metadata catalog CHỈ khi đọc rõ trong văn bản (không bịa; `verified` giữ false). Kết quả OCR đặt vào `regulations/manual/<doc_id>.txt` để pipeline ưu tiên thay lớp chữ cũ (kiểm tra cơ chế `manual_override`), giữ nguyên PDF gốc. Báo cáo `data/processed/ocr_report.md`: từng file — số trang, tỷ lệ dấu, nghi ngờ lỗi (số trang ít chữ, ký tự lạ), thời gian.
Không có chuyện dùng ảnh chụp màn hình Drive: QĐ 2261/2025, 370/2025, 1390/2025 chưa có file — bỏ qua.

## Kiểm chứng
Python test (SQLite tạm) + `run_eval.py` trước/sau + `tsc`/`vitest` nếu đụng web. Cập nhật `docs/HANDOFF.md` (lệnh cho Claude chạy ghi PostgreSQL: `ingest_regulations.py --publish-db --no-vault`). Báo số thật, nêu rõ cái gì chưa chạy.
