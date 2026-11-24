# Brief B6b (bản 2, thay bản cũ) — Khoa/bộ môn CHỈ lấy từ đề cương; không có thì "Phòng Đào tạo"

Không chạy lệnh shell (chủ dự án chạy). Chỉ sửa/thêm code + test + tài liệu. Không commit. Đọc kết quả B6 đã làm (lệnh `python -m app.cli fix-module-faculty [--dry-run]`, `audit_module_faculties`, `api/app/services/faculty_names.py`, `api/app/cli.py`) và SỬA cho đúng quy tắc mới dưới đây (bỏ mọi suy đoán).

## QUY TẮC CỦA CHỦ DỰ ÁN (ưu tiên cao nhất, thay mọi quy tắc suy luận trước đó)
**Không suy đoán.** Khoa và bộ môn của một học phần phải dựa vào **nguồn cụ thể: đề cương môn học** (bảng `outline_courses`/tài liệu đề cương đã parse; đầu trang đề cương ghi "FACULTY OF … / … DEPARTMENT", ánh xạ qua `faculty_vi`/`department_vi`). Học phần **không có đề cương** (hoặc đề cương không ghi khoa) thì khoa là **"Phòng Đào tạo"** (tên VI chuẩn "Phòng Đào tạo", EN "Department of Academic Affairs" — đã có trong từ điển `STATIC_FACULTY_VI_TO_EN`), bộ môn để trống (NULL).
- BỎ: suy khoa từ bộ môn (đa số), từ tiền tố mã, từ bản tương ứng Anh↔Việt, từ CTĐT, từ lớp học phần. Không có bảng `department_to_faculty.tsv`. Nếu B6 đã thêm các bước đó, gỡ chúng. Khoa/bộ môn từ CTĐT/lớp học phần/nạp Excel KHÔNG được ghi vào `modules.faculty`/`department` (chỉ đề cương mới ghi).
- Ví dụ đã biết: EFF2045 — đề cương ghi Faculty of Finance and Banking / Finance Department → "Khoa Tài chính - Ngân hàng" / "Bộ môn Tài chính". "Kỹ năng lãnh đạo" BBB1068/EBB1068 hiện sai khoa (TCNH/HTTT) và KHÔNG có đề cương → thành "Phòng Đào tạo".
- Một môn có nhiều đề cương mâu thuẫn nhau (khác khoa): ưu tiên đề cương của đúng mã học phần (`course_code_norm` khớp, bản mới nhất/`ok`); nếu vẫn mâu thuẫn thì đánh dấu "cần duyệt" trong báo cáo và để nguyên giá trị đề cương của bản ưu tiên.
- Tên khoa/bộ môn trong đề cương chưa ánh xạ được sang tên VI chuẩn: giữ nguyên chuỗi gốc đã dịch tốt nhất có thể (không bỏ trống), ghi vào báo cáo để bổ sung từ điển `api/seed/faculty_names_en.tsv`.

## Yêu cầu
1. Hàm áp dụng thuần + idempotent `apply_outline_faculties(db)`: với mọi học phần, đặt `faculty`/`department` từ đề cương theo quy tắc trên; môn không có đề cương → faculty = "Phòng Đào tạo", department = NULL. Cập nhật `search_text`.
2. Script kiểm tra độc lập `python -m app.cli audit-faculty`: không sửa DB; xuất `data/processed/module_faculty_audit.csv` (code, name, faculty_hiện_tại, department_hiện_tại, faculty_theo_đề_cương, department_theo_đề_cương, có_đề_cương, kết_luận, vấn_đề) và tóm tắt: tổng môn; số môn có đề cương; số môn → "Phòng Đào tạo"; số môn sẽ bị đổi; số môn đề cương mâu thuẫn; danh sách tên khoa/bộ môn trong đề cương chưa ánh xạ được; số học phần theo khoa (soi bộ lọc). Lệnh `fix-module-faculty [--dry-run]` gọi cùng logic (dry-run chỉ xuất báo cáo).
3. Đảm bảo luồng nạp lại dữ liệu (importer, `ctdt_import`, nạp lớp học phần, parse đề cương) sau cùng gọi `apply_outline_faculties`, không để nguồn khác ghi đè (sửa `importer.py` `module()` không đặt faculty/department từ CTĐT/lớp; hoặc chuẩn hóa lại ở bước cuối).
4. Giao diện: facet "Khoa" ở API (`/api/modules/facets`) phải hiện "Phòng Đào tạo" như một khoa bình thường; EN "Department of Academic Affairs". Kiểm tra `faculty_en` cho giá trị này.
5. Test pytest: EFF2045-like (đề cương TCNH → Khoa Tài chính - Ngân hàng dù CTĐT ghi HTTT); môn không có đề cương (BBB1068-like) → "Phòng Đào tạo" + department NULL; import CTĐT/lớp không ghi đè khoa; đề cương mâu thuẫn → đánh dấu; idempotent; CSV đúng cột.
6. Ghi quyết định vào `docs/DECISIONS.md` (thay mục B6 cũ về thứ tự ưu tiên) và README `api/` nếu có mục CLI.

Báo cáo cuối: nêu chính xác lệnh để chủ dự án chạy (audit → fix --dry-run → fix thật) và những gì đã gỡ khỏi B6.
