# Hướng dẫn giao diện UELPATH (bố cục tham khảo NUSMods)

> Chủ dự án yêu cầu (2026-11-21): giao diện **tương tự nusmods.com**. Phạm vi cho phép: **bố cục và cách dùng** (layout, luồng thao tác, mật độ thông tin). **Không** dùng tên "NUSMods", logo, màu cam thương hiệu, hình ảnh, văn bản, hay **sao chép mã nguồn** của họ. Wordmark **UELPATH** có chữ xanh navy `#0B2A63` và tam giác cam `#FF8315` trong chữ A. Trang Cài đặt/Giới thiệu có dòng ghi công: "Bố cục lấy cảm hứng từ NUSMods (NUS) và các công cụ lập thời khóa biểu mã nguồn mở".

## 1. Khung chung (app shell)
- **Thanh điều hướng trái** cố định, rộng ~170 px, mỗi mục là icon + nhãn; mục đang mở tô màu nhấn. Thứ tự: Hôm nay · Thời khóa biểu · Học phần · Phòng học · Kế hoạch · CTĐT (cây môn học) · Tương đương · Quy chế & AI · Cài đặt · Góp ý. Dưới 768 px: chuyển thành thanh tab dưới cùng (5 mục chính + "Thêm").
- **Thanh trên** mỏng: bên trái biểu tượng chữ A và tên UELPATH; bên phải nút tìm nhanh (Ctrl+K, mở hộp tìm học phần/lệnh), chỉ báo "Học kỳ hiện tại" (vd `2026-2027 · HK1`), nút chế độ tối/sáng.
- Nền xám rất nhạt (#f7f8fa), nội dung trắng, viền mảnh 1 px, bo góc nhỏ (6 px), gần như không bóng đổ. Chữ hệ thống/Inter. Mật độ thông tin cao, ít trang trí. Hỗ trợ **chế độ tối** (biến CSS).
- Bảng màu cho từng học phần trong TKB: 8–10 màu rõ, phân biệt được (lưu theo mã môn).

## 2. Trang Thời khóa biểu (`/timetable`) — trang quan trọng nhất
- Đầu trang: bộ chuyển học kỳ `‹ Học kỳ 1 · 2026-2027 ›` ở giữa.
- **Lưới**: mỗi **hàng là một thứ** (Thứ 2 → Thứ 7, thêm CN nếu có buổi), **cột là thời gian** (mốc giờ thật theo tiết: 07:00, 07:50, … đến ~21:00; ghi cả số tiết). Nền xen kẽ sáng/tối theo giờ. Mỗi buổi học là **khối màu** nằm đúng khoảng giờ, hiện `MÃ MÔN` đậm, loại buổi (LT/TH) + lớp, phòng. Buổi trùng nhau xếp chồng/chia dòng và tô cảnh báo đỏ.
- Dưới lưới, thanh nút: [Chế độ dọc] [Hiện tên môn] [Lịch thi] ở trái; [Tải xuống ▾ (PNG, .ics)] [Chia sẻ/Đồng bộ (link)] [Đặt lại] ở phải.
- Ô nhập **"Thêm học phần vào TKB"** có gợi ý tự hoàn thành (gõ mã hoặc tên, không cần dấu).
- Danh sách học phần đã chọn: mỗi dòng có ô vuông màu (bấm để đổi màu), mã + tên (màu nhấn), "Số TC · EN/VN", nút ẩn/hiện buổi học, xóa; bấm tên → trang chi tiết. Tổng tín chỉ ở cuối.
- Bấm vào một khối buổi học: hiện các lớp khác của cùng môn để đổi nhanh (đã có logic; giữ nguyên hành vi, chỉ đổi giao diện).
- Di động: lưới cuộn ngang, hoặc chế độ dọc (mỗi ngày một cột).

## 3. Trang Học phần (`/modules`)
- Ô **tìm kiếm lớn** ở đầu ("Mã học phần, tên hoặc mô tả"); tìm không dấu; kết quả cập nhật khi gõ.
- Dòng "N học phần tìm thấy". Danh sách **thẻ học phần** một cột: tiêu đề `MÃ Tên` bằng màu nhấn; dòng phụ `Khoa · N TC`; đoạn mô tả ngắn (từ đề cương nếu có); huy hiệu **EN** (dạy bằng tiếng Anh), **CNTN** (tài năng).
- Bên phải mỗi thẻ: dải **tab học kỳ HK1 · HK2 · HK3** — kỳ có lớp mở được tô màu nhấn (dữ liệu `semesters`), kèm số lớp; bên dưới: "Thi: …", "Khối lượng: LT/TH/Tự học giờ" (từ đề cương, nếu chưa có thì ẩn).
- **Cột "Lọc theo"** bên phải (sticky): Mở trong học kỳ (checkbox), Ngôn ngữ (Tiếng Anh/Tiếng Việt/Tài năng), Số tín chỉ (0–2, 3, 4, ≥5), Khoa, Loại học phần, Có học phần tương đương. Có đếm số kết quả cạnh mỗi lựa chọn nếu API trả được; nếu không thì bỏ số.
- Phân trang hoặc cuộn vô hạn (không tải hết 1.214 môn một lần).

## 4. Trang chi tiết học phần (`/modules/[code]`)
- Đầu trang: `MÃ  Tên`, số TC, khoa, huy hiệu; nút "Thêm vào TKB" / "Thêm vào kế hoạch".
- Tab học kỳ (như NUSMods) → danh sách lớp của kỳ đó (giảng viên, sĩ số, buổi học dạng mini-lịch).
- **Cây tiên quyết hai chiều**: bên trái "Cần học trước" → [môn này] → bên phải "Mở khóa"; nét liền = tiên quyết, nét đứt = học trước; nhóm AND/OR; bấm node để đi tới môn đó.
- Khối "Học phần tương đương" (cặp cũ↔mới, bản Anh↔Việt).
- Khối "Đề cương" (khi API có `GET /api/modules/{code}/outline`): thông tin chung, mục tiêu CO ↔ CĐR CLO, **bảng đánh giá với trọng số**, kế hoạch giảng dạy theo tuần, giáo trình. Nếu API chưa có (404) thì ẩn khối, không báo lỗi.

## 5. Các trang khác (cùng ngôn ngữ thiết kế)
- **Phòng học `/venues`**: ô tìm phòng; danh sách phòng; chọn phòng → lưới tuần kiểu TKB cho thấy phòng bận/trống; ô "Tìm phòng trống" theo thứ + khung giờ.
- **Kế hoạch `/planner`**: các cột theo học kỳ, kéo-thả học phần, tổng TC mỗi cột, tô đỏ môn thiếu điều kiện (đã có logic); giữ bố cục thoáng như NUSMods Planner.
- **CTĐT `/programs`**: danh sách + sơ đồ lộ trình (đã có) — chỉ đồng bộ kiểu dáng; bỏ danh sách "CTĐT phổ biến" cứng (có mã K22… đã bị xóa khỏi DB) — lấy từ API.
- **Hôm nay `/`**: lịch học trong ngày của TKB đã lưu (nếu có), ô tìm học phần, lối tắt tới Quy chế.
- **Quy chế & AI `/regulations`**: giữ bố cục 3 cột đã thiết kế (cây văn bản · trình đọc · chat có trích dẫn), chỉ đồng bộ màu và khung.

## 6. Ràng buộc kỹ thuật
- Giữ nguyên route, logic (`src/lib/*`), API client và test hiện có; thay đổi chủ yếu ở `src/app/*`, `src/components/*`, `src/styles`/Tailwind.
- Tiếng Việt toàn bộ giao diện. Truy cập bàn phím + nhãn ARIA cho điều hướng, lưới TKB, ô tìm.
- Không thêm thư viện nặng nếu không cần; nếu cần icon thì dùng bộ MIT (lucide-react).
- Dữ liệu thật từ API (`NEXT_PUBLIC_API_URL`, dev: http://localhost:8001); mock chỉ là dự phòng khi API chết, kèm nhãn "Dữ liệu mẫu".
- Kiểm tra: `npx tsc --noEmit`, `npm test` (vitest), `npm run lint`. **Không chạy `next build` khi dev server đang chạy** (dùng chung thư mục `.next`).
- Xem kết quả: http://localhost:3001 (dev server tự nạp lại). Ảnh chụp trước/sau đưa vào `docs/ui-screenshots/` (không bắt buộc commit).
