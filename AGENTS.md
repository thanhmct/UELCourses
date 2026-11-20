# UELCourses — hướng dẫn chung cho MỌI AI (Claude, Gemini/Antigravity, ChatGPT/Codex)

File này là **nguồn sự thật duy nhất** về cách làm việc. `CLAUDE.md` và `GEMINI.md` chỉ trỏ về đây.
Mục tiêu: bất kỳ AI nào cũng đọc xong trong vài phút và làm tiếp đúng chỗ người trước dừng (kể cả khi người trước hết token giữa chừng).

## 1. Dự án
UELCourses: nền tảng web cho sinh viên Trường ĐH Kinh tế – Luật (UEL, ĐHQG-HCM) — tra cứu học phần, xếp thời khóa biểu, lập kế hoạch nhiều học kỳ, cây môn học (tiên quyết/học trước), học phần tương đương, và AI tra cứu quy chế học vụ (RAG, trích dẫn chính xác Điều/Khoản, theo khóa). Là khóa luận tốt nghiệp, phát triển theo Design Thinking (`research/`). Chức năng và bố cục tham khảo NUSMods (theo `docs/UI_STYLE_GUIDE.md`) nhưng **không** dùng tên, logo, màu/ảnh thương hiệu hay sao chép mã nguồn của họ.

## 2. Thứ tự đọc khi bắt đầu phiên (tiết kiệm token — đừng đọc cả cây thư mục)
1. `docs/HANDOFF.md` — trạng thái hiện tại, việc đang làm dở, việc tiếp theo, lỗi đã biết. **Đọc đầu tiên.**
2. `ARCHITECTURE.md` — hợp đồng API, kiểu dữ liệu, kiến trúc.
3. `docs/DECISIONS.md` — các quyết định đã chốt (đừng tranh luận lại).
4. README của thư mục bạn sắp sửa (`api/`, `web/`, `api/app/rag/`, `regulations/`, `research/`).

## 3. Thư mục làm việc duy nhất: `D:\UELCourse` (trong Docker: `/workspace`)
Không ghi file ngoài thư mục này (trừ thư mục tạm của hệ điều hành). Quyền sửa theo vùng:

| Vùng | Nội dung |
|---|---|
| `web/` | Next.js (TypeScript, Tailwind) |
| `api/` (trừ `api/app/rag/`) | FastAPI + SQLAlchemy, importer, CLI |
| `api/app/rag/`, `api/scripts/ingest_regulations.py` | RAG quy chế |
| `regulations/` | văn bản quy chế gốc + `catalog.json` |
| `research/` | khảo sát, persona, phân tích feedback |
| `data/` | dữ liệu thô/đã xử lý — **không commit** (có dữ liệu cá nhân) |
| `docs/`, `scripts/`, `docker/` | tài liệu, script tiện ích, Docker |

Hai AI không sửa cùng một file cùng lúc: xem mục "Khóa phiên" trong `docs/HANDOFF.md`.

## 4. Quy tắc cứng
- Giao diện/nội dung người dùng: **tiếng Việt**. Code, tên biến: tiếng Anh.
- **Quy ước khóa:** mã khóa = 2 số cuối năm nhập học (K22 = tuyển sinh 2022). Quy định ghi áp dụng khóa nào thì chỉ áp dụng khóa đó. Không dùng cách đánh số cũ K44/K47.
- **Token/ mật khẩu / cookie sinh viên:** không bao giờ ghi vào file, log, commit, tin nhắn. Chỉ qua biến môi trường hoặc `token.txt` (đã `.gitignore`).
- **Cấm** gọi API đăng ký/hủy/khóa học phần (`RegistScheduleStudyUnit`, `RemoveScheduleStudyUnit`, `LockScheduleStudyUnitByID`, `UnLockScheduleStudyUnitByID`, `sendOtpByUser`). Chỉ gọi API đọc.
- **Gọi API của trường phải chậm và ít** (chủ dự án lo bị phát hiện): 1 luồng, nghỉ 1,5–3,5 giây ngẫu nhiên giữa các request, nghỉ dài sau mỗi ~60 request, dừng ngay khi gặp 401/403/429. Không chạy song song nhiều luồng.
- Dữ liệu cá nhân (`data/uel_my_timetable*.json`, `data/raw/ctdt_programs.json`, …): không commit, không đưa vào Docker image, không dán vào chat công khai.
- Không dùng cờ bỏ qua quyền/duyệt của công cụ (vd `--dangerously-skip-permissions`).
- Cấu hình/đường dẫn đọc từ biến môi trường (`DATABASE_URL`, `DATA_DIR`, `REGULATIONS_DIR`, `CORS_ORIGINS`, `LLM_PROVIDER`…, xem `.env.example`), không hard-code.
- AI quy chế: mặc định chế độ `extractive` (miễn phí, chỉ trích nguyên văn). Không bịa số quyết định/ngày; thiếu nguồn thì nói "không tìm thấy".
- Mỗi thay đổi có test chạy được; không sửa test cho "xanh" nếu hành vi sai.

