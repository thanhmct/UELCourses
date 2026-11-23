# Checklist triển khai UELPATH

- [ ] **Tạo tài khoản.** Chuẩn bị quyền truy cập Supabase, Render, Vercel, repository Git và vùng DNS của `uelcourses.id.vn`.  
  **Kết quả mong đợi** — Mở được bảng điều khiển của ba dịch vụ và có quyền sửa bản ghi DNS.

- [ ] **Tạo project Supabase.** Chọn gói Free, đặt tên `UELCourses`, chọn Tokyo (`ap-northeast-1`) và đặt mật khẩu database chỉ gồm chữ và số. Lấy URL Transaction pooler và lưu dưới tên `SUPABASE_DB_URL` trong `.env.deploy` cục bộ.  
  **Kết quả mong đợi** — URL của project có host `aws-1-ap-northeast-1.pooler.supabase.com`, cổng 6543 và database `postgres`.

- [ ] **Nạp dữ liệu.** Chuẩn bị Postgres Docker cục bộ, chạy `.\scripts\deploy\push_to_supabase.ps1 -DryRun`, rồi chạy lệnh thật và xác nhận đúng project. Nếu project đích đã có dữ liệu, sao lưu trước khi xác nhận thay schema.  
  **Kết quả mong đợi** — Script nạp SQL, đặt `search_path` về `public` và in số dòng cùng phiên bản Alembic khớp nguồn. Mốc X1 là 1.486 học phần, 5.879 lớp, 76 chương trình và `0019`.

- [ ] **Triển khai API trên Render.** Tạo Blueprint từ `render.yaml`, điền biến theo hướng dẫn triển khai và kiểm tra `DATABASE_URL` dùng `postgresql+psycopg://` với `sslmode=require`.  
  **Kết quả mong đợi** — Dịch vụ `uelcourses-api` ở Singapore báo **Live** sau khi chạy Alembic và vượt qua health check.

- [ ] **Triển khai web trên Vercel.** Nhập repository, chọn thư mục gốc `web`, đặt biến Production `NEXT_PUBLIC_API_URL=https://api.uelcourses.id.vn` và chạy deploy.  
  **Kết quả mong đợi** — Bản build Production thành công và chứa URL API đúng.

- [ ] **Gắn tên miền và hoàn tất SSL.** Gắn `uelcourses.id.vn` ở Vercel, `api.uelcourses.id.vn` ở Render và thêm bản ghi DNS theo bảng điều khiển. Nếu dùng Cloudflare, để DNS only đến khi cả hai cấp SSL, đặt Full (strict) rồi bật proxy.  
  **Kết quả mong đợi** — Cả hai hostname truy cập được qua HTTPS với chứng chỉ hợp lệ.

- [ ] **Kiểm tra triển khai.** Chạy `.\scripts\deploy\check_deploy.ps1 -WebUrl https://uelcourses.id.vn -ApiUrl https://api.uelcourses.id.vn`. Mở web và thử tra cứu học phần, xem chương trình đào tạo, xếp thời khóa biểu.  
  **Kết quả mong đợi** — Bốn endpoint trả HTTP 2xx và CORS đúng origin web. Giao diện hiển thị dữ liệu đã nạp.

[Hướng dẫn chi tiết](DEPLOY_FREE.md)
