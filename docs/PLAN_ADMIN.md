# Kế hoạch: Tab Quản trị (Admin) cho UELPATH

Ngày lập: 2026-11-22. Người lập plan: Claude. Thực thi: Antigravity (Gemini 3.8 Flash High) theo các brief `scripts/agent_briefs/A0…A7_*.md`. Claude kiểm tra (pytest, alembic, tsc, vitest, trình duyệt).

## 1. Mục tiêu (gom từ ý tưởng của chủ dự án)
Ý tưởng gốc (file `UEL Course.docx`, mục "Mục tiêu phát triển và thương mại hóa"):
1. Backend **thu thập xu hướng chọn môn và cách xếp thời khóa biểu** của sinh viên.
2. **Kiểm duyệt bình luận** (góp ý, bài đăng).
3. **Cửa sổ đăng nhập** cho sinh viên — **tùy chọn** (không bắt buộc để dùng web).
4. **Chợ trao đổi giáo trình**: bắt buộc đăng nhập; đăng bài trao đổi gửi qua email sinh viên.

Cộng các nhu cầu quản trị dữ liệu đã nảy sinh trong quá trình làm:
5. **Duyệt dữ liệu khoa/bộ môn** (danh sách "cần duyệt", xung đột tiền tố — B6e/B6i), chỉnh tay có ghi nguồn.
6. **Độ phủ đề cương** (môn chưa có đề cương, file scan chờ OCR, link Drive chưa lấy).
7. **Lịch năm học & học kỳ** (sửa sự kiện, đánh dấu chưa kiểm chứng, khoảng tuần học thật).
8. **Tình trạng nạp dữ liệu và hệ thống** (lần nạp gần nhất, lỗi, dung lượng DB).

## 2. Quyết định thiết kế (Claude chọn mặc định — chủ dự án có thể đổi)
| # | Vấn đề | Mặc định | Lý do |
|---|---|---|---|
| D-A1 | Vị trí tab | Route riêng `/admin` với layout riêng (sidebar trái), **không nằm trong menu sinh viên**. Chỉ hiện lối vào nhỏ ở cuối trang Cài đặt khi đã đăng nhập với vai trò quản trị. | Không làm rối menu sinh viên; tách biệt quyền. |
| D-A2 | Đăng nhập quản trị | Tài khoản trong DB (email + mật khẩu băm **argon2id**), tạo bằng CLI `python -m app.cli create-admin --email …` (mật khẩu nhập qua prompt/biến môi trường `ADMIN_BOOTSTRAP_PASSWORD`, **không** ghi file). Phiên bằng cookie `HttpOnly; Secure; SameSite=Strict`, ký bằng `SESSION_SECRET` sẵn có; hết hạn 8 giờ; CSRF header `X-CSRF-Token`. Khóa 15 phút sau 5 lần sai. | Không phụ thuộc dịch vụ ngoài; miễn phí; đúng quy tắc không ghi bí mật vào file. |
| D-A3 | Vai trò | `admin` (toàn quyền), `moderator` (chỉ kiểm duyệt), `data_editor` (dữ liệu học phần/đề cương/lịch). | Tách quyền tối thiểu. |
| D-A4 | Đăng nhập sinh viên (tùy chọn) | **Giai đoạn sau (A7)**: mã OTP 6 số gửi tới email trường `@st.uel.edu.vn`, không mật khẩu. Cần SMTP → chủ dự án quyết nhà cung cấp (mặc định đề xuất: Brevo/Resend gói miễn phí). Trước khi có SMTP: chế độ `EMAIL_MODE=console` (in mã ra log dev). | Không lưu mật khẩu sinh viên; đúng yêu cầu "đăng bài gửi qua email sinh viên". |
| D-A5 | Thu thập xu hướng | **Ẩn danh, tổng hợp, có thể tắt.** Web tạo `anon_id` ngẫu nhiên (UUID v4, localStorage), không gắn tên/email/token. Chỉ ghi các sự kiện hành vi (xem môn, thêm/xóa môn khỏi TKB/kế hoạch, đổi lớp, tìm kiếm (cắt 64 ký tự), dùng bộ lọc, mã CTĐT dạng K24414 — không phải dữ liệu cá nhân). Cài đặt có công tắc "Chia sẻ dữ liệu sử dụng ẩn danh" (mặc định **bật** + thông báo một lần trong hộp thoại lần đầu; tắt là ngừng gửi). Dữ liệu thô giữ **180 ngày**, sau đó chỉ giữ bảng tổng hợp. | Khóa luận + dữ liệu cá nhân: ẩn danh là an toàn; vẫn đủ cho xu hướng. |
| D-A6 | Kiểm duyệt | Hàng đợi chung cho: góp ý (feedback có sẵn), bình luận học phần (mới), bài đăng chợ giáo trình (mới). Trạng thái `pending → approved / rejected / hidden`; bộ lọc từ khóa tự gắn cờ (danh sách từ cấm trong DB, sửa được); mọi thao tác ghi nhật ký. Bình luận/bài đăng mới **chờ duyệt** trước khi hiện (mặc định), có thể chuyển "đăng ngay, duyệt sau" trong cài đặt quản trị. | An toàn nội dung cho sản phẩm của trường. |
| D-A7 | Sửa dữ liệu khoa tay | Admin chọn khoa/bộ môn cho môn "cần duyệt" → lưu `faculty_source='admin'`, `faculty_set_by`, `faculty_set_at`; quy trình tự động (`fix-module-faculty`) **không ghi đè** giá trị nguồn `admin`. | Phù hợp quy tắc "dựa vào nguồn cụ thể": quyết định của quản trị là một nguồn có ghi danh. |
| D-A8 | Kiến trúc | Cùng FastAPI + Postgres hiện có, router `/api/admin/*`; migration Alembic 0017+; web Next.js route group `app/admin/(…)`. Không thêm dịch vụ mới. | Miễn phí, triển khai Render/Vercel/Neon như kế hoạch D1. |

