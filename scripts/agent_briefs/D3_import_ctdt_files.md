# Brief D3 — Nạp chương trình đào tạo từ 46 file PDF/Excel/Word đã thu thập

Không chạy lệnh shell (chủ dự án chạy), không commit. Sửa trong `api/`. Chủ dự án chạy `cd api; .venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --ignore=tests/rag`.

## Dữ liệu đã có
Thư mục **`data/raw/ctdt_pdf/`** (không commit, đã gitignore) chứa 46 file do chủ dự án và Claude thu thập từ web 9 khoa của UEL.

**Quy ước tên file (đã chuẩn hóa):** `CTDT{năm}_{TenNganh}[_EN|_VI|_CNTN|_CLC][_phụ lục].{pdf|xls|xlsx|docx}`
- `CTDT2023_KinhTe.pdf`, `CTDT2025_HTTTQL.pdf`, `CTDT2025_Luat_VI.xls`, `CTDT2023_KinhTeQuocTe_EN.xlsx`…
- Tiền tố `LichThi{năm}_…` = lịch thi, KHÔNG phải CTĐT (bỏ qua ở brief này hoặc lưu riêng).
- Tiền tố `GHICHU_` = file ghi chú "không áp dụng", bỏ qua.
- Phụ lục của HTTTQL 2025: `_ChuanDauRa`, `_ChuoiMonHoc`, `_ThongTinMonHoc` — không phải CTĐT chính.
- `CTDT2025_QD_BanHanh.pdf` là quyết định ban hành, không có nội dung CTĐT.
- `CTDT2025_KeToan_MoTa.docx`, `CTDT2025_KiemToan_MoTa.docx` là bản mô tả tóm tắt, không đủ danh sách học phần — ghi nhận là "chưa đủ dữ liệu".

## QUY TẮC KHÓA (chủ dự án đã chốt, quan trọng nhất)
Một CTĐT ban hành năm Y áp dụng cho **hai khóa liên tiếp**:
- **CTĐT 2023 → áp dụng K23 và K24**
- **CTĐT 2025 → áp dụng K25 và K26**
- CTĐT 2021 → K21, K22; CTĐT 2027 → K27, K28 (cùng quy luật)

Nghĩa là file `CTDT2023_KinhTe.pdf` phải sinh ra dữ liệu cho **cả** `K23{mã ngành}` **và** `K24{mã ngành}`; `CTDT2025_HTTTQL.pdf` sinh ra `K25406` và `K26406`. Mã chương trình trong DB có dạng `K{2 số khóa}{mã ngành 3 số}` (xem bảng `programs`, ví dụ K24414 = khóa 24, ngành Công nghệ tài chính). Mã ngành tra trong dữ liệu sẵn có (`api/app/services/catalog_programs.py` có bảng tên ngành → mã) hoặc từ các chương trình đã có trong DB.

Hậu tố trong tên file ánh xạ sang biến thể chương trình: `_EN` = chương trình tiếng Anh (mã lớp đuôi E), `_CNTN` = cử nhân tài năng (đuôi T), `_CLC` = chất lượng cao, `_VI` hoặc không hậu tố = chương trình chuẩn tiếng Việt.

## Yêu cầu

### 1. Đọc được Excel
Parser CTĐT hiện chỉ xử lý PDF và Word. Bổ sung đọc bảng Excel:
- `.xlsx` dùng `openpyxl` (đã có trong `api/requirements.txt`).
- `.xls` (định dạng cũ, Luật và Luật kinh tế 2023/2025 dùng) cần thư viện khác — thêm `xlrd` vào `requirements.txt` (ghim phiên bản) hoặc chuyển đổi; nêu rõ lựa chọn trong báo cáo.
- Bảng Excel CTĐT thường có các cột: STT, Mã học phần, Tên học phần (Việt/Anh), Số tín chỉ, loại bắt buộc/tự chọn, học kỳ, khối kiến thức, học phần tiên quyết/học trước. Tên cột không thống nhất giữa các khoa nên phải **dò cột theo từ khóa** (không phụ thuộc vị trí cố định), hỗ trợ cả tiêu đề tiếng Việt và tiếng Anh (Course code, Course name, Credits, Semester, Prerequisite…).
- Một file có thể nhiều sheet (chuyên ngành khác nhau): đọc mọi sheet có bảng học phần, ghi tên sheet làm "chuyên ngành".

