# Brief X1 — (Codex) Công cụ triển khai Supabase + Render, tài liệu, sửa tương thích Transaction pooler

Người thực thi: **Codex CLI**, chạy song song với Antigravity. Để hai bên không sửa chồng file, Codex CHỈ được sửa các file liệt kê ở mục "Vùng được sửa". Tuyệt đối không đụng `web/src/**`, `api/app/**` (trừ đúng một file `api/app/db.py` nêu bên dưới), `api/migrations/**`, `api/seed/**`, `api/tests/**`, `scripts/agent_briefs/**`. Không commit, không push. Không đọc, không in, không sửa `.env.deploy` hay bất kỳ file chứa mật khẩu nào. Không chạy lệnh kết nối tới Supabase hay Render.

## Vùng được sửa
- `docs/DEPLOY_FREE.md` (viết lại)
- `docs/DEPLOY_CHECKLIST.md` (tạo mới)
- `scripts/deploy/` (thư mục mới, toàn bộ file trong đó)
- `render.yaml` (chỉ phần chú thích và biến môi trường mới nêu dưới đây)
- `.env.example` (chỉ phần chú thích DATABASE_URL)
- `api/app/db.py` (chỉ hàm tạo engine, đúng như mục 2)
- `api/tests/test_db_engine_options.py` (file mới, một file test duy nhất cho mục 2)

## Bối cảnh (đã xác định thật, không đoán)
- Kiến trúc: **Vercel** (web `uelcourses.id.vn`, root `web`) → **Render Free Docker** (API `api.uelcourses.id.vn`, region Singapore) → **Supabase Free** (Postgres, project `UELCourses`, region Tokyo `ap-northeast-1`).
- Project Supabase này **chỉ mở Transaction pooler cổng 6543**. Cổng Session pooler 5432 và Direct bị từ chối kết nối (đã thử). Chuỗi kết nối có dạng `postgresql://postgres.<ref>:<mật khẩu>@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres`. Host dùng `aws-1-...`, không phải `aws-0-...`.
- Mật khẩu database **chỉ nên gồm chữ và số** (ký tự `@ : / ? # & %` làm hỏng URL).
- Dữ liệu đã nạp lên Supabase: 1486 học phần, 5879 lớp học phần, 76 chương trình, migration Alembic `0019`.
- Dump phải dùng **SQL thuần** (`pg_dump --no-owner --no-acl`, không dùng định dạng `-Fc` + `pg_restore`) vì `pg_restore` qua pooler lỗi "relation already exists". Sau khi nạp phải đặt lại `search_path`: `ALTER DATABASE postgres SET search_path TO public;` — nếu không, Transaction pooler dùng chung kết nối sẽ báo `relation "modules" does not exist` dù bảng có thật.
- Lệnh khởi động API đã tách ra `api/start.sh` và `render.yaml` dùng `dockerCommand: sh /app/start.sh` (chuỗi `a && b` đặt thẳng trong `dockerCommand` gây exit 127). Không sửa lại.

## Yêu cầu

### 1. `docs/DEPLOY_FREE.md` — viết lại cho đúng kiến trúc thật
Bảng ba dịch vụ (Vercel / Render / Supabase), mỗi dịch vụ ghi vai trò, gói miễn phí, địa chỉ. Các mục bắt buộc:
- Tạo project Supabase; lấy chuỗi **Transaction pooler** (cổng 6543); đặt mật khẩu chỉ chữ+số.
- Đổi đầu chuỗi thành `postgresql+psycopg://` và thêm `?sslmode=require` cho `DATABASE_URL` của Render. Ghi rõ ví dụ **đã che mật khẩu**.
- Biến môi trường Render (bảng đầy đủ): `DATABASE_URL`, `CORS_ORIGINS=https://uelcourses.id.vn`, `FRONTEND_BASE_URL=https://uelcourses.id.vn`, `OAUTH_REDIRECT_BASE=https://api.uelcourses.id.vn`; và các biến `render.yaml` tự lo (`SESSION_SECRET`, `ENV=production`, `AUTO_SEED=false`, `PORT`).
- Biến Vercel: `NEXT_PUBLIC_API_URL=https://api.uelcourses.id.vn`, nhấn mạnh biến này được **nhúng lúc build** (xem `web/next.config.ts`) nên đổi thì phải deploy lại web.
- Tên miền: gắn `uelcourses.id.vn` ở Vercel, `api.uelcourses.id.vn` ở Render; nếu dùng Cloudflare thì để **DNS only (đám mây xám)** tới khi cả hai cấp xong SSL, rồi mới bật proxy và đặt SSL mode **Full (strict)**.
- Nạp dữ liệu và cập nhật dữ liệu sau này (xem mục 3).
- Hạn chế gói miễn phí: Render ngủ sau 15 phút (request đầu 30–60 giây); Supabase tạm dừng sau 7 ngày không truy cập; 500 MB (DB hiện ~127 MB); độ trễ thêm ~70 ms vì Supabase ở Tokyo còn Render ở Singapore.
- Mục "Lỗi thường gặp" với đúng các lỗi đã gặp: exit 127 (xem `start.sh`), `Connection refused` cổng 5432, `relation does not exist` (search_path), `could not translate host` (IPv6 của Direct), URL hỏng vì ký tự đặc biệt trong mật khẩu.
- Mục chống cào dữ liệu: trỏ tới Cloudflare Bot Fight Mode + một Rate Limiting Rule (quá 240 request/phút từ một IP vào `/api/*` thì chặn 10 phút) + Cache cho endpoint đọc; ghi rằng **nếu bật proxy Cloudflare thì không để lộ URL gốc `*.onrender.com`**.