## 3. Mô hình dữ liệu (migration 0017_admin_core, 0018_analytics, 0019_moderation, 0020_accounts)
- `admin_users(id, email unique, password_hash, role, is_active, failed_attempts, locked_until, last_login_at, created_at)`
- `admin_sessions(id, user_id, token_hash, csrf_token_hash, expires_at, ip_hash, user_agent, created_at, revoked_at)`
- `audit_log(id, actor_type['admin','system','student'], actor_id, action, entity_type, entity_id, before jsonb, after jsonb, created_at)` — chỉ thêm, không sửa/xóa.
- `analytics_events(id bigserial, anon_id uuid, event_type, module_code, class_code, semester_id, program_code, query_text, filters jsonb, page, created_at)` + index `(event_type, created_at)`, `(module_code, created_at)`. Kích thước an toàn: giới hạn 10 sự kiện/giây/anon_id, gói gửi theo lô.
- `analytics_daily(day, event_type, module_code, semester_id, program_code, count)` — bảng tổng hợp (job hằng ngày + lệnh CLI `aggregate-analytics`).
- `analytics_pairs(semester_id, module_a, module_b, count, updated_at)` — cặp môn hay được xếp chung TKB.
- `module_comments(id, module_code, anon_id/student_id, body, rating 1-5 null, status, flag_reasons text[], created_at, moderated_by, moderated_at, moderation_note)`
- `book_listings(id, student_id, module_code, title, author, edition, condition['new','good','fair'], mode['give','swap','sell'], price_vnd null, note, photos text[], status['pending','active','reserved','closed','rejected'], created_at, updated_at, moderated_by, moderated_at)`
- `book_messages(id, listing_id, from_student_id, to_student_id, body, created_at, emailed_at)` — "Liên hệ" gửi email qua hệ thống (không lộ email người đăng).
- `students(id, email unique (@st.uel.edu.vn), display_name, program_code, created_at, last_login_at, is_banned)` + `student_otps(id, email, code_hash, expires_at, attempts, created_at)` + `student_sessions` (như admin_sessions).
- `banned_terms(id, term, severity['flag','block'], created_at)`
- `feedback` (bảng có sẵn): thêm cột `status`, `moderated_by`, `moderated_at`, `moderation_note` nếu thiếu.
- `modules`: thêm `faculty_source`, `faculty_set_by`, `faculty_set_at` (nếu B6 chưa có).
- `admin_settings(key, value jsonb, updated_by, updated_at)` — ví dụ `moderation.mode`, `analytics.retention_days`.

