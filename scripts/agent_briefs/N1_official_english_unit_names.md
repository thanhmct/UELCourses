# Brief — Chuẩn hóa tên tiếng Anh của phòng ban/khoa/viện theo nguồn chính thức của UEL (N1)

Quy tắc cứng: `data/` không commit; không in khóa; commit theo CLAUDE.md (`loại: …`, không tiền tố AI). Bạn không có Docker: sửa mã/seed/test; Claude kiểm DB sau.

## Nguồn chính thức
Trang tiếng Anh https://uel.edu.vn/en/units (bản lưu `data/processed/uel_en_units.html`) và trang tiếng Việt https://uel.edu.vn/cac-don-vi. DB lưu tên **tiếng Việt chuẩn** (`modules.faculty/department`), tên Anh hiển thị lấy từ ánh xạ seed/mã — nên việc là sửa ánh xạ đó cho khớp nguồn chính thức.

## Bảng chuẩn (VI → EN chính thức)
Đơn vị quản lý:
- Phòng Hành chính → Department of Administration
- Phòng Nhân sự → Department of Human Resources
- Phòng Bảo đảm chất lượng → Department of Quality Assurance
- Phòng Tuyển sinh và Công tác sinh viên (trang VI viết "Tuyển sinh & Công tác sinh viên") → Department of Admissions and Student Affairs
- Phòng Đào tạo → **Department of Academic Affairs** (hiện đang là "Academic Affairs Office")
- Phòng Khoa học và Công nghệ → Department of Science and Technology
- Phòng Hợp tác phát triển → Department of Cooperation and Development
- Phòng Quản trị tài sản → Department of Asset Management
- Phòng Tài chính → Department of Finance
- Phòng Công nghệ thông tin → Department of Information Technology
- Phòng Truyền thông → Department of Communication
- Phòng Pháp chế → Department of Legal Affairs
Đơn vị đào tạo:
- Khoa Kinh tế → Faculty of Economics; Khoa Kinh tế đối ngoại → Faculty of International Economic Relations; Khoa Tài chính - Ngân hàng → Faculty of Finance and Banking; Khoa Kế toán - Kiểm toán → Faculty of Accounting and Auditing; Khoa Hệ thống thông tin → Faculty of Information Systems; Khoa Quản trị kinh doanh → Faculty of Business Administration; Khoa Luật → Faculty of Law
- Khoa Luật Kinh tế → **Faculty of Economic Law** (hiện "Faculty of Business Law")
- Khoa Toán kinh tế → **Faculty of Economic Mathematics** (hiện "Faculty of Mathematical Economics")
- Viện Quốc tế UEL → **The International Institute of UEL** (hiện "UEL International Institute")
Khác: Thư viện → Library; Viện Nghiên cứu phát triển công nghệ ngân hàng ĐHQG-HCM → Institute for Development and Research in Banking Technology VNUHCM; Viện Pháp luật Quốc tế và so sánh → Institute of International and Comparative Law; Công ty TNHH MTV Kinh tế – Luật → Economics and Law Co., Ltd; Công đoàn → Trade Union; Đoàn Thanh niên - Hội Sinh viên → Youth Union (hoặc "Youth Union – Student Association" nếu đã dùng chỗ khác — giữ nhất quán, ghi chú nguồn).
KHÔNG có trong nguồn chính thức (giữ nguyên, nhưng báo cáo): "Bộ môn …" (Department of Finance… cho bộ môn — chú ý trùng chữ "Department of Finance" với Phòng Tài chính: cần phân biệt tên bộ môn vs phòng khi hiển thị, vd. bộ môn dùng "Department of …" như hiện tại là OK nếu nguồn của khoa dùng vậy; không đổi), "Trung tâm Ngoại ngữ - Tin học", "Trường Đại học Kinh tế - Luật" (University of Economics and Law).

## Việc cần làm
1. `api/seed/faculty_canonical.tsv`: sửa 4 dòng nêu trên (cột `faculty_en`) và thêm toàn bộ phòng/đơn vị còn thiếu (cột `faculty_vi`, `faculty_en`, `aliases` gồm biến thể VI/EN cũ: "Academic Affairs Office", "Quality Assurance Office", "Faculty of Business Law"… để đầu vào cũ vẫn nhận ra).
2. `api/seed/faculty_names_en.tsv` và hằng số trong `api/app/services/faculty_names.py` (các từ điển EN↔VI, hàm chuẩn hóa/`CANONICAL`, docstring ví dụ "Phòng Đào tạo → Academic Affairs Office" → tên mới): đổi tên EN chuẩn sang tên mới; GIỮ tên cũ làm alias đầu vào để đọc được đề cương tiếng Anh cũ ("ECONOMIC LAW", "ECONOMIC MATHEMATICS" vẫn ánh xạ về Khoa Luật Kinh tế / Khoa Toán kinh tế).
3. Web: `web/src/i18n/names.ts` (+ `en.ts`, `faculty_canonical` nếu có bản TSV/JSON ở web) và test `web/src/i18n/__tests__/names.test.ts`: cùng bảng chuẩn; trang EN không còn hiện tên cũ.
4. Quét toàn repo (api, web, seed, docs ví dụ) tìm tên EN cũ ("Academic Affairs Office", "Faculty of Business Law", "Faculty of Mathematical Economics", "UEL International Institute", "Quality Assurance Office") và thay đúng chỗ hiển thị; không sửa văn bản đề cương gốc, bản sao quy chế, hay dữ liệu `outline_*` (văn bản nguồn).
5. Test: Python (`tests/test_facets.py`, `test_b3_brief.py`, `test_fix_module_faculty.py`, `test_ctdt_files_import.py`, `test_api_core.py` …) và `web` Vitest + `tsc`; thêm test khẳng định từng cặp VI→EN trong bảng chuẩn (cả 12 phòng + 10 đơn vị đào tạo).
6. Báo cáo `data/processed/unit_names_en_audit.md`: bảng cũ → mới, mục nào đã đổi/thêm, mục nào không có trong nguồn chính thức, và chuỗi EN còn xuất hiện trong DB/mã mà bạn không đổi (kèm lý do).

## Báo lại
Danh sách thay đổi, kết quả test (số ca qua), và lệnh để Claude kiểm DB/endpoint (ví dụ `/api/facets` hoặc endpoint trả tên EN) sau khi khởi động lại API.
