# Brief W11 — Đổi câu "Đang lọc theo CTĐT K24414" thành câu đầy đủ

Tự tìm file (gợi ý `web/src/app/modules/page.tsx` ~dòng 225-240, `web/src/app/programs/page.tsx` ~dòng 115-130, khóa `profile.filteringBy` trong `web/src/i18n/vi.ts`/`en.ts`, `web/src/lib/programCode.ts` hàm `describeProgramCodeFull`/`parseProgramCode`, và các trang khác có banner tương tự như timetable/planner nếu có). Không chạy lệnh shell, không commit, không sửa backend.

Hiện banner: `Đang lọc theo CTĐT K24414`. Chủ dự án muốn thay bằng câu:

**"Chương trình đào tạo ngành Công nghệ tài chính khóa 24"**

Quy tắc:
- Tên ngành lấy từ dữ liệu chương trình (tên của program `K{khóa}{mã ngành}` qua `api.programs()`/`api.program(id)`, bỏ phần " Khóa NN" cuối tên và phần phụ như "(E)"/"– DLG…" nếu có để chỉ còn tên ngành; xem cách W5 đã làm trong `programCode.ts`). Khóa viết dạng "khóa 24" (hai số cuối, đúng quy ước K24 = tuyển sinh 2024, KHÔNG viết "2024" ở banner này).
- Hậu tố lớp: hệ chuẩn (A/B/C hoặc không có) → không thêm gì; `E…` → thêm ", chương trình tiếng Anh"; `T` → ", chương trình Cử nhân tài năng"; `H` → ", chương trình {tên chính thức Coop}" như W5. Ví dụ: "Chương trình đào tạo ngành Tài chính - Ngân hàng khóa 25, chương trình tiếng Anh".
- Chưa tải được tên ngành → hiện "Chương trình đào tạo mã ngành 414 khóa 24" (không hiện mã K24414 thô).
- Có ngành 2: hiện hai câu/hai dòng, gắn nhãn "(Ngành chính)" và "(Ngành 2)" sau mỗi câu.
- EN: "Undergraduate programme in Financial Technology, cohort 24".
- Bỏ chữ "Đang lọc theo CTĐT" khỏi banner; giữ nút/liên kết thay đổi chương trình (nếu có) và hành vi `?program=` ưu tiên như hiện tại.
- Cập nhật test hiện có dùng chuỗi cũ (`Đang lọc theo CTĐT` trong `web/src/app/modules/__tests__/profileFilterSync.test.tsx` và nơi khác) cho khớp, thêm test cho câu mới (hệ chuẩn, E, T, H, ngành 2, chưa có tên ngành, EN). Nhớ `cleanup()`.

Báo cáo cuối: file thay đổi. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
