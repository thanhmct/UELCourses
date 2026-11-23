# Brief D2 — Thống nhất tên "UELPATH" và chuyển tài liệu triển khai từ Neon sang Supabase

Tự tìm file. Không chạy lệnh shell, không commit, không sửa code nghiệp vụ. Chỉ sửa tài liệu, file cấu hình mẫu và chuỗi hiển thị.

## Bối cảnh
Dự án từng tên cũ là "uelplan", nay thống nhất là **UELPATH**. Chủ dự án đang triển khai thật: Supabase (database, project tên `UELCourses`, region Tokyo `ap-northeast-1`), Render (API, `api.uelcourses.id.vn`), Vercel (web, `uelcourses.id.vn`). Tài liệu triển khai hiện vẫn ghi Neon.

## Yêu cầu

### 1. Bỏ tên cũ "uelplan" khỏi tài liệu
Grep `uelplan` trong toàn repo (bỏ qua `node_modules`, `.venv*`, `.next*`, `.git`). Các file có: `api/app/config.py` (4), `api/tests/test_config_database.py` (2), `docker-compose.yml` (5), `docker-compose.dev.yml` (1), `scripts/build_table_structure.py`, `scripts/gen_db_doc.py`, và nhiều file trong `docs/` (`DATABASE.md`, `DATA_DICTIONARY.md`, `DEPLOY_FREE.md`, `HANDOFF.md`, `ROADMAP.md`, `README.md`, `CONTEXT_PACK.md`, `summary.md`), `scripts/agent_briefs/A2_ci_workflow.md`.

**QUAN TRỌNG — không đổi giá trị mặc định của database đang chạy.** `POSTGRES_DB=uelplan` và `POSTGRES_USER=uelplan` trong `docker-compose*.yml`, `.env.example`, `config.py` phải **GIỮ NGUYÊN**. Lý do: database Docker trên máy chủ dự án đã khởi tạo với tên và user đó, chứa 127 MB dữ liệu thật. Đổi giá trị sẽ làm app không kết nối được và phải nạp lại toàn bộ dữ liệu.

Chỉ sửa:
- Tên dự án trong **văn xuôi tài liệu**: "uelplan" khi dùng như tên dự án → "UELPATH".
- Chỗ nào nhắc `uelplan` như **tên database/user kỹ thuật** thì giữ nguyên, nhưng thêm chú thích một dòng: "tên database nội bộ, giữ nguyên từ bản đầu; tên dự án là UELPATH".
- Trong `config.py` và `test_config_database.py`: chỉ sửa comment/docstring, không sửa giá trị.

### 2. Chuyển tài liệu triển khai sang Supabase
Viết lại `docs/DEPLOY_FREE.md` cho đúng kiến trúc thật:

| Thành phần | Dịch vụ | Địa chỉ |
|---|---|---|
| Web (Next.js) | Vercel Hobby, root directory `web` | `uelcourses.id.vn` |
| API (FastAPI) | Render Free, Docker, region Singapore | `api.uelcourses.id.vn` |
| Database | **Supabase Free**, region `ap-northeast-1` (Tokyo) | nội bộ, không có tên miền |

Nội dung phải có:
- **Chuỗi kết nối**: dùng **Session pooler** của Supabase (cổng 5432, host `aws-0-ap-northeast-1.pooler.supabase.com`), KHÔNG dùng Direct connection vì chuỗi đó chỉ chạy IPv6 trong khi Render free là IPv4. Với SQLAlchemy phải đổi đầu chuỗi thành `postgresql+psycopg://` và thêm `?sslmode=require`.
- **Mật khẩu database chỉ nên gồm chữ và số**, vì ký tự đặc biệt (`@ : / ? # & %`) làm hỏng định dạng URL; nếu buộc dùng thì phải mã hóa phần trăm.
- **Nạp dữ liệu lần đầu**: dump từ Docker (`pg_dump -Fc --no-owner --no-acl`) rồi `pg_restore` lên Supabase. Bản dump mang theo bảng `alembic_version` nên Render chạy `alembic upgrade head` sẽ không làm gì thêm. Giải thích vì sao cần `--no-owner --no-acl` (Supabase dùng role khác).
- **Biến môi trường Render**: bảng đầy đủ gồm `DATABASE_URL`, `CORS_ORIGINS=https://uelcourses.id.vn`, `FRONTEND_BASE_URL=https://uelcourses.id.vn`, `OAUTH_REDIRECT_BASE=https://api.uelcourses.id.vn`, và các biến `render.yaml` đã tự lo (`SESSION_SECRET`, `ENV`, `AUTO_SEED`, `PORT`).
- **Biến môi trường Vercel**: `NEXT_PUBLIC_API_URL=https://api.uelcourses.id.vn`, nhấn mạnh biến này được **nhúng lúc build** (xem `web/next.config.ts`), nên phải đặt trước khi build và đổi thì phải deploy lại.
- **Tên miền**: gắn ở Vercel (`uelcourses.id.vn`) và Render (`api.uelcourses.id.vn`); nếu dùng Cloudflare thì để DNS-only (đám mây xám) cho tới khi cả hai cấp xong SSL, sau đó mới bật proxy và đặt SSL mode Full (strict).
- **Hạn chế gói miễn phí**: Render ngủ sau 15 phút không truy cập (request đầu 30–60 giây); Supabase tạm dừng sau 7 ngày không truy cập; Supabase free 500 MB trong khi DB hiện 127 MB.
- **Độ trễ**: Supabase ở Tokyo, Render ở Singapore nên mỗi truy vấn tốn thêm ~70 ms; ghi lại để sau này cân nhắc chuyển vùng.
- **Chống cào dữ liệu**: trỏ sang `S1_api_rate_limit` và phần Cloudflare (Bot Fight Mode, rate limiting rule, cache cho endpoint đọc).

### 3. Cập nhật `render.yaml` và `.env.example`
- `render.yaml`: sửa các dòng chú thích đang ghi "Neon" thành Supabase, nêu rõ phải dùng Session pooler và tiền tố `postgresql+psycopg://`. Giữ nguyên `name: uelcourses-api` (Render bắt tên dịch vụ phải chữ thường).
- `.env.example`: dòng chú thích `DATABASE_URL` đổi ví dụ Neon thành ví dụ Supabase Session pooler. Giữ nguyên mọi giá trị mặc định khác.

### 4. Không đụng tới
`.env.deploy` (file chứa mật khẩu thật của chủ dự án, đã gitignore) — không đọc, không sửa, không nhắc nội dung.

Báo cáo cuối: liệt kê file đã sửa và những chỗ cố ý giữ nguyên tên `uelplan` kèm lý do.
