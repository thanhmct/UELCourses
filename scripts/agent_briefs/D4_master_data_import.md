# Brief D4 — Nạp `Master_data.xlsx` (dữ liệu gốc của trường): khoa/bộ môn, hình thức đánh giá, link đề cương, giáo trình

Không chạy lệnh shell (chủ dự án chạy), không commit. Sửa trong `api/`. Chủ dự án chạy `cd api; .venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --ignore=tests/rag`.

## Nguồn
**`data/raw/Master_data.xlsx`** (không commit, nằm trong `data/`) — file dữ liệu gốc do Phòng Đào tạo/BĐCL quản lý, chủ dự án cung cấp. Đây là **nguồn đáng tin nhất** về khoa/bộ môn và hình thức đánh giá, tin hơn cả đề cương PDF.

### Sheet `Data_Course` (2971 mã môn) — danh mục môn toàn trường
Cột: `Mã Môn`, `Tên Môn`, `Tên Tiếng Anh`, `Mã Khoa / BM`, `Tên Khoa / BM`, `GV phụ trách`, `Khoa`.
- `Tên Tiếng Anh` có ở 2883/2971 môn.
- `Tên Khoa / BM` có đủ 2971 môn, giá trị dạng `"Bộ môn Hệ thống thông tin quản lý"` hoặc `"Khoa Hệ thống thông tin"`.
- Cột `Khoa` là **công thức XLOOKUP**: phải đọc workbook với `openpyxl.load_workbook(..., data_only=True)` mới lấy được giá trị đã tính. Một số ô trả `#N/A` → coi như KHÔNG có giá trị, lúc đó suy khoa từ `Tên Khoa / BM` (nếu chuỗi bắt đầu bằng "Khoa " thì chính là khoa; nếu bắt đầu bằng "Bộ môn " thì tra bảng bộ môn→khoa trong chính file này, xem sheet `Sheet7` 103 dòng — công thức tham chiếu `$N$2:$O$32`, hãy tìm bảng tra đó và dùng).
- Chuẩn hóa tên khoa về danh sách khoa chuẩn đã có (`api/seed/faculty_canonical.tsv` từ B6d): giá trị trong file ghi kiểu `"Hệ thống thông tin"` (không có tiền tố "Khoa") → phải ra `"Khoa Hệ thống thông tin"`.

### Sheet `Sheet1` (1309 mã môn hợp lệ) — đề cương và đánh giá
Cột: `Mã học phần`, `Tên học phần`, `Số tín chỉ`, `Quá trình_Tỉ lệ điểm`, `Quá trình_Hình thức`, `Giữa kỳ_Tỉ lệ điểm`, `Giữa kỳ_Hình thức`, `Cuối kỳ_Tỉ lệ điểm`, `Cuối kỳ_Hình thức`, `Nâng cao_Tỉ lệ điểm`, `Nâng cao_Hình thức`, `Loại thi`, `Thời lượng thi`, `Tài liệu chính`, `Link đề cương`, `Link tài liệu`, `Mã tài liệu`, `Ghi chú`, `Thẩm định`, `Bộ môn/ Khoa`, `GV phụ trách`, `Khoa`.
- **1144 môn có `Link đề cương`** (Google Drive).
- **1078 môn có `Cuối kỳ_Hình thức`** (vd "Tự luận", "Trắc nghiệm", "Tự luận + trắc nghiệm", "Vấn đáp", "Đồ án").
- `Loại thi` có giá trị như "Thi giấy", "Thi máy"; `Thời lượng thi` như "60'".
- Bỏ qua các cột công thức `Mã tài liệu_Hiển thị CTĐT`, `Link đề cương_Hiển thị` (chỉ là HYPERLINK hiển thị).

## Đối chiếu đã làm (số liệu thật)
DB hiện có 1486 học phần, **405 môn khoa còn trống**. Khớp với Master_data: 1265 môn. Trong 405 môn trống, **187 môn Master_data có khoa** → điền được. Còn **218 môn không có trong Master_data** (phần lớn mã bắt đầu bằng M, P — nhiều khả năng là môn sau đại học hoặc môn của hệ khác).

## Yêu cầu

### 1. Lệnh CLI `import-master-data`
`python -m app.cli import-master-data [--file data/raw/Master_data.xlsx] [--dry-run]`. Idempotent. `--dry-run` chỉ xuất báo cáo `data/processed/master_import_preview.csv`, không sửa DB.

### 2. Nạp TOÀN BỘ môn (chủ dự án yêu cầu)
Nạp **tất cả 2971 môn** của `Data_Course` vào bảng `modules`, kể cả môn chưa có lớp và chưa thuộc CTĐT nào. Môn chưa có trong DB thì tạo mới (mã, tên, tên tiếng Anh, bộ môn, khoa). Môn đã có thì bổ sung trường còn thiếu.
**Việc lọc theo CTĐT là ở tầng truy vấn, không phải ở tầng dữ liệu**: khi người dùng lọc theo một CTĐT thì chỉ trả các môn thuộc CTĐT đó (quan hệ `program_modules`), nhưng bảng `modules` vẫn chứa toàn bộ. Áp dụng như nhau cho MỌI chương trình đào tạo và mọi tab của giao diện.

