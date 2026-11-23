# Brief X6 (Codex) — Đề cương: chỉ nạp phần còn thiếu + rà soát tên tiếng Anh (chủ dự án yêu cầu 23/11)

Làm SAU khi X5 Bước A (migration 0024–0026 áp lên DB thật, `alembic current` = 0026) xong. Quy tắc cứng như X5: sao lưu `.\scripts\db_backup.ps1 -Tag <lý-do>` trước mỗi lần ghi DB, `--dry-run` trước, ghi số trước/sau vào `data/processed/ledger_x5.md`, không commit, không web, không OCR, không token.

Lệnh container: `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T -w /workspace/api workspace <lệnh>`. DB user `uelplan`, db `uelplan`.

## Nguyên tắc chủ dự án
- KHÔNG OCR. Mọi nội dung trích thẳng từ lớp chữ của PDF/DOCX. File không có lớp chữ → ghi vào danh sách "cần chủ dự án nhập tay", không đoán.
- Đề cương CTĐT 2023: có 279 file tải được (`data/outlines_master/ctdt2023/`), 396 file bị chặn quyền, 11 file đã xóa. File Master_data + các thư mục cũ (`data/outlines_master/docs|pdf`, `data/outlines_2025/*`, 783 tài liệu đang có trong DB) KIỂM TRA TRƯỚC khi coi là thiếu: nếu một (mã môn, năm CTĐT) đã có dữ liệu đủ trường UI cần thì BỎ QUA, không tải/nạp lại.
- Môn nào vẫn thiếu thì chủ dự án sẽ tự chụp màn hình/nhập tay → báo danh sách rõ ràng (xem Phần 1.4).

## Phần 1 — Khoảng trống đề cương (theo trường UI cần)
1.1 Xác định các trường UI hiển thị cho từng môn (đọc `web/src/app/modules/[code]/page.tsx`, `web/src/components/OutlineBlock.tsx`, `api/app/routers/modules.py` endpoint outline): tên VI/EN, mô tả VI/EN, số tín chỉ/giờ, môn tiên quyết/học trước, mục tiêu (CO), CLO, đánh giá (thành phần + tỉ lệ + hình thức thi/cuối kỳ), giáo trình/tham khảo, kế hoạch tuần, giảng viên phụ trách, năm CTĐT. Ghi bảng trường → bảng DB/cột vào đầu `data/processed/outline_gap_report.md`.
1.2 Với MỖI cặp (module_code, ctdt_year ∈ {2023, 2025}) mà chương trình đào tạo trong DB dùng (suy từ `programs.cohort`: K23,K24→2023; K25,K26→2025; K27,K28→2027 nếu có) tính: có tài liệu đề cương (outline_module_links) chưa; các trường ở 1.1 có đủ chưa (outline_courses/objectives/clos/assessments/materials/schedule). Đưa ra `data/processed/outline_gap_matrix.csv` (module_code, ctdt_year, has_doc, doc_id, source_file, text_status, thiếu_trường, trạng_thái ∈ {du, thieu_truong, chua_co_de_cuong, chan_quyen, file_loi, can_nhap_tay}).
1.3 Nạp phần còn lại: chạy `import-outlines-docx` (D5) chỉ với file CHƯA có trong DB (so sha256), gán `ctdt_year` đúng (Master_data → 2025; thư mục ctdt2023 → 2023), rồi `parse-outlines` lại cho tài liệu mới; kiểm tra các trường thiếu bằng cách đọc lại văn bản gốc (không OCR) trước khi kết luận thiếu. Tài liệu `text_status='needs_ocr'` KHÔNG xử lý OCR: chuyển vào danh sách thiếu.
1.4 Xuất danh sách để chủ dự án điền tay: `data/processed/outline_can_nhap_tay.csv` gồm (module_code, tên VI, tên EN nếu có, ctdt_year, chương trình/khóa dùng môn này, lý do thiếu: chặn quyền/file xóa/không có link/không có lớp chữ/thiếu trường nào, link Drive nếu có) — mỗi dòng một (môn, năm) và sắp theo số chương trình dùng môn giảm dần. Tóm tắt số lượng ở `outline_gap_report.md`. Ghi sẵn cột trống `chu_du_an_dien` để chủ dự án điền (mô tả/tên EN/…).

