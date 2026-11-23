# Brief W17 — Liên kết "← Danh sách chương trình đào tạo" đổi thành nút vuông quay lại

Tự tìm file: `web/src/app/programs/[id]/page.tsx` (liên kết "← Danh sách chương trình đào tạo" → `/programs`) và mọi liên kết quay lại cùng kiểu: `web/src/app/modules/[code]/page.tsx` ("← Học phần"), trang quy chế/văn bản, trang sách chi tiết nếu có, v.v. (grep `"←` và `←` trong `web/src`). Không chạy lệnh shell, không commit, không sửa backend.

Yêu cầu của chủ dự án: thay liên kết chữ trần "← Danh sách chương trình đào tạo" bằng **nút vuông để quay lại**.

Thiết kế:
1. Tạo component dùng chung `BackButton` (`web/src/components/BackButton.tsx`): nút **vuông bo góc nhẹ** (≈40×40px, `rounded-lg`, viền mảnh, nền trắng/`bg-surface`, hover nền nhẹ + viền màu thương hiệu, focus ring rõ) chứa **icon mũi tên trái SVG** (không dùng ký tự ←). Là thẻ `Link` (Next) khi có `href`; có `aria-label` đầy đủ (vd "Quay lại danh sách chương trình đào tạo") và `title` (tooltip) cùng nội dung; đặt cạnh tiêu đề trang (cùng hàng với tiêu đề, bên trái, căn giữa theo chiều dọc dòng đầu tiên của tiêu đề) thay cho dòng link riêng phía trên → tiết kiệm một dòng.
2. Dùng ở trang chi tiết chương trình (`/programs/[id]` → `/programs`), chi tiết học phần (`/modules/[code]` → quay lại danh sách học phần, giữ query lọc nếu hiện đang giữ), và các trang chi tiết khác có liên kết quay lại. Nếu trang có lịch sử trình duyệt phù hợp có thể dùng `router.back()` khi `document.referrer` cùng origin; mặc định dùng `href`.
3. i18n vi/en cho nhãn tooltip; dark mode; có text ẩn cho đọc màn hình.
4. Test Vitest (cleanup(), role): nút có `aria-label`, link tới đúng `href`; không còn text "← Danh sách chương trình đào tạo" trên trang chi tiết CTĐT; cập nhật các test đang tìm chữ cũ.

Báo cáo cuối: các trang đã đổi, file thay đổi. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
