# Brief W10 — Bỏ nút Góp ý nhỏ nổi ở góc dưới bên phải

Tự tìm file (gợi ý `web/src/components/FeedbackWidget.tsx`, nơi nó được gắn trong `web/src/app/layout.tsx`/`Providers`). Không chạy lệnh shell, không commit, không sửa backend.

Yêu cầu: gỡ **nút nổi "Góp ý"** (FAB nhỏ ở góc dưới bên phải mọi trang) khỏi giao diện. Mục "Góp ý" đã có trong thanh menu (xem brief W9) nên phải giữ chức năng gửi góp ý: trang/hộp thoại Góp ý mở từ menu vẫn dùng lại `FeedbackWidget`/biểu mẫu hiện có (tách phần biểu mẫu thành component dùng được trong hộp thoại hoặc trang `/feedback` nếu W9 chưa làm; kiểm tra Header hiện đang trỏ tới đâu và đảm bảo link hoạt động). Góc dưới phải chỉ còn nút chat pop-up Quy chế & AI (W9). Cập nhật/bổ sung test (cleanup()): không còn nút nổi Góp ý ở layout; mở Góp ý từ menu vẫn hiển thị biểu mẫu và gửi được (mock API).

Báo cáo cuối: file thay đổi. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