### 2. `api/app/db.py` — tương thích Transaction pooler
Transaction pooler (cổng 6543) **không hỗ trợ prepared statement** của psycopg3, nếu để mặc định API sẽ lỗi `prepared statement ... does not exist` hoặc `already exists` khi chạy thật. Khi `DATABASE_URL` trỏ tới PostgreSQL:
- Thêm `connect_args={"prepare_threshold": None}` cho engine (psycopg3: tắt tự động chuẩn bị câu lệnh).
- Giữ `pool_pre_ping=True`. Đặt `pool_size`/`max_overflow` nhỏ (ví dụ 5 và 5) vì gói miễn phí giới hạn kết nối.
- **Chỉ áp dụng cho PostgreSQL**; SQLite (test) giữ nguyên `check_same_thread=False` như hiện tại. Đừng làm hỏng nhánh SQLite.
- Đọc hai giá trị pool từ biến môi trường `DB_POOL_SIZE`, `DB_MAX_OVERFLOW` (mặc định 5 và 5), thêm vào `.env.example` kèm chú thích tiếng Việt.
- Test `api/tests/test_db_engine_options.py`: với URL `postgresql+psycopg://...` tùy chọn chứa `prepare_threshold=None`; với URL SQLite thì không có; giá trị pool đọc đúng từ biến môi trường. Test **không** được kết nối thật tới database nào (chỉ dựng engine/kiểm tra tham số).

### 3. `scripts/deploy/` — công cụ đẩy dữ liệu lên Supabase, an toàn mật khẩu
Viết bằng PowerShell (Windows), chạy ở thư mục gốc dự án:
- `push_to_supabase.ps1`: (1) đọc `SUPABASE_DB_URL` từ `.env.deploy` (KHÔNG in giá trị ra màn hình, KHÔNG ghi vào log, che mật khẩu trong mọi thông báo lỗi); (2) tự đổi cổng `:5432/` thành `:6543/` nếu cần và thêm `?sslmode=require` nếu thiếu; (3) dump từ Postgres Docker local bằng `pg_dump --no-owner --no-acl` ra SQL thuần; (4) hỏi xác nhận rõ ràng ("sẽ XÓA toàn bộ schema public trên Supabase") trước khi `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`; (5) nạp lại bằng `psql -f`; (6) chạy `ALTER DATABASE postgres SET search_path TO public;`; (7) in số dòng các bảng chính (`modules`, `class_sections`, `programs`) và `alembic_version`; (8) tham số `-DryRun` chỉ in các bước sẽ làm, không đụng Supabase.
- `check_deploy.ps1`: nhận hai URL (web, API), gọi `GET <api>/api/health`, `/api/semesters`, `/api/programs`, `/api/modules?size=1`, in mã trạng thái và thời gian từng lần, cảnh báo nếu lần đầu chậm hơn 20 giây (Render đang ngủ), và kiểm tra header CORS cho origin web.
- `README.md` trong thư mục: cách dùng, nhấn mạnh mật khẩu chỉ ở `.env.deploy` (đã gitignore).
- Cả hai script **không được** chứa mật khẩu, khóa hay URL thật nào; dùng giá trị giả `postgres.xxxxxxxx`.

### 4. `render.yaml` và `.env.example`
- `render.yaml`: sửa chú thích đang ghi "Neon" thành Supabase **Transaction pooler cổng 6543**; thêm `DB_POOL_SIZE` và `DB_MAX_OVERFLOW` với giá trị mặc định (`value: "5"`, không `sync: false`). Giữ `name: uelcourses-api`, `dockerCommand: sh /app/start.sh` và mọi cấu hình khác nguyên vẹn.
- `.env.example`: dòng chú thích `DATABASE_URL` đổi ví dụ Neon thành ví dụ Supabase Transaction pooler (mật khẩu giả).

### 5. `docs/DEPLOY_CHECKLIST.md`
Danh sách việc phải làm tay theo đúng thứ tự (tạo tài khoản, tạo project, nạp dữ liệu, Render, Vercel, DNS, kiểm tra), mỗi bước có ô tick `[ ]` và dòng "kết quả mong đợi".

## Kiểm tra
Chủ dự án (hoặc Claude) chạy: `cd api; .venv\Scripts\python.exe -m pytest -q -p no:cacheprovider tests/test_db_engine_options.py` và đọc lại các file trong vùng được sửa. Báo cáo cuối: danh sách file đã tạo/sửa, và mọi chỗ cố ý không làm kèm lý do.
