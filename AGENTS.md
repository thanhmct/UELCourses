# UELPATH — quy tắc chung cho mọi AI (Claude, Gemini/Antigravity, Codex)

Nguồn sự thật duy nhất. `CLAUDE.md`, `GEMINI.md` chỉ import file này. Giữ ngắn: file này đi kèm mọi prompt.

## Dự án
Web cho sinh viên ĐH Kinh tế – Luật (UEL): tra học phần, xếp thời khóa biểu, kế hoạch nhiều kỳ, cây tiên quyết, học phần tương đương, AI tra quy chế (RAG trích dẫn Điều/Khoản theo khóa). Khóa luận, làm theo Design Thinking (`research/`). Tham khảo bố cục NUSMods nhưng không dùng tên, logo, màu, mã nguồn của họ.

## Đọc khi bắt đầu (chỉ đọc khi cần, đừng duyệt cả cây)
1. `docs/HANDOFF.md` — trạng thái, việc dở, khóa phiên. **Luôn đọc.**
2. Chỉ khi việc cần: `ARCHITECTURE.md` (hợp đồng API, kiểu dữ liệu), `docs/DECISIONS.md` (quyết định đã chốt, không tranh luận lại), README của thư mục sắp sửa.
3. Lịch sử cũ ở `docs/handoff/HISTORY.md` — không đọc trừ khi tra cứu.

## Vùng sửa — thư mục duy nhất `D:\UELCourse` (Docker: `/workspace`)
`web/` Next.js · `api/` FastAPI + SQLAlchemy (trừ `api/app/rag/`) · `api/app/rag/` RAG quy chế · `regulations/` văn bản gốc · `research/` khảo sát · `docs/`, `scripts/`, `docker/` · `data/` dữ liệu, **không commit**.
Hai AI không sửa cùng file cùng lúc (bảng "Khóa phiên" trong HANDOFF).

## Quy tắc cứng
- Giao diện tiếng Việt; code và tên biến tiếng Anh.
- Token, mật khẩu, cookie, khóa API: không ghi vào file, log, commit, tin nhắn. Chỉ qua biến môi trường hoặc file đã gitignore (`token.txt`, `.env`, `.env.deploy`).
- **Cấm** gọi API đăng ký/hủy/khóa học phần (`RegistScheduleStudyUnit`, `RemoveScheduleStudyUnit`, `LockScheduleStudyUnitByID`, `UnLockScheduleStudyUnitByID`, `sendOtpByUser`). Chỉ API đọc.
- Gọi API trường chậm: 1 luồng, nghỉ 1,5–3,5 s ngẫu nhiên, nghỉ dài sau ~60 request, dừng ngay khi 401/403/429.
- Dữ liệu cá nhân (`data/uel_my_timetable*.json`, `data/raw/ctdt_programs.json`…) không commit, không đưa vào image, không dán vào chat.
- Không dùng cờ bỏ qua quyền (`--dangerously-skip-permissions`…) trừ khi chủ dự án duyệt từng lệnh.
- Cấu hình đọc từ biến môi trường (`.env.example`), không hard-code.
- AI quy chế mặc định `extractive`; không bịa số quyết định/ngày, thiếu nguồn nói "không tìm thấy".
- Mỗi thay đổi có test chạy được; không sửa test cho "xanh" khi hành vi sai.
- **Commit:** tiêu đề `[claude|gemini|codex] feat|fix|docs|data|chore: …`. **Không** thêm dòng `Co-Authored-By` hay "Generated with …". Chỉ commit khi chủ dự án cho phép; không commit thay đổi dở của AI khác.

## Quy tắc nghiệp vụ (đã chốt, áp dụng mọi nơi)
- Khóa `Kyy` = tuyển sinh năm 20yy, bắt đầu năm học 20yy–20yy+1 (K26 → 2026–2027). Không dùng kiểu K44/K47.
- Mỗi năm **3 học kỳ** HK1, HK2, HK3; không có "học kỳ hè". Một khóa 4 năm = 12 học kỳ.
- CTĐT ban hành theo năm áp dụng **hai khóa**: CTĐT 2023 → K23, K24; CTĐT 2025 → K25, K26; 2027 → K27, K28.
- Học kỳ `n` trong CTĐT = kỳ thứ n kể từ HK1 năm nhập học, đếm liên tiếp qua HK3 (HK4 = HK1 năm 2).
- Mã lớp: `K<khóa><mã ngành 3 số>[hậu tố]`; hậu tố `E` tiếng Anh, `T` cử nhân tài năng, `TE` tài năng tiếng Anh, `H` Coop; chữ A/B/C là thứ tự lớp hệ chuẩn. Chỉ hệ có sheet CTĐT chính thức mới tồn tại (vd 414 không có hệ E).
- Nguồn khoa/bộ môn của học phần, ưu tiên: `api/seed/faculty_overrides.tsv` → `Master_data.xlsx` → đề cương → bản tương ứng Anh↔Việt → tiền tố mã → giữ nguyên.
- K24 lấy từ cổng trường là đúng 100%; K23 hệ tiếng Việt sao chép từ K24. Đề cương cùng mã môn có thể khác nhau giữa CTĐT 2023 và 2025.

## Chạy dự án
Docker dùng chung (cùng container, cùng DB cho mọi AI): `.\scripts\dev.ps1 init | up | setup | test | psql`, `.\scripts\dev.ps1 run <lệnh>`, `.\scripts\dev.ps1 ctx` (gói ngữ cảnh cho ChatGPT web). Không có Docker: `api\.venv\Scripts\python.exe -m pytest -q --ignore=tests/rag`; trong `web/`: `npm test`, `npm run build`. Sao lưu DB trước khi ghi dữ liệu: `.\scripts\db_backup.ps1 -Tag <lý-do>`. Triển khai: `docs/DEPLOY_FREE.md`.

## Bàn giao
**Bắt đầu:** `git status`, đọc HANDOFF, ghi một dòng vào "Khóa phiên". **Kết thúc hoặc sắp hết quota:** xong thay đổi đang dở → chạy test liên quan → cập nhật HANDOFF (việc dở + **lệnh cụ thể** để tiếp tục) → xóa dòng khóa phiên. HANDOFF chỉ giữ việc còn mở và kiểm chứng của **7 ngày gần nhất**; mục cũ hơn chuyển sang `docs/handoff/HISTORY.md`. Người nhận chạy lại test trước khi làm tiếp.

## Ghi chú công cụ
- **Claude Code:** đọc `CLAUDE.md`.
- **Antigravity (`agy`):** đọc `GEMINI.md`; `%LOCALAPPDATA%\agy\bin\agy.exe`, chạy `--mode plan` hoặc `--mode accept-edits`. Brief giao việc ở `scripts/agent_briefs/`.
- **Codex CLI:** đọc file này; chạy `codex exec --sandbox workspace-write "<yêu cầu>"` ở thư mục dự án.
- **ChatGPT web:** chạy `.\scripts\dev.ps1 ctx` rồi dán `docs/CONTEXT_PACK.md`.
