# Brief X2 (Codex) — Tạo chương trình K23 hệ tiếng Việt từ K24 (CTĐT 2023 dùng chung cho K23 và K24)

Quy tắc chủ dự án: CTĐT 2023 áp dụng cho CẢ K23 và K24; hệ tiếng Việt của K23 giống hệt K24 (cổng trường là nguồn đúng 100% cho K24). Hiện DB chỉ có 8 chương trình K23 (406, 407, 410, 411, 415, 416, 417, 418) vì cổng trường chỉ cung cấp 8 mã cho K23; K24 có 18. Việc này: sinh các chương trình K23 còn thiếu bằng cách sao chép từ K24.

## Vùng được sửa
- Thêm mới: `api/scripts/` hoặc `api/app/cli.py` một lệnh `clone-cohort-programs` (hoặc file script riêng dưới `api/scripts/`), test `api/tests/test_clone_cohort_programs.py`.
- DB: chỉ THÊM dòng `programs` và `program_modules` (và bảng phụ nếu cần) cho K23; KHÔNG sửa, KHÔNG xóa dòng nào đã có (kể cả 8 chương trình K23 hiện có và mọi chương trình K24).
- KHÔNG sửa `web/`, `api/app/routers`, `api/migrations`, `scripts/agent_briefs`, không commit, không dùng cờ bỏ qua quyền.

## Quy tắc
1. Nguồn: các chương trình K24 HỆ TIẾNG VIỆT trong bảng `programs` có `source='ctdt'` và id dạng `K24NNN` (không hậu tố E/H/T…). Đích: `K23NNN` cho cùng NNN.
2. Chỉ tạo `K23NNN` khi chưa tồn tại VÀ có bằng chứng ngành đó thật sự có khóa 23. Bằng chứng (đủ MỘT trong ba): (a) có nhóm lớp `K23NNN…` trong `class_sections.student_groups` hoặc `cohorts`; (b) dòng của mã ngành NNN trong 17 Excel `data/outlines_master/ctdt2023_excel/*.xlsx` có cột "Học kỳ K23"/"Khóa 23" khác trống; (c) tên file Excel 2023 ghi mã NNN (vd `2023_404`, `2023_413_419`). Ngành chỉ xuất hiện từ khóa 24 trở đi (kiểm tra bằng chứng; ví dụ 419 Phân tích dữ liệu, 413 Toán) thì KHÔNG tạo. Xuất báo cáo `data/processed/k23_clone_report.csv`: mã ngành, quyết định (tạo/bỏ qua), bằng chứng, số môn.
3. Với mỗi chương trình tạo: `id = K23NNN`, `name` = tên K24 thay "Khoá 24/Khóa 24" bằng "Khóa 23", `cohort = 'K23'`, `faculty` như K24, `source = 'derived_from_K24'`, `is_sample = false`. Sao chép nguyên `program_modules` (cùng khối kiến thức, bắt buộc/tự chọn, tín chỉ, thứ tự). `suggested_semester`: lùi MỘT năm học (2024-2025-n → 2023-2024-n, 2025-2026-n → 2024-2025-n…; giữ số kỳ n); nếu có cột suggested_term dạng chuỗi ("HK01 năm học 2024-2025") thì lùi năm tương ứng.
4. Hệ E/H/T của K23 KHÔNG sinh (chủ dự án chỉ yêu cầu hệ tiếng Việt); `total_credits`/`module_count` tính lại đúng.
5. Chạy `--dry-run` trước (in số chương trình và số môn sẽ thêm, không ghi DB), rồi chạy thật. Sao lưu DB trước khi ghi: `.\scripts\db_backup.ps1 -Tag truoc-k23-clone` (script đã có, chỉ dump khi dữ liệu đổi). Chạy lại lệnh phải IDEMPOTENT (không nhân đôi).
6. Test pytest (SQLite tạm): tạo vài chương trình K24 mẫu + 1 K23 có sẵn → lệnh chỉ thêm K23 còn thiếu, không đụng K23 sẵn có, lùi đúng năm học, idempotent, bỏ qua ngành không có bằng chứng.
7. Báo cáo cuối: danh sách K23 vừa tạo (mã, tên, số môn), danh sách bỏ qua kèm lý do, đường dẫn bản sao lưu.
