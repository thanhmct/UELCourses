# Brief B3 — Dữ liệu tiếng Anh, môn bắt buộc, nhóm tự chọn (backend)

Đọc `AGENTS.md`, `ARCHITECTURE.md`, `docs/DATABASE.md`. Chỉ sửa trong `api/` (routers/modules.py, schemas.py, services/descriptions.py, services/…, `api/seed/` nếu cần, tests) — KHÔNG sửa `web/`. Không commit. Không chạy migration/nạp dữ liệu (chỉ viết code + test; chạy test bằng `cd api; python -m pytest -q --ignore=tests/rag`).

Bối cảnh: DB là PostgreSQL; test dùng SQLite tạm. Ví dụ lỗi: môn `EFF4017` "Khai thác dữ liệu trong tài chính (Data mining) (E)" hiển thị "Chưa rõ khoa" dù đề cương ghi "FACULTY OF FINANCE AND BANKING / DEPARTMENT OF FINANCE".

Yêu cầu:
1. **Khoa/bộ môn tiếng Anh → ánh xạ sang tên khoa tiếng Việt** khi `modules.faculty` rỗng/không khớp: từ `outline_courses.faculty/department` (bản EN, ví dụ "FACULTY OF FINANCE AND BANKING") và từ bản Việt đối ứng (`language_pairs`/mã VI↔EN). Viết bảng ánh xạ EN→VI cho các khoa của UEL (tài liệu hóa trong `api/seed/faculty_names_en.tsv`: cột en, vi) và hàm `faculty_vi(en)` trong `services/`; dùng khi điền `modules.faculty/department` (hàm điền chạy trong `fill-descriptions`/importer hiện có — chọn chỗ hợp lý, idempotent). Trả thêm `faculty_en` trong `ModuleDetail`/`ModuleSummary` nếu chưa có.
2. **Mô tả theo ngôn ngữ đề cương:** với đề cương tiếng Anh (`outline_courses.doc_type='syllabus_en'`), mô tả học phần phải vào `modules.description_en` (không vào `description` tiếng Việt). Kiểm tra `services/descriptions.py` và sửa nếu đang ghi sai cột; thêm test.
3. **Ô "bắt buộc":** `ModuleDetail` trả thêm `required_in_programs: [{program_id, required: bool}]` (từ `program_modules`) và `is_required_any: bool`; có tham số tùy chọn `program_id` trên `GET /api/modules/{code}` để trả `required` của CTĐT đó.
4. **Nhóm môn tự chọn:** tìm trong DB (bảng `program_modules`, trường `block`, `note`, và `program_catalog_entries.required_raw`/`original`) quy định "phải hoàn thành N tín chỉ trong nhóm"; thêm hàm/endpoint `GET /api/programs/{id}/elective-groups` trả `[{block, required_credits, available_credits, modules[]}]` (suy từ `ProgramBlock.required_credits` nếu có). Nếu không có dữ liệu trong DB thì trả mảng rỗng và ghi rõ trong docstring chỗ nào thiếu — không bịa số.
5. Mỗi thay đổi có test pytest; không sửa test cho "xanh" nếu hành vi sai.

Tiêu chí xong: toàn bộ `python -m pytest -q --ignore=tests/rag` qua (hiện 262 test).
