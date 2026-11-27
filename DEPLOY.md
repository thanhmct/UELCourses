# Chạy UELPATH bằng Docker

## 1. Cài đặt (một lần)

- Cài **Docker Desktop for Windows** (cần bật WSL 2; trình cài đặt sẽ hướng dẫn). Kiểm tra: `docker --version`, `docker compose version`.
- `copy .env.example .env` rồi đổi `POSTGRES_PASSWORD`.

## 2. Phát triển (hot reload, cả nhóm dùng chung một môi trường)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

- Web: http://localhost:3000 · API: http://localhost:8000/docs · Postgres: localhost:5432
- Sửa code trong `web/` hoặc `api/` → tự reload.
- Nạp dữ liệu mẫu: `docker compose exec api python -m app.cli seed`
- Nhập dữ liệu thật từ `fetch_courses.py`: chép `data/courses.json` vào `api/data/` hoặc dùng `POST /api/import/classes` trên trang `/docs`.
- Xây chỉ mục quy chế: `docker compose exec api python scripts/ingest_regulations.py`

## Nhập bản sao Supabase vào PostgreSQL local

API trong Compose luôn đọc PostgreSQL service `db`; file SQLite `data/db/uelplan.db` không được dùng. Script dưới đây chỉ đọc schema ứng dụng `public` từ Supabase, tạo backup local, rồi chỉ ghi vào service `db` sau khi bạn xác nhận rõ:

```powershell
# Điền SUPABASE_DB_HOST/PORT/USER/NAME trong .env; không lưu password.
.\scripts\import_supabase_to_local.ps1
```

Script dùng PostgreSQL client 17 trong image `pgvector/pgvector:pg17`, hỗ trợ Direct connection hoặc Session pooler và mặc định `sslmode=require`. Password được hỏi bằng prompt ẩn và chỉ truyền vào container client qua biến môi trường. Dump cùng backup local nằm trong `%TEMP%\uelpath_supabase_import_<timestamp>`, bên ngoài repository. Script kiểm tra exit code, file khác rỗng và `pg_restore --list` trước khi restore; không migrate hay ghi lên Supabase và không xóa volume `pgdata`.

Nếu thiếu cấu hình `.env`, có thể truyền các giá trị không bí mật:

```powershell
.\scripts\import_supabase_to_local.ps1 -SupabaseHost db.example.supabase.co -SupabasePort 5432 -SupabaseUser postgres -SupabaseDatabase postgres -SslMode require
```

Xác minh số bản ghi sau restore (cả hai lệnh chỉ đọc local):

```powershell
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -c "SELECT schemaname, relname, n_live_tup AS estimated_rows FROM pg_stat_user_tables WHERE schemaname = ''public'' ORDER BY relname;"'
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM public.<ten_bang>;"'
docker compose up -d api
docker compose logs --tail 100 api
```

Lỗi DNS/network, SSL, authentication, version mismatch hoặc archive hỏng sẽ dừng quy trình trước thao tác thay thế local và in hướng xử lý.

## 3. Production / staging

```bash
docker compose up -d --build
```

Image production: web chạy Next.js standalone (Node 24 alpine), api chạy uvicorn (Python 3.14 slim), đều dưới user không phải root; dữ liệu nằm trong volume `pgdata`, `apidata`.

## 4. AI tra cứu quy chế

| `LLM_PROVIDER` | Chi phí | Ghi chú |
|---|---|---|
| `none` (mặc định) | Miễn phí | Chỉ trả nguyên văn Điều/Khoản + số quyết định |
| `ollama` | Miễn phí, cần RAM ≥ 8 GB (GPU càng tốt) | `docker compose --profile ollama up -d` rồi `docker compose exec ollama ollama pull qwen2.5:7b` |
| `claude` | Trả phí theo lượng dùng | Điền `ANTHROPIC_API_KEY` trong `.env` |

## 5. Đưa lên web

Hướng gợi ý cho khóa luận (rẻ, đơn giản): một VPS Linux (2 vCPU / 4 GB RAM; 8 GB nếu chạy Ollama) cài Docker → `git clone` → tạo `.env` với:

```
PUBLIC_API_URL=https://api.ten-mien-cua-ban
CORS_ORIGINS=https://ten-mien-cua-ban
```

→ `docker compose up -d --build`, rồi đặt reverse proxy có HTTPS (Caddy hoặc Nginx + Let's Encrypt) trỏ tên miền vào cổng 3000 (web) và 8000 (api). Phương án thay thế: web lên Vercel, api + Postgres lên Render/Railway/Fly.io dùng cùng `docker/api.Dockerfile`.

Lưu ý bảo mật khi public: không bao giờ lưu token sinh viên; giới hạn tần suất các endpoint `/api/sync/*` và `/api/regulations/ask`; sao lưu volume `pgdata` định kỳ.