## 5. Chạy dự án
Môi trường chuẩn là Docker dùng chung (cùng container + cùng database cho mọi AI):

```powershell
.\scripts\dev.ps1 init      # tạo .env (mật khẩu DB ngẫu nhiên) nếu chưa có
.\scripts\dev.ps1 up        # db (Postgres) + workspace (Python 3.14 + Node 24)
.\scripts\dev.ps1 setup     # cài thư viện trong container (lần đầu)
.\scripts\dev.ps1 test      # pytest (api) + vitest (web)
.\scripts\dev.ps1 run <lệnh>   # chạy lệnh bất kỳ trong container, vd: run python -m app.cli seed
.\scripts\dev.ps1 psql      # vào Postgres
.\scripts\dev.ps1 ctx       # tạo docs/CONTEXT_PACK.md để dán cho AI không có quyền đọc file (ChatGPT web)
```

Không có Docker (hoặc Docker chưa chạy): dùng trực tiếp `api\.venv\Scripts\python.exe -m pytest -q --ignore=tests/rag` (SQLite mặc định) và `npm run build`, `npm test` trong `web/`. Docker Desktop phải đang chạy thì `dev.ps1 up` mới hoạt động.

## 6. Giao thức bàn giao (làm theo từng phiên)
**Bắt đầu:** `git status`; đọc `docs/HANDOFF.md`; ghi tên bạn + việc dự định vào bảng "Khóa phiên".
**Trong lúc làm:** thay đổi nhỏ, commit thường (`[claude]`, `[gemini]` hoặc `[codex]` + loại: `feat|fix|docs|data|chore`, vd `[gemini] fix: parse tiết 16`). Chỉ commit khi chủ dự án cho phép hoặc quy ước của họ cho phép.
**Khi sắp hết token** (hoặc kết thúc phiên): dừng bắt đầu việc mới → hoàn tất thay đổi nguyên tử đang làm → chạy test liên quan → cập nhật `docs/HANDOFF.md` (mục *Đang làm dở* và *Việc tiếp theo* ghi **lệnh cụ thể** để tiếp tục) → xóa dòng khóa phiên của bạn. Không để việc dở mà không ghi.
**Người nhận:** đọc HANDOFF → chạy lại test để kiểm chứng trạng thái → mới làm tiếp. Không tin tuyệt đối vào phần "đã xong" chưa có cột *Đã kiểm chứng*.

## 7. Ghi chú theo công cụ
- **Claude Code:** đọc `CLAUDE.md` (tự import file này). Brief các agent con ở `.claude/agents/*.md` là văn bản thường — AI nào cũng có thể làm theo như một đề bài.
- **Gemini / Antigravity (`agy`):** đọc `GEMINI.md` (import file này). Chạy `agy` với `--mode plan` hoặc `--mode accept-edits`. Đường dẫn: `%LOCALAPPDATA%\agy\bin\agy.exe` (chưa nằm trong PATH).
- **ChatGPT / Codex:** Codex CLI đọc `AGENTS.md`. ChatGPT web không đọc được file: chạy `.\scripts\dev.ps1 ctx` rồi dán `docs/CONTEXT_PACK.md`.
