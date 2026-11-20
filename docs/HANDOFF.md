# HANDOFF — trạng thái bàn giao giữa các AI

> **Đọc file này đầu tiên.** Cập nhật nó **trước khi hết token** hoặc khi kết thúc phiên. Quy tắc chung: `AGENTS.md`.
> Cập nhật lần cuối: 2026-11-21 (Claude). Cột *Đã kiểm chứng* nói rõ điều gì đã được chạy thật.

## 0. Khóa phiên (ai đang sửa gì — xóa dòng của bạn khi xong)
| AI | Bắt đầu | Đang sửa vùng nào |
|---|---|---|
| Codex | 2026-11-21 | `web/`: thiết kế lại chọn học kỳ, phương án, chọn lớp; chuẩn hóa thứ/tiết/giờ/phòng |
| Claude | 2026-11-21 | `api/app/models.py`, `api/migrations/`, `api/app/services/*`, `docs/`, `data/README.md` |

> 2026-11-21: đổi tên thương hiệu UELPlan → **UELCourses** (code, docs, localStorage key). GIỮ NGUYÊN `uelplan` cho tên DB/user Postgres, `name: uelplan` trong compose (volume) và file `uelplan.db` để không mất dữ liệu đang chạy. Docker: db + workspace chạy; api ở host :8001, web ở :3001 (workspace). `dev.ps1` đã sửa lỗi stderr của PowerShell 5.1.

> 2026-11-21 (DB): Postgres ở migration **0010** (thêm `modules.name_en`, chỉ mục lớp theo kỳ, unique từng phần cho NULL, CHECK buổi học). SQLite dev tự bổ sung cột/chỉ mục thiếu khi khởi động (`app/db.py::_sync_sqlite_schema`) — lỗi 500 `is_talent_program` là do file SQLite cũ, đã vá; bản sao lưu: `data/db/uelplan.backup-20261121-before-schema-sync.db`. Tên tiếng Anh: `python -m app.cli fill-english-names` (nguồn đề cương > catalog > `api/seed/module_names_en.tsv`). **Chưa làm:** web hiển thị `name_en` khi bật EN + dịch khoa/bộ môn; CTĐT K25/K26 chưa lấy được từ cổng (mã K25401–K25411 trả rỗng).

> 2026-11-21 (Claude): (1) `modules.name_en` (migration 0009) + `python -m app.cli fill-english-names` (nguồn: đề cương > catalog > `api/seed/module_names_en.tsv`); web đã dùng `name_en` + dịch khoa/bộ môn (`web/src/i18n/names.ts`) ở trang Tra cứu, chi tiết học phần, ô tìm kiếm; CÒN thiếu: Planner, Programmes/[id], Timetable, Today, GPA (vẫn tên Việt), và chuỗi "Chọn khóa và ngành…" chưa dịch. K26 dựng giống K25 (`build-catalog-programs --cohort K26`, theo chủ dự án: CTĐT 2026 tương tự 2025). Cảnh báo: dev server web chạy trong `workspace` (cổng container 3000 = host 3001); đừng chạy thêm `next dev` hay `next build` cùng thư mục `web/.next`. (2) Cổng portal trả rỗng cho K25401–K25410 (K25411+ và K26 chưa kiểm). Dựng tạm K25 từ danh mục 2025: `python -m app.cli build-catalog-programs --cohort K25` → 25 CTĐT `programs.source='catalog2025'`, mã K25+mã ngành (402/Kinh tế quốc tế là suy đoán từ K24402), HKnn = thứ tự kỳ (chưa có năm học); khi có dữ liệu cổng thật cùng mã thì `import-ctdt` ghi đè. K26 chưa có.

