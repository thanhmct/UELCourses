# Brief W20 — Bỏ thông báo "Không có lớp thay thế"

Tự tìm file: `web/src/app/timetable/page.tsx`, `web/src/components/TimetableGrid.tsx`, i18n `web/src/i18n/vi.ts`/`en.ts` (grep `Không có lớp thay thế`, `noAlternative`, `no.alt`), test trong `web/src/app/timetable/__tests__/`. Không chạy lệnh shell, không commit, không sửa backend.

Yêu cầu của chủ dự án: khi bấm vào một khối môn trên lưới thời khóa biểu mà môn đó **không có lớp thay thế** (vd "Không có lớp thay thế (BFB4007 - 261BFB400701)"), thì **không hiển thị gì cả**: bỏ hẳn thông báo/toast/dòng chữ đó (và mọi chỗ khác hiển thị câu này). Chỉ giữ hành vi chọn khối (viền nổi bật) hoặc không làm gì thêm; không có ô bóng thì không cần báo. Xóa khóa i18n không còn dùng, dọn mã/state liên quan, cập nhật test T3 đang kỳ vọng thông báo này thành kỳ vọng "không có thông báo" (môn chỉ có một lớp → bấm khối không hiện văn bản "Không có lớp thay thế"; môn có lớp khác → vẫn hiện ô bóng).

Báo cáo cuối: file thay đổi. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
