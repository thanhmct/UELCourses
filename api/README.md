# Backend API — UELPATH

FastAPI + SQLAlchemy + PostgreSQL (Alembic) backend cho hệ thống UELPATH.

## Lệnh Quản trị Dữ liệu (CLI)

Chạy CLI từ thư mục `api/` hoặc thư mục gốc:
```bash
python -m app.cli <lệnh> [tham số]
```

### 1. Chuẩn hóa & Rà soát Khoa / Bộ môn (Brief B6h/B6i, W29 và D4)

Thứ tự nguồn xác định khoa/bộ môn (chủ dự án chốt ngày 2026-11-22, DECISIONS D19):
- Khoa và bộ môn của học phần lấy theo thứ tự:
  1. **Chỉ định tay từ `api/seed/faculty_overrides.tsv`** (ưu tiên cao nhất, tuyệt đối không ghi đè);
  2. **`Master_data.xlsx` sheet `Data_Course`** (nguồn chính đáng tin cậy nhất từ Phòng Đào tạo/BĐCL; ô nào `#N/A` hoặc trống thì **GIỮ NGUYÊN** giá trị DB hiện tại);
  3. **Đề cương của chính mã đó** (`outline_courses` qua `outline_module_links` hoặc `course_code_norm`);
  4. Nếu không có, **đề cương của bản tương ứng Anh↔Việt** (`counterpart_code`, không bắc cầu);
  5. Nếu không có, **tiền tố mã học phần [B|E][XX]** (`api/seed/prefix_to_faculty.tsv`, chỉ điền chỗ trống, không ghi đè ca mâu thuẫn);
  6. Môn không có nguồn nào: **giữ nguyên giá trị cũ trong DB** (kể cả trống).
- Quy tắc kèm theo:
  - **Bộ môn Ngoại ngữ thuộc Phòng Bảo đảm chất lượng** (khoa = Phòng Bảo đảm chất lượng).
  - Khi Master_data mâu thuẫn với đề cương: **theo Master_data**, đồng thời ghi dòng đó vào `data/processed/module_faculty_conflicts.csv` để chủ dự án xem.
  - Master_data áp dụng cho **khóa 2025 và 2026**.
- **Không suy đoán**: CTĐT, lớp học phần (UIS/portal) không bao giờ ghi đè vào khoa/bộ môn.

Các lệnh liên quan:

1. **Nạp dữ liệu gốc Master_data.xlsx (Brief D4):**
   ```bash
   python -m app.cli import-master-data [--file data/raw/Master_data.xlsx] [--dry-run] [--preview-out data/processed/master_import_preview.csv] [--conflicts-out data/processed/module_faculty_conflicts.csv]
   ```
   Nạp toàn bộ 2971 môn học, khoa/bộ môn, tên tiếng Anh, giảng viên phụ trách, hình thức đánh giá (quá trình, giữa kỳ, cuối kỳ, nâng cao, loại thi, thời lượng thi), link đề cương Drive và tài liệu giáo trình.

2. **Rà soát độc lập (không sửa database):**
   ```bash
   python -m app.cli audit-faculty [--out data/processed/module_faculty_audit.csv] [--rebuild-prefix-table] [--conflicts-out data/processed/module_faculty_prefix_conflicts.csv]
   ```
   Xuất file CSV báo cáo rà soát gồm 14 cột:
   `code, name, faculty_hiện_tại, department_hiện_tại, faculty_gốc_đề_cương, faculty_chuẩn, faculty_theo_đề_cương, department_theo_đề_cương, có_đề_cương, nguồn, needs_review, kết_luận, lý do, vấn_đề`
   và in tóm tắt số liệu.

3. **Chạy thử nghiệm (dry-run, không sửa database):**
   ```bash
   python -m app.cli fix-module-faculty --dry-run [--out data/processed/module_faculty_audit.csv] [--rebuild-prefix-table] [--conflicts-out data/processed/module_faculty_prefix_conflicts.csv]
   ```

4. **Áp dụng cập nhật database thật:**
   ```bash
   python -m app.cli fix-module-faculty [--out data/processed/module_faculty_audit.csv] [--rebuild-prefix-table] [--conflicts-out data/processed/module_faculty_prefix_conflicts.csv]
   # Hoặc:
   python -m app.cli fill-faculties
   ```

