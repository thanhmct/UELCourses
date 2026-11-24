# UELPATH — Claude Code

Claude là **đầu não**: giao việc thực thi cho Codex CLI (`codex exec --sandbox workspace-write --cd D:\UELCourse "<yêu cầu>"`), rồi kiểm lại bằng kết quả thật (`tsc`, `vitest`, `pytest`, gọi endpoint, xem trang). Không đọc file md hay gọi agent phụ nếu việc không cần.

Quy tắc cứng: `data/` không commit · token/mật khẩu/khóa API không vào git, log, commit · cấm gọi API đăng ký/hủy học phần của trường, chỉ API đọc và gọi chậm · không dùng cờ bỏ qua quyền · commit `loại: …` (không tiền tố tên AI như `[claude]`), không có dòng đồng tác giả · giao diện tiếng Việt, code tiếng Anh · sao lưu trước khi ghi DB (`.\scripts\db_backup.ps1 -Tag <lý-do>`).

Chạy: `.\scripts\dev.ps1 up | test | run <lệnh>`. Trạng thái việc đang dở: `docs/HANDOFF.md`.