### 1a. K23 hệ TIẾNG VIỆT — KHÔNG tạo ở brief này (đã giao cho brief X2, Codex)
Chủ dự án chốt: chương trình **K23 hệ tiếng Việt** được tạo bằng cách **sao chép từ K24** (CTĐT 2023 dùng chung K23/K24, và K24 lấy từ cổng trường là đúng 100%). Việc đó do brief `X2_k23_from_k24.md` làm (Codex), chỉ THÊM dòng `programs`/`program_modules` có `source='derived_from_K24'`.
Với D3 thì:
- **BỎ phần tạo chương trình K23 hệ tiếng Việt** từ 17 Excel `data/outlines_master/ctdt2023_excel/`. Đừng tạo, đừng ghi đè các `K23NNN` đã có.
- Chỉ **kiểm tra khớp**: với mỗi ngành K23 hệ tiếng Việt, so danh sách học phần trong Excel 2023 với `program_modules` hiện có (từ cổng trường hoặc do X2 sao chép), ghi chênh lệch vào báo cáo `data/processed/ctdt2023_vs_db.csv`. Không sửa dữ liệu theo chênh lệch trừ khi chủ dự án duyệt.
- **GIỮ** phần hệ **E / Coop (H) / cử nhân tài năng (T / TE)** của K23 nếu có trong Excel 2023: những hệ đó không nằm trong X2 nên D3 vẫn nạp.
- Phần K24, K25, K26 không đổi so với các mục dưới đây.
Nếu X2 chưa chạy khi D3 chạy: D3 vẫn không tạo K23 hệ tiếng Việt, chỉ ghi vào báo cáo "chưa có, chờ X2". X2 idempotent nên chạy trước hay sau D3 đều được.

### 1b. NGUỒN CHUẨN: Excel của Phòng BĐCL và Drive khoa (ưu tiên hơn PDF)
Chủ dự án chốt: cấu trúc học phần theo khóa lấy từ **Excel**, chỉ dùng PDF khi Excel không có ngành đó.

| Khóa | Nguồn chuẩn | Đường dẫn |
|---|---|---|
| K25, K26 | 9 workbook Đại học của Phòng BĐCL (hiện có 8, thiếu Kinh tế đối ngoại) | `data/raw/ctdt_bdcl/DH_*.xlsx` |
| K23, K24 | 17 Excel CTĐT 2023 từ Drive khoa | `data/outlines_master/ctdt2023_excel/` |

Cấu trúc file BĐCL: **mỗi workbook là một khoa, mỗi sheet là một CTĐT/hệ**. Tên sheet gồm số thứ tự + mã ngành + hậu tố hệ, ví dụ `406 HTTTQL`, `406H Coop-K25/K26`, `411E TMĐT tiếng Anh`, `411T CNTN`, `411TE`, `404`, `414`. Hậu tố: `E` = chương trình tiếng Anh, `H` = Coop, `T` = cử nhân tài năng, không hậu tố = chương trình chuẩn. Danh sách sheet đã liệt kê sẵn ở `data/raw/ctdt_bdcl/SHEETS.md`.

**Tên sheet là nguồn sự thật về hệ nào CÓ THẬT.** Ví dụ không có sheet `414E` nghĩa là ngành Công nghệ tài chính không có hệ tiếng Anh — khớp với việc mã lớp `K24414E` không tồn tại (xem brief W30). Dùng danh sách này để sinh đúng tập chương trình trong DB, đừng tạo biến thể không có thật.

**Kinh tế đối ngoại — ƯU TIÊN nguồn máy đọc được.** Trong `data/raw/ctdt_bdcl/THS_KinhTeDoiNgoai.xlsx` và `DH_Luat.xlsx` có sẵn các sheet **khuôn MyUEL 7 cột** (`STT`, `Mã môn học`, `Tên môn học`, `STC`, `Loại môn học` = Bắt buộc/Tự chọn, `Khối kiến thức`, index) cho đúng các CTĐT Kinh tế đối ngoại: `1_402_KTQT`, `2_402T_KTQT`, `2_408_KDQT`, `4_408E_KDQT`, `5_408T`, `6_408TE`, `5_420` (Logistics), và `8.402_KTQT_THS_NC/UD`. **Dùng các sheet này làm nguồn chính cho Kinh tế đối ngoại** vì chúng cho biết bắt buộc/tự chọn và khối kiến thức, thứ bản chép tay không có. Lưu ý khi đọc: ô chữ có ký tự `\xa0` (non-breaking space) phải `strip()`, cột `STC` ở dạng chuỗi `'3.00'`.

