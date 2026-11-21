# Brief B2 — Tab "Kế hoạch" (planner)

Đọc `AGENTS.md`, `docs/PLAN_UEL_COURSE_DOCX.md`. Chỉ sửa: `web/src/app/planner/**`, `web/src/lib/planner.ts`, `web/src/lib/programs.ts` (đã có hàm `requiredByTerm`), component mới nếu cần, khóa i18n `pl.*` trong `vi.ts`/`en.ts` (chỉnh nhỏ, đọc lại file ngay trước khi sửa vì agent khác cũng sửa), test. Không commit.

Yêu cầu:
1. Bỏ dòng phụ đề "Kéo môn giữa các học kỳ, kiểm tra ràng buộc tiên quyết và tính điểm GPA tốt nghiệp." (khóa `pl.subtitle`).
2. Hai tab **"Lộ trình các học kỳ"** và **"GPA & Mục tiêu"**: phóng to **25%** (chữ và padding của nút tab).
3. **Danh sách chờ (backlog)**: tự ánh xạ các học phần **bắt buộc** của CTĐT người dùng (`useMyProgramId`; dữ liệu từ `api.program(id)` + `requiredByTerm`) vào đúng **học kỳ gợi ý** của CTĐT (kỳ 1…12 theo thứ tự `suggested_order`; kỳ chưa phân → nhóm "Chưa phân học kỳ"). Cho phép người dùng bấm "Áp dụng lộ trình chuẩn" để đưa các môn bắt buộc vào các kỳ tương ứng của kế hoạch (không ghi đè môn người dùng đã xếp tay; bỏ môn đã đạt). Nếu chưa nhập mã CTĐT thì hiện gợi ý nhập mã.
4. **Sắp xếp lại bố cục tab** cho nội dung đầy đủ, gọn: thanh tổng tín chỉ/kỳ, danh sách chờ theo nhóm kỳ, vùng học kỳ; không mất chức năng kéo-thả hiện có.
5. Không đổi API backend.

Tiêu chí xong: `cd web; npx tsc --noEmit`, `npx vitest run` qua; test mới cho hàm tạo lộ trình chuẩn (loại môn đã đạt, không ghi đè môn đã xếp, nhóm chưa phân kỳ).
