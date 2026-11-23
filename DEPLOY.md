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