## 4. API `/api/admin/*` (tất cả yêu cầu phiên quản trị + đúng vai trò + CSRF cho thao tác ghi)
- Auth: `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me`.
- Tổng quan: `GET /api/admin/overview` (số liệu 7/30 ngày: người dùng ẩn danh hoạt động, lượt thêm môn, hàng đợi kiểm duyệt, môn cần duyệt dữ liệu, lỗi gần đây).
- Xu hướng: `GET /api/admin/trends/modules?semester&program&range` (top môn được thêm vào TKB/kế hoạch, tăng/giảm so với kỳ trước), `/trends/pairs`, `/trends/slots` (khung giờ được chọn nhiều — bản đồ nhiệt Thứ × Tiết), `/trends/conflicts` (tỷ lệ TKB có trùng lịch/vi phạm ranh giới tiết), `/trends/search` (từ khóa tìm nhiều mà không ra kết quả → gợi ý bổ sung dữ liệu), `/trends/classes?module` (lớp nào được chọn nhiều — tín hiệu lớp sắp đầy). Xuất CSV cho từng báo cáo.
- Kiểm duyệt: `GET /api/admin/moderation/queue?type&status`, `POST /api/admin/moderation/{type}/{id}/{approve|reject|hide}` (lý do), `GET/POST/DELETE /api/admin/banned-terms`.
- Dữ liệu học phần: `GET /api/admin/data/faculty-review` (needs_review + prefix conflicts + chưa có nguồn), `PATCH /api/admin/modules/{code}` (faculty, department, … ghi `faculty_source='admin'`), `POST /api/admin/data/faculty-review/bulk` (áp dụng hàng loạt đề xuất tiền tố đã chọn).
- Đề cương: `GET /api/admin/outlines/coverage` (thống kê + danh sách môn thiếu đề cương, sắp theo số lớp mở), `GET /api/admin/outlines/ocr-pending`, `GET /api/admin/outlines/drive-links` (chờ đồng ý tải).
- Lịch: `GET/POST/PATCH/DELETE /api/admin/calendar/events`, `PATCH /api/admin/semesters/{id}` (is_current, teaching_start/end).
- Hệ thống: `GET /api/admin/system` (phiên bản, alembic head, kích thước bảng, lần import gần nhất, số lỗi 24h), `GET /api/admin/audit-log`.
- Người dùng: `GET/POST/PATCH /api/admin/users` (chỉ `admin`), `GET /api/admin/students` (A7, chỉ đếm/khóa tài khoản vi phạm).
- Công khai (cho web sinh viên): `POST /api/analytics/events` (lô ≤ 50 sự kiện, không cần đăng nhập, rate limit theo IP+anon_id, bỏ qua khi `DNT`/tắt chia sẻ), `GET/POST /api/modules/{code}/comments`, `GET/POST /api/books…` (A7).

