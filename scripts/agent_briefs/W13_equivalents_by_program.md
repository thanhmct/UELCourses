# Brief W13 — Trang "Học phần tương đương": chỉ hiện các môn trong chương trình đào tạo đang lọc

Tự tìm file (gợi ý trang `web/src/app/equivalents/page.tsx` hoặc route tương đương — tìm bằng `grep -ri "equivalents" web/src/app`; hook `web/src/lib/myProgram.ts` (`useMyProgramId`, ngành chính + ngành 2), `useSettings`/`profile` trong `web/src/lib/store.ts`, banner lọc theo CTĐT ở `modules/page.tsx` để làm theo; `web/src/lib/api.ts` — `api.equivalents`/tương tự, `api.program(id)` để lấy danh sách mã môn của chương trình). Không chạy lệnh shell, không commit, không sửa backend trừ khi bắt buộc (nếu API hỗ trợ tham số `program_id`/`program_ids` ở endpoint tương đương thì dùng; nếu không thì lọc ở client).

## Yêu cầu
1. Trang Học phần tương đương: khi người dùng có chương trình đào tạo (ngành chính và/hoặc ngành 2, hoặc `?program=` trong URL), **chỉ hiển thị các nhóm/dòng tương đương có ít nhất một môn thuộc chương trình đó**; trong mỗi nhóm, môn thuộc chương trình đứng trước/được đánh dấu, các môn tương đương ngoài chương trình ẩn đi (nếu muốn xem, có nút nhỏ "Hiện cả môn ngoài chương trình" tắt mặc định). Chương trình có ngành 2 → hợp của hai chương trình (có chip để chọn Ngành 1/Ngành 2/Cả hai như các trang khác nếu đã có thành phần dùng chung).
2. Hiển thị banner lọc giống trang Học phần (cùng văn bản "Chương trình đào tạo ngành … khóa …" nếu W11 đã làm; dùng chung hàm/ component) kèm số kết quả, và nút đổi/bỏ lọc.
3. Người dùng chưa chọn chương trình: hiện toàn bộ như cũ kèm gợi ý "Chọn chương trình để chỉ xem môn liên quan".
4. Phản ứng tức thì khi đổi chương trình (như W6): store đổi → trang lọc lại không cần tải lại; phân trang về trang 1; dùng đúng khóa gọi API.
5. Tìm kiếm trong trang vẫn hoạt động trên tập đã lọc; số lượng hiển thị đúng; song ngữ vi/en.
6. Test Vitest (cleanup(), within/role): có chương trình → ẩn nhóm không liên quan và môn ngoài chương trình; bật "Hiện cả môn ngoài chương trình"; đổi chương trình lọc lại; không chương trình → hiện hết.

Báo cáo cuối: file thay đổi. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