## 1. Ảnh chụp hiện trạng
| Vùng | Hiện trạng | Đã kiểm chứng |
|---|---|---|
| **Database** | **PostgreSQL 17 trong Docker** (`.\scripts\dev.ps1 up`), schema do **Alembic** (`api/migrations/versions/0001_initial_schema.py`, 18 bảng + `alembic_version`), extension `pg_trgm`+`unaccent`, JSONB, chỉ mục trigram. Đã nạp dữ liệu thật (37 MB). Thiết kế đầy đủ + ERD + số dòng: **`docs/DATABASE.md`** | `alembic upgrade head`, `alembic check` (sạch), `downgrade base`→`upgrade head`, đếm bảng, tìm không dấu — 2026-11-21 |
| `api/` | models mới: `import_runs`, `program_catalog_entries`, `outline_*`, `regulation_documents/chunks`; importer đề cương/quy chế (`app/services/outline_import.py`), nhật ký nguồn (`lineage.py`); CLI: `import-outlines`, `extract-outline-texts`, `import-regulations`. `init_db()`: SQLite tự tạo bảng, PostgreSQL yêu cầu `alembic upgrade head` | **84 test qua** (trong container và local; test dùng SQLite tạm, **không** kiểm chứng Postgres) |
| `api/app/rag/` | Đủ thành phần. Cài `pypdf`+`python-docx` (đã thêm vào `requirements.txt`) làm hết 4/8 test lỗi | còn **4 test lỗi**: `test_rag_compare::test_sentence_diff_units`, `test_rag_index::test_search_accentless_and_filter`, `test_rag_vault_graph::test_graph_edges_and_cohort_filter`, `::test_graph_article_nodes` — chưa phân tích |
| `web/` | Agent bị ngắt giữa chừng; `src/` 88 file | **62 test Vitest qua** (12 file, trong container). **`npm run build` CHƯA chạy** |
| `regulations/` | `catalog.json` 28 văn bản (đã nạp vào `regulation_documents`), 17 PDF; khóa K22=2022 | 4 văn bản `verified`; ~8 PDF scan cần OCR; thiếu QĐ 2261/2025, 118/2024, 1390/2025 (chủ dự án tự tải vào `regulations/manual/`) |
| `research/` | Xong (khảo sát, persona, kế hoạch test, script phân tích) | 8/8 test |
| Docker | `docker-compose.yml` + `docker-compose.dev.yml`; container **`workspace`** (Python 3.14, Node 24, Tesseract `vie`, psql) dùng chung cho mọi AI; `db` = pgvector/pgvector:pg17 | `dev.ps1 up/setup/test/migrate` chạy được. Image **production** (`docker/api.Dockerfile`, `web.Dockerfile`) **CHƯA build** |
| Antigravity CLI | `agy` 1.5.13 tại `%LOCALAPPDATA%\agy\bin\agy.exe`, đã đăng nhập | headless viết script lần đầu không tạo file (chưa rõ nguyên nhân) |

## 2. Dữ liệu — xem `data/README.md` (bố cục thống nhất, KHÔNG commit)
- Đã gộp hai thư mục dữ liệu: `api/data/` → `data/db/`; file quét DKHP → `data/raw/dkhp/`; TKB cá nhân → `data/raw/personal/`; `config.data_dir` mặc định = `<repo>/data/db`.
- Nạp toàn bộ dữ liệu: `.\scripts\dev.ps1 run sh /workspace/scripts/load_all.sh` (UIS → TA → DKHP → CTĐT → tương đương → quy chế → đề cương). Idempotent.
- `data/outlines_2025/` (733 MB) là đề cương CTĐT 2025 do chủ dự án cung cấp: 18 Excel + 863 PDF (783 khác nhau theo sha256). 127 URL cần quyền truy cập (`additional_access_required.md`) nên chưa có PDF.

## 3. Đã kết luận về quét DKHP (đừng làm lại)
- API `POST dkhpapi.uel.edu.vn/api/Schedule/GetAllScheduleStudyUnit`: tối đa 100 dòng/truy vấn, khớp chuỗi con theo mã môn (`"0"`) hoặc tên (`"1"`, phân biệt dấu). Chi tiết: `UEL_DKHP_API.md`.
- Đã có 6.089 lớp. Lần quét kiểm tra 107 truy vấn không ra lớp mới ⇒ coi như đủ. Nếu phải quét lại: `scripts/dkhp_slow_crawl.js` (chậm, 1 luồng) và quy tắc ở `AGENTS.md` mục 4.

