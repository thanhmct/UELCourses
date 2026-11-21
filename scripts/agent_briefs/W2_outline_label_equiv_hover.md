# Brief W2 — nhãn "Đề cương" và cửa sổ hover "Có tương đương"

Chỉ sửa/tạo các file sau (không commit):
- `web/src/app/modules/page.tsx` (khối chip ở khoảng dòng 216–223)
- `web/src/components/EquivalentsHover.tsx` (MỚI)
- `web/src/i18n/vi.ts`, `web/src/i18n/en.ts` (thêm khóa)
- test mới `web/src/components/__tests__/equivalentsHover.test.tsx`

## Yêu cầu
1. Chip liên kết PDF hiện ghi `Có đề cương (PDF) ↗` → đổi thành `Đề cương ↗` (EN: `Outline ↗`). Thêm khóa i18n mới `badge.outlineLink` (vi "Đề cương", en "Outline") và dùng nó CHỈ cho chip có liên kết PDF (`m.outline_url`). Giữ nguyên `badge.outline` ("Có đề cương") cho chip không có liên kết và cho bộ lọc.
2. Chip `Có tương đương` (khi `m.has_equivalents`) thành component `EquivalentsHover({ code })`:
   - Chip giữ nguyên giao diện (class violet hiện tại) nhưng là `<button type="button">` có `aria-haspopup="dialog"`.
   - Khi rê chuột vào (onMouseEnter, trễ ~150 ms) hoặc focus bàn phím, hiện popover nhỏ (position absolute dưới chip, `role="dialog"`, nền trắng/tối theo theme, bóng, `max-w-xs`, `z-20`) liệt kê các học phần tương đương: mã (liên kết `/modules/{mã}`), tên (theo ngôn ngữ giao diện: dùng `moduleName` từ `@/i18n/names` nếu có `name_en`, nếu không dùng `name`), số tín chỉ. Rời chuột/blur/nhấn Esc thì đóng. Bấm vào chip cũng bật/tắt popover (cho màn hình cảm ứng).
   - Dữ liệu lấy lười bằng `api.equivalent(code)` (xem `web/src/lib/api.ts` ~dòng 270, kiểu `EquivalentItem {code,name,credits,equivalents[]}`) — chỉ gọi lần đầu khi mở, cache trong state của component. Trong lúc tải hiện chữ "Đang tải…" (khóa `common.loading` nếu đã có, nếu chưa thì thêm `eq.loading`); không có dữ liệu hiện `eq.none` ("Không có dữ liệu tương đương").
   - Tiêu đề popover: khóa `eq.hoverTitle` (vi "Học phần tương đương", en "Equivalent modules").
   - Mỗi mục bấm được chuyển tới trang học phần; popover không được làm vỡ bố cục thẻ (thẻ cha có thể cần `relative`).
3. Test Vitest (jsdom): mock `api.equivalent` (vi.spyOn trên `@/lib/api`), kiểm tra: không gọi API trước khi hover; hover → hiện tên/mã tương đương và gọi API đúng 1 lần dù hover nhiều lần; Esc đóng.
4. Kiểm tra: `cd web; npx tsc --noEmit` và `npx vitest run` đều qua. Không thêm thư viện.
