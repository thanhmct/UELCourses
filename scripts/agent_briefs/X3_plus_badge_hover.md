# Brief X3 (Codex) — Nhãn "+1" trên khối thời khóa biểu: rê chuột hiện bảng hover chi tiết, KHÔNG mở khung/hộp thoại mới

Chỉ sửa: `web/src/components/TimetableGrid.tsx` (và component tooltip hover Codex đã làm ở lần sửa trước nếu nằm file riêng), i18n `web/src/i18n/vi.ts`/`en.ts` (nếu cần chuỗi), test Vitest liên quan. Không sửa backend, không commit, không dùng cờ bỏ qua quyền. Chạy SAU các việc Codex đang làm cùng file (hover tooltip, đổi viền nhấp nháy, bấm thân khối = chọn khối kiểu NUSMods) — đọc lại file hiện tại trước khi sửa, không ghi đè.

## Hiện trạng (chủ dự án chụp ảnh)
Khối môn (vd BBB1067, lớp 261BBB106708, A.310 · B1.202, "26/08 · 09/09–21/10") có nhãn nhỏ **"+1"** ở góc dưới phải = còn thêm 1 buổi/lịch khác của cùng lớp được gộp trong khối. Hiện bấm vào đó mở một khung/hộp thoại chi tiết mới.

## Yêu cầu
1. **Rê chuột (hover) vào nhãn "+N"** hiện NGAY một bảng nổi (tooltip/popover) liệt kê chi tiết các lịch được gộp: mỗi dòng gồm Thứ, tiết/giờ, phòng, ngày hoặc khoảng ngày thật (dd/MM hoặc dd/MM–dd/MM) và, nếu khác, giảng viên; bên trên ghi mã lớp + tên môn. Dùng đúng component/kiểu tooltip hover nổi ở lớp trên cùng đã làm (không bị che, bám theo khối khi cuộn, tự lật lên/xuống để không tràn mép màn hình).
2. **Không mở hộp thoại/khung mới** khi bấm nhãn "+N": bấm vào nhãn chỉ giữ/khóa bảng hover (kiểu toggle) hoặc không làm gì thêm; KHÔNG chặn việc chọn khối (bấm thân khối vẫn = chọn khối và hiện ô bóng lớp thay thế).
3. Tiếp cận: nhãn "+N" là phần tử có thể focus bằng bàn phím (`tabIndex=0`, `role="button"` hoặc `aria-describedby`); focus cũng hiện bảng; Esc ẩn bảng. Cảm ứng (touch): chạm vào nhãn bật/tắt bảng, chạm ra ngoài thì đóng.
4. Thiết kế: nền sáng/tối theo giao diện, chữ đậm rõ, số dòng nhiều thì cuộn nội bộ (max-height), không làm nhảy bố cục lưới.
5. Test Vitest: rê chuột vào "+1" → bảng hiện, có đủ dòng lịch gộp; rời chuột → ẩn; bấm nhãn không mở `role="dialog"`; bấm thân khối vẫn chọn khối; focus bằng bàn phím hiện bảng và Esc ẩn. EN: nhãn/cột theo tiếng Anh.
Báo cáo cuối: file thay đổi, hành vi hover/focus/touch đã làm.
