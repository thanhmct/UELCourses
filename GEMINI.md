# UELCourses — Gemini / Antigravity

@./AGENTS.md

## Riêng cho Gemini / Antigravity
- Mở thư mục `D:\UELCourse` làm workspace duy nhất (Antigravity IDE) hoặc chạy `agy` ở thư mục này.
- Headless: `agy --print "<yêu cầu>" --mode plan` (chỉ lập kế hoạch) hoặc `--mode accept-edits` (tự sửa file, vẫn hỏi trước khi chạy lệnh). **Không** dùng `--dangerously-skip-permissions`.
- `agy.exe` ở `%LOCALAPPDATA%\agy\bin\agy.exe`; có thể chưa nằm trong PATH.
- Lần giao việc headless đầu tiên (viết `fetch_all_dkhp.py`) thoát code 0 nhưng không tạo file — nếu lặp lại, chạy ở chế độ tương tác hoặc đọc log bằng `--output-format json`.
- Ưu tiên chạy lệnh trong container dùng chung: `.\scripts\dev.ps1 run <lệnh>` (xem AGENTS.md mục 5).
- Đọc `docs/HANDOFF.md` trước; cập nhật nó trước khi hết quota.
