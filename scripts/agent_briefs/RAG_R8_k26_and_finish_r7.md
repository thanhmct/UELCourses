# Brief — Nạp sổ tay K26 + hoàn tất R7 (R8)

Quy tắc cứng như các brief trước (không in khóa; `data/` không commit; commit `[codex] …`). Không có Docker; Claude ghi PostgreSQL sau.

## Phần A — Sổ tay K26 (chính thức)
- File đúng: `data/raw/sotay_sv/K26_STSV_chinh_thuc.pdf` (64 trang, "Sổ tay sinh viên K26", số liệu tính đến 30/6/2026). Text đã trích: `data/processed/sotay_sv_text/K26_STSV_chinh_thuc.txt` (trống chỉ tr.1 và 64 = bìa, không cần OCR).
- File cũ `data/raw/sotay_sv/K26_STSV_2026.pdf` + `data/processed/sotay_sv_text/K26_STSV_2026.txt` THỰC RA là sổ tay khóa 19 (năm 2019) — không dùng cho K26; đổi tên/ghi chú để khỏi nhầm (ví dụ `K19_STSV_2019.*`, nếu catalog/ghi chú nào đang trỏ vào thì sửa cho nhất quán; có thể giữ làm nguồn K19 nếu pipeline hỗ trợ khóa đó, nếu không thì chỉ lưu).
- Làm như cách đã làm K24/K25 (mã `api/app/rag/handbook.py`): đặt `regulations/manual/uel-sotay-sv-k26.txt`, cập nhật `uel-sotay-sv-k26` trong `regulations/catalog.json` (file, `applies_to_cohorts` ["K26"], status active, verified false, notes "tóm tắt, không thay thế văn bản gốc", nguồn ctsv.uel.edu.vn/so-tay-12 → Drive).
- Khác biệt cần chú ý: K26 dựa vào **QĐ 2261/2025** (quy chế đào tạo mới, áp dụng K25 trở đi), K24 dựa QĐ 1268/118. Câu hỏi K26 phải ưu tiên 2261 (sau khi R7 xong) rồi sổ tay K26.
- Số hiệu văn bản K26 viện dẫn: `data/processed/sotay_refs_k26.json` (do Claude trích; 28 số hiệu, 10 đã có catalog). Chưa có trong catalog và liên quan sinh viên: 01/2019/TT-BLĐTBXH, 01/2023/TT-BYT, 08/2023/TT-BLĐTBXH, 33/2021/TT-BYT, 32/2023/TT-BYT, 499/TB-KTX, 1911/QĐ-ĐHKTL, 1912/QĐ-ĐHKTL, 1178/QĐ-ĐHQG, 20/2021/NĐ-CP, 35/2014/TTLT, 18/2009/TTLT, 01/2014/TT-BGDĐT, 01/VBHN-VPQH. Thêm vào catalog dưới dạng mục `file: null`, `verified: false`, notes "được sổ tay K24/K25/K26 viện dẫn, chưa có bản gốc" — chỉ những văn bản quy định (bỏ thành lập trường, khen thưởng). Không bịa số QĐ/ngày: chỗ nào sổ tay có ngày ban hành thì ghi, không thì `unknown`.
- Thêm ≥ 10 câu vào `questions.jsonl` có đáp án trong sổ tay K26 (cohort K26), chạy `run_eval.py` (SQLite) trước/sau, ghi `docs/RAG_EVAL.md`; kết quả K24/K25/quy chế cũ không được tệ đi.

## Phần B — Hoàn tất R7 (đã bị dừng giữa chừng)
Đọc `scripts/agent_briefs/RAG_R7_transcribe_screens.md` và làm phần còn lại. Hiện trạng: `regulations/manual/uel-qcdt-2261-2025.txt` ĐÃ có (77 KB) nhưng chưa kiểm chéo; QĐ 370 CHƯA chép (41 ảnh ở `data/raw/quyche_screens/QD370/`); catalog chưa sửa; chưa thêm câu hỏi; chưa chạy eval. Việc: kiểm 2261 (Điều 1…45 liên tục, đối chiếu ảnh ở chỗ nghi ngờ và các con số quan trọng), chép 370 (Điều 1…37 + Phụ lục I–VIII), sửa catalog (ngày QĐ 370 = 2023-04-04 theo ảnh), thêm câu hỏi, chạy eval. Phải tự nhìn ảnh; chữ không rõ → `[không rõ]`.

## Kiểm chứng và báo lại
Python test + `run_eval.py` trước/sau + `tsc`/`vitest` nếu đụng web; cập nhật `docs/HANDOFF.md` (lệnh Claude chạy: `.\scripts\db_backup.ps1 -Tag truoc-rag-r8` rồi `ingest_regulations.py --publish-db --no-vault`). Báo số Điều đã chép, số `[không rõ]`, số chunk K26, eval trước/sau, và cái gì chưa kiểm.
