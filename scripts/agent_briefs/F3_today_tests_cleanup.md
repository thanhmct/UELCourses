# Brief F3 — Sửa 2 test trang Hôm nay (nguyên nhân thật: thiếu dọn DOM giữa các test)

Chỉ sửa `web/src/app/today/__tests__/TodayPage.test.tsx`, và `web/src/app/today/page.tsx` chỉ nếu mục 3 dưới đây cần. Không sửa file khác, không commit, không chạy shell.

Kết quả chạy thật (`npx vitest run src/app/today/__tests__/TodayPage.test.tsx`):
- "hiển thị các tab và các mũi tên chuyển tab bên phải": `Found multiple elements with the role "tab" and name /Tuần sau/i`
- "hiển thị đồng hồ thời gian chạy mỗi giây": `Found multiple elements with the text of: live-clock`

Nguyên nhân: các lần `render()` của test trước vẫn còn trong DOM (không có dọn dẹp), nên nhiều bản của trang cùng tồn tại. Chẩn đoán trước đó ("trang lặp cụm mũi tên") KHÔNG phải nguyên nhân — đừng xóa phần giao diện đã đúng.

Cách sửa:
1. Trong file test thêm `afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); })` (import `cleanup` từ `@testing-library/react`). Nếu test dùng fake timers thì tiến thời gian bằng `act(() => vi.advanceTimersByTime(1000))`.
2. Chạy từng test độc lập phải qua (không phụ thuộc thứ tự).
3. Đồng hồ: KHÔNG khởi tạo state bằng giờ hiện tại ngay trong `useState(() => …)` ở lần render đầu nếu việc đó làm HTML từ server khác HTML client (lỗi hydration). Giữ cách chỉ hiện đồng hồ sau `mounted`; test phải `await` hoặc `act` để effect `mounted` chạy rồi mới kiểm tra `live-clock` và kiểm tra giá trị đổi sau 1 giây (fake timers).

Tiêu chí xong: `cd web; npx vitest run` toàn bộ qua (hiện 164/166) và `npx tsc --noEmit` không lỗi.
