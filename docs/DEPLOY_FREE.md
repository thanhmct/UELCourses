# Hướng dẫn Triển khai UELCourses Miễn phí

Tài liệu này hướng dẫn từng bước đưa **UELCourses** lên môi trường công khai bằng các dịch vụ **hoàn toàn miễn phí**:
- **Frontend (Web Next.js):** [Vercel](https://vercel.com) (Gói Hobby Miễn phí)
- **Backend (API FastAPI + Docker):** [Render](https://render.com) (Gói Free Web Service)
- **Cơ sở dữ liệu (PostgreSQL):** [Neon](https://neon.tech) (Gói Free Serverless Postgres)

> [!NOTE]
> **Vì sao chọn Neon thay vì PostgreSQL trên Render?**
> Render cung cấp cơ sở dữ liệu PostgreSQL miễn phí nhưng **tự động xóa sau 30 ngày**. Neon cung cấp gói Serverless Postgres miễn phí duy trì lâu dài, lưu trữ dữ liệu bền vững và hỗ trợ đầy đủ các tiện ích mở rộng cần thiết (`pg_trgm`, `unaccent`).

---

## Kiến trúc Tổng quan

```
                      +-----------------------------+
                      |       Người dùng web        |
                      +--------------+--------------+
                                     |
                                     v HTTPS
                      +-----------------------------+
                      |   Frontend (Next.js 15)     |
                      |   Vercel Hobby (Miễn phí)   |
                      +--------------+--------------+
                                     |
                                     | REST API (HTTPS)
                                     v
                      +-----------------------------+
                      |    Backend (FastAPI)        |
                      |  Render Web Service (Free)  |
                      |    (Docker container)       |
                      +--------------+--------------+
                                     |
                                     | postgresql+psycopg
                                     v
                      +-----------------------------+
                      |   Cơ sở dữ liệu Postgres    |
                      |     Neon Serverless Free    |
                      |    (pg_trgm + unaccent)     |
                      +-----------------------------+
```

---

## Bước 1: Khởi tạo Cơ sở dữ liệu PostgreSQL trên Neon

1. **Đăng ký tài khoản:** Truy cập [neon.tech](https://neon.tech) và đăng ký bằng tài khoản GitHub hoặc Google.
2. **Tạo Project mới:**
   - Đặt tên Project: `uelcourses` (hoặc tên tùy chọn).
   - Chọn **Region**: `ap-southeast-1` (Singapore) để có độ trễ thấp nhất đến sinh viên tại Việt Nam.
   - Nhấn **Create Project**.
3. **Lấy chuỗi kết nối (Connection String):**
   - Tại trang tổng quan (Dashboard) của Neon, sao chép chuỗi kết nối dạng `postgresql://...`.
   - Lưu ý: Thư viện backend sử dụng driver `psycopg 3`, do đó tiền tố chuỗi kết nối khi dán vào Render nên là `postgresql+psycopg://` (hoặc `postgresql://`, backend sẽ tự động chuẩn hóa).
   - Chuỗi kết nối có dạng mẫu:
     ```
     postgresql+psycopg://uelplan_owner:<password>@ep-cool-fog-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
     ```
4. **Kích hoạt các extension tìm kiếm tiếng Việt:**
   - Trên bảng điều khiển Neon, vào mục **SQL Editor**.
   - Chạy hai câu lệnh SQL sau để kích hoạt chỉ mục trigram và loại bỏ dấu tiếng Việt:
     ```sql
     CREATE EXTENSION IF NOT EXISTS pg_trgm;
     CREATE EXTENSION IF NOT EXISTS unaccent;
     ```
   - Nhấn **Run** và kiểm tra kết quả thông báo thành công.

---

## Bước 2: Nạp dữ liệu và kiểm tra cấu trúc bảng (Migrations)

Dữ liệu học phần, CTĐT và thời khóa biểu của UEL cần được khôi phục lên database Neon.

### 2.1. (Tùy chọn) Tạo bản sao lưu mới nhất từ máy cục bộ
Nếu bạn muốn tạo file sao lưu dữ liệu mới nhất từ container PostgreSQL đang chạy trên máy:
```bash
pg_dump -Fc -U uelplan -h localhost -p 5432 -d uelplan -f data/db/backups/uelcourses_latest.dump
```
*(Nếu dùng script Docker tiện ích: `docker compose exec -T db pg_dump -Fc -U uelplan uelplan > data/db/backups/uelcourses_latest.dump`)*

### 2.2. Khôi phục dữ liệu lên Neon
Sử dụng công cụ `pg_restore` (có sẵn khi cài PostgreSQL hoặc trong container `workspace`):
```bash
pg_restore --no-owner --no-acl -d "<chuỗi kết nối Neon>" data/db/backups/uelplan_before_consolidate_20261121.dump
```
*(Thay `<chuỗi kết nối Neon>` bằng chuỗi lấy ở Bước 1, bao gồm cả tham số `?sslmode=require`).*

### 2.3. Chạy cập nhật Schema (Alembic)
Sau khi khôi phục dữ liệu, chạy lệnh sau từ thư mục `api/` để đảm bảo toàn bộ migration mới nhất đã được áp dụng:
```bash
# Trên terminal máy có cài Python và thư viện
DATABASE_URL="<chuỗi kết nối Neon>" alembic upgrade head
```

---

## Bước 3: Triển khai Backend API lên Render

Render hỗ trợ triển khai trực tiếp từ tệp [render.yaml](file:///D:/UELCourse/render.yaml) (Blueprint) ở gốc repository.

1. **Đăng ký / Đăng nhập:** Truy cập [render.com](https://render.com) và đăng nhập bằng tài khoản GitHub.
2. **Tạo Blueprint:**
   - Trên giao diện Render Dashboard, nhấn nút **New +** ở góc phải trên -> Chọn **Blueprint**.
   - Kết nối với kho lưu trữ GitHub của dự án `UELCourse`.
   - Render sẽ tự động quét và nhận diện tệp [render.yaml](file:///D:/UELCourse/render.yaml).
3. **Cấu hình biến môi trường trên Render:**
   Render sẽ yêu cầu nhập các biến chưa đồng bộ (`sync: false`):
   - `DATABASE_URL`: Dán chuỗi kết nối Neon (dạng `postgresql+psycopg://...`).
   - `CORS_ORIGINS`: Tạm thời điền URL dự kiến của Vercel (ví dụ: `https://uelcourses.vercel.app`), ta sẽ cập nhật chính xác ở Bước 5.
   - `FRONTEND_BASE_URL`: Điền URL dự kiến của Vercel (ví dụ: `https://uelcourses.vercel.app`).
   - `OAUTH_REDIRECT_BASE`: Điền URL Render của bạn sau khi tạo (ví dụ: `https://uelcourses-api.onrender.com`).
   - `SESSION_SECRET`: Render sẽ tự động tạo một chuỗi ngẫu nhiên bảo mật (nhờ cấu hình `generateValue: true`).
4. **Nhấn Apply:**
   - Render sẽ xây dựng Docker image theo [docker/api.Dockerfile](file:///D:/UELCourse/docker/api.Dockerfile) với context thư mục `api`.
   - Khi khởi động, lệnh khởi động trong Blueprint (`alembic upgrade head && uvicorn ...`) sẽ tự động chạy migration rồi lắng nghe cổng do Render cấp.
5. **Đặc điểm cần lưu ý của gói Render Free:**
   > [!WARNING]
   > Dịch vụ web miễn phí của Render sẽ **tự động ngủ (spin down)** nếu không nhận được truy cập nào sau khoảng **15 phút**.
   > Khi có người dùng truy cập lại, dịch vụ sẽ cần khoảng **30 - 50 giây** để khởi động lại container (hiện tượng "cold start"). Lần gọi đầu tiên sẽ phản hồi chậm; các yêu cầu sau đó sẽ nhanh bình thường.

Sau khi Render báo **Live**, hãy sao chép URL dịch vụ (ví dụ: `https://uelcourses-api.onrender.com`).

---

## Bước 4: Triển khai Frontend Web lên Vercel

1. **Đăng nhập Vercel:** Truy cập [vercel.com](https://vercel.com) và đăng nhập bằng tài khoản GitHub.
2. **Nhập dự án (Import Project):**
   - Nhấn **Add New...** -> Chọn **Project**.
   - Chọn repository GitHub `UELCourse`.
3. **Cấu hình Project Settings:**
   - **Framework Preset:** Next.js (hệ thống sẽ tự nhận diện theo [web/vercel.json](file:///D:/UELCourse/web/vercel.json)).
   - **Root Directory:** Nhấn nút **Edit** và chọn thư mục `web`.
   - **Build and Output Settings:** Giữ mặc định (`npm run build`).
4. **Cài đặt Biến Môi Trường (Environment Variables):**
   Mở rộng mục **Environment Variables** và thêm:
   - `NEXT_PUBLIC_API_URL`: Dán URL backend Render đã lấy ở Bước 3 (ví dụ: `https://uelcourses-api.onrender.com` — *lưu ý: không có dấu gạch chéo `/` ở cuối*).
   - `NEXT_PUBLIC_USE_MOCKS`: **KHÔNG đặt** biến này (hoặc đặt giá trị `false`). Khi không đặt, frontend sẽ luôn gọi API thật từ Render và không tự ý bật dữ liệu giả ngầm.
5. **Nhấn Deploy:**
   - Vercel sẽ tiến hành cài đặt thư viện và build dự án Next.js.
   - Khi hoàn tất, bạn sẽ nhận được tên miền Vercel (ví dụ: `https://uelcourses.vercel.app` hoặc `https://uelcourses-<user>.vercel.app`).

---

## Bước 5: Cập nhật CORS và Tên miền Frontend

Để trình duyệt của người dùng có thể gửi yêu cầu từ tên miền Vercel sang API Render mà không bị chặn lỗi CORS:

1. Mở lại [Render Dashboard](https://dashboard.render.com).
2. Chọn dịch vụ `uelcourses-api` -> Chuyển vào tab **Environment**.
3. Cập nhật các biến sau với URL Vercel chính xác vừa tạo:
   - `CORS_ORIGINS`: `https://uelcourses.vercel.app` (hoặc tên miền thật của bạn).
   - `FRONTEND_BASE_URL`: `https://uelcourses.vercel.app`.
4. Nhấn **Save Changes**. Render sẽ tự động khởi động lại dịch vụ với cấu hình mới.

> [!IMPORTANT]
> **Chốt chặn an toàn Production (Production Guard):**
> Backend UELCourses có cơ chế kiểm tra an toàn tự động: khi `ENV=production`, nếu `CORS_ORIGINS` vẫn chứa `localhost` hoặc `SESSION_SECRET` dùng chuỗi mặc định, server sẽ từ chối khởi động (`RuntimeError`) để bảo vệ dữ liệu. Luôn đảm bảo biến môi trường `CORS_ORIGINS` trên Render trỏ về đúng domain công khai của Vercel.

---

## Bước 6: Kiểm tra và Nghiệm thu Hệ thống

Thực hiện các bước kiểm tra sau để xác nhận hệ thống vận hành trơn tru:

1. **Kiểm tra trạng thái API:**
   - Mở trình duyệt và truy cập: `https://<url-render-cua-ban>/api/health`
   - Kết quả hiển thị: `{"status": "ok"}`
2. **Kiểm tra Frontend:**
   - Mở trình duyệt truy cập vào URL Vercel: `https://<url-vercel-cua-ban>/`
   - Quan sát góc giao diện: Xác nhận **KHÔNG** xuất hiện nhãn đỏ `"Mất kết nối"` hoặc nhãn `"Dữ liệu mẫu"`.
3. **Thử nghiệm các tính năng chính:**
   - Vào mục **Tra cứu học phần**: Nhập tìm một môn (ví dụ: `Kinh tế vi mô`, `BIM5022`).
   - Xem trang **Chi tiết học phần**: Kiểm tra cây môn học tiên quyết/học trước và thông tin đề cương.
   - Vào mục **Chương trình đào tạo**: Chọn khóa K24, ngành Tài chính - Ngân hàng.
   - Vào mục **Thời khóa biểu**: Kiểm tra lịch học và bố trí phòng học.

---

## Bước 7: Bảng Chi phí & Định mức Gói Miễn phí

Hệ thống được thiết kế tối ưu để có thể chạy thử nghiệm nghiệm thu khóa luận mà không phát sinh chi phí:

| Thành phần | Nhà cung cấp & Gói | Định mức miễn phí tiêu biểu | Khi nào cần trả tiền? |
|---|---|---|---|
| **Frontend** | Vercel (Hobby) | Băng thông 100 GB/tháng, build không giới hạn phi thương mại. | Khi vượt quá 100 GB băng thông/tháng hoặc nâng cấp tính năng tổ chức thương mại (Pro). |
| **Backend API** | Render (Free Web Service) | 750 giờ CPU chia sẻ/tháng, RAM 512 MB, tự ngủ sau 15 phút rảnh. | Khi muốn chạy 24/7 không có cold start (gói Starter $7/tháng) hoặc cần RAM lớn hơn (> 512 MB). |
| **Cơ sở dữ liệu** | Neon (Free Tier) | 0.5 GiB lưu trữ, tự động tính toán serverless, hỗ trợ pg_trgm/unaccent lâu dài. | Khi dung lượng dữ liệu vượt 0.5 GB hoặc cần thêm dung lượng lưu trữ chuyên sâu. |

> [!NOTE]
> *Để biết chi tiết thông số định mức và bảng giá mới nhất, vui lòng xem trang biểu phí chính thức của từng nhà cung cấp: [Vercel Pricing](https://vercel.com/pricing), [Render Pricing](https://render.com/pricing), [Neon Pricing](https://neon.tech/pricing).*

---

## Bước 8: Các Tính năng Bổ sung (Đăng nhập Google / Facebook)

- Tính năng đánh giá học phần có hỗ trợ đăng nhập OAuth (Google/Facebook).
- Để bật tính năng này trên bản chạy công khai, chủ dự án cần đăng ký:
  - **Google OAuth Client ID & Secret** từ [Google Cloud Console](https://console.cloud.google.com).
  - **Facebook App ID & Secret** từ [Meta for Developers](https://developers.facebook.com).
  - Thêm URL callback vào cấu hình OAuth: `https://<url-render-cua-ban>/api/auth/google/callback`
  - Điền các biến `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` vào Render.
- **Hiện tại:** Khi chưa điền các biến này, các tính năng tra cứu học phần, xem CTĐT, xếp thời khóa biểu và RAG quy chế vẫn hoạt động hoàn toàn bình thường mà không cần đăng nhập.
