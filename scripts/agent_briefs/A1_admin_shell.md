# Brief A1 — Giao diện khung `/admin`: đăng nhập, layout, Tổng quan

Đọc trước `docs/PLAN_ADMIN.md` (mục 2 D-A1; mục 4 Auth + Tổng quan; mục 5 Layout + mục 1 "Tổng quan"; mục 7). Yêu cầu A0 đã xong (API `/api/admin/login|logout|me`). Chỉ đọc/sửa file, không chạy shell, không commit.

## Phạm vi file
Backend nhỏ: `api/app/admin/router.py` thêm `GET /api/admin/overview` (+ test). Web: `web/src/app/admin/` (route group, `layout.tsx`, `login/page.tsx`, `page.tsx` Tổng quan), `web/src/components/admin/` (Sidebar, AdminTopbar, KpiCard, DataTable dùng chung có phân trang/sắp xếp, EmptyState, Skeleton cố định chiều cao), `web/src/lib/adminApi.ts` (fetch với `credentials: "include"`, tự gắn `X-CSRF-Token` cho thao tác ghi, xử lý 401 → về `/admin/login?next=…`), `web/src/lib/types.ts` (kiểu admin), i18n vi/en, `web/src/app/settings/page.tsx` (lối vào), `web/next.config.*` hoặc `app/admin/layout.tsx` (metadata `robots: noindex`), mock cho test.

## Yêu cầu
1. **Đăng nhập** `/admin/login`: form email + mật khẩu (có nút hiện/ẩn), lỗi hiển thị trong form (không toast lớn), khóa nút khi đang gửi; thành công → `next` hoặc `/admin`. Không lưu mật khẩu/token vào localStorage (cookie HttpOnly do API đặt; CSRF token giữ trong bộ nhớ store, lấy lại qua `/me`).
2. **Layout** `/admin/*`: thanh trên cố định (tên hệ thống "UELPATH · Quản trị", email + vai trò, nút Đăng xuất), **sidebar trái cố định** với các mục theo PLAN mục 5: Tổng quan, Xu hướng chọn môn, Kiểm duyệt, Dữ liệu học phần, Đề cương, Lịch năm học & học kỳ, Hệ thống & nhật ký, Tài khoản quản trị (chỉ vai trò `admin`), Cài đặt quản trị. Mục chưa làm (A2–A6) hiển thị trang "Đang xây dựng" gọn, KHÔNG ẩn mục. Mục không đủ quyền ẩn khỏi sidebar. Sidebar thu gọn thành ngăn kéo trên di động. Khung không nhảy (W22): vùng nội dung có min-height, skeleton cố định.
3. **Bảo vệ route**: layout kiểm `/api/admin/me`; 401 → chuyển `/admin/login`; trong lúc kiểm hiển thị skeleton khung (không chớp nội dung). Không render menu sinh viên (Header) trong `/admin` (layout riêng, nhưng dùng chung theme/dark mode).
4. **Tổng quan**: `GET /api/admin/overview` trả `{active_anon_7d, active_anon_30d, timetable_adds_7d, planner_adds_7d, moderation_pending, data_review_pending, errors_24h, last_import_at}` — các bảng chưa tồn tại (analytics, moderation) thì trả 0/null an toàn (không lỗi). Trang hiển thị 6 thẻ KPI + danh sách "Việc cần làm" (liên kết tới mục tương ứng khi số > 0). Biểu đồ để A2.
5. **Lối vào**: trang Cài đặt của sinh viên hiển thị liên kết nhỏ "Quản trị" ở cuối trang CHỈ khi `/api/admin/me` trả 200 (gọi im lặng, lỗi thì bỏ qua). Không thêm vào menu chính.
6. **Test**: pytest cho `/overview` (401 không phiên, số liệu 0 khi bảng trống). Vitest (cleanup(), role): login lỗi hiện thông báo trong form; login thành công chuyển trang; layout chuyển hướng khi 401; sidebar ẩn mục "Tài khoản quản trị" với `moderator`; Tổng quan hiển thị KPI từ mock; lối vào Cài đặt chỉ hiện khi có phiên.

Báo cáo cuối: file thay đổi. Claude chạy pytest, `npx tsc --noEmit`, `npx vitest run`, xem `/admin` trên trình duyệt.
