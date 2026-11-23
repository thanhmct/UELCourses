# Brief F6 — Sửa lỗi tsc + 5 test của T1

Được sửa: `web/src/app/timetable/__tests__/timetable.test.tsx`, và mã nguồn trong `web/src/app/timetable/**`, `web/src/components/TimetableGrid.tsx`, `web/src/components/TimetableModuleSearch.tsx` CHỈ khi lỗi thật nằm ở mã (không phải ở test). Không sửa file khác, không commit, không chạy shell. Không xóa/nới test cho "xanh".

Kết quả đo thật (`cd web; npx tsc --noEmit`, `npx vitest run src/app/timetable/__tests__/timetable.test.tsx`):

1. **tsc**: `timetable.test.tsx(27–29): Property 'has_equivalents' is missing in type … but required in type 'ModuleSummary'` → thêm `has_equivalents: false` vào 3 đối tượng mẫu.
2. **Test 1 (lọc theo đuôi E)**: `expected ['EBAA2028','ECO1001'] to deeply equal ['EBAA2028']`. Xác định cái nào sai: yêu cầu là "ưu tiên/lọc học phần mã E (hệ tiếng Anh) thuộc CTĐT tương ứng". Nếu `ECO1001` KHÔNG thuộc CTĐT trong dữ liệu mẫu của test thì mã lọc sai (phải chỉ giữ môn có trong CTĐT); nếu có thuộc thì test kỳ vọng sai → sửa test. Giải thích lựa chọn trong báo cáo.
3. **Test chọn-để-đổi-lớp (3 test)**: `Found multiple elements with the text of: /BIM5001 lớp 261BIM500101/` → (a) thêm `cleanup()` trong `afterEach` (các lần render trước còn trong DOM); (b) nếu sau khi dọn vẫn có nhiều phần tử trùng chữ do cùng chữ vừa nằm ở khối lưới vừa ở panel, dùng truy vấn theo `role`/`aria-label`/`within(...)` thay vì `getByText` mơ hồ.
4. **Test 'không còn chứa Kéo để đổi lớp'**: `Unable to find an element with the text: 261BIM500101` → xem test đang tìm mã lớp ở đâu; giao diện không hiện mã lớp trong khối thì sửa truy vấn cho đúng thực tế (khối ghi "lớp 261BIM500101" trong aria-label?), không thêm mã lớp vào giao diện chỉ để qua test.

Tiêu chí xong: `npx tsc --noEmit` sạch; `npx vitest run` toàn bộ qua (hiện 178/183).
