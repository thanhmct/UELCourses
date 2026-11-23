# Brief X5 (Codex) — Hoàn tất hàng đợi dang dở và thống nhất database (chủ dự án: "chuyển qua Codex chạy hết")

Bạn là Codex chạy ở `D:\UELCourse` (sandbox workspace-write, KHÔNG cờ bỏ qua quyền, KHÔNG commit, KHÔNG push). Docker Desktop đang chạy; container `workspace` (python/node, cd /workspace), `db` (PostgreSQL), `api`. Chạy lệnh trong container bằng `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T -w /workspace/api workspace <lệnh>`. Máy chủ Antigravity (agy) đã DỪNG, không còn ai sửa song song ngoài phiên Claude và phiên fork (có thể sửa web/src/components/TimetableGrid.tsx, X3): đọc lại file hiện tại trước khi sửa, không ghi đè.

## Quy tắc cứng
- Sao lưu TRƯỚC mỗi lần ghi DB thật: `.\scripts\db_backup.ps1 -Tag <lý-do>` (chỉ dump khi dữ liệu đổi, kiểm tra đọc được). Không `DROP`/`TRUNCATE` bảng thật, không xóa dòng ngoài những gì brief của từng lệnh quy định.
- Mỗi lệnh nạp: chạy `--dry-run` trước, lưu tóm tắt, rồi mới chạy thật; sau đó ghi VÀO `data/processed/ledger_x5.md` các số trước/sau (programs, program_modules, modules, outline_documents…) và tên bản sao lưu.
- DỪNG và báo cáo (không cố sửa tiếp) nếu: dry-run định xóa/đổi tên dữ liệu đã có ngoài phạm vi brief của lệnh đó; số chương trình/môn giảm bất thường; một bước lỗi hai lần liên tiếp; hoặc cần mật khẩu/token/đăng nhập.
- Token/cookie/mật khẩu không ghi vào file/log. Không gọi API trường. Không dùng web.
- Làm xong từng bước mới sang bước sau, ghi tiến độ cuối `docs/HANDOFF.md` bằng MỘT dòng ngắn đúng mục (không dán lịch sử dài).

## Bước A — Migration 0024–0026 đang LỖI trên DB thật (ưu tiên số 1)
DB hiện ở revision 0023, head là 0026. `alembic upgrade head` lỗi ở `api/migrations/versions/0024_program_suffix_canonical_codes.py` (~dòng 249 `SELECT id, name FROM programs WHERE degree = 'thac_si'` báo `InFailedSqlTransaction`: một câu lệnh TRƯỚC đó đã lỗi trong cùng giao dịch và bị nuốt bởi try/except). Việc cần làm:
1. Tìm lệnh lỗi thật (dùng savepoint/`begin_nested` hoặc in lỗi gốc); sửa migration để ĐÚNG và có thể chạy trên Postgres thật (đổi mã -V2/-V3 → 405E/411E/414H/422 theo `docs`/brief W31; bảng chuyển tiếp mã; khóa ngoại cập nhật đủ), không nuốt lỗi im lặng.
2. KIỂM TRA TRÊN BẢN SAO trước: tạo DB tạm từ bản sao lưu mới nhất (`data/backups/db_*.dump` mới nhất; `createdb` + `pg_restore` trong container `db`, đặt `DATABASE_URL` tạm), chạy `alembic upgrade head` ở đó; so sánh số chương trình/môn trước-sau; rồi MỚI chạy trên DB thật (sau `db_backup.ps1 -Tag truoc-alembic-0024`). Kiểm tra `alembic current` = 0026 và `alembic check` sạch; downgrade 0026→0023 thử trên bản sao.
3. Sau migration: danh sách `programs.id` không còn hậu tố `-V2`/`-V3`; mã cũ còn dùng được qua bảng chuyển tiếp; chạy pytest các test W31.

## Bước B — Làm xanh toàn bộ kiểm tra
Chạy: `python -m pytest -q -rfE -p no:cacheprovider --ignore=tests/rag tests` (api), `npx tsc --noEmit` và `npx vitest run` (web, trong container). Sửa tận gốc mọi ca đỏ (không làm yếu test; ghi lý do khi đổi assertion). Hiện còn ít nhất 1 ca API đỏ và có thể còn vài ca web (kiểm tra `noMockFallback`, các test bị đổi khi W34/X3).

