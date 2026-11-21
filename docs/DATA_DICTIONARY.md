# UELCourses — Từ điển dữ liệu (Data Dictionary)

*Tra cứu học phần, thời khóa biểu, kế hoạch học tập, CTĐT, học phần tương đương và quy chế học vụ của Trường ĐH Kinh tế – Luật (UEL)*

Phiên bản tài liệu 1.0 · sinh tự động ngày 2026-11-21 từ database PostgreSQL đang chạy (Alembic `0015`). Tham chiếu độc lập cho database `uelplan` (tên giữ nguyên để không mất dữ liệu; thương hiệu là UELCourses). Số liệu và ví dụ lấy từ dữ liệu thật; thiết kế và vận hành xem `docs/DATABASE.md`.

| Bảng vật lý | Trường vật lý | Ràng buộc khóa ngoại | View SQL |
|---:|---:|---:|---:|
| **27** | **300** | **21** | **2** |

## Nguồn dữ liệu

| # | Nguồn | Dùng cho |
|---:|---|---|
| 1 | Excel UIS — lịch lớp học phần 2025–2026 HK01 | class_sections, lessons, venues, modules (nguồn chính thức, 225 lớp) |
| 2 | Quét trang Tra cứu học phần (DKHP) | class_sections, lessons, modules (6.089 lớp, các kỳ 251–271) |
| 3 | Cổng portal — chương trình đào tạo (studyProgram) | programs, program_modules, module_relations (K23, K24) |
| 4 | Cổng portal — học phần tương đương (equivalentcourse) | equivalents (chỉ các CTĐT của tài khoản lấy dữ liệu) |
| 5 | Kế hoạch môn học tiếng Anh 2026–2027 (Excel) | module_offering_plans |
| 6 | Đề cương CTĐT 2025 (18 workbook Excel) | program_catalog_entries, outline_resources; dựng CTĐT K25/K26 |
| 7 | Đề cương học phần dạng PDF (783 file) | outline_documents và các bảng outline_* |
| 8 | Danh mục văn bản quy chế (regulations/catalog.json) | regulation_documents (regulation_chunks chưa nạp) |
| 9 | Bảng đối chiếu tên Việt–Anh do chủ dự án cung cấp | modules.name_en (api/seed/module_names_en.tsv) |
| 10 | Ứng dụng web (đăng nhập, đánh giá, góp ý) | users, reviews, feedback |

## Lưu ý và cờ chất lượng dữ liệu

- **Khác kỳ, khác đơn vị đo:** lớp học theo học kỳ (2025–2026 đến 2027–2028), CTĐT theo khóa (K23–K26), danh mục đề cương theo bản 2025. Không trộn các mốc này khi so sánh.
- **CTĐT K25/K26 là bản dựng giả định** từ danh mục Đề cương CTĐT 2025 (`programs.source = 'catalog2025'`, 50 chương trình, 3.298 dòng môn). Cổng portal chưa trả CTĐT K25/K26; K26 được coi giống K25 theo chủ dự án. Khi có dữ liệu cổng cùng mã thì `import-ctdt` ghi đè.
- **Tên tiếng Anh chưa đủ:** 828/1.486 học phần có `name_en`; phần còn lại giao diện hiển thị tên tiếng Việt. Cột `program_catalog_entries.module_name_en` có 173 giá trị rác (vd `v`) — không dùng cột này để hiển thị.
- **Học phần tương đương không phủ toàn trường:** bảng `equivalents` có 665 dòng, chỉ 398 dòng có mã tương đương nằm trong `modules`. Endpoint nguồn chỉ trả dữ liệu của các CTĐT của tài khoản đã lấy; phần lớn cặp là mã cũ ↔ mã mới.
- **Quan hệ tương đương trong `module_relations` còn rác:** 1.236 cạnh `equivalent` (K23, K24) nhưng chỉ 26 cạnh có `source` nằm trong `modules`. Nguyên nhân: chuỗi `equivalent_raw` dạng `EN03-Tiếng Anh 3 [5 TC]; EN13-…` bị tách thành mảnh ("3", "C", "ANH"…) ở bước nhập CTĐT. Không dùng các cạnh `equivalent` này cho tới khi sửa; dùng bảng `equivalents`. Các cạnh `prereq/previous/coreq` không có mã rác (đếm mã sai định dạng: 0).
- **Lớp học:** 17 lớp chưa suy ra học kỳ (`semester_id` NULL); 875 lớp chưa suy ra khóa (`cohorts` rỗng); 324 học phần chưa từng có lớp.
- **Quy chế:** `regulation_chunks` có 0 dòng (RAG chưa nạp vào DB).
- **View lệch cột:** `v_modules_english` / `v_modules_vietnamese` được tạo bằng `SELECT *` ở migration 0003 nên không có các cột thêm sau đó (`is_talent_program`, `name_en`, `name_en_source`); cần tạo lại view bằng migration mới nếu muốn dùng.

## Tra cứu từng bảng

Mỗi mục nêu một dòng là gì, khóa chính và số dòng hiện tại. Thẻ **PK** / **FK** / **UQ** là khóa chính, khóa ngoại, ràng buộc duy nhất. Ví dụ lấy từ dữ liệu thật (bảng chứa dữ liệu người dùng không có ví dụ).

### A. Lịch học và học phần

#### 01. `semesters`

**Một dòng:** Một học kỳ. **Khóa:** id (dạng 2026-2027-1). **Số dòng hiện tại:** 7.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | VARCHAR(32) · NOT NULL · **PK** | 2025-2026-1 | Mã học kỳ dạng `năm học-kỳ`, ví dụ 2026-2027-1 (suy từ mã lớp: `261` → 2026-2027-1). |
| `name` | VARCHAR(128) · NOT NULL | Học kỳ 1, năm học 2025–2026 | Tên hiển thị, ví dụ "Học kỳ 1, năm học 2025–2026". |
| `year` | VARCHAR(16) · NOT NULL | 2025-2026 | Năm học dạng 2025-2026. |
| `term` | INTEGER · NOT NULL | 1 | Số kỳ trong năm: 1, 2 hoặc 3 (cả ba đều là học kỳ chính thức). |
| `start_date` | DATE · NULL | 2025-08-25 | Ngày bắt đầu học kỳ, nếu biết. |
| `end_date` | DATE · NULL | 2026-01-16 | Ngày kết thúc học kỳ, nếu biết. |
| `is_current_override` | BOOLEAN · NULL | — | Ép đánh dấu học kỳ hiện tại; NULL = tự suy theo ngày. |
| `is_sample` | BOOLEAN · NOT NULL | False | Cờ dữ liệu mẫu; `clear-sample` xóa các dòng này khi đã có dữ liệu thật. |

> Học kỳ 3 là học kỳ chính thức (không phải học kỳ hè), cùng với học kỳ 1 và 2. Có thể có học kỳ chưa bắt đầu (kế hoạch).

#### 02. `modules`