Bản chép tay từ ảnh (dưới đây) dùng **bổ sung** cho phần mà khuôn MyUEL không có: tỉ lệ điểm, hình thức đánh giá, loại thi, thời lượng thi. Đã chép sang TSV ở `data/raw/ctdt_bdcl/manual_screenshots/DH_KinhTeDoiNgoai__*.tsv` — đủ 7 sheet: `1.402_KTQT`, `2.402T`, `3.408_KDQT`, `4.408E` (hai file: `PARTIAL rows1-22` và `rows23-60.compact`), `5.408T`, `6.408TE`, `7.420_Logistics`. Đọc TSV này như một workbook BĐCL bình thường. Hạn chế của bản chép tay: sheet 1–3 và 22 dòng đầu sheet 4 có đủ hình thức đánh giá; các file còn lại chỉ có mã, tên, tín chỉ, tỉ lệ điểm (qt/gk/ck/nc), loại thi, thời lượng; **không file nào có cột học kỳ** → `suggested_semester` của ngành này để trống, không đoán.

Đối chiếu đã làm: 155 mã học phần, 141 có sẵn trong DB và **tín chỉ khớp 100%**. 14 mã chưa có trong DB, cần tạo mới theo quy tắc "nạp tất cả môn": `ERB4022`, `ERB4037`, `ERB4038`, `ERB4039`, `ERB5041`, `ERBT017`, `ERBT022`, `ERBT038`, `ERE3033`, `ERET002`, `ERET013`, `EUUT021`, `EUUT023` (mã hệ tiếng Anh/tài năng của ngành Kinh doanh và Kinh tế quốc tế), và `BRE4038` — mã này **nhiều khả năng là lỗi gõ của `BRB4038`** ở sheet 1, hãy kiểm tra tên môn và tín chỉ để xác nhận rồi ghi kết luận vào báo cáo; nếu đúng là lỗi gõ thì không tạo mã mới.

Hệ có thật của Kinh tế đối ngoại theo tên sheet: `402` (KTQT), `402T`, `408` (KDQT), `408E`, `408T`, `408TE`, `420` (Logistics). **Không có sheet `402E`** → ngành Kinh tế quốc tế không có hệ tiếng Anh.

Lưu ý khuôn dạng: vài sheet khác khuôn chung (file Luật có nhóm `408`/`402` chỉ 7 cột). Sheet tên `Dữ liệu gốc` hoặc `Data` là bảng tra nội bộ, **bỏ qua**. Excel 2023 có sẵn cột `Học kỳ K23/K24` và `Tên BM` từng môn — dùng cho mục 3b và để đối chiếu bộ môn.

### 2. Trích dữ liệu từ PDF (chỉ khi Excel không có)
Dùng lại hạ tầng phân tích sẵn có (`api/app/services/outline_parse.py` và các helper đọc PDF) để lấy bảng học phần từ các PDF CTĐT. Các PDF này là bản scan hoặc bản xuất từ Word, bảng nhiều trang, cần nối bảng qua trang như parser đề cương đang làm. File nào không đọc được bảng thì ghi `parse_status` và lý do, **không bịa dữ liệu**.

### 3. Lệnh CLI nạp dữ liệu
Thêm `python -m app.cli import-ctdt-files [--dir data/raw/ctdt_pdf] [--dry-run] [--only <pattern>]`:
- Quét thư mục, phân loại theo quy ước tên file ở trên.
- Với mỗi file hợp lệ: trích danh sách học phần, rồi **ghi vào hai chương trình** (hai khóa) theo quy tắc khóa.
- `--dry-run` chỉ xuất báo cáo CSV `data/processed/ctdt_import_preview.csv` (file, năm, ngành, biến thể, số học phần đọc được, số học phần khớp mã có sẵn trong bảng `modules`, số học phần lạ, chương trình đích) và không sửa DB.
- Idempotent: chạy lại không nhân đôi dữ liệu.
- **KHÔNG ghi đè khoa/bộ môn của học phần** (giữ quy tắc B6: khoa chỉ từ đề cương). File CTĐT chỉ cung cấp quan hệ chương trình ↔ học phần, học kỳ gợi ý, bắt buộc/tự chọn, khối kiến thức, tiên quyết.
- Học phần trong CTĐT mà chưa có trong bảng `modules`: tạo bản ghi tối thiểu (mã, tên, số tín chỉ), để trống khoa/bộ môn.