## 4. Việc tiếp theo (theo thứ tự ưu tiên)
1. **Đề cương → dữ liệu có cấu trúc (ĐANG LÀM):** văn bản đã trích bằng `pdftotext -layout` (771 ok, 12 `needs_ocr`; pypdf bị bỏ vì mỗi từ một dòng). Bộ phân tích `api/app/services/outline_parse.py` (migration `0002`) đang chạy: `python -m app.cli parse-outlines --workers 6` (mỗi PDF trích bảng bằng PyMuPDF trong tiến trình riêng, timeout 90 s qua `OUTLINE_TABLE_TIMEOUT`). Kiểm tra kết quả: `select parse_status, count(*) from outline_courses group by 1` và `python scripts/show_outline.py <id>`. Cấu trúc không đồng nhất (bản Việt, bản Anh, ~151 file là báo cáo thống kê CLO → `skipped`). **Việc kế tiếp:** (a) đo tỉ lệ ok/partial/failed, sửa lỗi hay gặp; (b) file `partial/failed` → dự phòng bằng Gemini (`agy --print --model gemini-3.8-flash-high`; **đừng truyền văn bản lớn qua stdin/pipe** — lỗi/treo; để agent đọc file); (c) OCR 12 file scan (Tesseract `vie`, `pdftoppm` có sẵn trong container). Sau đó chạy lại `classify-languages`.
1b. **Môn tiếng Anh / tiếng Việt (XONG):** `classify-languages` (tự chạy sau mỗi import/seed/parse) ghi `language_track` cho `modules`, `program_catalog_entries`, `outline_courses`; `export-language-split` xuất CSV vào `data/processed/` (`modules_english.csv` 360, `modules_vietnamese.csv` 1.316, `modules_language_review.csv` 34, `modules_talent_program.csv` 46, `language_pairs.csv` 289; 29 môn CNTN tiếng Anh do chủ dự án xác nhận ngày 2026-11-21, cột `modules.is_talent_program`, migration `0005`). Lớp học phần: 1.227 lớp EN, 5.087 lớp VI. Quy tắc và ngoại lệ: `api/app/services/language.py`.
1d. **Bỏ mã học phần hệ cũ (XONG 2026-11-21):** `purge-legacy-codes` đã xóa 462 môn mã 4 ký tự có chữ số (435 lớp, 4.168 dòng CTĐT, 42.665 cạnh quan hệ); sao lưu `data/db/backups/uelplan_before_legacy_purge_20261121.sql`; importer bỏ qua các mã này (`SKIP_LEGACY_CODES=false` để tắt; test conftest tắt mặc định, `tests/test_legacy_codes.py` bật lại). Backend: 117 test qua. Cũng đã xóa 60 chương trình K19–K22 (chủ dự án đồng ý 2026-11-21; `purge-old-programs`, sao lưu `uelplan_before_old_programs_purge_20261121.sql`; importer bỏ qua khóa < K23 qua `MIN_PROGRAM_COHORT`). DB còn 26 chương trình (K23: 8, K24: 18); portal chưa có K25/K26. **Còn hỏi chủ dự án:** có xóa nốt `GDQP/TATC/TEST` không?
1e. **Chạy phân tích đề cương:** dùng container `jobs` (không dùng `workspace`, vì phiên khác có thể khởi động lại nó): `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T -w /workspace/api -e OUTLINE_TABLE_TIMEOUT=60 jobs python -m app.cli parse-outlines --workers 12` (tự bỏ qua tài liệu đã xong phiên bản `rules-4`; PDF nặng quá 60 s bị bỏ phần bảng → `tables_failed`).
1c. **Quy định UEL bổ sung:** agent `regulations-collector` được giao tìm thêm (tiếng Anh, đề cương, quy chế khóa mới…) — khi xong, xem `regulations/README.md`, rồi `python -m app.cli import-regulations`.
2. **Chuyển RAG vào DB:** nạp `regulation_chunks` từ segmenter (`api/app/rag/`); cân nhắc `embedding vector` (pgvector) bằng migration `0002`.
3. Sửa 4 test RAG còn lỗi; chạy OCR 8 PDF quy chế scan.
4. `web/`: `npm run build`, kết nối API thật, theo `ARCHITECTURE.md`; thêm trang đề cương/cây môn học dùng dữ liệu mới.
5. Build image production (`docker compose build api web`) và thử `docker compose up` (không dùng file dev).
6. Gán khóa cho lớp SV không bắt đầu bằng `K` (cần chủ dự án quyết).

