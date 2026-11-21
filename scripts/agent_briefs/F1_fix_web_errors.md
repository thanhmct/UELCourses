# Brief F1 — Sửa lỗi tsc và test web sau B1/B2

Chỉ sửa: `web/src/lib/planner.ts`, `web/src/app/modules/[code]/page.tsx` (chỉ thêm import còn thiếu), `web/src/app/today/page.tsx`, `web/src/app/today/__tests__/TodayPage.test.tsx`, `web/src/app/today/todayDates.ts`. Không sửa file khác, không commit, không chạy lệnh shell.

Lỗi hiện tại (đo bằng `cd web; npx tsc --noEmit` và `npx vitest run`):
1. `src/app/modules/[code]/page.tsx(30,25): Cannot find name 'useMemo'` → thêm `useMemo` vào import từ "react".
2. `src/lib/planner.ts(177–180): TS2783 'code'/'name'/'credits' is specified more than once, so this usage will be overwritten` → trong object literal có `...spread` đặt SAU các khóa tường minh (hoặc ngược lại) làm ghi đè; sắp xếp lại (spread trước, khóa tường minh sau) hoặc bỏ khóa thừa, sao cho giá trị cuối đúng ý (tên/tín chỉ lấy từ module đầu vào, không bị ghi đè bởi undefined). Đừng đổi hành vi hàm; test `web/src/lib/__tests__/planner.test.ts` phải vẫn qua.
3. Hai test lỗi trong `src/app/today/__tests__/TodayPage.test.tsx`: "hiển thị các tab và các mũi tên chuyển tab bên phải" và "hiển thị đồng hồ thời gian chạy mỗi giây". Chạy từng test để đọc thông báo lỗi thật, tìm nguyên nhân (query sai role/tên, thiếu `act`/fake timers, trang chỉ render sau `mounted`, mock store thiếu…). Sửa **hành vi sai trong trang nếu trang sai**; chỉ sửa test khi test sai. Không xóa/bỏ qua test, không nới lỏng assertion cho "xanh".

Tiêu chí xong: `npx tsc --noEmit` không lỗi; `npx vitest run` toàn bộ qua (hiện 164/166). Báo cáo cuối nêu rõ nguyên nhân từng lỗi và file đã sửa.
