# Brief — Chép lại QĐ 2261/2025 và QĐ 370 từ ảnh chụp màn hình (R7)

Quy tắc cứng như các brief trước (không in khóa; `data/` không commit; commit `[codex] …`). Bạn không có Docker; Claude sẽ nạp PostgreSQL sau.

## Đầu vào
- `data/raw/quyche_screens/QD2261/` : 52 ảnh `001.jpg…052.jpg`, theo thứ tự đọc; mỗi ảnh là một màn hình cuộn, **ảnh liền kề chồng lên nhau ~10% chiều cao** (dòng cuối ảnh n lặp lại ở đầu ảnh n+1). Văn bản: QĐ 2261/QĐ-ĐHKTL (04/09/2025) ban hành Quy chế đào tạo trình độ đại học, 32 trang PDF, gồm Quyết định + Quy chế (45 Điều).
- `data/raw/quyche_screens/QD370/` : 41 ảnh `001.jpg…041.jpg`, cùng cách chụp. Văn bản: QĐ 370/QĐ-ĐHKTL "Ban hành Quy chế quản lý văn bằng, chứng chỉ" (37 Điều + Phụ lục I–VIII), 28 trang PDF. Trên ảnh ghi ngày **04 tháng 4 năm 2023** (catalog đang ghi 2025-04-04 — sửa theo ảnh và ghi chú nguồn).
- Cũng có `QD2261_screens.pdf`, `QD370_screens.pdf` (gộp ảnh), Tesseract thử cho kết quả sai dấu thanh nên KHÔNG dùng làm bản chính.

## Việc cần làm
1. **Đọc từng ảnh bằng khả năng nhìn ảnh của bạn** (đính ảnh vào ngữ cảnh, ví dụ `codex exec -i`/công cụ xem ảnh; nếu môi trường không cho xem ảnh thì DỪNG và báo rõ, đừng chuyển sang đoán). Chép **nguyên văn** tiếng Việt, đầy đủ dấu, giữ nguyên số Điều/Khoản/điểm (a, b, c, đ…), bảng (thang điểm, bảng loại điểm…) dạng bảng Markdown/văn bản. Không sửa chính tả, không diễn đạt lại, không bỏ sót, không thêm. Chữ mờ/đóng dấu che → ghi `[không rõ]`, không đoán.
2. Ghép các ảnh thành một văn bản liên tục: bỏ phần lặp do chồng ảnh, giữ dấu `=== Trang N ===` theo **số trang in trong văn bản** (số ở chân trang, nếu có) để trích dẫn; phần Quyết định ban hành trước Quy chế.
3. Ghi kết quả vào `regulations/manual/uel-qcdt-2261-2025.txt` và `regulations/manual/uel-vanbang-370-2025.txt` (pipeline `manual_override` ưu tiên file này; kiểm tra tên/đuôi đúng cơ chế đang dùng và `.gitignore` của `regulations/`).
4. Kiểm tra chéo: (a) đếm Điều liên tục 1…45 (2261) và 1…37 (370) — thiếu/nhảy số thì xem lại ảnh tương ứng; (b) so với Tesseract (`api\.venv\Scripts\python.exe -X utf8 scripts/ocr_pdf.py data/raw/quyche_screens/QD2261_screens.pdf`) — chỗ lệch nhiều thì xem lại ảnh; (c) các con số quan trọng (tín chỉ, ngưỡng điểm, thời hạn, % học phí) đọc lại lần hai.
5. Catalog `regulations/catalog.json`: cập nhật `file` / ghi `notes` ("chép lại từ ảnh chụp màn hình bản xem Google Drive, chưa đối chiếu bản gốc"), `verified` = false; QĐ 370 sửa `issued_date` thành 2023-04-04 (và `effective_from` nếu đang suy ra từ ngày cũ — chỉ khi chắc chắn từ văn bản; trong văn bản 370 có câu "có hiệu lực kể từ ngày ký và thay thế QĐ 339/QĐ-ĐHKTL ngày 31/12/2019"). Quy chế 2261: `effective_from` 2025-09-04, áp dụng cho các khóa tuyển sinh từ tháng 09/2025 (K25 trở đi); QĐ 1268/2022 (và 118/2024) vẫn áp dụng cho khóa trước 09/2025 (xem Điều 45) — kiểm tra `applies_to_cohorts`, `supersedes`/`superseded_by` trong catalog cho nhất quán, không bịa.
6. Test: segmenter đọc đúng cấu trúc Chương/Điều/Khoản/điểm của hai file; thêm vào `questions.jsonl` ≥ 10 câu có đáp án trong 2261 (ví dụ: số tín chỉ tối thiểu/tối đa mỗi học kỳ chính — Điều 22.1.e; điều kiện tốt nghiệp — Điều 35; thang điểm — Điều 26; cảnh báo học tập — Điều 33; buộc thôi học — Điều 34; công nhận tín chỉ tối đa 50% — Điều 29.6; học phí khi nghỉ học — Điều 36.5; lớp mở ngoài kế hoạch tối thiểu 30/20 người — Điều 21.2) và ≥ 4 câu trong 370. Chạy `run_eval.py` (SQLite) trước/sau, ghi `docs/RAG_EVAL.md`; kết quả cũ không được tệ đi. Câu hỏi K25 phải ra QĐ 2261, K24 vẫn ra QĐ 1268/118.
7. Cập nhật `docs/HANDOFF.md` (lệnh Claude chạy ghi PostgreSQL: `.\scripts\db_backup.ps1 -Tag truoc-rag-r7` rồi `ingest_regulations.py --publish-db --no-vault`).

## Báo lại
Số trang/Điều đã chép, số chỗ `[không rõ]` (liệt kê), kết quả kiểm chéo và eval trước/sau. Nêu rõ cái gì chưa kiểm.