## 5. Giao diện `/admin` (Next.js, cùng hệ màu, tiếng Việt/Anh, khung cố định theo W22)
Layout: thanh trên (logo + "Quản trị" + tài khoản + đăng xuất), **sidebar trái cố định** (thu gọn trên di động), vùng nội dung chiều cao ổn định, bảng có phân trang phía máy chủ.
1. **Tổng quan** — thẻ KPI (người dùng ẩn danh 7 ngày, lượt thêm môn, hàng chờ kiểm duyệt, môn cần duyệt dữ liệu, lỗi 24h) + biểu đồ đường hoạt động 30 ngày + danh sách "việc cần làm".
2. **Xu hướng chọn môn** — chọn học kỳ/khóa/CTĐT/khoảng thời gian; bảng top môn (lượt thêm TKB, kế hoạch, xem; xu hướng ▲▼); bản đồ nhiệt Thứ × Tiết; cặp môn hay đi cùng; lớp được chọn nhiều; từ khóa tìm không ra kết quả; tỷ lệ TKB có trùng lịch. Nút "Xuất CSV".
3. **Kiểm duyệt** — tab con: Góp ý / Bình luận học phần / Bài đăng giáo trình; bảng hàng chờ với cờ tự động; xem chi tiết ở panel phải (không đổi trang); phím tắt A (duyệt) / R (từ chối) / H (ẩn); quản lý từ cấm.
4. **Dữ liệu học phần** — tab con: Cần duyệt khoa (13 môn), Xung đột tiền tố, Chưa có nguồn; mỗi dòng: mã, tên, khoa hiện tại, đề xuất + nguồn, nút chọn khoa (dropdown 9 khoa chuẩn + Phòng Đào tạo) → lưu nguồn `admin`; chọn nhiều → áp dụng hàng loạt.
5. **Đề cương** — độ phủ (% môn có đề cương theo khoa), danh sách thiếu sắp theo số lớp mở, file scan chờ OCR, link Drive chờ đồng ý.
6. **Lịch năm học & học kỳ** — bảng sự kiện (lọc theo năm/khóa/loại), sửa/thêm/xóa, đánh dấu "đã kiểm chứng"; đặt kỳ hiện tại, khoảng tuần học thật.
7. **Hệ thống & nhật ký** — tình trạng hệ thống; nhật ký thao tác (lọc theo người/hành động).
8. **Tài khoản quản trị** (chỉ `admin`) — thêm/tắt tài khoản, đổi vai trò, đặt lại mật khẩu (sinh mật khẩu tạm hiển thị một lần).
9. **Cài đặt quản trị** — chế độ kiểm duyệt, thời gian giữ dữ liệu ẩn danh, bật/tắt thu thập.

## 6. Giai đoạn & brief
| Brief | Nội dung | Phụ thuộc |
|---|---|---|
| **A0_admin_core** | Migration 0017 (admin_users, admin_sessions, audit_log, admin_settings, cột faculty_source…), auth + vai trò + CSRF + khóa đăng nhập, CLI `create-admin`, router khung `/api/admin/me`, test | — |
| **A1_admin_shell** | Web: `/admin/login`, layout sidebar, bảo vệ route, trang Tổng quan (số liệu từ `/api/admin/overview` cơ bản), lối vào ở Cài đặt khi có phiên, test | A0 |
| **A2_analytics** | Migration 0018, `POST /api/analytics/events`, client `web/src/lib/analytics.ts` (hàng đợi, gửi lô, `sendBeacon`, công tắc tắt trong Cài đặt, thông báo một lần), các điểm gắn sự kiện, job/CLI tổng hợp + dọn dữ liệu > 180 ngày, API trends, trang Xu hướng, test | A0, A1 |
| **A3_moderation** | Migration 0019 (module_comments, banned_terms, cột trạng thái feedback), API kiểm duyệt + bình luận công khai, trang Kiểm duyệt, bình luận ở trang chi tiết học phần (hiện bình luận đã duyệt; gửi bình luận ẩn danh hoặc khi đăng nhập), test | A0, A1 |
| **A4_data_admin** | API + trang Dữ liệu học phần (dùng audit B6), Đề cương (độ phủ), tôn trọng `faculty_source='admin'` trong `fix-module-faculty`, test | A0, A1, B6 xong |
| **A5_calendar_admin** | API + trang Lịch năm học & học kỳ, test | A0, A1 |
| **A6_system_admin** | Trang Hệ thống, Nhật ký, Tài khoản quản trị, Cài đặt quản trị, test | A0, A1 |
| **A7_student_login_books** | (Chờ chủ dự án chọn SMTP) Đăng nhập sinh viên OTP, chợ giáo trình thật (thay mock W9), email liên hệ, kiểm duyệt bài đăng, test | A0–A3 + quyết định SMTP |