**Một dòng:** Một học phần (theo mã). **Khóa:** code. **Số dòng hiện tại:** 1.486.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `code` | VARCHAR(64) · NOT NULL · **PK** | BFF4080 | Mã học phần (khóa chính). Bản tiếng Anh mã `E…`, bản tiếng Việt `B…`; không gộp chỉ dựa vào tên. |
| `name` | VARCHAR(512) · NOT NULL | Gói phần mềm ứng dụng cho tài chính… | Tên học phần (tiếng Việt, đôi khi còn hậu tố lớp vét/học ghép từ nguồn). |
| `credits` | INTEGER · NULL | 3 | Số tín chỉ. |
| `type` | VARCHAR(128) · NULL | Lý thuyết | Loại học phần theo nguồn (vd Lý thuyết). |
| `faculty` | VARCHAR(256) · NULL | Khoa Tài chính - Ngân hàng | Khoa quản lý theo nguồn; một số khoa viết hai kiểu (có/không "Khoa "). |
| `department` | VARCHAR(256) · NULL | Bộ môn Kế toán | Bộ môn theo nguồn. |
| `is_english` | BOOLEAN · NOT NULL | False | Tên có hậu tố `(E)`/ghi chú dạy bằng tiếng Anh (cờ cũ; ưu tiên dùng `language_track`). |
| `description` | TEXT · NULL | Môn học giới thiệu ngôn ngữ lập trì… | Mô tả học phần bằng TIẾNG VIỆT (giao diện VI hiển thị cột này). Điền bởi `fill-descriptions` từ đề cương; NULL nếu chưa có. |
| `prerequisites` | JSONB · NULL | — | Danh sách mã tiên quyết (cột cũ, JSONB); quan hệ chính thức nằm ở module_relations/program_modules. |
| `search_text` | TEXT · NOT NULL | bff4080 goi phan mem ung dung cho t… | Bản không dấu, chữ thường để tìm kiếm tiếng Việt (chỉ mục trigram GIN trên PostgreSQL). |
| `is_sample` | BOOLEAN · NOT NULL | False | Cờ dữ liệu mẫu; `clear-sample` xóa các dòng này khi đã có dữ liệu thật. |
| `updated_at` | TIMESTAMP · NOT NULL | 2026-11-21 04:21:19.656437+00:00 | Thời điểm cập nhật gần nhất (múi giờ UTC). |
| `language_track` | VARCHAR(2) · NOT NULL | vi | Ngôn ngữ giảng dạy suy ra: `en` hoặc `vi`. |
| `language_basis` | VARCHAR(32) · NULL | default | Căn cứ phân loại ngôn ngữ (code_pattern, name_marker, cntn_confirmed, default…). |
| `counterpart_code` | VARCHAR(64) · NULL | EAA4026 | Mã bản tương ứng Anh↔Việt (EEE1038 ↔ BEE1038). |
| `is_talent_program` | BOOLEAN · NOT NULL | False | Môn thuộc chương trình Cử nhân tài năng (CNTN). |
| `name_en` | VARCHAR(512) · NULL | Advanced Financial Accounting 1 | Tên tiếng Anh; NULL nếu chưa có nguồn. |
| `name_en_source` | VARCHAR(16) · NULL | seed_table | Nguồn của name_en: outline \| catalog \| seed_table \| portal; NULL + name_en có giá trị = nhập tay. |
| `description_source` | VARCHAR(16) · NULL | outline | Nguồn của `description`: outline \| counterpart (chép từ bản Anh↔Việt tương ứng); NULL + có nội dung = nhập tay. |
| `description_en` | TEXT · NULL | The main content of the module aims… | Mô tả học phần bằng TIẾNG ANH (giao diện EN hiển thị cột này); NULL nếu chưa có — không tự dịch, giao diện sẽ dùng bản tiếng Việt và báo rõ. |
| `description_en_source` | VARCHAR(16) · NULL | counterpart | Nguồn của `description_en`: outline \| counterpart; NULL + có nội dung = nhập tay. |

> `name_en` là tên tiếng Anh để hiển thị khi giao diện ở chế độ EN; NULL = chưa có nguồn (giao diện dùng tên tiếng Việt, không tự dịch). Thứ tự ưu tiên nguồn: outline > catalog > seed_table > portal (cột `name_en_source`); giá trị nhập tay (`name_en` có, `name_en_source` NULL) không bị ghi đè. Mô tả song ngữ: `description` (VI) và `description_en` (EN) lấy từ đề cương, nhận diện ngôn ngữ từng đoạn; môn thiếu một bản có thể chép từ bản Anh↔Việt tương ứng (`*_source = counterpart`); lệnh `python -m app.cli fill-descriptions`.

#### 03. `module_offering_plans`

**Một dòng:** Một học phần và một năm học trong kế hoạch mở môn. **Khóa:** id (duy nhất: module_code + academic_year). **Số dòng hiện tại:** 183.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 1 | Khóa thay thế tự tăng. |
| `module_code` | VARCHAR(64) · NOT NULL · **FK** → modules.code · UQ | EIM5001 | Học phần được lên kế hoạch mở. |
| `academic_year` | VARCHAR(16) · NOT NULL · UQ | 2026-2027 | Năm học của kế hoạch (2026-2027). |
| `terms` | JSONB · NOT NULL | [1, 3] | Danh sách học kỳ dự kiến mở, ví dụ [1, 3]. |
| `terms_text` | VARCHAR(128) · NULL | Học kỳ 1,3 | Nguyên văn cột học kỳ trong file nguồn. |
| `open_pct` | DOUBLE · NULL | 100.0 | Phần trăm khả năng mở theo kế hoạch. |
| `lecture_hours` | DOUBLE · NULL | 45.0 | Số giờ giảng. |
| `note` | TEXT · NULL | — | Ghi chú nguồn. |
| `source` | VARCHAR(64) · NULL | ta-plan | Mã nguồn kế hoạch (vd ta-plan). |

Ràng buộc duy nhất: (module_code, academic_year).

> Nguồn là kế hoạch mở môn tiếng Anh; không phải lớp học thực tế.

#### 04. `class_sections`

