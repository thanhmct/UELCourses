# Brief cho agent: A2 — CI GitHub Actions (docs/ROADMAP.md, mục 3.A2)

Bạn làm việc trong repo `D:\UELCourse` (đọc `AGENTS.md` mục 4 trước: không ghi token, không dùng cờ bỏ qua quyền).
**Chỉ được tạo/sửa đúng một file: `.github/workflows/ci.yml`.** Không sửa file nào khác, không chạy git commit.

## Yêu cầu
Tạo workflow `CI` chạy khi `push` và `pull_request` vào nhánh `main`, có `concurrency` hủy lần chạy cũ cùng nhánh, `permissions: contents: read`.

### Job `api` (ubuntu-latest, `working-directory: api`)
- Service Postgres: image `pgvector/pgvector:pg17`, `POSTGRES_USER=uelplan`, `POSTGRES_PASSWORD=ci-only-password`, `POSTGRES_DB=uelplan`, cổng 5432, health check `pg_isready`.
- `actions/setup-python@v5` với `python-version: "3.14"`, bật cache pip theo `api/requirements.txt`.
- `sudo apt-get install -y poppler-utils` (lệnh `pdftotext`).
- `pip install -r requirements.txt`.
- Bước "Migrations": `alembic upgrade head` rồi `alembic check`, với env `DATABASE_URL=postgresql+psycopg://uelplan:ci-only-password@localhost:5432/uelplan`.
- Bước "Downgrade/upgrade": `alembic downgrade base` rồi `alembic upgrade head` (cùng env) — kiểm tra migration đảo ngược được.
- Bước "Tests": `pytest -q --ignore=tests/rag` (test tự dùng SQLite tạm qua `tests/conftest.py`; KHÔNG đặt DATABASE_URL ở bước này).
- Bước "RAG tests (đang có 4 test lỗi đã biết)": `pytest -q tests/rag` với `continue-on-error: true`.

### Job `web` (ubuntu-latest, `working-directory: web`)
- `actions/setup-node@v4` với `node-version: "24"`, cache npm theo `web/package-lock.json`.
- `npm ci`
- `npx tsc --noEmit`
- `npm test` (Vitest)
- `npm run build` với env `NEXT_PUBLIC_API_URL=http://localhost:8000` và `NEXT_TELEMETRY_DISABLED=1`.

## Ràng buộc
- Không dùng secret nào; mật khẩu `ci-only-password` chỉ dùng trong service CI.
- Comment ngắn bằng tiếng Việt ở đầu file giải thích mục đích (theo AGENTS.md: nội dung cho người đọc là tiếng Việt).
- YAML hợp lệ (2 dấu cách thụt lề). Khi xong, in ra nội dung file.