## Phần 2 — Rà soát tên tiếng Anh `modules.name_en` so với đề cương
2.1 Trích tên tiếng Anh từ văn bản đề cương (không OCR): `outline_courses.name_en` và, nếu trống, dòng "Tên học phần (tiếng Anh)/Course title/English name" trong `outline_sections`/văn bản gốc của tất cả tài liệu đã có (kể cả tài liệu mới từ Phần 1). Chỉ lấy tài liệu có liên kết tới mã đó qua `outline_module_links`.
2.2 Thu thập các nguồn khác ĐÃ CÓ trong repo: Master_data (`data/raw/...` bảng tên EN), các Excel CTĐT (`data/raw/ctdt_bdcl`, `data/outlines_master/ctdt2023_excel`), `api/seed/*` (bảng seed tên EN), `program_catalog_entries`, dữ liệu cổng (portal). KHÔNG dùng web.
2.3 So sánh với `modules.name_en` hiện tại cho từng môn (1.485): chuẩn hóa so sánh (bỏ hoa/thường, dấu, khoảng trắng, "&"/"and", dấu ngoặc "(E)"). Xuất `data/processed/english_name_audit.csv`: module_code, name_vi, name_en_db, name_en_source_db, name_en_outline, name_en_master, name_en_excel, name_en_seed, kết_luận ∈ {khop, khac_chi_hoa_thuong, khac_noi_dung, db_thieu_co_nguon, khong_co_nguon}, name_en_de_xuat, nguon_de_xuat.
2.4 Áp dụng vào DB (sau sao lưu `-Tag ten-en`): chỉ khi `kết_luận` là `db_thieu_co_nguon` (DB trống, có nguồn) hoặc `khac_chi_hoa_thuong`. Thứ tự ưu tiên nguồn: đề cương > Master_data > Excel CTĐT > seed. Với `khac_noi_dung`: KHÔNG ghi đè, để trong CSV cho chủ dự án duyệt (đã có tên EN khác từ nguồn tin cậy). Ghi `name_en_source` đúng giá trị (`outline|master_data|catalog|seed_table`).
2.5 `data/processed/english_name_missing.csv` = các môn (nhất là mã E/TE và môn thuộc chương trình đang dùng) KHÔNG tìm được tên EN ở bất kỳ nguồn nào: module_code, name_vi, các chương trình/khóa dùng, cột trống `chu_du_an_dien`. Đây là danh sách báo chủ dự án tự tìm.

## Kiểm tra
- `alembic current`=0026; không có dòng `modules` bị mất; số `outline_documents` chỉ tăng; mỗi bản ghi mới có `ctdt_year`.
- pytest/tsc/vitest không đỏ thêm so với trước.
- Báo cáo cuối (tiếng Việt, ngắn): số cặp (môn, năm) đủ/thiếu theo từng trạng thái; số file mới nạp; số tên EN đã áp dụng / chờ duyệt / không có nguồn; đường dẫn 4 CSV; tên bản sao lưu; dòng ghi vào HANDOFF (một dòng).

## Cập nhật 23/11 (Claude, theo chủ dự án)
- Danh sách 'chặn quyền' 2023 (152 mã) đã đối chiếu với DB: 89 mã ĐÃ có đề cương dùng được trong DB (text extracted, parse ok/partial) → KHÔNG cần tải, giao diện dùng bản có sẵn (fallback năm, có thông báo). Chỉ còn 63 mã thiếu thật, xem data/processed/outline_2023_con_thieu.csv. Khi chạy 'export-chan-quyen-outlines' KHÔNG ghi đè file này và không đưa lại 89 mã đã có vào danh sách cần tải tay; outline_can_nhap_tay.csv phải gộp từ file này.
