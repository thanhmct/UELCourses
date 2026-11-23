# Công cụ triển khai UELPATH

Chạy các lệnh dưới đây từ thư mục gốc dự án trên Windows bằng PowerShell 5.1 trở lên.

## Nạp PostgreSQL lên Supabase

Chuẩn bị Docker Desktop với container `db` của dự án đang chạy và PostgreSQL client `psql` có trong `PATH`. Dùng `psql` bản 17 đã cập nhật hoặc mới hơn để đọc được SQL do `pg_dump` trong container PostgreSQL 17 tạo.

**Chỉ lưu mật khẩu cho script cục bộ trong `.env.deploy`**, tệp đã được Git bỏ qua. Tạo tệp ở thư mục gốc với một dòng `SUPABASE_DB_URL`. Ví dụ này dùng giá trị giả:

```dotenv
SUPABASE_DB_URL=postgresql://postgres.xxxxxxxx:MATKHAUGIA@aws-1-vi-du-1.pooler.supabase.com:6543/postgres?sslmode=require
```

Dùng URL Transaction pooler của project thật và mật khẩu chỉ gồm chữ và số. Script sử dụng cổng 6543 kể cả khi URL pooler ghi 5432, và đặt `sslmode=require` khi URL bỏ trống tham số.

```powershell
.\scripts\deploy\push_to_supabase.ps1 -DryRun
.\scripts\deploy\push_to_supabase.ps1
```

`-DryRun` chỉ in quy trình. Khi chạy thật, script xuất SQL thuần, hiển thị mã project và yêu cầu nhập đúng `XOA PUBLIC` trước khi kết nối Supabase. **Thao tác thay toàn bộ schema `public`.** Sao lưu dữ liệu production cần giữ trước khi xác nhận. Xóa, tạo lại, nạp schema và đặt `search_path` chạy trong một giao dịch. Script in số dòng bảng chính cùng phiên bản Alembic sau khi nạp.

## Kiểm tra API và CORS

```powershell
.\scripts\deploy\check_deploy.ps1 -WebUrl https://web.example.test -ApiUrl https://api.example.test
```

Thay hai URL ví dụ bằng tên miền gốc thật. Script gửi tuần tự bốn GET đến API, dùng URL web làm header `Origin`, rồi in mã HTTP, thời gian và kết quả CORS. Script cảnh báo nếu lần gọi đầu vượt 20 giây và báo lỗi nếu một endpoint trả mã ngoài 2xx, thiếu phản hồi hoặc trả CORS sai origin.

[Hướng dẫn triển khai](../../docs/DEPLOY_FREE.md)
