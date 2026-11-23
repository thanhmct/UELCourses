# Brief T4 — "Khối lượng ~27 giờ/tuần": tính đúng theo từng tuần thực tế; ICS và web phải dùng cùng một nguồn

Tự tìm file (gợi ý `web/src/lib/workload.ts`, nơi hiển thị "Khối lượng ~N giờ/tuần" ở `web/src/app/timetable/page.tsx`, xuất ICS (`grep -ri "ics\|VEVENT"` trong `web/src/lib`), `web/src/lib/conflicts.ts`, `web/src/lib/lessonDates*`/hàm sinh buổi học theo ngày, `TimetableGrid.tsx`, trang `today`, `venues`, `planner`; API tham chiếu `api/app/services/lesson_dates.py` để hiểu `date_start`/`date_end`/`weeks` của từng `Lesson`). Không chạy lệnh shell, không commit, không sửa backend (chỉ đọc để hiểu dữ liệu).

## Vấn đề (chủ dự án)
Ô "Khối lượng ~27 giờ/tuần" đang cộng thô số tiết/giờ của mọi môn trong thời khóa biểu như thể TẤT CẢ đều diễn ra đủ mọi tuần. Sai, vì mỗi lớp có nhiều tầng ngày (lịch đổi giờ/đổi ca theo từng giai đoạn; có buổi "Một ngày", có đoạn tuần học khác nhau). Cần: (1) công thức chỉ áp dụng đúng nghĩa; (2) ICS xuất theo từng tuần với giờ học thay đổi; (3) web đồng bộ cùng cách tính.

## Yêu cầu
1. **Một hàm nguồn sự thật duy nhất** (vd `web/src/lib/occurrences.ts`): từ danh sách lớp đã chọn + `lessons` (weekday, tiết/giờ bắt đầu–kết thúc, `date_start`, `date_end`, `weeks`) trả danh sách **buổi học cụ thể theo ngày thật** `{date, class_code, module_code, start, end, room}`: mỗi tầng ngày được mở ra đúng các ngày thuộc khoảng [date_start, date_end] khớp thứ (weekday); `date_start === date_end` = đúng một buổi; xử lý `weeks` nếu có; tôn trọng ngày bắt đầu/kết thúc lớp; có test với lớp 3 tầng ngày (vd mẫu: tầng 1 tuần 1–4 Thứ 2 tiết 1–3; tầng 2 tuần 5–8 Thứ 4 tiết 7–9; tầng 3 một ngày thi) để chắc đúng ngày/giờ.
2. **Khối lượng:**
   - Với **một môn**: tổng thời gian phải học = tổng độ dài các buổi thật (giờ) của lớp đã chọn; hiển thị kiểu "Tổng ~N giờ" cho môn (tooltip/hàng môn), tính từ danh sách buổi ở (1), không nhân tuần giả định.
   - Khối lượng **theo tuần**: tính cho TỪNG tuần lịch (Thứ 2–CN) bằng cách cộng các buổi thật rơi vào tuần đó; hiển thị tuần đang xem/tuần hiện tại ("Tuần này ~N giờ"); thêm biểu đồ nhỏ/tooltip các tuần của học kỳ (cao nhất, trung bình) thay vì một con số "~27 giờ/tuần" chung. Không còn công thức cộng toàn bộ tiết của mọi môn rồi coi là mỗi tuần. Giờ = số tiết × độ dài tiết thật theo bảng giờ tiết (tham khảo `start_time`/`end_time` của lesson; nếu thiếu, dùng bảng tiết của UEL trong code).
   - Giữ nhãn tự học nếu workload.ts đang có (chỉ cộng nếu có nguồn rõ từ tín chỉ/đề cương; nếu là suy đoán thì bỏ).
3. **ICS:** xuất bằng đúng các buổi thật ở (1): mỗi buổi là một `VEVENT` có ngày/giờ thật (múi giờ Asia/Ho_Chi_Minh), hoặc `RRULE` + `EXDATE` chỉ khi chuỗi buổi thật sự đều đặn; KHÔNG dùng một RRULE chung cho cả học kỳ khi lịch đổi giờ/ca giữa các tuần. Buổi "Một ngày" là một sự kiện đơn. Có UID ổn định (`classcode-date-start`), tên sự kiện "MÃ Tên môn", địa điểm = phòng, mô tả = mã lớp + giảng viên. Test: lớp 3 tầng ngày → đúng số VEVENT, đúng ngày/giờ từng tuần, không sự kiện thừa ở tuần lớp không học.
4. **Đồng bộ web:** lưới thời khóa biểu theo tuần, trang Hôm nay, Phòng học, kiểm tra trùng lịch, tab "tuần kế tiếp" đều lấy buổi từ hàm ở (1) (kiểm tra và chuyển những nơi đang tự mở rộng lịch theo cách riêng). Kết quả hiển thị tuần nào thì buổi của tuần đó đúng với ICS.
5. Test Vitest (cleanup()): hàm occurrences, khối lượng theo tuần (tuần chỉ có tầng 1, tuần có tầng 2, tuần có buổi thi), tổng giờ của một môn, ICS.

Báo cáo cuối: công thức mới (mô tả ngắn), file thay đổi, các nơi đã chuyển sang dùng hàm chung. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