Mỗi brief: agy chỉ đọc/sửa file, không chạy shell; Claude chạy `alembic upgrade head`, `alembic check`, pytest, tsc, vitest, xem trình duyệt; không commit khi chủ dự án chưa cho phép.

## 7. An toàn & quyền riêng tư (bắt buộc ở mọi brief)
- Không ghi mật khẩu/token/cookie vào file, log, test fixture thật; test dùng mật khẩu sinh ngẫu nhiên trong test.
- Băm mật khẩu argon2id (`argon2-cffi`); so sánh hằng thời gian; token phiên ngẫu nhiên 32 byte, lưu **băm** trong DB.
- Tất cả `/api/admin/*` trả 401 khi không có phiên, 403 khi sai vai trò; CORS không mở cho admin ngoài `CORS_ORIGINS`.
- Rate limit: đăng nhập 5 lần/15 phút/IP+email; sự kiện analytics 10/giây/anon_id.
- Analytics: không lưu IP thô (chỉ băm có muối xoay vòng theo ngày nếu cần chống spam), không lưu user-agent đầy đủ; tôn trọng `DNT` và công tắc tắt.
- Nhật ký thao tác quản trị bất biến; hiển thị ai sửa gì, khi nào.
- Trang `/admin` gắn `noindex`, không có trong sitemap.

## 8. Cập nhật thứ tự (chủ dự án, 2026-11-22): GIAO DIỆN TRƯỚC, ĐĂNG NHẬP SAU
- Chạy A1 → A2 → A3 → A4 → A5 → A6 **trước**, rồi mới A0 (đăng nhập quản trị thật), A7 (đăng nhập sinh viên + chợ giáo trình) để sau cùng.
- Trong lúc chưa có A0: mọi route `/api/admin/*` dùng phụ thuộc tạm `require_admin_dev` (file `api/app/admin/deps.py`): CHỈ cho truy cập khi `ENV != "production"` VÀ biến môi trường `ADMIN_DEV_OPEN=true`; ngược lại trả **404** (không lộ sự tồn tại). Có tham số `roles` để sau này A0 thay bằng kiểm tra thật mà không đổi chữ ký. Ghi nhật ký với `actor_type='dev'`. Trang web `/admin/*` hiển thị dải nhỏ cố định "Chế độ phát triển — chưa có đăng nhập" và không có trang đăng nhập; khi API trả 404 thì trang báo "Khu vực quản trị chưa bật". `validate_production` từ chối khởi động khi `ENV=production` mà `ADMIN_DEV_OPEN=true`.
- Bảng `admin_users`/`admin_sessions` và trang `/admin/login` thuộc A0 (làm sau). Bảng `audit_log` và `admin_settings` tạo ở brief A đầu tiên chạy (A1) nếu chưa có. Cột `moderated_by`/`faculty_set_by`/`updated_by`… để kiểu text (lưu email hoặc "dev") cho đến A0.
- Migration: mỗi brief tạo revision TIẾP THEO sau file migration mới nhất đang có trong `api/migrations/versions/` (đừng giả định số 0017/0018…), đặt tên theo nội dung.
- A0 (chạy sau A6): thêm `admin_users`, `admin_sessions`, đăng nhập, trang `/admin/login`, thay `require_admin_dev` bằng kiểm tra phiên + vai trò + CSRF thật, bỏ dải "Chế độ phát triển".
- **Email cho A7: dùng Google Cloud** — gửi qua Gmail API (dự án Google Cloud, OAuth/Service Account; thông tin xác thực chỉ qua biến môi trường/secret, không ghi file) hoặc SMTP của Google (`smtp.gmail.com`, mật khẩu ứng dụng qua biến môi trường). Chọn cụ thể khi làm A7.