3. **Nạp Chương trình Đào tạo từ File Excel/PDF/Word (Brief D3):**
   ```bash
   # Chạy thử nghiệm xem trước (không sửa DB):
   python -m app.cli import-ctdt-files --dry-run [--dir data/raw/ctdt_pdf] [--bdcl-dir data/raw/ctdt_bdcl] [--excel-2023-dir data/outlines_master/ctdt2023_excel] [--preview-out data/processed/ctdt_import_preview.csv] [--vs-db-out data/processed/ctdt2023_vs_db.csv] [--only <pattern>]

   # Áp dụng nạp dữ liệu thật vào DB:
   python -m app.cli import-ctdt-files [--dir data/raw/ctdt_pdf] [--bdcl-dir data/raw/ctdt_bdcl] [--excel-2023-dir data/outlines_master/ctdt2023_excel]
   ```
   Quy tắc áp dụng:
   - **Quy tắc khóa:** CTĐT năm Y áp dụng 2 khóa liên tiếp: 2023 -> K23 và K24; 2025 -> K25 và K26.
   - **Ngoại lệ K23 tiếng Việt:** Không tạo từ Excel 2023 (để X2 sao chép từ K24), chỉ xuất báo cáo đối chiếu chênh lệch `ctdt2023_vs_db.csv`; hệ tiếng Anh (E), Coop (H), Tài năng (T/TE) của K23 vẫn nạp bình thường.
   - **Nguồn chuẩn:** 8-9 Excel BĐCL K25-K26 và 17 Excel CTĐT 2023 từ Drive khoa ưu tiên hơn PDF. Khuôn MyUEL 7 cột trong `DH_Luat.xlsx`/`THS_KinhTeDoiNgoai.xlsx` là nguồn chính cho Kinh tế đối ngoại; sửa lỗi gõ `BRE4038` -> `BRB4038` ở sheet 1.
   - **Quy tắc đếm học kỳ:** 3 học kỳ/năm, 10 học kỳ/4 năm liên tiếp (hàm `semester_id_for`); tự động điền `suggested_semester` cho các CTĐT 2025 còn trống trong DB; môn không gắn kỳ để trống.
   - **Bảo toàn khoa/bộ môn:** Tuyệt đối không ghi đè khoa/bộ môn của học phần (Quy tắc B6 & D19).

### 2. Các lệnh nạp và xử lý dữ liệu khác

- `python -m app.cli import-ctdt <path>`: Nạp chương trình đào tạo JSON.
- `python -m app.cli import-uis-classes <path>`: Nạp lớp học phần từ Excel UIS.
- `python -m app.cli import-classes <path>`: Nạp lớp học phần từ JSON DKHP.
- `python -m app.cli import-outlines --data-dir <path>`: Nạp danh mục đề cương CTĐT 2025.
- `python -m app.cli parse-outlines`: Phân tích PDF đề cương sang dữ liệu có cấu trúc.
- `python -m app.cli fill-descriptions`: Điền mô tả học phần song ngữ từ đề cương.
- `python -m app.cli fill-english-names`: Điền `name_en` cho học phần.
- `python -m app.cli classify-languages`: Phân loại ngôn ngữ môn học (Anh/Việt).
- `python -m app.cli seed`: Nạp dữ liệu ban đầu.

### 3. Quản trị Tài khoản Quản trị viên (Brief A0)

- **Tạo tài khoản quản trị ban đầu:**
  ```bash
  # Cách 1: Qua biến môi trường (khuyên dùng trong script)
  ADMIN_BOOTSTRAP_PASSWORD="MatKhauAnToanCuaBan123!" python -m app.cli create-admin --email admin@uel.edu.vn --role admin

  # Cách 2: Nhập tương tác ẩn màn hình qua getpass
  python -m app.cli create-admin --email admin@uel.edu.vn --role admin
  ```
  *(Các vai trò hỗ trợ: `admin`, `moderator`, `data_editor`)*

- **Đặt lại mật khẩu quản trị viên:**
  ```bash
  python -m app.cli reset-admin-password --email admin@uel.edu.vn
  ```
  Lệnh sẽ sinh mật khẩu tạm thời 16 ký tự cryptographically secure, in ra màn hình **MỘT LẦN DUY NHẤT**, cập nhật CSDL và thu hồi mọi phiên làm việc trước đó của người dùng. Mật khẩu không bao giờ được ghi vào file nào.

### 4. Nạp Chương trình Đào tạo Thạc sĩ (Brief D6)

```bash
# Chạy thử nghiệm xem trước (không sửa DB, xuất ths_import_preview.csv):
python -m app.cli import-ths --dry-run [--bdcl-dir data/raw/ctdt_bdcl] [--preview-out data/processed/ths_import_preview.csv]

# Áp dụng nạp thật vào DB:
python -m app.cli import-ths [--bdcl-dir data/raw/ctdt_bdcl]
```
Quy tắc áp dụng:
- Nguồn: 10 workbook BĐCL (`THS_*.xlsx`). Tự động bỏ qua file trùng lặp (`*_copy*.xlsx`), sheet dữ liệu tổng (`Data`), sheet tiến sĩ (`Kế toán (TS)`), và các sheet đại học nằm lẫn.
- Bậc đào tạo: Gắn `degree='thac_si'` cho các CTĐT và môn học mới nạp từ 10 file này.
- Phân biệt nhánh: Tạo 2 CTĐT riêng biệt cho 2 nhánh: NC (nghiên cứu / nâng cao) và UD (ứng dụng), quy ước mã `M{major_code}{branch}` (vd: `M601NC`, `M601UD`, `M602`, `M605`...).
- Khóa áp dụng: Gán tạm `2025-2026` (chưa xác nhận chính thức từ nhà trường).
- Giữ nguyên các môn có sẵn trong DB (không đặt lại degree, không xóa).
- `suggested_semester` để trống (file không có cột học kỳ).
- Nạp đầy đủ thông tin đánh giá (tỉ lệ, hình thức, loại thi, thời lượng thi) và giáo trình chính.


Mọi luồng nạp dữ liệu trên (`import-*`, `seed`, `parse-outlines`) đều tự động chạy `apply_outline_faculties` ở bước cuối cùng để đảm bảo tính nhất quán dữ liệu.