**Một dòng:** Một lớp học phần trong một học kỳ. **Khóa:** id (duy nhất: class_code + semester_id). **Số dòng hiện tại:** 5.879.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 1 | Khóa thay thế tự tăng. |
| `class_code` | VARCHAR(128) · NOT NULL · UQ | 251EIE300401 | Mã lớp học phần, dạng `<kỳ 3 ký tự><mã môn><số lớp>` (251EIE300401). |
| `module_code` | VARCHAR(64) · NOT NULL · **FK** → modules.code | EIE3004 | Học phần của lớp. |
| `semester_id` | VARCHAR(32) · NULL · **FK** → semesters.id · UQ | 2025-2026-1 | Học kỳ của lớp; NULL nếu không suy ra được. |
| `lecturer` | VARCHAR(512) · NULL | Lâm Hồng Thanh | Giảng viên (nguyên văn, có thể nhiều người). |
| `quota` | INTEGER · NULL | 40 | Sĩ số tối đa. |
| `quota_min` | INTEGER · NULL | 20 | Sĩ số tối thiểu để mở lớp. |
| `registered` | INTEGER · NULL | 40 | Số đã đăng ký. |
| `available` | INTEGER · NULL | 0 | Số chỗ còn trống (có thể âm nếu vượt sĩ số). |
| `student_groups` | JSONB · NULL | ["K24404E", "K24413E"] | Danh sách lớp sinh viên được phép đăng ký (K24404E…). |
| `cohorts` | JSONB · NULL | ["K24"] | Khóa suy từ lớp sinh viên bắt đầu bằng K (K24). Rỗng/NULL = chưa suy được. |
| `rooms` | JSONB · NULL | [{"room": "B2.202", "capacity": 54,… | Danh sách phòng kèm sức chứa: [{room, capacity, capacity_gap}]. |
| `notes` | JSONB · NULL | ["Giảng bằng Tiếng anh"] | Ghi chú của nguồn (vd "Giảng bằng Tiếng Anh"). |
| `source` | VARCHAR(32) · NULL | uis | Nguồn của lớp: uis \| dkhp \| portal \| sample. |
| `start_date` | DATE · NULL | 2025-09-10 | Ngày bắt đầu lớp. |
| `end_date` | DATE · NULL | 2025-11-12 | Ngày kết thúc lớp. |
| `study_type` | VARCHAR(128) · NULL | Lý thuyết | Hình thức học (Lý thuyết, Thực hành…). |
| `schedule_raw` | TEXT · NULL | Thứ 4,tiết 1-5,tuần 4-12,B2.202 \|\| … | Chuỗi lịch học nguyên văn từ nguồn (để rà soát bộ phân tích). |
| `is_sample` | BOOLEAN · NOT NULL | False | Cờ dữ liệu mẫu; `clear-sample` xóa các dòng này khi đã có dữ liệu thật. |
| `updated_at` | TIMESTAMP · NOT NULL | 2026-11-20 16:08:34.697420+00:00 | Thời điểm cập nhật gần nhất (múi giờ UTC). |

Ràng buộc duy nhất: (class_code, semester_id).

> `semester_id` có thể NULL khi không suy ra được học kỳ từ mã lớp (khi đó khóa duy nhất không chặn trùng trên PostgreSQL). `cohorts` chỉ suy được từ lớp sinh viên bắt đầu bằng K.

#### 05. `lessons`

**Một dòng:** Một buổi học lặp lại hàng tuần của một lớp (một khối tiết). **Khóa:** id. **Số dòng hiện tại:** 7.487.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 22724 | Khóa thay thế tự tăng. |
| `class_id` | INTEGER · NOT NULL · **FK** → class_sections.id | 376 | Lớp học phần chứa buổi học. |
| `weekday` | INTEGER · NOT NULL | 7 | Thứ trong tuần: 2–7 = Thứ 2–7, 8 = Chủ nhật. |
| `start_period` | INTEGER · NOT NULL | 2 | Tiết bắt đầu. |
| `end_period` | DOUBLE · NOT NULL | 5.5 | Tiết kết thúc (số thực vì có tiết lẻ). |
| `start_time` | VARCHAR(5) · NOT NULL | 07:50 | Giờ bắt đầu HH:MM theo bảng tiết. |
| `end_time` | VARCHAR(5) · NOT NULL | 11:50 | Giờ kết thúc HH:MM. |
| `room` | VARCHAR(128) · NULL · **FK** → venues.room | B1.406 | Phòng học (có thể NULL). |
| `weeks` | VARCHAR(256) · NULL | 4-14 | Các tuần học, nguyên văn (vd `4-12`). |
| `raw` | TEXT · NULL | Thứ 7, Tiết 2->5.5, 21/03/2026->28/… | Đoạn lịch nguyên văn đã tách ra buổi học này. |
| `date_start` | DATE · NULL | 2026-03-21 | Ngày đầu tiên của buổi học (nếu suy ra được). |
| `date_end` | DATE · NULL | 2026-03-28 | Ngày cuối cùng của buổi học (nếu suy ra được). |

> `weekday` 2–8 (8 = Chủ nhật). `end_period` là số thực vì có tiết lẻ. `weeks` giữ nguyên văn các tuần học; `date_start/date_end` là khoảng ngày thật nếu suy ra được.

#### 06. `venues`

**Một dòng:** Một phòng học. **Khóa:** room. **Số dòng hiện tại:** 140.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `room` | VARCHAR(128) · NOT NULL · **PK** | B2.202 | Tên phòng (khóa chính), vd B2.202. |
| `capacity` | INTEGER · NULL | 54 | Sức chứa (chỗ), NULL nếu không rõ. |
| `is_sample` | BOOLEAN · NOT NULL | False | Cờ dữ liệu mẫu; `clear-sample` xóa các dòng này khi đã có dữ liệu thật. |

> Sức chứa lấy từ dữ liệu lịch học, có thể NULL.

### B. Chương trình đào tạo và quan hệ học phần

#### 07. `programs`

**Một dòng:** Một chương trình đào tạo (CTĐT) của một khóa. **Khóa:** id. **Số dòng hiện tại:** 76.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | VARCHAR(64) · NOT NULL · **PK** | K25401 | Mã CTĐT: `K` + 2 số cuối năm nhập học + mã ngành, vd K24404 (khóa 24, ngành 404). |
| `name` | VARCHAR(512) · NULL | Kinh tế Khóa 25 | Tên CTĐT kèm khóa. |
| `cohort` | VARCHAR(16) · NULL | K25 | Khóa dạng K24 (2 số cuối năm tuyển sinh). |
| `faculty` | VARCHAR(256) · NULL | Khoa Kinh tế | Khoa phụ trách. |
| `search_text` | TEXT · NOT NULL | k25401 kinh te khoa 25 khoa kinh te | Bản không dấu, chữ thường để tìm kiếm tiếng Việt (chỉ mục trigram GIN trên PostgreSQL). |
| `is_sample` | BOOLEAN · NOT NULL | False | Cờ dữ liệu mẫu; `clear-sample` xóa các dòng này khi đã có dữ liệu thật. |
| `source` | VARCHAR(32) · NULL | catalog2025 | Nguồn dữ liệu: ctdt (portal) \| catalog2025 (dựng từ danh mục 2025). |

> `source`: `ctdt` = lấy từ cổng portal (K23, K24); `catalog2025` = dựng từ danh mục Đề cương CTĐT 2025 (K25, K26 — xem Quy tắc diễn giải).

#### 08. `program_modules`

**Một dòng:** Một học phần trong một CTĐT. **Khóa:** id (duy nhất: program_id + module_code). **Số dòng hiện tại:** 5.126.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 9575 | Khóa thay thế tự tăng. |
| `program_id` | VARCHAR(64) · NOT NULL · **FK** → programs.id · UQ | K25414 | CTĐT chứa học phần. |
| `module_code` | VARCHAR(64) · NOT NULL · **FK** → modules.code · UQ | BEE1037 | Học phần. |
| `block` | VARCHAR(512) · NULL | Ngoại ngữ | Khối kiến thức (nguyên văn). |
| `parent_block` | VARCHAR(512) · NULL | Kiến thức giáo dục đại cương | Khối kiến thức cha. |
| `required` | BOOLEAN · NOT NULL | True | Bắt buộc. Với CTĐT từ catalog: `X` → true, ô trống → false (không đánh dấu bắt buộc: tự chọn/chưa rõ). |
| `suggested_term` | VARCHAR(128) · NULL | HK01 | Học kỳ gợi ý nguyên văn. CTĐT cổng: `HK02 năm học 2022-2023`; CTĐT catalog: chỉ thứ tự `HK03`. |
| `suggested_semester` | VARCHAR(32) · NULL | 2023-2024-1 | Học kỳ gợi ý đã chuẩn hóa dạng `2022-2023-2`; NULL nếu nguồn không ghi năm học (CTĐT catalog luôn NULL). |
| `suggested_order` | INTEGER · NULL | 1 | Thứ tự học kỳ trong khóa (1 = sớm nhất). |
| `prereq_raw` | VARCHAR(512) · NULL | BIE3004, BIM2050, BIM3049, BIM5013 | Học phần tiên quyết nguyên văn. |
| `previous_raw` | VARCHAR(512) · NULL | BIM3049 | Học phần học trước nguyên văn (CTĐT catalog: chỉ giữ mã). |
| `coreq_raw` | VARCHAR(512) · NULL | — | Học phần song hành nguyên văn. |
| `equivalent_raw` | VARCHAR(512) · NULL | EN03-Tiếng Anh 3 [5 TC]; EN13-Tiếng… | Học phần tương đương nguyên văn. |
| `prereq_tree` | JSONB · NULL | {"and": ["BIE3004", "BIM2050", "BIM… | Cây điều kiện tiên quyết (JSONB). |
| `previous_tree` | JSONB · NULL | BIM3049 | Cây điều kiện học trước (JSONB). |
| `coreq_tree` | JSONB · NULL | — | Cây điều kiện song hành (JSONB). |
| `note` | TEXT · NULL | — | Ghi chú của nguồn. |

Ràng buộc duy nhất: (program_id, module_code).

> Cột `*_raw` là nguyên văn nguồn; cột `*_tree` là cây điều kiện đã phân tích (`{"and": [...]}` / `{"or": [...]}` / mã môn). `suggested_order` là thứ tự học kỳ trong khóa (1 = sớm nhất).

#### 09. `module_relations`

**Một dòng:** Một cạnh quan hệ giữa hai học phần trong phạm vi một CTĐT. **Khóa:** id (duy nhất: source + target + type + program_id). **Số dòng hiện tại:** 2.571.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 47743 | Khóa thay thế tự tăng. |
| `source` | VARCHAR(64) · NOT NULL · UQ | BAA2028 | Mã học phần điều kiện (phải có trước). |
| `target` | VARCHAR(64) · NOT NULL · UQ | BAA2029 | Mã học phần bị ràng buộc. |
| `type` | VARCHAR(16) · NOT NULL · UQ | previous | Loại: prereq \| previous \| coreq \| equivalent. |
| `program_id` | VARCHAR(64) · NULL · **FK** → programs.id · UQ | K25406 | CTĐT mà quan hệ áp dụng. |

Ràng buộc duy nhất: (source, target, type, program_id).

> Cạnh `source → target`: phải có `source` mới học `target` (với type prereq/previous/coreq); với `equivalent`: `source` thay thế được `target`. `source`/`target` là liên kết mềm tới modules.code (không ép khóa ngoại).

#### 10. `equivalents`

**Một dòng:** Một cặp học phần tương đương (mã cũ ↔ mã mới). **Khóa:** id (duy nhất: code + equivalent_code). **Số dòng hiện tại:** 665.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 818 | Khóa thay thế tự tăng. |
| `code` | VARCHAR(64) · NOT NULL · UQ | DT02 | Mã học phần gốc (thường là mã cũ). |
| `name` | VARCHAR(512) · NULL | Đầu tư quốc tế | Tên học phần gốc (tiếng Việt, bản chụp lúc nhập). |
| `credits` | INTEGER · NULL | 3 | Số tín chỉ học phần gốc. |
| `equivalent_code` | VARCHAR(64) · NOT NULL · UQ | BRB4007 | Mã học phần tương đương (thường là mã mới). |
| `equivalent_name` | VARCHAR(512) · NULL | Đầu tư tài chính | Tên học phần tương đương (tiếng Việt). |
| `equivalent_credits` | INTEGER · NULL | 3 | Số tín chỉ học phần tương đương. |
| `search_text` | TEXT · NOT NULL | dt02 dau tu quoc te brb4007 | Bản không dấu, chữ thường để tìm kiếm tiếng Việt (chỉ mục trigram GIN trên PostgreSQL). |
| `is_sample` | BOOLEAN · NOT NULL | False | Cờ dữ liệu mẫu; `clear-sample` xóa các dòng này khi đã có dữ liệu thật. |

Ràng buộc duy nhất: (code, equivalent_code).

> Nguồn gồm: (1) các dòng lấy từ cổng portal (endpoint chỉ trả học phần tương đương của các CTĐT của tài khoản đã lấy: K22404, K22406 Ngành 2) và (2) các dòng khôi phục từ file cũ bị hỏng (chỉ giữ dòng còn bắt đầu bằng mã, tên có thể trống). Không phủ toàn trường. Tên Việt là bản chụp lúc nhập; tên tiếng Anh lấy từ modules.name_en.

### C. Danh mục CTĐT 2025 và đề cương học phần

#### 11. `program_catalog_entries`

**Một dòng:** Một dòng môn trong một sheet của workbook Đề cương CTĐT 2025. **Khóa:** id (duy nhất: source_file + source_sheet + source_row). **Số dòng hiện tại:** 3.690.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | VARCHAR(64) · NOT NULL · **PK** | 0007dc86afd3e0c906689b24 | Mã băm của dòng (khóa chính). |
| `program_label` | VARCHAR(256) · NOT NULL | Công nghệ tài chính | Tên ngành/chương trình của workbook. |
| `track_label` | VARCHAR(256) · NULL | 1. DLG Kinh tế | Tên sheet (nhánh/bản rà soát). |
| `category` | VARCHAR(32) · NULL | curriculum_source | `curriculum_source` (dữ liệu gốc) \| `track_or_review` (nhánh/rà soát). |
| `module_code` | VARCHAR(64) · NULL | ADD00031 | Mã học phần (liên kết mềm tới modules.code). |
| `module_code_en` | VARCHAR(64) · NULL | BDG1013 | Mã bản tiếng Anh nếu có. |
| `module_name` | VARCHAR(512) · NULL | Tư duy phản biện | Tên học phần (Việt). |
| `module_name_en` | VARCHAR(512) · NULL | Marketing Research | Tên tiếng Anh ghi trong workbook — CÓ giá trị rác (vd `v`); dùng modules.name_en thay vì cột này. |
| `term` | VARCHAR(16) · NULL | HK03 | Thứ tự học kỳ HK01…HK10; NULL nếu sheet không có cột học kỳ. |
| `academic_year` | VARCHAR(16) · NULL | 2025-2026 | Năm học nếu workbook ghi. |
| `credits` | DOUBLE · NULL | 2.0 | Số tín chỉ. |
| `required_raw` | VARCHAR(32) · NULL | X | `X` hoặc trống — không suy diễn thêm. |
| `department` | VARCHAR(256) · NULL | Luật Kinh tế | Bộ môn. |
| `previous_raw` | VARCHAR(512) · NULL | [BAA2028]Nguyên lý kế toán | Học phần học trước nguyên văn, dạng `[MÃ]Tên, [MÃ]Tên` hoặc văn bản tự do. |
| `source_file` | VARCHAR(512) · NOT NULL · UQ | 1. Đề cương CTĐT Kinh tế 2025.xlsx | Tên file workbook nguồn. |
| `source_sheet` | VARCHAR(256) · NOT NULL · UQ | 1. DLG Kinh tế | Tên sheet nguồn. |
| `source_row` | INTEGER · NOT NULL · UQ | 72 | Số dòng trong sheet. |
| `original` | JSONB · NULL | [{"value": "71", "column": 1, "head… | Toàn bộ ô gốc [{column, header, value}]. |
| `import_run_id` | INTEGER · NULL · **FK** → import_runs.id | — | Lần nhập tạo ra dòng này. |
| `language_track` | VARCHAR(2) · NULL | en | Ngôn ngữ giảng dạy suy ra: en \| vi. |

Ràng buộc duy nhất: (source_file, source_sheet, source_row).

> Cùng một môn xuất hiện ở nhiều nhánh/bản rà soát nên KHÔNG dùng module_code làm khóa. `term` (HK01…) chỉ là thứ tự học kỳ, chỉ có ở các sheet "Dữ liệu gốc"/bản chương trình.

#### 12. `outline_resources`

**Một dòng:** Một liên kết đề cương (URL) của một dòng catalog. **Khóa:** id. **Số dòng hiện tại:** 4.736.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | VARCHAR(64) · NOT NULL · **PK** | afc407333092152d38eece98-11 | Mã băm (khóa chính). |
| `entry_id` | VARCHAR(64) · NOT NULL · **FK** → program_catalog_entries.id | afc407333092152d38eece98 | Dòng catalog sở hữu liên kết. |
| `kind` | VARCHAR(128) · NULL | Link đề cương hiện tại (chuẩn) | Loại liên kết (vd "Link đề cương hiện tại (chuẩn)"). |
| `label` | VARCHAR(512) · NULL | BDG1012_Giáo dục thể chất 1_3TC.docx | Nhãn/tên file hiển thị. |
| `url` | TEXT · NULL | https://docs.google.com/document/d/… | URL đề cương (thường Google Drive). |
| `source_column` | INTEGER · NULL | 11 | Cột trong Excel chứa liên kết. |
| `status` | VARCHAR(16) · NOT NULL | failed | downloaded \| failed \| no_url. |
| `failure_reason` | TEXT · NULL | response is not PDF (may require lo… | Lý do tải lỗi. |
| `document_id` | INTEGER · NULL · **FK** → outline_documents.id | 463 | File PDF đã tải tương ứng. |

> `status`: downloaded / failed / no_url.

#### 13. `outline_documents`

**Một dòng:** Một file đề cương PDF đã tải. **Khóa:** id (duy nhất: sha256). **Số dòng hiện tại:** 783.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 137 | Khóa thay thế tự tăng. |
| `sha256` | VARCHAR(64) · NOT NULL · UQ | aa00c362eab274cb71e08b9b9dab1f32851… | Mã băm nội dung file (duy nhất). |
| `file_name` | VARCHAR(255) · NOT NULL | 292b8864861c5d5d448feb7e.pdf | Tên file PDF. |
| `rel_path` | VARCHAR(512) · NOT NULL | outlines_2025/pdfs/292b8864861c5d5d… | Đường dẫn tương đối tới file PDF. |
| `size_bytes` | BIGINT · NOT NULL | 3113696 | Dung lượng file (byte). |
| `page_count` | INTEGER · NULL | 12 | Số trang. |
| `text_status` | VARCHAR(16) · NOT NULL | needs_ocr | pending \| extracted \| needs_ocr \| failed. |
| `text_method` | VARCHAR(16) · NULL | pdf_text | pdf_text hoặc ocr. |
| `text_chars` | INTEGER · NULL | 55841 | Số ký tự đã trích. |
| `language` | VARCHAR(8) · NULL | — | Mã ngôn ngữ phát hiện. |
| `text` | TEXT · NULL | TRƯỜNG ĐẠI HỌC KINH TẾ - LUẬT KHOA … | Văn bản trích xuất toàn bộ. |
| `extracted_at` | TIMESTAMP · NULL | 2026-11-21 05:55:50.760060+00:00 | Thời điểm trích văn bản. |
| `ocr_status` | VARCHAR(16) · NULL | pending | OCR để làm sau: NULL = không cần (PDF có lớp chữ); pending = PDF scan cần OCR; done = đã OCR và đưa vào phân tích. |
| `ocr_text` | TEXT · NULL | Mẫu 7: Đề cương chi tiết học phan T… | Văn bản OCR (với 'pending': bản chạy thử chưa duyệt, chưa dùng để phân tích). |
| `ocr_engine` | VARCHAR(64) · NULL | tesseract vie+eng psm4 300dpi (chạy… | Công cụ/tham số OCR, vd 'tesseract vie+eng psm4 300dpi'. |
| `ocr_at` | TIMESTAMP · NULL | 2026-11-21 05:55:50.760060+00:00 | Thời điểm OCR. |

Ràng buộc duy nhất: (sha256).

> File PDF nằm ngoài DB (`rel_path`); DB giữ metadata và văn bản trích xuất. `text_status`: pending / extracted / needs_ocr / failed.

#### 14. `outline_sections`

**Một dòng:** Một phần có đánh số của đề cương (nguyên văn). **Khóa:** id. **Số dòng hiện tại:** 8.286.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 45047 | Khóa thay thế tự tăng. |
| `document_id` | INTEGER · NOT NULL · **FK** → outline_documents.id | 195 | Đề cương chứa phần này. |
| `kind` | VARCHAR(32) · NOT NULL | description | Loại phần (front, objectives, clo, content, assessment, textbooks, other…). |
| `ord` | INTEGER · NOT NULL | 2 | Thứ tự trong đề cương. |
| `heading` | VARCHAR(512) · NULL | 2. Mô tả môn học(Course description… | Tiêu đề mục. |
| `text` | TEXT · NOT NULL |  Môn học cung cấp kiến thức về chu … | Nội dung nguyên văn. |
| `search_text` | TEXT · NOT NULL | mon hoc cung cap kien thuc ve chu t… | Bản không dấu, chữ thường để tìm kiếm tiếng Việt (chỉ mục trigram GIN trên PostgreSQL). |

> `kind` ví dụ front, objectives, clo, content, assessment, textbooks, other.

#### 15. `outline_courses`

**Một dòng:** Thông tin tổng quát đã phân tích của một đề cương. **Khóa:** document_id. **Số dòng hiện tại:** 771.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `document_id` | INTEGER · NOT NULL · **PK** · **FK** → outline_documents.id | 1 | Đề cương (khóa chính, 1–1 với outline_documents). |
| `doc_type` | VARCHAR(16) · NOT NULL | syllabus_en | Loại tài liệu: đề cương, khung… (other nếu không rõ). |
| `faculty` | VARCHAR(256) · NULL | ECONOMIC LAW | Khoa ghi trong đề cương. |
| `department` | VARCHAR(256) · NULL | BUSINESS LAW | Bộ môn ghi trong đề cương. |
| `name_vi` | VARCHAR(512) · NULL | Quản lý chuỗi cung ứng | Tên học phần tiếng Việt trong đề cương. |
| `name_en` | VARCHAR(512) · NULL | Law on real estate transactions | Tên học phần tiếng Anh trong đề cương (có thể thiếu hoặc sai lỗi chính tả). |
| `course_code` | VARCHAR(64) · NULL | BRB4017 | Mã học phần như ghi trong đề cương. |
| `course_code_norm` | VARCHAR(64) · NULL | BAA2028 | Mã đã chuẩn hóa (dùng để liên kết). |
| `knowledge_block` | VARCHAR(256) · NULL | General Knowledge | Khối kiến thức. |
| `level` | VARCHAR(64) · NULL | Undergraduate | Trình độ (Undergraduate…). |
| `major` | VARCHAR(256) · NULL | Economic law | Ngành. |
| `cohort_range` | VARCHAR(128) · NULL | 2025-2029 | Khóa áp dụng, dạng 2025-2029. |
| `academic_year` | VARCHAR(64) · NULL | Năm thứ 3 | Năm học trong khung chương trình. |
| `term` | VARCHAR(64) · NULL | Học kỳ 5 | Học kỳ trong khung chương trình. |
| `credits` | DOUBLE · NULL | 2.0 | Số tín chỉ. |
| `hours_lecture` | DOUBLE · NULL | 45.0 | Giờ lý thuyết. |
| `hours_practice` | DOUBLE · NULL | 0.0 | Giờ thực hành. |
| `hours_self_study` | DOUBLE · NULL | 30.0 | Giờ tự học. |
| `prerequisite_raw` | TEXT · NULL | Thống kê cơ bản. | Tiên quyết nguyên văn. |
| `previous_raw` | TEXT · NULL | Luật quốc tế | Học trước nguyên văn. |
| `next_raw` | TEXT · NULL | Other relevant subjects | Học sau nguyên văn. |
| `corequisite_raw` | TEXT · NULL | Không | Song hành nguyên văn. |
| `teaching_language` | VARCHAR(128) · NULL | Vietnamese | Ngôn ngữ giảng dạy nguyên văn. |
| `lecturers` | JSONB · NULL | ["MS. Phan Thi Huong Giang Dr. Nguy… | Danh sách giảng viên (JSONB). |
| `assistants` | JSONB · NULL | ["PGS.", "TS. Lê Hoành Sử, Ths. Ngu… | Danh sách trợ giảng (JSONB). |
| `description` | TEXT · NULL | The course includes 5 chapters pres… | Mô tả học phần. |
| `parse_status` | VARCHAR(16) · NOT NULL | failed | ok \| partial \| failed \| skipped. |
| `parse_detail` | JSONB · NULL | {"counts": {"clos": 4, "schedule": … | Chi tiết kết quả phân tích (đếm số mục…). |
| `parse_method` | VARCHAR(16) · NULL | rules-7 | Phiên bản bộ phân tích (vd rules-5). |
| `parsed_at` | TIMESTAMP · NULL | 2026-11-21 06:12:45.512040+00:00 | Thời điểm phân tích. |
| `language_track` | VARCHAR(2) · NULL | en | Ngôn ngữ giảng dạy suy ra: en \| vi. |

> `parse_status`: ok / partial / failed / skipped. Các trường `*_raw` giữ nguyên văn.

#### 16. `outline_module_links`

**Một dòng:** Liên kết một đề cương với một mã học phần. **Khóa:** id (duy nhất: document_id + module_code). **Số dòng hiện tại:** 1.063.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 1 | Khóa thay thế tự tăng. |
| `document_id` | INTEGER · NOT NULL · **FK** → outline_documents.id · UQ | 603 | Đề cương. |
| `module_code` | VARCHAR(64) · NOT NULL · UQ | BLB5042 | Học phần được liên kết (liên kết mềm). |
| `source` | VARCHAR(16) · NOT NULL | catalog | Cách suy ra liên kết (catalog…). |

Ràng buộc duy nhất: (document_id, module_code).

> `module_code` là liên kết mềm. `source` cho biết liên kết suy ra từ đâu (catalog, mã trong đề cương…).

#### 17. `outline_objectives`

**Một dòng:** Một mục tiêu học phần (CO) của đề cương. **Khóa:** id. **Số dòng hiện tại:** 2.221.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 8810 | Khóa thay thế tự tăng. |
| `document_id` | INTEGER · NOT NULL · **FK** → outline_documents.id | 193 | Đề cương. |
| `code` | VARCHAR(16) · NOT NULL | CO1 | Mã mục tiêu (CO1…). |
| `description` | TEXT · NULL | Áp dụng kiến thức Kinh tếcông vào p… | Nội dung mục tiêu. |
| `clo_codes` | JSONB · NULL | [] | Các CLO tương ứng (JSONB). |
| `competency_level` | VARCHAR(128) · NULL | 3 | Mức năng lực. |

#### 18. `outline_clos`

**Một dòng:** Một chuẩn đầu ra học phần (CLO) của đề cương. **Khóa:** id. **Số dòng hiện tại:** 3.070.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 9547 | Khóa thay thế tự tăng. |
| `document_id` | INTEGER · NOT NULL · **FK** → outline_documents.id | 765 | Đề cương. |
| `code` | VARCHAR(16) · NOT NULL | CLO1 | Mã CLO (CLO1…). |
| `description` | TEXT · NULL | Trình bày được những khái niệm, đặc… | Nội dung chuẩn đầu ra. |
| `teaching_levels` | VARCHAR(128) · NULL | I | Mức giảng dạy I/T/U. |

#### 19. `outline_assessments`

**Một dòng:** Một thành phần/mục đánh giá của đề cương. **Khóa:** id. **Số dòng hiện tại:** 2.812.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 11786 | Khóa thay thế tự tăng. |
| `document_id` | INTEGER · NOT NULL · **FK** → outline_documents.id | 193 | Đề cương. |
| `ord` | INTEGER · NOT NULL | 1 | Thứ tự. |
| `component` | TEXT · NULL | A1. Đánh giá quá trình | Thành phần đánh giá (A1, A2…). |
| `item_code` | VARCHAR(16) · NULL | A1.1 | Mã mục (A1.1…). |
| `item_name` | TEXT · NULL | (Individu al LMS) | Tên mục. |
| `clo_codes` | JSONB · NULL | ["CLO1", "CLO2"] | CLO được đánh giá (JSONB). |
| `criteria` | TEXT · NULL | Students can present fundamental kn… | Tiêu chí. |
| `duration` | VARCHAR(128) · NULL | 20mins | Thời lượng. |
| `weight_pct` | DOUBLE · NULL | 25.0 | Trọng số thành phần (%). |
| `sub_weight_pct` | DOUBLE · NULL | 40.0 | Trọng số mục trong thành phần (%). |

#### 20. `outline_schedule`

**Một dòng:** Một dòng kế hoạch giảng dạy theo tuần. **Khóa:** id. **Số dòng hiện tại:** 4.772.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 14550 | Khóa thay thế tự tăng. |
| `document_id` | INTEGER · NOT NULL · **FK** → outline_documents.id | 252 | Đề cương. |
| `ord` | INTEGER · NOT NULL | 1 | Thứ tự. |
| `week_label` | VARCHAR(128) · NULL | 1 | Nhãn tuần/buổi. |
| `content` | TEXT · NULL | Giới thiệu môn học | Nội dung giảng dạy. |
| `clo_codes` | JSONB · NULL | [] | CLO liên quan (JSONB). |
| `activities` | TEXT · NULL | Giảng viên: - Giới thiệu đề cương c… | Hoạt động dạy và học. |
| `assessment` | TEXT · NULL |  | Mục đánh giá liên quan. |

#### 21. `outline_materials`

**Một dòng:** Một giáo trình hoặc tài liệu tham khảo. **Khóa:** id. **Số dòng hiện tại:** 7.016.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 29127 | Khóa thay thế tự tăng. |
| `document_id` | INTEGER · NOT NULL · **FK** → outline_documents.id | 195 | Đề cương. |
| `kind` | VARCHAR(16) · NOT NULL | textbook | Loại: textbook \| reference \| software. |
| `ord` | INTEGER · NOT NULL | 1 | Thứ tự. |
| `citation` | TEXT · NOT NULL | Bài giảng quản lý dự án đầu tư, Đỗ … | Trích dẫn tài liệu nguyên văn. |

> `kind`: textbook / reference / software.

### D. Quy chế học vụ

#### 22. `regulation_documents`

**Một dòng:** Một văn bản quy chế/quy định. **Khóa:** id. **Số dòng hiện tại:** 50.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | VARCHAR(128) · NOT NULL · **PK** | uel-qcdt-2261-2025 | Mã văn bản (khóa chính), vd uel-qcdt-1268-2022. |
| `title` | TEXT · NOT NULL | Quy chế đào tạo trình độ đại học (á… | Tiêu đề văn bản. |
| `issuer` | VARCHAR(256) · NULL | Hiệu trưởng Trường Đại học Kinh tế … | Cơ quan ban hành. |
| `decision_no` | VARCHAR(64) · NULL | 2261/QĐ-ĐHKTL | Số quyết định (NULL nếu không đọc được trong văn bản). |
| `issued_date` | DATE · NULL | 2025-09-04 | Ngày ban hành. |
| `effective_from` | DATE · NULL | 2022-10-14 | Ngày bắt đầu hiệu lực. |
| `effective_to` | DATE · NULL | 2024-08-13 | Ngày hết hiệu lực. |
| `status` | VARCHAR(16) · NOT NULL | active | active \| expired \| superseded \| upcoming. |
| `superseded_by` | VARCHAR(128) · NULL | uel-qcdt-1268-2022 | Mã văn bản thay thế (liên kết mềm). |
| `supersedes` | JSONB · NULL | uel-qcdt-789-2017 | Mã văn bản bị thay thế (JSONB). |
| `applies_to_cohorts` | JSONB · NULL | ["K25", "K26"] | Khóa áp dụng, vd ["K25","K26"] hoặc ["all"]. |
| `topics` | JSONB · NULL | ["quy chế đào tạo", "tín chỉ", "đăn… | Chủ đề (JSONB). |
| `source_url` | TEXT · NULL | https://pdt.uel.edu.vn/van-ban-quy-… | URL nguồn. |
| `file` | VARCHAR(512) · NULL | raw/uel-qcdt-1268-2022.pdf | Đường dẫn file gốc trong thư mục regulations/. |
| `verified` | BOOLEAN · NOT NULL | False | Đã đối chiếu số/ngày trong chính văn bản. |
| `notes` | TEXT · NULL | Số QĐ và ngày lấy từ tiêu đề trang … | Ghi chú. |

> Không bịa số quyết định/ngày: trường không rõ để NULL; `verified` = đã đọc trong chính văn bản.

#### 23. `regulation_chunks`

**Một dòng:** Một Điều/Khoản/Điểm nguyên văn của văn bản quy chế (đơn vị truy xuất và trích dẫn của RAG). **Khóa:** id (duy nhất: doc_id + anchor). **Số dòng hiện tại:** 0.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | — | Khóa thay thế tự tăng. |
| `doc_id` | VARCHAR(128) · NOT NULL · **FK** → regulation_documents.id · UQ | — | Văn bản chứa đoạn. |
| `chapter` | VARCHAR(256) · NULL | — | Chương. |
| `article` | VARCHAR(32) · NULL | — | Điều. |
| `clause` | VARCHAR(32) · NULL | — | Khoản. |
| `point` | VARCHAR(8) · NULL | — | Điểm. |
| `heading` | TEXT · NULL | — | Tiêu đề Điều. |
| `anchor` | VARCHAR(128) · NOT NULL · UQ | — | Neo trích dẫn, vd dieu-10-khoan-2. |
| `page` | INTEGER · NULL | — | Số trang trong file gốc. |
| `text` | TEXT · NOT NULL | — | Nội dung NGUYÊN VĂN. |
| `search_text` | TEXT · NOT NULL | — | Bản không dấu, chữ thường để tìm kiếm tiếng Việt (chỉ mục trigram GIN trên PostgreSQL). |

Ràng buộc duy nhất: (doc_id, anchor).

> Hiện CHƯA nạp (0 dòng): RAG quy chế đang chạy bằng chỉ mục riêng ngoài DB.

### E. Người dùng và vận hành

#### 24. `users`

**Một dòng:** Một người dùng đăng nhập. **Khóa:** id (duy nhất: provider + subject). **Số dòng hiện tại:** 0.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | — | Khóa thay thế tự tăng. |
| `provider` | VARCHAR(16) · NOT NULL · UQ | — | Nhà cung cấp đăng nhập. |
| `subject` | VARCHAR(128) · NOT NULL · UQ | — | Định danh người dùng tại nhà cung cấp. |
| `display_name` | VARCHAR(128) · NOT NULL | — | Tên hiển thị. |
| `created_at` | TIMESTAMP · NOT NULL | — | Thời điểm tạo tài khoản. |
| `last_login_at` | TIMESTAMP · NULL | — | Lần đăng nhập gần nhất. |

Ràng buộc duy nhất: (provider, subject).

> Chứa dữ liệu cá nhân khi có người dùng thật — không đưa vào ví dụ hay commit.

#### 25. `reviews`

**Một dòng:** Một đánh giá học phần của người dùng. **Khóa:** id. **Số dòng hiện tại:** 0.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | — | Khóa thay thế tự tăng. |
| `module_code` | VARCHAR(64) · NOT NULL | — | Học phần được đánh giá. |
| `user_id` | INTEGER · NOT NULL · **FK** → users.id | — | Người viết. |
| `display_name` | VARCHAR(128) · NOT NULL | — | Tên hiển thị trên đánh giá. |
| `semester` | VARCHAR(32) · NULL | — | Học kỳ đã học. |
| `professor` | VARCHAR(256) · NULL | — | Giảng viên. |
| `cohort` | VARCHAR(8) · NULL | — | Khóa của người đánh giá. |
| `rating` | INTEGER · NOT NULL | — | Điểm tổng thể. |
| `difficulty` | INTEGER · NULL | — | Độ khó. |
| `workload` | INTEGER · NULL | — | Khối lượng học tập. |
| `content` | TEXT · NOT NULL | — | Nội dung đánh giá. |
| `status` | VARCHAR(16) · NOT NULL | — | Trạng thái kiểm duyệt. |
| `moderation_reasons` | JSONB · NULL | — | Lý do kiểm duyệt (JSONB). |
| `created_at` | TIMESTAMP · NOT NULL | — | Thời điểm tạo. |

> Có kiểm duyệt (`status`, `moderation_reasons`).

#### 26. `feedback`

**Một dòng:** Một lượt góp ý từ widget trên web. **Khóa:** id. **Số dòng hiện tại:** 0.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | — | Khóa thay thế tự tăng. |
| `page` | VARCHAR(256) · NOT NULL | — | Trang web gửi góp ý. |
| `rating` | INTEGER · NOT NULL | — | Điểm hài lòng. |
| `category` | VARCHAR(64) · NOT NULL | — | Loại góp ý. |
| `message` | TEXT · NOT NULL | — | Nội dung. |
| `contact` | VARCHAR(256) · NULL | — | Liên hệ (tùy chọn). |
| `app_version` | VARCHAR(64) · NULL | — | Phiên bản ứng dụng. |
| `created_at` | TIMESTAMP · NOT NULL | — | Thời điểm gửi. |

> Phục vụ vòng Design Thinking.

#### 27. `import_runs`

**Một dòng:** Một lần nhập một file/nguồn dữ liệu. **Khóa:** id. **Số dòng hiện tại:** 18.

| Cột | Kiểu / khóa | Ví dụ | Mô tả |
|---|---|---|---|
| `id` | INTEGER · NOT NULL · **PK** | 1 | Khóa thay thế tự tăng. |
| `source` | VARCHAR(32) · NOT NULL | uis-classes | Nguồn nhập (uis-classes, ctdt, equivalents…). |
| `file_name` | VARCHAR(512) · NULL | UIS-DanhSachThongTinLHPDangKy_2025-… | Tên file nguồn. |
| `file_sha256` | VARCHAR(64) · NULL | 09d73c0c7b8c7c57f89eb9a57a3d6dea9d7… | Mã băm file nguồn. |
| `rows_in` | INTEGER · NOT NULL | 225 | Số dòng đọc vào. |
| `rows_ok` | INTEGER · NOT NULL | 225 | Số dòng nhập thành công. |
| `rows_skipped` | INTEGER · NOT NULL | 0 | Số dòng bỏ qua. |
| `rows_error` | INTEGER · NOT NULL | 0 | Số dòng lỗi. |
| `status` | VARCHAR(16) · NOT NULL | ok | ok \| partial \| failed. |
| `detail` | JSONB · NULL | {"venues": 43, "lessons": 270, "mod… | Chi tiết kết quả (JSONB). |
| `started_at` | TIMESTAMP · NOT NULL | 2026-11-20 16:08:35.711703+00:00 | Bắt đầu. |
| `finished_at` | TIMESTAMP · NULL | 2026-11-20 16:08:35.711712+00:00 | Kết thúc. |

> Dùng để truy vết nguồn gốc dữ liệu (chương đánh giá khóa luận).

## View SQL

### `v_modules_english`

Một dòng mỗi học phần có `language_track` tương ứng (en). Số dòng hiện tại: 384. Các cột: `code`, `name`, `credits`, `type`, `faculty`, `department`, `is_english`, `description`, `prerequisites`, `search_text`, `is_sample`, `updated_at`, `language_track`, `language_basis`, `counterpart_code`.

### `v_modules_vietnamese`

Một dòng mỗi học phần có `language_track` tương ứng (vi). Số dòng hiện tại: 1.102. Các cột: `code`, `name`, `credits`, `type`, `faculty`, `department`, `is_english`, `description`, `prerequisites`, `search_text`, `is_sample`, `updated_at`, `language_track`, `language_basis`, `counterpart_code`.

> Hai view này là tiện ích đọc nhanh; ứng dụng không dựa vào chúng. Xem cờ "View lệch cột" ở đầu tài liệu.

## Khóa ngoại và cách nối bảng an toàn

21 ràng buộc khóa ngoại được ép ở mức database:

| Bảng con (cột) | Bảng cha (cột) | Khi xóa cha |
|---|---|---|
| `class_sections` (module_code) | `modules` (code) | CASCADE |
| `class_sections` (semester_id) | `semesters` (id) | SET NULL |
| `lessons` (class_id) | `class_sections` (id) | CASCADE |
| `lessons` (room) | `venues` (room) | SET NULL |
| `module_offering_plans` (module_code) | `modules` (code) | CASCADE |
| `module_relations` (program_id) | `programs` (id) | CASCADE |
| `outline_assessments` (document_id) | `outline_documents` (id) | CASCADE |
| `outline_clos` (document_id) | `outline_documents` (id) | CASCADE |
| `outline_courses` (document_id) | `outline_documents` (id) | CASCADE |
| `outline_materials` (document_id) | `outline_documents` (id) | CASCADE |
| `outline_module_links` (document_id) | `outline_documents` (id) | CASCADE |
| `outline_objectives` (document_id) | `outline_documents` (id) | CASCADE |
| `outline_resources` (document_id) | `outline_documents` (id) | SET NULL |
| `outline_resources` (entry_id) | `program_catalog_entries` (id) | CASCADE |
| `outline_schedule` (document_id) | `outline_documents` (id) | CASCADE |
| `outline_sections` (document_id) | `outline_documents` (id) | CASCADE |
| `program_catalog_entries` (import_run_id) | `import_runs` (id) | SET NULL |
| `program_modules` (module_code) | `modules` (code) | CASCADE |
| `program_modules` (program_id) | `programs` (id) | CASCADE |
| `regulation_chunks` (doc_id) | `regulation_documents` (id) | CASCADE |
| `reviews` (user_id) | `users` (id) | CASCADE |

**Liên kết mềm (không ép khóa ngoại, có thể mồ côi):** `module_relations.source/target`, `equivalents.code/equivalent_code`, `program_catalog_entries.module_code`, `outline_module_links.module_code`, `regulation_documents.superseded_by`, `lessons` ↔ tên phòng chỉ ép tới `venues.room`. Khi nối qua các cột này dùng LEFT JOIN và chịu được thiếu tên môn.

### Bản đồ nối nhanh

| Câu hỏi | Đường nối khuyến nghị |
|---|---|
| Lịch một lớp | `class_sections` → `lessons` (class_id) → `venues` (room); học kỳ qua `semesters` (semester_id, có thể NULL). |
| Lớp mở của một học phần | `modules` → `class_sections` (module_code), lọc `semester_id`. |
| Môn trong một CTĐT | `programs` → `program_modules` (program_id) → `modules` (module_code); thứ tự kỳ theo `suggested_order`. |
| Cây tiên quyết/học trước | `module_relations` lọc `program_id` và `type IN ('prereq','previous','coreq')`; hoặc dùng `*_tree` của `program_modules`. |
| Học phần tương đương | `equivalents` (hai chiều: code ↔ equivalent_code); không dùng cạnh `equivalent` của `module_relations` (còn rác). |
| Đề cương của một môn | `outline_module_links` (module_code) → `outline_documents` → `outline_courses` / `outline_sections` / `outline_clos`… |
| Tên tiếng Anh | `modules.name_en` (NULL → dùng `modules.name`); khoa/bộ môn dịch ở phía web (không có cột trong DB). |
| Quy chế theo khóa | `regulation_documents.applies_to_cohorts` (JSONB) và `effective_from/to`; nội dung Điều/Khoản qua RAG (chưa vào `regulation_chunks`). |

### Quy tắc diễn giải

- **Khóa:** `K22` = tuyển sinh 2022 (2 số cuối năm). Quy định ghi áp dụng khóa nào thì chỉ áp dụng khóa đó.
- **CTĐT từ catalog (K25, K26):** mã = `K25`/`K26` + mã ngành theo K24 cùng tên; riêng `…402` (Kinh tế quốc tế) là suy đoán từ K24402 (Kinh tế đối ngoại). Ngành chưa rõ mã dùng mã chữ (`K25LUAT`, `K25LKT`, `K25KDNNS`, `K25KDTMHQ`, `K25KTDD`); các bản phụ của một ngành có hậu tố `-V2`, `-V3`.
- **`HK01…HK10` trong catalog chỉ là thứ tự học kỳ**, không phải học kỳ có năm học: `suggested_semester` để NULL và thứ tự nằm ở `suggested_order`.
- **Bắt buộc:** với CTĐT từ catalog, `X` = bắt buộc; ô trống = không đánh dấu bắt buộc (tự chọn hoặc chưa rõ), không suy diễn thêm.
- **Học trước của catalog:** chỉ giữ mã trong ngoặc vuông (`[BAA2028]…` → `BAA2028`); văn bản tự do không có mã bị bỏ. Các mã nối bằng dấu phẩy được hiểu theo cùng quy ước với dữ liệu cổng.
- **Thiếu dữ liệu là NULL, không phải 0.** `NULL` ở `name_en`, `semester_id`, `cohorts` nghĩa là chưa có nguồn/chưa suy ra được.
- **Dữ liệu số quyết định/ngày của quy chế không được bịa:** để NULL khi không đọc được trong văn bản (`verified = false`).
- **Dữ liệu cá nhân** (`users`, `reviews`, `feedback`, TKB cá nhân) không đưa vào tài liệu, ví dụ hay commit.
