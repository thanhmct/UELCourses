# Quyết định đã chốt (đừng tranh luận lại nếu chưa có lý do mới)

| # | Quyết định | Lý do | Ngày |
|---|---|---|---|
| D1 | Stack: Next.js (TypeScript, Tailwind) + FastAPI + PostgreSQL (+ pgvector sau này) | Chủ dự án chọn; Python tiện cho RAG/xử lý PDF/script thu thập | 2026-11-20 |
| D2 | AI quy chế: mặc định `extractive` (miễn phí, chỉ trích nguyên văn Điều/Khoản). Bật LLM (Ollama/Claude) bằng biến môi trường khi có key; câu trả lời LLM phải qua hậu kiểm trích dẫn | Độ chính xác tuyệt đối, không bịa | 2026-11-20 |
| D3 | Quy ước khóa: K22 = tuyển sinh 2022 (2 số cuối năm nhập học). Quy định khóa nào áp dụng khóa đó | Chủ dự án xác nhận; khớp MSSV `K22…` và mã lớp `K24404E` | 2026-11-20 |
| D4 | CSDL: **PostgreSQL** là chuẩn ở dev (Docker) và production; **Alembic** quản lý schema; SQLite chỉ dùng cho test nhanh/không Docker. Dữ liệu đi theo 3 lớp: file thô (`data/raw`) → importer/parser → bảng phục vụ; mỗi lần nhập ghi `import_runs` | Dev/prod giống nhau, đưa lên web được; tra cứu không dấu (pg_trgm/unaccent); truy vết nguồn dữ liệu cho khóa luận | 2026-11-20 |
| D5 | Nguồn dữ liệu lớp học: Excel UIS (chính thức) > quét DKHP > TKB portal cá nhân (chỉ để đối chiếu, không đưa vào DB chung) | Độ tin cậy; TKB cá nhân là dữ liệu cá nhân | 2026-11-20 |
| D6 | Gọi API trường: chỉ đọc, 1 luồng, nghỉ 1,5–3,5 s, dừng khi 401/403/429. Không gọi API đăng ký/hủy | Chủ dự án lo bị phát hiện; tránh ảnh hưởng hệ thống trường | 2026-11-20 |
| D7 | Dữ liệu cá nhân (`data/`, token) không commit, không vào Docker image | Quyền riêng tư | 2026-11-20 |
| D8 | Tham khảo NUSMods về **chức năng và bố cục/cách dùng** (chủ dự án yêu cầu giao diện tương tự, 2026-11-21; xem `docs/UI_STYLE_GUIDE.md`). **Không** dùng tên, logo, màu cam thương hiệu, hình ảnh, văn bản hay sao chép mã nguồn của NUSMods; thương hiệu riêng UELCourses và có dòng ghi công | Tránh vi phạm thương hiệu/bản quyền nhưng vẫn quen thuộc với người dùng | 2026-11-21 |
| D9 | Phát triển theo Design Thinking: khảo sát nhu cầu → MVP → thử nhóm nhỏ (SUS/feedback) → cải tiến; mọi trang có widget góp ý | Yêu cầu khóa luận | 2026-11-20 |
| D11 | Docker: **dùng ngay từ đầu cho Postgres + container `workspace` dùng chung** (chạy test/import/migration trong đó); image production (`api`, `web`) chỉ build khi chuẩn bị triển khai. Không trộn venv/node_modules Windows với container (container dùng named volume riêng) | Môi trường giống nhau cho mọi AI, tránh lỗi "chạy máy tôi được"; build image production sớm chỉ tốn thời gian | 2026-11-21 |
| D12 | Dữ liệu gom về một thư mục gốc `data/` (`raw/`, `outlines_2025/`, `processed/`, `db/`); `api/data/` không còn dùng | Dễ tìm, dễ sao lưu, một nơi để `.gitignore` và Docker bỏ qua | 2026-11-21 |
| D13 | Bỏ học phần mã hệ cũ (4 ký tự có chữ số) khỏi DB và chặn nạp lại; giữ bảng `equivalents` và mã đặc biệt chỉ có chữ (GDQP, TATC, TEST) | Chủ dự án: mã cũ chỉ phục vụ K19–K22 (đã/đang tốt nghiệp); hệ mới dùng mã 7 ký tự. Có sao lưu để khôi phục | 2026-11-21 |
| D14 | **Học kỳ 3 là học kỳ chính thức**, ngang hàng HK1 và HK2; không gọi/xử lý là "học kỳ hè" (nhãn, chú thích, tài liệu, giao diện). Mỗi năm học có 3 học kỳ chính thức (`semesters.term` = 1, 2, 3) | Chủ dự án chỉnh lại; lịch thật cho thấy HK3 có lớp mở và kéo dài nhiều tháng | 2026-11-21 |
| D10 | Làm việc đa AI (Claude/Gemini/ChatGPT) trong **một thư mục duy nhất** `D:\UELCourse`, một container `workspace` + một database dùng chung (Docker); nguồn sự thật: `AGENTS.md` + `docs/HANDOFF.md`; bàn giao khi hết token theo `AGENTS.md` mục 6 | Chủ dự án yêu cầu để AI nào cũng làm tiếp được | 2026-11-20 |
