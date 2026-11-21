# Brief F4 — Sửa 3 lỗi test còn lại (đã đo bằng cách chạy thật)

Không commit, không chạy shell. Sửa hành vi sai trong mã nếu mã sai; chỉ sửa test khi test sai. KHÔNG nới lỏng assertion cho "xanh".

## 1. `api/tests/test_b3_brief.py::test_faculty_and_department_name_mappings` (dòng 25)
`assert faculty_en("Faculty of Economics") == "Faculty of Economics"` nhận 'Khoa Kinh tế'. File: `api/app/services/faculty_names.py`, hàm `faculty_en`: nhánh "đã là tiếng Anh" (khoảng dòng 200–208) lặp `for orig_en in STATIC_FACULTY_EN_TO_VI` rồi `return STATIC_FACULTY_EN_TO_VI[orig_en]` — đó là giá trị TIẾNG VIỆT. Phải trả chính `orig_en`. Làm tương tự cho `department_en` nếu có cùng lỗi. (Lượt trước bạn chưa sửa được điều này.)

## 2. `api/tests/test_academic_calendar.py::test_phase_for_dates` (dòng ~125)
`phase_for(db, date(2027, 2, 5), cohort="K26")` trả `semester_id == "2026-2027-3"` nhưng đúng phải là `"2026-2027-2"` (Tết Âm lịch 01–14/02/2027 nằm giữa HK2, 14/12/2026–20/02/2027). File: `api/app/services/academic_calendar.py`. Các sự kiện nghỉ lễ trong seed không có `semester_id`; hàm phải suy học kỳ cho ngày nghỉ/dự trữ/thi bằng cách tìm khoảng học kỳ bao quanh ngày đó (đợt `teaching` của cùng khóa có `start_date <= d` gần nhất ở trước và cùng năm học, hoặc khoảng [đầu HK, cuối HK] của khóa) — không chọn học kỳ SAU. Kiểm tra thêm: 25/12/2026 → HK2; 24/11/2026 (Ngày Văn hóa VN) → HK1; ngày giữa HK2 và HK3 (vd 20/3/2027) → quyết định hợp lý và ghi chú trong docstring. Thêm test cho các ngày đó.

## 3. `web/src/app/today/__tests__/TodayPage.test.tsx` — "hiển thị đồng hồ thời gian chạy mỗi giây"
`TestTimeoutError: Test timed out in 5000ms` (dùng fake timers cùng `waitFor`/`findBy…` thường treo vì waitFor không tiến fake timer). Sửa test: với `vi.useFakeTimers()` hãy `await act(async () => { await vi.advanceTimersByTimeAsync(1000); })` rồi kiểm tra bằng `getByLabelText("live-clock")` (không dùng waitFor/findBy chờ thời gian thật); đảm bảo `vi.useRealTimers()` trong afterEach. Kiểm tra giá trị đồng hồ đổi sau 1 giây.

Tiêu chí xong: `cd api; python -m pytest -q --ignore=tests/rag` toàn bộ qua; `cd web; npx tsc --noEmit` sạch và `npx vitest run` toàn bộ qua.
