# Brief A7 — Đăng nhập sinh viên (tùy chọn, OTP email) + Chợ trao đổi giáo trình thật

**CHỜ CHỦ DỰ ÁN QUYẾT nhà cung cấp email (SMTP) trước khi chạy.** Đọc trước `docs/PLAN_ADMIN.md` (D-A4, D-A6, mục 3 `students`, `student_otps`, `student_sessions`, `book_listings`, `book_messages`; mục 4; mục 7). A0–A3 xong; trang `/books` (W9) hiện là giao diện mẫu. Chỉ đọc/sửa file, không chạy shell, không commit.

## Backend
1. Migration `0021_students_books`: các bảng như PLAN. Model khớp.
2. Email: `api/app/services/mailer.py` với `EMAIL_MODE` = `console` (dev: ghi nội dung ra log, KHÔNG ghi mã OTP vào file), `smtp` (cấu hình `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` từ biến môi trường). Mẫu email vi/en (OTP, thông báo liên hệ bài đăng, bài đăng được duyệt/từ chối).
3. Đăng nhập sinh viên: `POST /api/auth/otp/request` (email phải kết thúc `@st.uel.edu.vn` — cấu hình `STUDENT_EMAIL_DOMAINS`), sinh mã 6 số, lưu băm, hết hạn 10 phút, tối đa 5 lần thử, giới hạn 3 yêu cầu/15 phút/email và 10/giờ/IP; trả thông báo chung. `POST /api/auth/otp/verify` → tạo `students` nếu chưa có + phiên cookie `uel_student` (HttpOnly, SameSite=Lax, 30 ngày), trả hồ sơ. `POST /api/auth/logout`, `GET /api/auth/me`, `PATCH /api/auth/me` (display_name, program_code). Không lưu mật khẩu. Sinh viên bị `is_banned` không đăng nhập được.
4. Chợ giáo trình: `GET /api/books` (chỉ `active`, lọc theo môn/khoa/tình trạng/hình thức, tìm kiếm, phân trang) — công khai; `POST /api/books` (cần đăng nhập; qua bộ lọc kiểm duyệt A3; trạng thái `pending` theo `moderation.mode`; ảnh: tối đa 3, ≤ 2MB mỗi ảnh, chỉ jpeg/png/webp, lưu thư mục cấu hình `UPLOAD_DIR` (không commit, ngoài Docker image) — nếu chưa muốn lưu ảnh thì để trống tính năng ảnh, ghi rõ); `PATCH /api/books/{id}` (chủ bài: sửa, đánh dấu `reserved`/`closed`); `POST /api/books/{id}/contact` (cần đăng nhập; tạo `book_messages` và gửi email tới người đăng qua hệ thống, **không lộ email** hai bên; giới hạn 5 liên hệ/ngày/người); `GET /api/books/mine`.
5. Kiểm duyệt: loại `book` trong hàng đợi A3 hoạt động thật; duyệt/từ chối gửi email cho người đăng. Admin xem/khóa sinh viên vi phạm: `GET /api/admin/students`, `PATCH /api/admin/students/{id}` (`is_banned`), audit.

## Web
6. Đăng nhập tùy chọn: nút "Đăng nhập" nhỏ ở góc phải thanh trên (không bắt buộc cho các tab khác); hộp thoại 2 bước (nhập email trường → nhập mã 6 số, ô mã tự nhảy, đếm ngược gửi lại 60s); đã đăng nhập → menu tài khoản (tên hiển thị, "Bài đăng của tôi", Đăng xuất).
7. `/books` thay dữ liệu mẫu bằng API thật: giữ giao diện W9; nút "Đăng bài" và "Liên hệ" yêu cầu đăng nhập (mở hộp thoại đăng nhập rồi quay lại hành động); form đăng bài (môn — tìm học phần, tên sách, tác giả, lần xuất bản, tình trạng, hình thức, giá, ghi chú, ảnh); sau gửi hiện trạng thái "Chờ duyệt" trong "Bài đăng của tôi"; "Liên hệ" mở form tin nhắn ngắn → "Đã gửi email tới người đăng".
8. Bỏ banner "Tính năng đang thiết kế — dữ liệu hiển thị là mẫu" khi API thật hoạt động (giữ khi `NEXT_PUBLIC_USE_MOCKS=true`).
9. Test pytest: OTP (domain sai, hết hạn, quá số lần, rate limit, mã băm), phiên, books CRUD + quyền chủ bài + kiểm duyệt + liên hệ gửi mail (mailer giả) không lộ email, ảnh sai định dạng bị từ chối, sinh viên bị khóa. Vitest: hộp thoại đăng nhập 2 bước, hành động cần đăng nhập mở hộp thoại, danh sách books từ mock, form đăng bài.

Báo cáo cuối: file thay đổi, biến môi trường mới. Claude chạy alembic/pytest/tsc/vitest.
