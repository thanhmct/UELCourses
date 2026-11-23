# Brief W24 — Phòng học: trở về kiểu lịch tháng (lưới ~30 ngày) như bản cũ, bỏ dạng danh sách theo ngày

Tệp cần sửa: `web/src/app/venues/page.tsx` (+ `web/src/lib/venueCalendar.ts`, `web/src/lib/venues.ts`, test trong `web/src/app/venues/__tests__/` hoặc nơi tương ứng, i18n vi/en). Không chạy lệnh shell, không commit, không sửa backend.

## Tham chiếu bản cũ
Bản cũ của trang (trước khi sửa Phòng học ở T1/T4) được lưu để bạn đọc ở **`scripts/agent_briefs/ref/venues_page_HEAD.tsx.txt`** (nguyên văn `web/src/app/venues/page.tsx` ở commit gần nhất; chỉ là tài liệu tham khảo, không import, không sửa file này). Trong đó có `RoomMonth` dùng `monthGrid(month)` + `occurrencesByDay(...)` để vẽ **lưới tháng**, mỗi ô là một ngày (khoảng 30 ngày), trong ô là các buổi dùng phòng; có chọn phòng, chọn tháng, chọn học kỳ.

## Hiện trạng (chủ dự án phản hồi)
Cửa sổ/phần "Lịch sử dụng phòng B1.104 · Tháng 11/2026 · 99 buổi" hiện là **danh sách dọc từng ngày** ("Chủ nhật, ngày 01/11/2026 — 2 buổi", mỗi buổi một khối Tiết/giờ/tên môn/liên kết, rất dài và khó nhìn tổng thể). Chủ dự án thích **bản đồ cũ dạng lưới tháng thể hiện 30 ngày** hơn và không muốn kiểu cửa sổ/danh sách này.

## Yêu cầu
1. **Khôi phục giao diện lưới tháng** theo bản tham chiếu: tiêu đề phòng + tháng; lưới 7 cột (T2 … CN) × các tuần của tháng; mỗi ô ngày hiển thị số ngày và danh sách buổi dùng phòng dạng chip nhỏ gọn (khung giờ rút gọn + mã môn), tô đậm ô theo mật độ sử dụng (số buổi), ngày ngoài tháng làm mờ, ngày hôm nay có viền. Nhiều buổi quá ô: hiện tối đa 2-3 chip + "+N" ; bấm ô (hoặc rê chuột) mở **popover/popup nhỏ nổi** (lớp phủ, không đẩy layout) liệt kê đầy đủ các buổi của ngày đó (tiết, giờ, tên môn, mã môn có liên kết `/modules/{code}`, mã lớp nếu có — nhưng KHÔNG hiện mã lớp theo yêu cầu T1 trước đó: bỏ mã lớp). Cấu trúc thông tin giữ "phòng → ngày".
2. **Bỏ hẳn** danh sách dọc "Chủ nhật, ngày 01/11/2026 · 2 buổi …" và khối tổng "99 buổi" dạng cuộn dài khỏi giao diện chính; số buổi của tháng có thể hiện nhỏ ở tiêu đề (vd "99 buổi") gọn trên cùng hàng với tên phòng và tháng.
3. Giữ các cải tiến đã có: bộ chọn học kỳ (kỳ hiện tại/nút "Đến kỳ hiện tại" — nếu W19 đã có `SemesterPicker` thì dùng nó), tên kỳ/tháng song ngữ, chuyển tháng trước/sau, chọn phòng, tìm phòng. Lịch dùng buổi học theo ngày thật (nhất quán với `web/src/lib/occurrences.ts`/`venueCalendar.ts`); nhãn "Một lần" đã đổi thành "Một ngày"/"One day".
4. Chiều cao khung cố định (không nhảy layout khi đổi tháng/phòng), responsive (di động: lưới cuộn ngang trong khung hoặc rút gọn ô thành chấm + popover).
5. Test Vitest (cleanup(), within/role): hiển thị lưới 7 cột có đủ số ngày của tháng; ô ngày có buổi hiện chip và "+N" khi nhiều; bấm ô mở popover với đủ buổi; không còn tiêu đề "ngày dd/MM/yyyy · N buổi" dạng danh sách; không hiện mã lớp; chuyển tháng/phòng; EN.

Báo cáo cuối: file thay đổi, điều gì khôi phục/giữ từ bản cũ. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
