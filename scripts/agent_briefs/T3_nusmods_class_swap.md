# Brief T3 — Đổi lớp theo kiểu NUSMods: bấm khối trên lưới, các lớp thay thế hiện NGAY TRÊN LƯỚI; xóa bảng "Đổi lớp cho môn …"

Tự tìm file (gợi ý `web/src/app/timetable/page.tsx`, `web/src/components/TimetableGrid.tsx`, `web/src/lib/conflicts.ts`, test trong `web/src/app/timetable/__tests__/`, i18n). Không chạy lệnh shell, không commit, không sửa backend. Chỉ tham khảo CÁCH TƯƠNG TÁC của NUSMods, không sao chép mã/thương hiệu.

## Hiện trạng
Bấm vào một khối môn trên lưới thì hiện thêm một bảng lớn bên dưới "Đổi lớp cho môn BDG1003 — Chủ nghĩa xã hội khoa học" với danh sách các thẻ lớp (Trùng lịch / Hợp lệ, "Chọn lớp này →", nút "Đóng (Esc)"). Chủ dự án yêu cầu XÓA bảng này.

## Yêu cầu
1. **Xóa hoàn toàn** bảng/panel "Đổi lớp cho môn …" (component, state, i18n liên quan nếu không còn dùng; dọn test cũ phụ thuộc nó).
2. **Hành vi mới (như NUSMods):** bấm vào một khối môn trên lưới → môn đó vào chế độ "đang chọn": khối được tô viền nổi bật (như đang có), các khối khác mờ đi; **tất cả các lớp thay thế của đúng môn đó (cùng học kỳ, cùng loại lớp) hiện thành các ô "bóng" ngay trên lưới** tại đúng thứ/tiết của chúng (nền trong suốt/viền nét đứt, cùng màu môn, ghi mã lớp rút gọn + phòng; nếu lớp có nhiều buổi thì hiện bóng ở mọi buổi, và bấm vào bất kỳ buổi nào của lớp đó đều chọn cả lớp). Lớp thay thế gây trùng lịch với môn khác thì bóng màu đỏ/cảnh báo nhưng vẫn bấm được (giữ cảnh báo trùng như hiện có). Dùng chung chiều cao/vị trí ô với lưới hiện có; nhiều bóng chồng một ô thì xếp cạnh nhau hoặc chia ô, vẫn bấm được từng cái.
3. **Bấm vào ô bóng** → đổi sang lớp đó ngay (cập nhật thời khóa biểu, tính lại trùng lịch/quy tắc ranh giới tiết 6|7, 12|13), thoát chế độ chọn. Bấm lại khối đang chọn, bấm vùng trống, hoặc nhấn Esc → thoát chế độ chọn. Có hover tooltip nhỏ trên ô bóng: mã lớp, giảng viên, phòng, sĩ số còn lại nếu có.
4. Truy cập bàn phím/đọc màn hình: các khối và ô bóng là `button` có `aria-label` (môn, lớp, thứ, tiết), Esc hoạt động.
5. Giữ nguyên các thứ khác: banner cảnh báo "Vi phạm quy định xếp lớp"/"Có tiết học trùng lịch", xuất ICS/PNG, kéo-thả nếu còn (đã quyết định bỏ "Kéo để đổi lớp", giữ như hiện tại).
6. Test Vitest (nhớ `cleanup()`, dùng `within`/role): bấm khối → xuất hiện ô bóng của lớp khác và KHÔNG có panel "Đổi lớp cho môn"; bấm ô bóng → lớp đổi; Esc/bấm vùng trống → thoát; lớp trùng lịch hiển thị cảnh báo; môn chỉ có một lớp thì không có bóng (báo nhẹ "Không có lớp thay thế").

Báo cáo cuối: file thay đổi. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
