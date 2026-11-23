# Brief B6 — Học phần E hiện sai khoa (vd EFF2045 "Quản trị tài chính (E)" ra "Khoa Hệ thống thông tin")

Không chạy lệnh shell (chủ dự án sẽ chạy nạp lại và kiểm). Chỉ sửa code + test trong `api/` và tài liệu. Không commit.

## Chẩn đoán đã có
- DB: `modules.faculty` của EFF2045 = "Khoa Hệ thống thông tin", `department` = "Bộ môn Tài chính", bản tương ứng BFF2045 có `faculty` = "Khoa Tài chính - Ngân hàng" (đúng).
- Toàn DB: 53/307 học phần mã E có khoa KHÁC khoa của bản tương ứng (counterpart); 55 môn E đang mang "Khoa Hệ thống thông tin" dù bộ môn là Tài chính/Marketing/Kế toán…
- EFF2045 chỉ nằm trong các CTĐT K25405-V3/K26405-V3 (Kế toán DLG, khoa Kế toán–Kiểm toán) và K25411-V2/K26411-V2 (Thương mại điện tử, **Khoa HTTT**). Nghi ngờ: cột `Khoa` trong dữ liệu CTĐT (`api/app/services/ctdt_import.py` dòng ~138-139, `faculty=get_ci(r, "Khoa")` → `ImportContext.module(...)` ở `api/app/services/importer.py` ~232-246) là **khoa quản lý chương trình**, không phải khoa sở hữu học phần, nên chương trình nào nạp sau ghi đè khoa của môn.

## BỔ SUNG QUAN TRỌNG (chủ dự án xác nhận bằng đề cương gốc)
Đề cương PDF của EFF2045 ghi đầu trang "FACULTY OF FINANCE AND BANKING / FINANCE DEPARTMENT" → khoa đúng là **Khoa Tài chính - Ngân hàng**, bộ môn **Bộ môn Tài chính**. Vậy **đề cương (bảng `outline_courses`/`outline_docs`, cột faculty/department đã parse, ánh xạ qua `faculty_vi`/`department_vi`) là nguồn đáng tin NHẤT**, cao hơn CTĐT, cao hơn lớp học phần. Thứ tự ưu tiên mới: đề cương > bản tương ứng Anh↔Việt > bộ môn→khoa > lớp học phần > CTĐT. Đề cương GHI ĐÈ khoa/bộ môn sai đang có (không chỉ điền chỗ trống như bước 1 hiện tại ở `faculty_names.py` ~dòng 297-327).

## Yêu cầu RÀ SOÁT TOÀN BỘ (không chỉ môn E)
Áp dụng cho TẤT CẢ học phần, không chỉ mã E. Viết hàm audit thuần (ví dụ `audit_module_faculties(db) -> list[dict]`) trả danh sách từng học phần bị đổi: `code, name, faculty_cũ, faculty_mới, department_cũ, department_mới, nguồn quyết định`; thêm lệnh CLI `python -m app.cli fix-module-faculty [--dry-run]` (dry-run chỉ in/ghi báo cáo CSV vào `data/processed/module_faculty_audit.csv`, không sửa DB; chạy thật thì sửa và ghi cùng báo cáo). Báo cáo cuối nêu lệnh chính xác để chủ dự án chạy dry-run trước rồi chạy thật.

## Yêu cầu
1. Xác nhận nguyên nhân (đọc `ctdt_import.py`, `importer.py` `module()`, và dữ liệu mẫu trong `data/raw/ctdt_programs.json` nếu đọc được: cột `Khoa` ở mỗi dòng môn là gì). Ghi kết luận ngắn vào `docs/DECISIONS.md` (mục mới).
2. Sửa nguồn: khi nạp CTĐT, KHÔNG để `Khoa` của dòng CTĐT ghi đè khoa đã có của học phần; chỉ dùng nó khi học phần chưa có khoa (và ưu tiên nguồn theo thứ tự: lớp học phần/đề cương > bản tương ứng > bộ môn → khoa > CTĐT).
3. Sửa bước chuẩn hóa trong `api/app/services/faculty_names.py` (hàm làm đầy khoa/bộ môn, quanh dòng 294-343): thêm bước **sửa khoa sai** — với học phần có `counterpart_code` mà khoa khác khoa của bản tương ứng VI (bản VI đáng tin hơn) thì lấy khoa của bản VI; với học phần không có counterpart, dùng ánh xạ bộ môn → khoa (xây từ đa số các học phần cùng bộ môn trong DB, hoặc bảng `api/seed/faculty_names_en.tsv` nếu có cột đó) khi khoa hiện tại mâu thuẫn với bộ môn. Hàm phải idempotent.
4. Thêm lệnh CLI hoặc dùng lệnh chuẩn hóa sẵn có (`python -m app.cli ...` — xem `api/app/cli.py` để biết lệnh đang gọi hàm này) để chủ dự án chạy lại trên DB hiện có; ghi chính xác lệnh vào báo cáo cuối.
5. Test pytest (`api/tests/`): EFF2045-like (E có bộ môn Tài chính, khoa HTTT từ CTĐT, counterpart khoa Tài chính–NH) → sau chuẩn hóa là "Khoa Tài chính - Ngân hàng"; import CTĐT thứ hai không ghi đè khoa; idempotent; môn không counterpart suy khoa từ bộ môn.

Báo cáo cuối: nguyên nhân thật, file đã sửa, lệnh chạy lại.
