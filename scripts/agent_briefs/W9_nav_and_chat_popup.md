# Brief W9 — Sắp xếp lại menu + trang "Trao đổi sách" (thiết kế UI) + cửa sổ chat pop-up cho Quy chế & AI

Tự tìm file (gợi ý `web/src/components/Header.tsx`, `web/src/app/layout.tsx`, `web/src/app/regulations/page.tsx`, `web/src/components/regulations/ChatPanel.tsx` và các thành phần cùng thư mục, `web/src/i18n/vi.ts`/`en.ts`). Không chạy lệnh shell, không commit, không sửa backend. Đây là **thiết kế giao diện trước** (dùng dữ liệu mẫu/mock, chưa nối backend mới).

## 1. Thứ tự menu (thanh điều hướng, cả desktop lẫn menu di động)
Hôm nay → Thời khóa biểu → Học phần → Kế hoạch → Chương trình đào tạo → Tương đương → Phòng học → **Hỏi đáp AI** (Q&A với AI) → **gạch ngang phân cách** (vạch dọc mảnh trên desktop; đường kẻ ngang trong menu di động) → **Trao đổi sách** → **Góp ý** → **Cài đặt**. Hỏi đáp AI vẫn mở được như trang đầy đủ (`/regulations` hoặc route hiện có); Góp ý và Cài đặt giữ nguyên chức năng hiện có (nếu đang là biểu tượng/nút thì giữ dạng đó sau vạch). Cập nhật i18n vi/en, active-state, test điều hướng nếu có (thứ tự link).

## 2. Trang "Trao đổi sách" (`/books`) — chợ trao đổi giáo trình (chỉ thiết kế UI)
Mục đích: sinh viên trao đổi **giáo trình** (không bán hàng khác). Yêu cầu tương lai: bắt buộc đăng nhập mới đăng bài; bài đăng gửi qua email sinh viên — hiện CHƯA làm backend nên chỉ mock:
- Thanh tìm kiếm + lọc: theo mã/tên học phần, khoa, tình trạng sách (mới/cũ), hình thức (tặng/đổi/bán lại giá sinh viên), sắp xếp mới nhất.
- Lưới thẻ bài đăng (dữ liệu mẫu ~8 thẻ): tên giáo trình, môn liên quan (MÃ + tên), tình trạng, hình thức + giá, người đăng (ẩn danh một phần, vd "SV K24 · Kế toán"), thời gian đăng, nút "Liên hệ" (hiện thông báo "Cần đăng nhập").
- Nút "Đăng bài" → hộp thoại biểu mẫu (môn, tên sách, tình trạng, hình thức, giá, ảnh, ghi chú). Khi chưa đăng nhập: hộp thoại/banner "Đăng nhập để đăng bài và liên hệ" với nút "Đăng nhập bằng email trường" (chưa hoạt động, `disabled` + chú thích "Sắp ra mắt").
- Banner đầu trang: "Tính năng đang thiết kế — dữ liệu hiển thị là mẫu".
- Giao diện cùng phong cách các trang khác; song ngữ; responsive; có test Vitest (cleanup()) cho lọc/tìm trên dữ liệu mẫu.

## 3. Cửa sổ chat pop-up "Quy chế & Hỏi đáp AI"
- Nút nổi (FAB) tròn góc dưới bên phải mọi trang (trừ trang hỏi đáp toàn màn hình), biểu tượng chat + tooltip "Hỏi quy chế / AI".
- Bấm → mở **cửa sổ chat nhỏ** (khoảng 380×560 px trên desktop; toàn chiều rộng, cao ~80% trên di động) neo góc dưới phải, có thanh tiêu đề: tên "Hỏi đáp Quy chế & AI", chọn khóa (cohort) nếu thành phần hiện tại có, nút **phóng to** (mở rộng thành cửa sổ lớn/toàn màn hình, hoặc chuyển sang trang chính `/regulations` giữ nguyên hội thoại), nút **thu nhỏ**, nút **đóng**.
- Tái sử dụng logic của `ChatPanel` hiện có (gọi API hỏi đáp, trích dẫn Điều/Khoản, cảnh báo), không viết lại; tách phần giao diện cho dùng được ở cả 3 chế độ: pop-up nhỏ / phóng to / trang chính. Lịch sử hội thoại giữ khi chuyển chế độ và khi đổi trang (lưu trong store zustand, có thể lưu sessionStorage).
- Trạng thái đóng/mở/phóng to nhớ trong phiên; phím Esc thu nhỏ/đóng; focus quản lý hợp lý (aria-label, role="dialog").
- Trang `/regulations`: giữ tra cứu văn bản/đồ thị quy chế; phần chat dùng chung component.
- Test Vitest: mở/đóng/phóng to, hội thoại giữ khi phóng to, FAB không hiện ở trang toàn màn hình.

Báo cáo cuối: file thay đổi cho từng phần. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
