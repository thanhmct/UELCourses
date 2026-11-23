# Brief D6 — Thêm bậc đào tạo và nạp chương trình THẠC SĨ

Chạy **SAU D3** (D3 nạp CTĐT đại học). Không chạy lệnh shell (chủ dự án chạy), không commit. Chủ dự án chạy pytest + `alembic check` + `npx tsc --noEmit` + `npx vitest run`.

Chủ dự án đã chốt: **nạp chương trình thạc sĩ vào database**. Chưa có tiến sĩ (chưa có file), nhưng thiết kế phải mở sẵn cho bậc đó.

## Nguồn
`data/raw/ctdt_bdcl/THS_*.xlsx` — **10 workbook** (đủ các khoa, gồm cả Quản trị kinh doanh). Danh sách sheet liệt kê sẵn ở `data/raw/ctdt_bdcl/SHEETS_THS.md`.

**Chỉ lấy sheet thạc sĩ**: sheet có chữ `THẠC SĨ` trong dòng `NGÀNH: … - CHƯƠNG TRÌNH: …`. Mã ngành thạc sĩ: 601, 602, 603, 604, 607, 609, 610, 611, 614 (Công nghệ tài chính), 618, 619, 657. Mỗi ngành có thể có hai nhánh: **NC = nghiên cứu**, **UD = ứng dụng** — là hai chương trình riêng.

**Bỏ qua**: sheet `Data`/dữ liệu tổng, sheet `Kế toán (TS)` (tiến sĩ, chưa đủ dữ liệu), và các sheet **đại học nằm lẫn** trong `THS_KeToanKiemToan.xlsx` và `THS_KinhTeDoiNgoai.xlsx` (D3 đã dùng chúng cho bậc đại học, đừng nạp lại thành thạc sĩ).

**Cấu trúc sheet**: dòng 8–9 là tiêu đề (`TT`, `Mã học phần`, `Tên học phần`, `Số tín chỉ`, Quá trình/Giữa kỳ/Cuối kỳ mỗi nhóm gồm tỉ lệ + hình thức, `Thi`, `Thời lượng thi`, `Tài liệu chính`, `Mã tài liệu`, `Ghi chú`); dữ liệu từ dòng 10. **Không có cột học kỳ.** Ô chữ có thể chứa `\xa0`, phải `strip()`; `Số tín chỉ` ở dạng chuỗi `'3.00'`.

## Yêu cầu

### 1. Trường bậc đào tạo (migration Alembic)
- Thêm `programs.degree` với giá trị `'dai_hoc'` | `'thac_si'` | `'tien_si'`, **mặc định `'dai_hoc'`**, NOT NULL. Mọi chương trình đang có trong DB giữ `'dai_hoc'`.
- Thêm `modules.degree` tương tự (mặc định `'dai_hoc'`) để lọc danh sách học phần theo bậc.
- Migration phải đi cả hai chiều (upgrade/downgrade) và `alembic check` sạch sau khi chạy.

### 2. Nạp dữ liệu
Mở rộng lệnh CLI của D3 hoặc thêm `python -m app.cli import-ths [--dry-run]`:
- Mỗi sheet thạc sĩ → một chương trình, `degree='thac_si'`, tên gồm ngành + nhánh (NC hoặc UD). Mã chương trình: theo quy ước hiện có nhưng phải phân biệt được hai nhánh (ví dụ hậu tố `NC`/`UD`); nêu rõ quy ước đã chọn trong báo cáo.
- **Nạp TẤT CẢ môn mã M** (`MEE`, `MRB`, `MUU`, `MFF`, `MIE`…) vào bảng `modules` với `degree='thac_si'`, theo quy tắc chung "nạp hết môn, lọc ở tầng truy vấn".
- Lấy luôn tỉ lệ điểm, hình thức đánh giá, loại thi, thời lượng thi, tài liệu chính như D4 làm cho đại học.
- `suggested_semester` **để trống** (file không có cột học kỳ) — không đoán.
- Idempotent; `--dry-run` chỉ xuất `data/processed/ths_import_preview.csv`.

### 3. Khóa áp dụng
File không ghi khóa ở đầu sheet. **Không đoán.** Gắn tạm khóa hiện hành **2025–2026** (các sheet đại học cùng workbook có dòng `KHÓA 2025, 2026`), và ghi chú trong dữ liệu + báo cáo rằng khóa của thạc sĩ chưa được xác nhận.

### 4. Giao diện — mặc định vẫn là đại học
Thạc sĩ **không được lẫn** vào trải nghiệm hiện tại:
- API `GET /api/programs`, `GET /api/modules` và endpoint facets nhận tham số `degree`, **mặc định `dai_hoc`** khi không truyền. Mọi trang đang có (Chương trình đào tạo, Kế hoạch, Học phần, Thời khóa biểu, Tương đương, hộp thoại chọn CTĐT) giữ nguyên hành vi, chỉ thấy đại học.
- Thêm bộ chọn bậc ở trang Chương trình đào tạo (chip hoặc tab: "Đại học" / "Thạc sĩ"), mặc định Đại học. Chỉ khi người dùng chọn Thạc sĩ mới hiện chương trình và học phần bậc đó.
- Hộp thoại chọn CTĐT của người dùng vẫn chỉ nhận mã lớp đại học.
- i18n vi/en cho nhãn bậc.

### 5. KHÔNG đụng tới 218 mã môn M/P đang có sẵn
Trong DB có ~218 mã không có trong `Master_data.xlsx`, phần lớn tiền tố **M** và **P**, lọt vào từ dữ liệu lớp học phần. **Chủ dự án yêu cầu để nguyên nhóm này**: không đặt lại `degree`, không gắn nhãn, không xóa, không xuất danh sách.

Chỉ các môn **mới nạp từ 10 workbook thạc sĩ** mới được đặt `degree='thac_si'`. Nếu một mã trong nhóm 218 trùng với môn thạc sĩ vừa nạp thì việc nạp đó cập nhật bản ghi như bình thường (đó là nạp dữ liệu, không phải dọn dẹp); ngoài ra không rà soát gì thêm.

### 6. Test
pytest: migration lên/xuống sạch; đọc sheet thạc sĩ đúng (bỏ `\xa0`, `'3.00'` → 3); bỏ đúng sheet `Data`, `Kế toán (TS)` và sheet đại học lẫn trong file THS; nhánh NC và UD thành hai chương trình; `/api/programs` không có `degree` → chỉ trả đại học; truyền `degree=thac_si` → chỉ trả thạc sĩ; idempotent.
Vitest: trang Chương trình mặc định hiện đại học; chọn Thạc sĩ thì danh sách đổi; hộp thoại chọn CTĐT không hiện chương trình thạc sĩ.

### 7. Tài liệu
`docs/DECISIONS.md`: quyết định thêm bậc đào tạo, quy ước mã chương trình NC/UD, và việc khóa của thạc sĩ là tạm. Cập nhật `ARCHITECTURE.md` phần hợp đồng API (tham số `degree`).

Báo cáo cuối: số chương trình và số môn thạc sĩ đã nạp theo từng khoa, quy ước mã đã chọn, và danh sách mã chưa rõ bậc.

## Quy tắc ghi HANDOFF (thêm 2026-11-23): khi cập nhật docs/HANDOFF.md chỉ THÊM một dòng ngắn vào đúng mục (Đang làm dở / Việc tiếp theo / Chờ chủ dự án); KHÔNG dán lại khối lịch sử dài (lịch sử nằm ở docs/handoff/HISTORY.md). Đọc lại file hiện tại trước khi sửa.