## 5. Vấn đề đã biết
- Codex cập nhật tiếp 2026-11-21: đã kiểm chứng **Chrome desktop và viewport mobile 390×844** cho `/modules/BIM5022`; cây quan hệ chuyển ngang/dọc hoạt động, sidebar/tab mobile hiển thị đúng. Đưa cây ra card toàn chiều rộng, bỏ tiêu đề trùng, căn hai nhãn và đường nối; thêm nút Xem dọc, vùng cuộn có focus bàn phím. **68 test qua, tsc qua; lint toàn frontend qua trước sửa cuối, lint các tệp TSX cuối qua.** Đã reset viewport và để tab Chrome làm bản xem thử. Tiếp tục: `http://localhost:3001/modules/BIM5022`; `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T -w /workspace/web workspace npm test`. Chưa commit; không build khi dev đang chạy.
- Codex 2026-11-21 (chủ dự án xác nhận dừng Claude web và tiếp quản): đổi `PrerequisiteTree.tsx` thành cây ngang hai chiều, thêm `RelationshipBranch.tsx` (AND/OR, thu gọn, chặn chu trình), CSS `.relation-*`, 2 test tương tác. Docker workspace: **67 Vitest test qua**, **tsc --noEmit qua**, **eslint 3 file đổi qua**. Lint toàn web lần đầu quét nhầm `.next-preview`; đã thêm ignore `.next-*/**`, chưa lấy được kết quả đầy đủ lần chạy lại. Không chạy build khi dev hoạt động. Preview đã khởi động lại riêng frontend (không restart workspace/API): `UEL_PREVIEW_DIST_DIR=.next-ui WATCHPACK_POLLING=true NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev -- -H 0.0.0.0` trong `/workspace/web`, cổng host 3001. Trang `/modules/BIM5022` compile và HTTP 200; **chưa kiểm chứng hình ảnh desktop/mobile** vì IAB/CDP timeout. Tiếp theo: mở `http://localhost:3001/modules/BIM5022`, kiểm tra cây ngang và cuộn mobile; chạy `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T -w /workspace/web workspace npm run lint`. Tài liệu tham khảo tải vào `data/references/nusmodifications/`; không đưa mã nguồn NUSMods vào ứng dụng. Chưa commit.
- Codex 2026-11-21: đã tải README/ARCHITECTURE/LICENSE của `nusmodifications/nusmods` vào `data/references/nusmodifications/`, kèm `ADAPTATION.md`. Chưa sửa web vì đang khóa cho Claude web-frontend; đã hỏi chủ dự án về việc tiếp quản. Sau khi xác nhận phiên kia dừng: đọc lại khóa, kiểm tra giao diện cổng 3001, tiếp tục theo ADAPTATION.md và UI_STYLE_GUIDE.md.
- `class_sections`: Postgres 6.314 dòng, SQLite dev 6.475 — chênh vì SQLite còn lớp từ lần nạp trước (nguồn khác). Postgres là bản chuẩn từ nay.
- 17 lớp không suy được học kỳ (`semester_id` NULL); lớp chỉ có ghi chú "Giảng bằng Tiếng anh" hoặc chưa có lịch thì không có `lessons` (bình thường).
- Lớp SV kiểu `C24605`, `MPL1`: `cohorts` rỗng.
- Commit git do công cụ khác tạo (lọc khóa K19–K22 khỏi UI) khác với việc giữ quy chế cũ trong `regulations/catalog.json` — đúng ý định, chỉ cần để ý.
- `agy` chưa nằm trong PATH ở terminal cũ.

## 6. Cần chủ dự án quyết
1. Lớp SV `C24605` / `MPL1` thuộc chương trình nào, có gán khóa K24 không?
2. Nơi triển khai (gợi ý trong `docs/DATABASE.md` mục 7: Vercel + Render + Neon cho demo; Oracle Always Free cho chạy ổn định).
3. Khi nào phát khảo sát nhu cầu thật (vòng Design Thinking đầu).
4. 127 liên kết đề cương cần quyền truy cập: có xin được quyền/tải tay không.

## 7. Môi trường
Windows 11, PowerShell 5.1, Python 3.14, Node 24, Docker Desktop 29.x. **Chạy lệnh trong container:** `.\scripts\dev.ps1 run|api|web <lệnh>`. Venv local: `api\.venv` (chuẩn), `research\.venv`. Token của trường **không** nằm trong file nào. File `.env` (mật khẩu Postgres ngẫu nhiên) tạo bởi `dev.ps1 init`, đã `.gitignore`.
