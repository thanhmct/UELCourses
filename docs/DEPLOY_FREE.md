# Triển khai UELPATH trên gói miễn phí

| Dịch vụ | Vai trò | Gói | Địa chỉ |
|---|---|---|---|
| Vercel | Web Next.js, thư mục gốc `web` | Hobby | `https://uelcourses.id.vn` |
| Render | API FastAPI chạy Docker tại Singapore | Free Web Service | `https://api.uelcourses.id.vn` |
| Supabase | PostgreSQL cho project `UELCourses` tại Tokyo (`ap-northeast-1`) | Free | `aws-1-ap-northeast-1.pooler.supabase.com:6543`, database `postgres` |

## 1. Tạo project Supabase

1. Tạo project `UELCourses` tại Tokyo (`ap-northeast-1`). Đặt mật khẩu database dài, ngẫu nhiên và chỉ gồm chữ và số. Các ký tự `@ : / ? # & %` ở dạng thô có thể làm hỏng cách phân tích URL.
2. Trong bảng điều khiển project, mở **Connect** và sao chép URL **Transaction pooler**. Project này dùng cổng **6543** và host bắt đầu bằng **`aws-1-`**. Những lần thử Session pooler cổng 5432 và Direct của project này đều bị từ chối kết nối.
3. Lưu URL dạng `postgresql://` vào biến `SUPABASE_DB_URL` trong tệp `.env.deploy` ở máy cục bộ. Với `DATABASE_URL` trên Render, đổi tiền tố thành `postgresql+psycopg://` và thêm `?sslmode=require`.

Ví dụ `DATABASE_URL` đã che mật khẩu và mã project:

```text
postgresql+psycopg://postgres.xxxxxxxx:<MAT_KHAU_DA_CHE>@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require
```

## 2. Nạp dữ liệu và cập nhật về sau

Chuẩn bị Postgres Docker cục bộ với dữ liệu và migration cần đưa lên. Ảnh chụp dữ liệu đã nạp theo X1 có **1.486 học phần**, **5.879 lớp học phần**, **76 chương trình** và Alembic **`0019`**. Đối chiếu lần nạp mới với số liệu của nguồn cục bộ tại thời điểm chạy.

Từ thư mục gốc trên Windows:

```powershell
.\scripts\deploy\push_to_supabase.ps1 -DryRun
.\scripts\deploy\push_to_supabase.ps1
```

Script xuất SQL thuần bằng `pg_dump --no-owner --no-acl` và hỏi xác nhận trước khi thay toàn bộ schema `public`. Sau khi tạo lại schema, script nạp bằng `psql -f`, chạy `ALTER DATABASE postgres SET search_path TO public;` rồi in số dòng và phiên bản Alembic. Lần thử dùng archive `-Fc` và `pg_restore` qua pooler đã gặp lỗi `relation already exists`. Cách chuẩn bị công cụ và chạy chi tiết nằm trong [README của script deploy](../scripts/deploy/README.md).

Với mỗi lần cập nhật bằng bản dump đầy đủ, cập nhật dữ liệu cục bộ và sao lưu các thay đổi phát sinh trực tiếp trên production trước khi chạy. Khôi phục schema sẽ thay cả các bảng chứa dữ liệu ghi trên production. Kiểm tra phiên bản vừa nạp, rồi khởi động lại hoặc triển khai lại API để chạy migration còn thiếu và tạo lại kết nối. Nếu các kết nối cũ của pooler còn dùng giá trị `search_path` trước đó, chờ chúng được thay mới và kiểm tra lại trước khi phục vụ người dùng.

## 3. Triển khai API trên Render

Tạo Blueprint từ [render.yaml](../render.yaml) trong repository để dựng dịch vụ Docker `uelcourses-api` ở Singapore. Điền các biến nhập tay trước khi triển khai.

| Biến | Giá trị | Nguồn |
|---|---|---|
| `DATABASE_URL` | URL Transaction pooler cổng 6543 với driver `postgresql+psycopg` và `sslmode=require` | Nhập tay, dạng bí mật |
| `CORS_ORIGINS` | `https://uelcourses.id.vn` | Nhập tay |
| `FRONTEND_BASE_URL` | `https://uelcourses.id.vn` | Nhập tay |
| `OAUTH_REDIRECT_BASE` | `https://api.uelcourses.id.vn` | Nhập tay |
| `SESSION_SECRET` | Chuỗi ngẫu nhiên | Blueprint tạo tự động |
| `ENV` | `production` | Blueprint |
| `AUTO_SEED` | `false` | Blueprint |
| `PORT` | `8000` | Blueprint |
| `DB_POOL_SIZE` | `5` | Blueprint |
| `DB_MAX_OVERFLOW` | `5` | Blueprint |

Lệnh `sh /app/start.sh` chạy Alembic rồi khởi động Uvicorn. Render kiểm tra `/api/health`. Engine dùng `pool_pre_ping` và tắt tự động chuẩn bị câu lệnh của psycopg3 để tương thích với Transaction pooler.

## 4. Triển khai web trên Vercel