### 3. Khoa và bộ môn — thứ tự nguồn (chủ dự án chốt lại 2026-11-22, bản MỚI NHẤT)
**`Master_data.xlsx` là nguồn khoa/bộ môn CAO NHẤT**, chỉ đứng sau file chỉ định tay. (Bản trước của brief này ghi đề cương cao nhất — ĐÃ BỊ THAY THẾ, không dùng nữa.) Thứ tự đầy đủ:
1. `api/seed/faculty_overrides.tsv` — chủ dự án chỉ định tay. Tuyệt đối không ghi đè.
2. **`Master_data.xlsx` sheet `Data_Course`** — nguồn chính. Ô `#N/A` hoặc trống thì **GIỮ NGUYÊN giá trị hiện có trong DB**, không coi là xóa.
3. đề cương của chính môn (qua `outline_module_links` → `outline_courses`)
4. đề cương của bản tương ứng Anh↔Việt (một bước, không bắc cầu)
5. tiền tố mã (bảng `api/seed/prefix_to_faculty.tsv`, chỉ điền chỗ trống)
6. giữ nguyên giá trị cũ

Quy tắc kèm theo:
- Khi Master_data mâu thuẫn với đề cương: **theo Master_data**, đồng thời ghi dòng đó vào `data/processed/module_faculty_conflicts.csv` (mã môn, khoa theo Master, khoa theo đề cương) để chủ dự án xem.
- **Bộ môn Ngoại ngữ thuộc Phòng Bảo đảm chất lượng** (không thuộc khoa nào).
- Master_data áp dụng cho **khóa 2025 và 2026**.
Vẫn KHÔNG lấy khoa từ CTĐT hay lớp học phần. Ghi `nguồn = master_data` vào CSV audit. Cập nhật `audit-faculty` và `fix-module-faculty` cho khớp. Ghi quyết định vào `docs/DECISIONS.md` (nêu rõ đây là thay đổi so với B6b).

### 4. Hình thức đánh giá và thi
Lưu vào DB (thêm cột hoặc bảng `module_assessments` — chọn cách ít phá vỡ schema nhất, kèm migration Alembic):
- tỉ lệ và hình thức của bốn thành phần: quá trình, giữa kỳ, cuối kỳ, nâng cao;
- `Loại thi`, `Thời lượng thi`.
API `GET /api/modules/{code}` trả các trường này; endpoint facets có nhóm "Đánh giá cuối kỳ" đếm theo `Cuối kỳ_Hình thức` đã chuẩn hóa (hiện nhóm này đang rỗng, xem W18). Giao diện hiển thị cạnh số tín chỉ (xem W8/W8b: lấy từ đây thay vì đoán từ đề cương).

### 5. Link đề cương và giáo trình
- `Link đề cương` → điền vào nguồn link đề cương của học phần (xem `_outline_urls_for` và `outline_resources` trong `api/app/routers/modules.py`, B7). Môn nào DB chưa có link thì bổ sung; đã có thì giữ, trừ khi link cũ hỏng.
- `Tài liệu chính`, `Link tài liệu`, `Mã tài liệu` → lưu thành thông tin giáo trình của học phần (bảng mới `module_textbooks` hoặc cột JSON), API trả về để giao diện hiển thị ở trang chi tiết. Đây cũng là dữ liệu cho tính năng "Trao đổi sách" (W9) sau này.
- `GV phụ trách` → lưu làm giảng viên phụ trách học phần (khác với giảng viên của từng lớp).

### 6. Báo cáo độ phủ
Lệnh in ra: tổng môn sau khi nạp; số môn có khoa, có bộ môn, có tên tiếng Anh, có link đề cương, có hình thức thi cuối kỳ; danh sách mã môn trong DB mà Master_data không có (hiện 218 mã, phần lớn tiền tố M/P — ghi rõ để chủ dự án biết là môn sau đại học hay dữ liệu rác).

### 7. Test pytest
File mẫu nhỏ trong `api/tests/fixtures/` (không dùng file thật vì nằm trong `data/`):
- đọc được công thức đã tính nhờ `data_only=True`; ô `#N/A` không bị coi là tên khoa;
- suy khoa từ `Tên Khoa / BM` khi cột `Khoa` là `#N/A`;
- chuẩn hóa `"Hệ thống thông tin"` → `"Khoa Hệ thống thông tin"`;
- nạp môn mới và cập nhật môn cũ, idempotent;
- Master_data ghi đè khoa sai có sẵn (ca BBB1068 "Kỹ năng lãnh đạo");
- hình thức đánh giá lưu và trả đúng qua API;
- `--dry-run` không đổi DB.

Báo cáo cuối: lệnh chính xác (dry-run rồi thật), số liệu độ phủ, và những gì đã thay đổi so với B6.
