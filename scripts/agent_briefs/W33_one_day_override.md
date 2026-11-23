# Brief W33 — Buổi "Một ngày" phải loại ngày đó khỏi lịch lặp; xem tuần phải hiện ngày cụ thể

Tự tìm file: `web/src/lib/occurrences.ts` (hàm mở lịch thành buổi theo ngày thật, làm ở T4), `web/src/components/TimetableGrid.tsx`, `web/src/app/timetable/page.tsx`, `web/src/lib/semesterWeeks.ts` (W21), test trong `web/src/app/timetable/__tests__/`. Đọc xem brief **W23** (môn nhiều lịch) đã làm gì ở vùng này để không phá, chỉ sửa tiếp. Không chạy lệnh shell, không commit, không sửa backend trừ khi dữ liệu API thực sự sai (khi đó chỉ ghi vào báo cáo).

## Hiện trạng (ảnh chủ dự án gửi, Kỳ 1 2026–2027, đang xem "Tuần 6 (28/09 – 04/10)")
Lớp `261BAA202802` của môn `BAA2028` hiện **hai khối**:
- T2: `261BAA202802 · A.802` — `Một ngày · 28/09`
- T7: `261BAA202802 · B1.205` — `19/09–31/10`

Hai lỗi:
1. **Đang xem một tuần cụ thể mà khối T7 vẫn ghi cả khoảng `19/09–31/10`** thay vì ngày thật của tuần đó. Ở chế độ xem tuần, mỗi khối phải là **một buổi học của đúng tuần đó**, ghi ngày cụ thể.
2. **Buổi "Một ngày" không loại trừ ngày tương ứng trong lịch lặp.** Buổi một ngày là buổi dạy bù / đổi lịch, nó **thay thế** buổi theo lịch lặp rơi vào cùng ngày.

## Yêu cầu

### 1. Buổi "Một ngày" ghi đè lịch lặp
Trong hàm mở lịch thành danh sách buổi (`occurrences.ts`), sau khi đã sinh đủ buổi của mọi tầng ngày của **cùng một lớp**:
- Với mỗi ngày mà lớp đó có **buổi một ngày** (`date_start === date_end`), **loại bỏ mọi buổi sinh ra từ tầng lịch lặp rơi đúng ngày đó**, dù khác thứ/tiết/phòng. Buổi một ngày được giữ.
- Chỉ áp dụng trong phạm vi **cùng một mã lớp**, không ảnh hưởng lớp khác hay môn khác.
- Nếu trong một ngày có nhiều buổi một ngày thì giữ tất cả.
- Hệ quả: khối lượng theo tuần (T4) và xuất ICS phải tính trên danh sách đã loại trừ, không đếm trùng. Kiểm tra lại số giờ của tuần trong ví dụ trên sau khi sửa.

### 2. Xem một tuần cụ thể → ghi ngày thật
Khi người dùng chọn một tuần (`Tuần 6 (28/09 – 04/10)`):
- Mỗi khối trên lưới là **một buổi của tuần đó**, dòng ngày ghi **ngày cụ thể** (`03/10`), **không** ghi khoảng `19/09–31/10` và **không** ghi nhãn "Một ngày".
- Tuần đó lớp không có buổi nào thì không vẽ khối nào.
- Giữ nguyên chế độ "Tất cả các tuần" như W23 đã làm (gộp theo mẫu lặp, ghi `dd/MM – dd/MM · N buổi`, hoặc `Một ngày · dd/MM/yyyy` khi nhóm chỉ có đúng một buổi).

### 3. Mặc định khi mới thêm môn: xem TOÀN BỘ học kỳ
Chủ dự án yêu cầu: vừa thêm môn vào thời khóa biểu thì phải **thấy ngay toàn bộ lịch trình cả kỳ**, gồm mọi tầng ngày kể cả các tầng khác khoảng ngày; sau đó bấm vào một tuần mới xem chi tiết tuần.
- Khi thời khóa biểu đang trống và người dùng thêm môn đầu tiên → bộ chọn tuần đặt về **"Tất cả các tuần"**.
- Khi đang xem một tuần cụ thể mà người dùng **thêm môn mới**, nếu môn vừa thêm **không có buổi nào trong tuần đang xem** → tự chuyển về "Tất cả các tuần" (để người dùng không tưởng là thêm hỏng), kèm chỉ báo nhẹ không chiếm chỗ (theo W22: không banner trong luồng nội dung).
- Nếu môn vừa thêm **có** buổi trong tuần đang xem thì giữ nguyên tuần đang xem.

### 4. Test Vitest (`cleanup()`, `within`/role)
- Lớp có tầng lặp T7 19/09–31/10 **và** buổi một ngày T2 28/09: xem "Tất cả các tuần" → thấy cả hai khối; xem tuần chứa 28/09 → thấy buổi một ngày 28/09 và buổi T7 của tuần đó ghi ngày cụ thể.
- Buổi một ngày trùng đúng ngày với một buổi của tầng lặp → chỉ còn buổi một ngày, buổi lặp bị loại; tổng giờ của tuần giảm tương ứng.
- Xem tuần cụ thể: không khối nào chứa dấu `–` của khoảng ngày, không khối nào có chữ "Một ngày".
- Thời khóa biểu trống + thêm môn đầu tiên → bộ chọn tuần là "Tất cả các tuần".
- Đang xem tuần N, thêm môn không có buổi trong tuần N → tự về "Tất cả các tuần"; thêm môn có buổi trong tuần N → vẫn ở tuần N.
- ICS: buổi lặp bị loại không xuất hiện trong file.

Báo cáo cuối: mô tả quy tắc loại trừ đã cài, file thay đổi, và số buổi/số giờ của lớp `261BAA202802` trước và sau khi sửa. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