Nhập repository vào Vercel, chọn **Next.js**, đặt **Root Directory** là `web` và đặt biến Production `NEXT_PUBLIC_API_URL=https://api.uelcourses.id.vn`.

`NEXT_PUBLIC_API_URL` được **nhúng lúc build**. Sau khi đổi giá trị, triển khai lại web để trình duyệt nhận URL mới. Xem [web/next.config.ts](../web/next.config.ts).

## 5. Gắn tên miền và bật HTTPS

1. Thêm `uelcourses.id.vn` vào project Vercel và `api.uelcourses.id.vn` vào dịch vụ Render. Tạo các bản ghi DNS mà từng bảng điều khiển yêu cầu.
2. Nếu dùng Cloudflare, để các bản ghi ở **DNS only** (đám mây xám) tới khi cả Vercel và Render báo đã cấp SSL cho tên miền riêng.
3. Đặt SSL/TLS của Cloudflare thành **Full (strict)** rồi bật proxy cho các bản ghi cần bảo vệ. Kiểm tra lại cả hai URL HTTPS. [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)

## 6. Kiểm tra triển khai

```powershell
.\scripts\deploy\check_deploy.ps1 -WebUrl https://uelcourses.id.vn -ApiUrl https://api.uelcourses.id.vn
```

Cả bốn GET phải trả HTTP 2xx và `Access-Control-Allow-Origin: https://uelcourses.id.vn`. Mở thêm web để thử tra cứu học phần, xem chương trình đào tạo và xếp thời khóa biểu. [Checklist triển khai](DEPLOY_CHECKLIST.md)

## 7. Hạn chế gói miễn phí

- Render Free ngủ sau khoảng **15 phút** không có truy cập. Yêu cầu đầu tiên sau khi ngủ có thể mất **30–60 giây**.
- Supabase Free có thể tạm dừng project sau **7 ngày** không truy cập. Dung lượng gói là **500 MB**. Database ở mốc X1 khoảng **127 MB**.
- Đường truyền từ Render Singapore tới Supabase Tokyo làm tăng độ trễ khoảng **70 ms** theo mốc X1.

## 8. Lỗi thường gặp

| Lỗi | Cách xử lý |
|---|---|
| Render dừng với `exit 127` | Kiểm tra Blueprint dùng đúng `dockerCommand: sh /app/start.sh`. Đặt thứ tự chạy migration và Uvicorn trong [api/start.sh](../api/start.sh). Chuỗi nhiều lệnh nối bằng `&&` trong `dockerCommand` từng gây lỗi này. |
| `Connection refused` ở cổng 5432 | Lấy lại URL Transaction pooler cổng 6543, kiểm tra đúng host `aws-1-ap-northeast-1`. |
| `relation "modules" does not exist` hoặc `relation does not exist` | Kiểm tra bảng trong `public`. Sau khi nạp, chạy `ALTER DATABASE postgres SET search_path TO public;` và kiểm tra lại với kết nối mới. |
| `could not translate host` khi dùng Direct | Kiểm tra mã project và DNS. Direct của project dùng IPv6, có thể gặp lỗi phân giải hoặc kết nối tùy mạng của máy khách. Dùng host Transaction pooler đã chỉ định cho X1. |
| URL hỏng khi mật khẩu chứa ký tự đặc biệt | Đặt lại mật khẩu chỉ gồm chữ và số. Cập nhật `.env.deploy` cục bộ và `DATABASE_URL` trên Render rồi khởi động lại API. |
| `prepared statement ... does not exist` hoặc `already exists` | Kiểm tra API đã dùng bản có `prepare_threshold=None` cho psycopg3. |

## 9. Giảm cào dữ liệu qua Cloudflare

- Cân nhắc bật **Bot Fight Mode** cho domain đã qua proxy, rồi chạy lại kiểm tra HTTP và CORS. Bot Fight Mode có thể trả thử thách cho cả các máy khách API hợp lệ. [Cloudflare Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/)
- Tạo một **Rate Limiting Rule** khớp đường dẫn bắt đầu bằng `/api/`, đếm theo IP. Mục tiêu là vượt **240 request trong 60 giây** thì **Block trong 10 phút**. Cấu hình chính xác cần gói Cloudflare hỗ trợ cửa sổ 60 giây và thời gian chặn 600 giây. Trên Cloudflare Free, có thể dùng một rule **40 request/10 giây, chặn 10 giây** để áp dụng mức trung bình 240 request/phút với cửa sổ ngắn hơn. [Giới hạn Rate Limiting Rules theo gói](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- Dùng **Cache Rules** với TTL ngắn cho GET công khai như `/api/semesters`, `/api/programs` và `/api/modules`. Giữ query string trong cache key và kiểm tra phản hồi CORS sau khi bật cache. Bỏ qua cache cho yêu cầu có cookie hoặc Authorization và các đường dẫn xác thực, quản trị hoặc dữ liệu cá nhân. [Cloudflare Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/)
- Khi bật proxy Cloudflare, chỉ công bố `https://api.uelcourses.id.vn` trong cấu hình web và tài liệu công khai. Không để lộ URL gốc `*.onrender.com`.
