# Brief A3 — Kiểm duyệt: góp ý, bình luận học phần, từ cấm

Đọc trước `docs/PLAN_ADMIN.md` (D-A6, mục 3 `module_comments`, `banned_terms`, `feedback`; mục 4 Kiểm duyệt; mục 5 mục 3; mục 7). A0, A1 đã xong. Chỉ đọc/sửa file, không chạy shell, không commit.

## Backend
1. Migration `0019_moderation` (down_revision = 0018): `module_comments`, `banned_terms`; thêm vào bảng góp ý hiện có (tìm model feedback trong `api/app/models.py`) các cột `status` (mặc định `pending`), `moderated_by`, `moderated_at`, `moderation_note`, `flag_reasons`. Model khớp.
2. Bộ lọc nội dung `api/app/services/moderation.py`: chuẩn hóa (bỏ dấu, chữ thường, gộp ký tự lặp, bỏ ký tự chèn kiểu "đ.ụ") rồi so với `banned_terms`; `severity=block` → từ chối ngay (trả 422 với thông báo chung "Nội dung chưa phù hợp"), `flag` → lưu `flag_reasons`; phát hiện số điện thoại/email/link lạ → gắn cờ `contact_info`/`link`; độ dài 5–1000 ký tự. Seed vài từ mẫu trung tính (để test), danh sách thật do admin nhập.
3. Bình luận công khai: `GET /api/modules/{code}/comments` (chỉ `approved`, phân trang, mới nhất trước, kèm điểm trung bình nếu có `rating`); `POST /api/modules/{code}/comments` (`body`, `rating?`, `anon_id`; khi có phiên sinh viên (A7) thì gắn `student_id`); rate limit 3 bình luận/10 phút/anon_id; `admin_settings.moderation.mode` = `pre` → `pending`, `post` → `approved` ngay nhưng vẫn vào hàng chờ xem lại.
4. Góp ý (`POST` có sẵn) đi qua cùng bộ lọc và có `status`.
5. API quản trị (vai trò `admin`/`moderator`): `GET /api/admin/moderation/queue?type=feedback|comment|book&status=&flagged=&q=&page=`; `POST /api/admin/moderation/{type}/{id}/approve|reject|hide` (ghi chú tùy chọn, ghi `audit_log`); thao tác hàng loạt `POST /api/admin/moderation/bulk`; `GET/POST/DELETE /api/admin/banned-terms`. Loại `book` để sẵn cấu trúc (A7 điền).
6. Overview `moderation_pending` lấy số thật.

## Web
7. Trang chi tiết học phần `web/src/app/modules/[code]/page.tsx`: khối "Đánh giá & bình luận" ở cuối trang (thu gọn mặc định, không làm nhảy layout): danh sách bình luận đã duyệt (ẩn danh hiển thị "Sinh viên ẩn danh"), điểm trung bình sao; form gửi (textarea + chọn sao 1–5 tùy chọn) → sau gửi hiện dòng nhỏ trong form "Bình luận đã gửi, sẽ hiển thị sau khi được duyệt" (không toast lớn); lỗi 422 hiện trong form. i18n vi/en.
8. `/admin/moderation`: tab con Góp ý / Bình luận học phần / Bài đăng giáo trình (A7, hiển thị "chưa có" khi chưa làm); bảng hàng chờ (thời gian, loại, trích nội dung, cờ, trạng thái) + **panel chi tiết bên phải** (không đổi trang) với nút Duyệt / Từ chối / Ẩn + ô ghi chú; phím tắt A/R/H/J/K (lên xuống) có hiển thị gợi ý; chọn nhiều → thao tác hàng loạt; bộ lọc trạng thái/cờ/tìm kiếm. Mục "Từ cấm": bảng thêm/xóa với mức `flag`/`block`.
9. Test: pytest (bộ lọc chuẩn hóa bắt biến thể, block/flag, liên hệ/link, rate limit, pre/post mode, chỉ approved hiển thị công khai, quyền moderator, audit). Vitest (cleanup(), role): form bình luận gửi + thông báo trong form; danh sách chỉ hiện approved (mock); trang kiểm duyệt duyệt/từ chối cập nhật danh sách; phím tắt; bulk.

Báo cáo cuối: file thay đổi, migration. Claude chạy alembic/pytest/tsc/vitest.
