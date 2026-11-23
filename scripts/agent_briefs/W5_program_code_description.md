# Brief W5 — Mô tả mã lớp ở hộp thoại khởi đầu: câu đầy đủ

Bạn tự tìm file liên quan (hộp thoại nhập mã lớp/CTĐT ở lần truy cập đầu và trong Cài đặt: gợi ý `web/src/components/ProgramProfileDialog.tsx`, hàm `describeProgramCode` và `parseProgramCode` trong `web/src/lib/programCode.ts`; cũng có thể xuất hiện ở thanh trên `Header.tsx` và trang `settings`). Được sửa các file đó, các khóa `vi.ts`/`en.ts` liên quan (chỉnh nhỏ), và test trong `__tests__`. Không sửa API backend, không commit, không chạy lệnh shell nào (chỉ đọc/sửa file).

Hiện tại hộp thoại hiện một dòng rút gọn kiểu: `→ Khóa 25 · CTĐT 405 · hệ chuẩn`.
Yêu cầu của chủ dự án: thay bằng **câu đầy đủ, tự nhiên**, ví dụ:
- Mã `K25405A` (hậu tố A/B/C = hệ chuẩn): **"Khóa 2025, chương trình đào tạo ngành Kế toán, chương trình tiếng Việt."**
- Hậu tố `E` / `E1` / `E2`…: "Khóa 2025, chương trình đào tạo ngành Kế toán, **chương trình tiếng Anh**."
- Hậu tố `T`: "…, **chương trình Cử nhân tài năng**."
- Hậu tố `H`: "…, **{tên chính thức đầy đủ của chương trình Coop}**" (lấy đúng tên từ dữ liệu chương trình, vd tên CTĐT trong `api.program(id)`/`api.programs()` có "COOP"/"Coop"; nếu không có tên chính thức trong dữ liệu thì ghi "chương trình Coop (hợp tác doanh nghiệp)" — không bịa tên).
- Năm khóa ghi **4 số** (K25 → "Khóa 2025", quy ước D3: K25 = tuyển sinh 2025).
- **Tên ngành** lấy từ dữ liệu thật: tên của chương trình có `program_id` = `K{khóa}{mã ngành}` (vd K25405) qua `api.programs()`/`api.program(id)` (đã có sẵn trong `web/src/lib/api.ts`); bỏ phần " Khoá 24"/"Khóa 25" ở cuối tên nếu có để chỉ còn tên ngành. Không tìm thấy chương trình → vẫn hiện câu với "mã ngành 405" thay cho tên ngành.
- Ngành 2 (nếu hộp thoại có ô ngành 2) mô tả tương tự cho mã thứ hai.
- Đầy đủ tiếng Việt và tiếng Anh (EN: "Cohort 2025, undergraduate programme in Accounting, Vietnamese-language programme." / "English-language programme" / "Talent Bachelor programme" / "Co-op programme: {name}").

Cách làm: viết hàm thuần `describeProgramCodeFull(parsed, programName | null, lang)` trong `programCode.ts` (có test cho các hậu tố A, B, C, E, E1, T, H, không có tên ngành, EN), rồi dùng nó trong dòng "→ …" của hộp thoại (tải tên ngành bằng `useApi`/`api.programs()` khi mã hợp lệ, hiển thị tạm câu không tên ngành trong lúc tải). Giữ nguyên hàm cũ nếu nơi khác còn dùng.

Tiêu chí xong (chủ dự án sẽ chạy kiểm tra): `cd web; npx tsc --noEmit` sạch, `npx vitest run` toàn bộ qua. Trong báo cáo cuối nêu file đã sửa và cách xử lý tên Coop.
