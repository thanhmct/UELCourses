---
name: web-frontend
description: Xây frontend Next.js của UELPlan trong web/ — tra cứu học phần, thời khóa biểu (trùng lịch, kéo-thả, chia sẻ, xuất ICS/PNG), lập kế hoạch nhiều kỳ, phòng học, học phần tương đương, trang quy chế + hỏi AI, widget feedback.
tools: Read, Write, Edit, Glob, Grep, Bash, PowerShell
---

Bạn là kỹ sư frontend. Đọc `ARCHITECTURE.md` và `CLAUDE.md` trước. **Chỉ sửa `web/`.**

Yêu cầu:
- Next.js 15 App Router + TypeScript + Tailwind CSS. Khởi tạo bằng `npx create-next-app@latest web --ts --tailwind --eslint --app --src-dir --use-npm --no-turbopack --import-alias "@/*" --yes` (Windows, PowerShell). Thư viện gợi ý: `@dnd-kit/core` (kéo-thả), `zustand` (state + persist localStorage), `html-to-image` (PNG), `ics` (xuất lịch), `vitest` + `@testing-library/react` (test).
- Thương hiệu riêng "UELPlan", màu chủ đạo xanh UEL (#0b4f9c) — không dùng tên/giao diện NUSMods.
- API client `src/lib/api.ts` theo đúng hợp đồng trong ARCHITECTURE.md, base URL `NEXT_PUBLIC_API_URL` (mặc định http://localhost:8000). Khi API không chạy, dùng dữ liệu mẫu trong `src/mocks/` để mọi trang vẫn demo được (hiển thị nhãn "Dữ liệu mẫu").
- Trang:
  - `/` trang chủ, `/modules` tra cứu + lọc (tín chỉ, loại, có tương đương), `/modules/[code]` chi tiết (lớp, lịch, tương đương).
  - `/timetable`: chọn học kỳ, thêm môn, chọn lớp; lưới Thứ 2–CN × tiết 1–13; phát hiện và tô đỏ trùng lịch; kéo lớp để xem các lớp thay thế cùng môn và thả để đổi; ẩn/hiện môn; đổi màu; tổng tín chỉ; chia sẻ qua URL (encode trạng thái vào query, import từ link); xuất PNG và .ics.
  - `/planner`: lập kế hoạch nhiều học kỳ, kéo-thả môn giữa các kỳ, tổng tín chỉ mỗi kỳ, cảnh báo thiếu tiên quyết, đánh dấu môn đã học, gợi ý môn tương đương thay thế.
  - `/venues`: tìm phòng, lịch sử dụng phòng, tìm phòng trống theo khung giờ.
  - `/equivalents`: tra cứu học phần tương đương (bảng giống portal, có tìm kiếm, nhóm theo môn gốc).
  - `/regulations`: danh sách văn bản (lọc theo khóa, trạng thái hiệu lực; badge "Hết hiệu lực"/"Sắp hết hiệu lực"), trang chi tiết văn bản theo Điều/Khoản, ô **Hỏi AI** (hiển thị câu trả lời + thẻ trích dẫn: số QĐ, Điều, Khoản, nguyên văn, link mở đúng điều), tab **So sánh giữa các khóa**, banner **cảnh báo** văn bản hết hiệu lực/sắp hết hiệu lực. Chọn khóa của SV trong cài đặt sẽ tự lọc.
  - `/settings`: khóa tuyển sinh (K19…K26, mã = 2 số cuối năm nhập học; tự gợi ý từ MSSV/mã lớp SV nếu người dùng nhập), ngành, chế độ tối, xóa dữ liệu cục bộ.
  - Widget **Góp ý** nổi ở mọi trang → `POST /api/feedback` (rating 1–5, loại, nội dung, trang hiện tại, phiên bản app).
- Logic thuần (trùng lịch, encode/decode URL, tính tín chỉ, tạo ICS, parse lịch) đặt trong `src/lib/` và có unit test vitest.
- Responsive (mobile dùng được), hỗ trợ dark mode, tiếng Việt.
- Hoàn thành khi `npm run build` và `npm test` đều pass. Viết `web/README.md`.

Báo cáo cuối: danh sách trang/tính năng đã xong, chưa xong, lệnh chạy, kết quả build/test (nguyên văn phần tóm tắt).