## Bước C — Nạp dữ liệu thật, theo THỨ TỰ này (mỗi lệnh có `--dry-run`)
1. `import-ctdt-files` (D3): cần `xlrd` cho 3 file .xls — cài trong container và THÊM vào `api/requirements.txt`; kiểm tra bảng đích trong `data/processed/ctdt_import_preview.csv` (đủ 403, 415, 416, 417, 419, 420, 421, 422, 430, 501–506 cho K25/K26, 0 đích bị lặp, hệ E/H/T đúng, K25/K26402 chuẩn dùng `data/raw/ctdt_bdcl/manual_screenshots/` + sheet MyUEL cho Kinh tế đối ngoại), rồi nạp thật. KHÔNG tạo K23 hệ tiếng Việt (đã có từ X2).
2. `import-master-data` (D4): thứ tự nguồn khoa: `api/seed/faculty_overrides.tsv` > Master_data (ô #N/A/trống giữ nguyên DB) > đề cương > bản Anh↔Việt > tiền tố > giữ nguyên; ghi `data/processed/module_faculty_conflicts.csv`. Dry-run báo `modules_with_final_assessment: 0` và `modules_with_outline_url: 0` — ĐIỀU TRA trước khi nạp thật (hình thức thi/tỉ lệ điểm/thời lượng và giáo trình từ Sheet1 phải được nạp; sửa code nếu thiếu).
3. `import-ths` (D6/D8): trước tiên chuẩn hóa tên chương trình thạc sĩ ("Thương mại điện tử – Thạc sĩ", "Kinh tế chính trị – Thạc sĩ nghiên cứu"… theo `scripts/agent_briefs/W31_program_suffix.md` mục W31b/W31c và `D8_ma_lop_sau_dai_hoc.md`; nhận diện bậc từ mã lớp C…=thạc sĩ, N…=tiến sĩ, giữ nguyên nhóm ~218 mã M/P đang có trong DB), nạp 18 chương trình thạc sĩ (`degree='thac_si'`).
4. `import-outlines-docx` (D5) cho: `data/outlines_master/docs|pdf` (Master_data → ctdt_year 2025), `data/outlines_master/ctdt2023/docs|pdf` (CTĐT 2023, file `status=ok` trong `manifest_ctdt2023.csv`: 279 ok, 396 chặn quyền, 11 đã xóa — KHÔNG nạp phần chặn), và `replace-bff4009-outline` (file `data/outlines_master/manual/BFF4009_K25.docx`). Sau đó `export-chan-quyen-outlines` ra danh sách mã cần chủ dự án tải tay (cập nhật `data/processed/outlines_2023_can_tai_tay.csv`).
5. `fill-description-en` (D7) cho môn mã E còn thiếu `description_en` (227 môn lúc 23/11); ghi `data/processed/E_modules_still_missing_description_en.csv`.
6. Chạy lại `diff-english-tracks` và lưu `data/processed/english_track_diff.csv` mới.

## Bước D — Giao diện tiếng Anh (W34)
`api\.venv\Scripts\python.exe -X utf8 scripts\check_en_ui.py` hiện báo A=9, B=0, C=677. Làm theo `scripts/agent_briefs/W34_english_ui_clean.md` tới khi A=0, B=0, C=0 (trừ dòng `// i18n-ok`), tsc/vitest xanh. Đây là việc lớn: làm theo từng cụm file, chạy kiểm tra giữa chừng.

## Bước E — Báo cáo thống nhất database
Ghi `data/processed/DB_CONSOLIDATED_REPORT.md` (tiếng Việt): (1) phiên bản migration; (2) chương trình theo khóa × bậc × hệ (chuẩn/E/H/T/TE) × nguồn, kèm số môn; (3) môn: tổng, theo bậc, khoa trống, môn mã E có/không có mô tả EN, môn tương đương; (4) đề cương: số tài liệu theo `ctdt_year` và định dạng, môn có hai năm, môn chưa có đề cương; (5) lớp học/học kỳ; (6) kiểm toàn vẹn: mồ côi (program_modules → modules, class_sections → modules…), mã trùng, chương trình không có môn, môn không thuộc CTĐT nào, ID chương trình còn hậu tố cũ, khóa ngoại; (7) danh sách VIỆC CÒN TỒN (cần chủ dự án quyết hoặc tải tay): đề cương bị chặn, môn không rõ khoa, ngành 608 có lớp thạc sĩ nhưng chưa có chương trình, mã `B…50x`, ngành không có bằng chứng K23, v.v.
Báo cáo cuối của bạn: tóm tắt mỗi bước (đã làm / bỏ dở và vì sao), tên các bản sao lưu, số trước-sau.

## Cập nhật 23/11 (Claude)
- Bước A đã xong (DB ở 0026), bỏ qua.
- Một phiên Codex khác đang sửa web: bỏ áp dụng nhanh CTĐT ở Kế hoạch, ẩn tab Chương trình, nút 'Chương trình đào tạo của bạn [Chọn]' lên Header. Bước D (W34) chỉ làm sau khi phiên đó xong (kiểm docs/HANDOFF.md mục Khóa phiên); không sửa Header, planner, trang programs, ProgramFilterBar, ProgramProfileDialog, và đọc lại file trước khi sửa.

- Chủ dự án chốt 23/11: K25422 và K26422 (Kế toán và Phân tích dữ liệu) lấy theo Excel ngành = 60 môn (không phải 69 trong brief cũ). D3 import-ctdt-files phải cho kết quả 60 môn cho cả hai; nếu file Excel ngành cho số khác 60 thì dừng và báo.
