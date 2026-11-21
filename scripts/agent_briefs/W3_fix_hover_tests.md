# Brief W3 — sửa test EquivalentsHover (chỉ sửa file test)

Chỉ sửa `web/src/components/__tests__/equivalentsHover.test.tsx`. KHÔNG sửa component `EquivalentsHover.tsx` hay file nào khác.

Hiện 4/5 test lỗi: `TestingLibraryElementError: Found multiple elements with the role "button" and name /có tương đương/i` — các lần render của các test trước chưa được dọn nên nhiều chip cùng tồn tại trong DOM.

Cách sửa: gọi `cleanup()` (từ `@testing-library/react`) trong `afterEach`; reset mock (`vi.restoreAllMocks()`/`mockClear`) và `vi.useRealTimers()` nếu đã dùng fake timers; nếu dùng fake timers thì tiến thời gian bằng `act(() => vi.advanceTimersByTime(200))` để vượt độ trễ hover 150 ms. Giữ nguyên ý nghĩa 5 test hiện có (không gọi API trước hover; hover nhiều lần chỉ gọi 1 lần; Esc đóng; bấm chip bật/tắt; thông báo khi không có dữ liệu).

Kiểm tra: `cd web; npx vitest run src/components/__tests__/equivalentsHover.test.tsx` phải qua 5/5, rồi `npx vitest run` toàn bộ qua.
