# UELPlan — hướng dẫn cho Claude/agents

- Đọc `ARCHITECTURE.md` trước: hợp đồng API, kiểu dữ liệu, và **thư mục mà mỗi agent được phép sửa**. Không sửa thư mục của agent khác; nếu cần thay đổi hợp đồng, ghi vào `docs/contract-change-requests.md`.
- Giao diện và nội dung hướng tới người dùng: tiếng Việt. Code, tên biến: tiếng Anh.
- Không dùng tên, logo, giao diện của NUSMods; chỉ tham khảo nhóm chức năng.
- Không bao giờ commit hoặc ghi log token sinh viên. Không gọi tự động các API đăng ký/hủy học phần.
- Môi trường: Windows, Python 3.14, Node 24. Docker là môi trường chuẩn để chạy/deploy (`DEPLOY.md`, `docker/`, compose ở thư mục gốc); khi chạy ngoài Docker mặc định SQLite + chế độ AI `extractive` miễn phí. Mọi đường dẫn/cấu hình phải đọc từ biến môi trường liệt kê trong ARCHITECTURE.md, không hard-code.
- Mỗi phần phải có test chạy được (`pytest` cho api, `npm run build` + `npm test` cho web) và README ngắn trong thư mục của mình.
- **Quy ước khóa:** mã khóa = 2 số cuối năm nhập học: K22 = khóa tuyển sinh 2022, K23 = 2023, K24 = 2024… (khớp MSSV `K22…` và mã lớp SV `K24404E` → K24). Quy định ghi áp dụng cho khóa nào thì chỉ áp dụng cho khóa đó; không dùng cách đánh số K44/K47.
- Phát triển theo Design Thinking: tính năng bám theo nhu cầu trong `research/`; mọi trang có widget feedback.
