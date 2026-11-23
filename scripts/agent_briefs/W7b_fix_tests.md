# Brief W7b — Sửa lỗi sau W7 (tsc 3 lỗi + 8 test đỏ)

Không chạy lệnh shell, không commit. Chủ dự án chạy `cd web; npx tsc --noEmit; npx vitest run`. Mục tiêu: tsc sạch, toàn bộ test qua. Nguyên tắc: test phải khớp **chữ ký hàm thật** trong code; chỉ sửa code sản phẩm khi hành vi thật sự sai.

Lỗi:
1. `web/src/i18n/__tests__/names.test.ts`:
   - Kiểu `Semester` thật (xem `web/src/lib/types.ts`) có `id`, `name`, `year`, `term`, `is_current`, KHÔNG có `semester_id`/`academic_year`. Sửa dữ liệu mẫu trong test cho đúng kiểu. Dòng ~81 gán `null` vào trường `string | undefined`: dùng `undefined` hoặc bỏ trường.
   - `moduleDescription` thật trả về `{ text: string | null; fallback: boolean }` (xem `web/src/i18n/names.ts`): sửa các assert dùng `.text` (và `.fallback`), vd rỗng → `text` là `null`. Không đổi chữ ký hàm.
   - `semesterName` test "chỉ có chuỗi name": hiện trả "HK1 2026-2027" nhưng test mong "Semester 1, 2026-2027". Đọc hàm: nếu khi EN nó nhận được `term`/`year` thì phải ra "Semester N, YYYY-YYYY"; với dữ liệu chỉ có `name` dạng "Học kỳ 1 năm học 2026-2027" hãy parse regex lấy kỳ + năm học để ra "Semester 1, 2026-2027" (EN) — sửa code nếu cần; giữ VI như cũ.
   - `facultyName`: test mong "Faculty of Economic Mathematics" nhưng code ra "Faculty of Mathematical Economics". Kiểm tra bảng ánh xạ chính thức `api/seed/faculty_names_en.tsv` (nguồn sự thật): dùng đúng tên trong file đó, sửa test hoặc code cho khớp.
2. `web/src/components/__tests__/FooterAndToday.test.tsx` — test "không hiển thị today.subtitle": lỗi `Unable to find an element with the text: Hôm nay`. Test render `TodayPage` sai cách (thiếu mock dữ liệu/ chờ dữ liệu). Xem cách test hiện có `web/src/app/today/__tests__/TodayPage.test.tsx` đã render trang thế nào và làm tương tự (mock/fake timers đúng, `cleanup()`), rồi chỉ cần khẳng định chuỗi "Xem nhanh các tiết học trong ngày" không xuất hiện.

Báo cáo cuối: nguyên nhân từng lỗi và file đã sửa.
