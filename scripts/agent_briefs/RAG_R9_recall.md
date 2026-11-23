# Brief — Tăng Recall truy xuất RAG (R9)

Quy tắc cứng như các brief trước (không in khóa; `data/` không commit; test không gọi LLM thật; commit `[codex] …`). Không có Docker: đo bằng SQLite (`run_eval.py`), Claude đo lại PostgreSQL.

## Hiện trạng (PostgreSQL, 110 câu: 92 trong phạm vi, 18 ngoài phạm vi)
Recall@1 0,78 · Recall@3 0,85 · trích dẫn đầu đúng 0,74 · từ chối sai trong phạm vi 6,5% · từ chối đúng ngoài phạm vi 18/18.

## Nguyên nhân Claude đã chẩn đoán (kiểm lại, sửa tận gốc)
1. **Chunk "hút" mọi câu hỏi (hub).** Khoản cuối của văn bản bị dính cả phụ lục/bảng: `uel-ngoaingu-2024-k24` Điều 12 Khoản 3 dài 5.572 ký tự (kèm Phụ lục xếp lớp), `uel-drl-2024` Điều 20 Khoản 5 1.516 ký tự (bảng khung điểm). 11 chunk > 5.000 ký tự, lớn nhất 54.010 (`uel-thi-1622-2022` 20.4), `uel-qcdt-1268-2022` 48.4 = 48.358. Hai chunk đầu đứng top-1 ở q2261_01/02/04/05/06 và q370_02/03 dù không liên quan.
   → Segmenter: tách "Phụ lục …", bảng, phần sau "./." / chữ ký ra khỏi khoản cuối thành đoạn riêng (loại `appendix`, giữ doc/điều gốc để trích dẫn "Phụ lục I, QĐ …"); chặn độ dài chunk (≈ 1.200–1.500 ký tự, chia cửa sổ có chồng, giữ article/clause/point + `part`), trích dẫn lấy cửa sổ tốt nhất.
2. **Cổng từ chối quá chặt với câu ngắn/dữ kiện.** q2261_03 (dạy trực tuyến tối đa 30%), h26_06, h26_11, h26_12 (hotline, số điện thoại) bị từ chối dù truy hồi đúng ở hạng 1 (`rank: 1`). q370_01, q370_04 bị từ chối.
   → Hiệu chỉnh `MIN_COVERAGE`/`MIN_SCORE` bằng quét ngưỡng trên bộ eval (giữ 18/18 ngoài phạm vi), cân nhắc tính coverage trên cửa sổ tốt nhất thay vì cả chunk, và trọng số IDF cho từ chung ("sinh viên", "trường", "quy định", "bao nhiêu"…).
3. **Tiếng Việt tách theo âm tiết làm mất nghĩa từ ghép.** "tín chỉ", "học phần", "điểm chữ", "ký túc xá", "ban cán sự"… bị tách → khớp nhầm. → Thêm token bigram (và có thể trigram) âm tiết (cả có dấu và bỏ dấu) vào BM25 (index + query), giữ tương thích bỏ dấu; đo trước/sau.
4. **Ưu tiên nguồn theo khóa và loại nguồn.** h06, h26_10: `vnu-ctsv-2019` (áp dụng "all") vượt sổ tay K25/K26 dù câu hỏi nói "theo sổ tay K26". Văn bản riêng cho khóa (cohort-specific) nên được cộng điểm nhẹ so với "all" khi điểm gần nhau; câu hỏi có cụm "sổ tay" thì ưu tiên nguồn handbook.
   Lưu ý: `uel-ngoaingu-2024-k24` xuất hiện ở câu K25 là do phạm vi mở "từ K24 trở đi" (QĐ 1390/2025 thay thế chưa có file) — kiểm tra `applies_from_cohort`/`superseded_by`: nếu catalog/ghi chú cho biết 1390/2025 thay thế cho khóa nào thì ghi `applies_until_cohort` đúng (không bịa); nếu không chắc thì giữ nguyên và ghi chú.
5. **Có thể là FN do cách chấm.** q2261_01 nhận `rank: null` dù danh sách trả về có (`uel-qcdt-2261-2025`, 22, 1) ở vị trí 3 — có lẽ vì expected có `point: "e"` mà chunk ở cấp khoản. Rà `run_eval.py`: so khớp expected ở cấp điểm phải chấp nhận chunk cấp khoản chứa điểm đó (và ngược lại), sổ tay khớp theo trang ±0 hoặc đoạn chứa `evidence`. Sửa metric cho đúng nhưng KHÔNG nới đến mức sai; ghi rõ thay đổi trong `docs/RAG_EVAL.md`, báo cả số trước/sau theo metric cũ và mới.
6. (Sau khi 1–5 xong, nếu Recall@3 còn < 0,95) **Truy xuất lai**: embedding đa ngôn ngữ nhẹ (fastembed, ví dụ `intfloat/multilingual-e5-small` hoặc tương đương chạy CPU) + hợp nhất RRF với BM25; bật bằng `RAG_EMBEDDINGS=1`, mặc định tắt nếu làm chậm/khó triển khai (Render free 512 MB). Lưu vector vào DB (cột/ bảng riêng, migration) hoặc tính lúc nạp; đo độ trễ `/regulations/ask` trước/sau.

## Mục tiêu
Recall@1 ≥ 0,90 · Recall@3 ≥ 0,95 · trích dẫn đầu đúng ≥ 0,88 · từ chối đúng ngoài phạm vi 18/18 · từ chối sai trong phạm vi ≤ 2% · trích nguyên văn 100%. Không được đạt bằng cách sửa đáp án trong `questions.jsonl` (chỉ sửa câu mà đáp án sai thật, liệt kê từng câu và lý do). Không thêm câu dễ để kéo số.

## Kiểm chứng
- Bảng số trước/sau từng bước (1→6) trong `docs/RAG_EVAL.md`, liệt kê các câu còn lỗi kèm lý do.
- Toàn bộ `pytest api/tests/rag` + test mới cho segmenter tách phụ lục/giới hạn độ dài, bigram, ưu tiên khóa, metric.
- Cập nhật `docs/HANDOFF.md`: lệnh Claude chạy `.\scripts\db_backup.ps1 -Tag truoc-rag-r9`, migrate (nếu có migration), `ingest_regulations.py --publish-db --no-vault`, `run_eval.py --database`.