### 3b. Học kỳ gợi ý — quy tắc đếm (chủ dự án xác nhận 2026-11-22)
Trường có **3 học kỳ mỗi năm** (HK1, HK2, HK3 — không có học kỳ hè). CTĐT 2025 ghi "4 năm (10 học kỳ)".

Số học kỳ `n` ghi trong file CTĐT là **học kỳ thứ n kể từ kỳ 1 của năm nhập học, đếm liên tiếp qua cả kỳ 3**:
- HK1, HK2, HK3 → năm thứ nhất
- HK4, HK5, HK6 → năm thứ hai
- HK7, HK8, HK9 → năm thứ ba
- HK10 → kỳ 1 năm thứ tư

Ví dụ khóa K25 (nhập học năm học 2025-2026): HK1 = `2025-2026-1`, HK4 = `2026-2027-1`, HK10 = `2028-2029-1`. Viết hàm thuần `semester_id_for(cohort_year, n)` có test cho các mốc 1, 3, 4, 6, 7, 9, 10.

**Việc cần sửa:** hiện trong DB các CTĐT 2025 (K25/K26, nguồn `catalog2025`) có `suggested_semester` **TRỐNG** cho toàn bộ môn — ví dụ cả 59 môn của ngành 404. D3 phải điền giá trị này theo quy tắc trên. Các CTĐT K24 lấy từ portal đã đếm đúng kiểu liên tiếp, **giữ nguyên, không sửa**.

Môn không gắn học kỳ trong CTĐT (tự chọn tự do, ngoại ngữ, Giáo dục thể chất, Giáo dục quốc phòng) thì **để trống**, không đoán.

**Nguồn kiểm chứng có sẵn:** `data/ctdt_khoa_2023_2025/parsed/*.tsv` (đã trích từ 4 PDF của Khoa Tài chính–Ngân hàng và Công nghệ tài chính, bản 2023 và 2025; có cột `hoc_ky`) và bản đối chiếu `data/ctdt_khoa_2023_2025/SO_SANH_PDF_VS_DB.md`. Dùng làm nguồn hoặc để kiểm chứng kết quả trích từ PDF.

### 4. Báo cáo độ phủ
Lệnh in ra: với mỗi khóa K23–K26, có bao nhiêu ngành đã có CTĐT, ngành nào còn thiếu. Dự kiến thiếu CTĐT 2025 của: Kinh tế, Kinh doanh quốc tế, Thương mại điện tử, Quản trị kinh doanh, Marketing, Toán kinh tế, Kinh doanh số & Trí tuệ nhân tạo (các khoa đó chưa công bố).

### 5. Test pytest
Dùng file mẫu nhỏ tự tạo trong `api/tests/fixtures/` (KHÔNG commit file thật vì nặng và nằm trong `data/`):
- Excel `.xlsx` có tiêu đề tiếng Việt và một bản tiếng Anh → đọc đúng mã, tên, tín chỉ, học kỳ, bắt buộc/tự chọn.
- Dò cột khi thứ tự cột khác nhau.
- Quy tắc khóa: file `CTDT2023_X` sinh ra đúng hai chương trình K23 và K24; `CTDT2025_X` sinh K25 và K26.
- Hậu tố `_EN`, `_CNTN` ánh xạ đúng biến thể.
- Idempotent; `--dry-run` không đổi DB; không ghi đè khoa.

### 6. Tài liệu
Ghi quy tắc khóa và quy ước tên file vào `docs/DECISIONS.md`; thêm mục lệnh vào `api/README.md`.

Báo cáo cuối: lệnh chính xác để chủ dự án chạy (dry-run rồi chạy thật), file nào đọc được, file nào không và vì sao, độ phủ theo khóa.

## LƯU Ý (thêm bởi Claude, 2026-11-22): `api/app/db.py` do Codex sửa song song (hàm tạo engine). Nếu brief này cần chạm db.py thì đọc lại file hiện tại trước và chỉ sửa phần cần thiết.
