# Brief C1 — Lịch năm học 2026-2027: dữ liệu + API (backend)

Đọc `AGENTS.md`, `docs/DATABASE.md`, `docs/DECISIONS.md` (D3 quy ước khóa K23=2023; D14 HK3 là học kỳ chính thức). Chỉ sửa/tạo trong `api/` (models.py, migration MỚI `api/migrations/versions/0016_academic_events.py` với `down_revision='0015'`, schemas.py, routers/calendar.py MỚI + đăng ký trong main.py, services/academic_calendar.py MỚI, seed `api/seed/academic_calendar_2026_2027.json` MỚI, cli.py, tests). KHÔNG sửa `web/`. Không commit. Không chạy migration hay nạp dữ liệu (chỉ viết code + test; chạy `cd api; python -m pytest -q --ignore=tests/rag`).

Nguồn: `data/references/calendar/ke_hoach_dao_tao_2026_2027.txt` (văn bản đã trích từ Thông báo 223/TB-ĐHKTL-ĐT ngày 29/7/2026; PDF gốc cùng thư mục). Đọc KỸ cả file (4 phần đầu là lịch học/thi/nghỉ; phần 2–6 là chứng chỉ ngoại ngữ, xét tốt nghiệp, xét học vụ, đăng ký CTĐT thứ hai, đăng ký học phần). Bảng trong PDF bị trích lệch cột — đối chiếu bằng suy luận từ chính văn bản, KHÔNG bịa ngày; mục nào mơ hồ thì ghi `note` và đánh `verified: false`.

## Mô hình
Bảng `academic_events`: `id` (int tự tăng), `academic_year` (vd "2026-2027"), `kind` (chuỗi ≤32), `title` (≤512), `start_date` (date), `end_date` (date, NULL nếu một ngày), `semester_id` (vd "2026-2027-1", nullable, FK mềm tới `semesters.id` — không ép khóa ngoại), `cohorts` (JSON: danh sách "K23","K24",… hoặc ["all"]), `note` (Text), `verified` (bool), `source` (≤128, mặc định "TB 223/TB-ĐHKTL-ĐT"). Chỉ mục: (`academic_year`,`start_date`), `kind`.
`kind` gồm: `teaching` (đợt học), `makeup_day` (ngày học bù), `reserve_week` (tuần dự trữ), `midterm_exam`, `final_exam`, `holiday` (nghỉ lễ/Tết/UEL's Day…), `online_study` (học trực tuyến LMS), `defense_week_internship`/`thesis` (thực tập, KLTN, HPCĐCK), `defense_training` (GDQP nội trú K26), `registration` (đăng ký học phần), `registration_adjust`, `second_program`, `language_cert`, `graduation_review`, `academic_review`, `ceremony`.

## Dữ liệu seed (JSON, mảng đối tượng đúng các cột trên)
Lập đầy đủ: mọi đợt học/thi giữa kỳ/thi cuối kỳ cho K23 và K24–K26 (HK1 K26 bắt đầu 24/08/2026; K24–K25 từ 03/09/2026; HK2: K23 14/12/2026–14/03/2027; K24–26 14/12/2026–20/02/2027… theo bảng), từng ngày nghỉ và ngày học bù tương ứng (Quốc khánh 31/8–2/9 bù 9,10,11/11; UEL's Day 6/11 bù 12/11; 24/11; Tết Dương lịch 1/1 bù 8/3; Tết Âm lịch 1–14/2/2027; Giỗ Tổ 16/4 bù 24/6; 30/4 bù 25/6; 1/5 và 3/5 bù 22,23/6), HK3 các khóa, GDQP K26 (29/3–17/4/2027), các đợt nộp chứng chỉ ngoại ngữ (5 đợt), 4 đợt xét tốt nghiệp (từng bước + lễ), 3 kỳ xét học vụ, đăng ký CTĐT thứ hai, đăng ký học phần và điều chỉnh. Mỗi sự kiện có `cohorts` đúng khóa áp dụng.

## Code
- `services/academic_calendar.py`: `load_seed()`, `import_academic_calendar(db, path=None)` idempotent (xóa/ghi lại theo `academic_year` + `source`; dùng `ImportContext`/`log_run` nếu phù hợp với `import_runs`), hàm `phase_for(db, d: date, cohort: str|None)` trả `{semester_id, phase: teaching|exam|break|holiday|reserve|none, week_no, weeks_total, events[]}` (tuần học thứ mấy của đợt học khớp ngày `d`).
- CLI: `python -m app.cli import-academic-calendar [--file ...]`.
- API (router `calendar`, prefix /api): `GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&cohort=K24&kind=` → danh sách sự kiện giao với khoảng; `GET /calendar/today?cohort=&date=` → kết quả `phase_for` (mặc định ngày hôm nay giờ VN, UTC+7).
- Test pytest (SQLite tạm): nạp seed, kiểm tra đúng ngày các mốc chính (vd HK1 K26 24/08/2026–19/11/2026; Tết 01–14/02/2027; bù 12/11/2026), `phase_for` ở vài ngày (ngày nghỉ lễ, tuần thi, tuần học thứ 3), lọc theo khóa, idempotent chạy 2 lần.

Tiêu chí xong: toàn bộ `python -m pytest -q --ignore=tests/rag` qua (hiện 262 test) + test mới; cuối báo cáo liệt kê mọi sự kiện `verified:false` kèm lý do, và đúng lệnh Claude cần chạy (`alembic upgrade head`, `python -m app.cli import-academic-calendar`).
