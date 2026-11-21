# Kế hoạch thực thi — yêu cầu trong `UEL Course.docx` (2026-11-21)

Quy trình: Claude lập plan + kiểm tra; **Antigravity (gemini-3.8-flash-high) làm hết**. Phần "Mở màn / lập nhu cầu / các function" trong file Word là ý tưởng của chủ dự án, không phải task.

## Gói việc (mỗi gói = 1 brief trong `scripts/agent_briefs/`)

| Gói | Nội dung (nguồn: file Word) | Vùng file chính | Đợt |
|---|---|---|---|
| **B1_today** | Tab Hôm nay: "Chúc mừng bạn đã được nghỉ ngơi!"; đồng hồ giờ:phút:giây bên phải ô giờ; bỏ dòng "Xem nhanh các tiết…"; danh sách hôm nay → ngày mai (tuần này), ghi rõ Thứ/ngày/tháng, chữ +30%; tab tuần kế tiếp (Thứ hai → CN); mũi tên bên phải | `web/src/app/today/*`, i18n | 1 |
| **B2_planner** | Kế hoạch: bỏ dòng "Kéo môn giữa các học kỳ…"; tab "Lộ trình các học kỳ" và "GPA & Mục tiêu" phóng 25%; danh sách chờ ánh xạ môn bắt buộc theo kỳ của CTĐT; sắp xếp lại tab cho đủ nội dung | `web/src/app/planner/*`, `web/src/lib/planner.ts`, i18n | 1 |
| **B3_api_en** | Dữ liệu EN: khoa/bộ môn tiếng Anh ánh xạ (FACULTY OF FINANCE AND BANKING…, "Chưa rõ khoa" khi có bản VI/EN đối ứng); mô tả đề cương tiếng Anh giữ tiếng Anh; ô "môn bắt buộc"; nhóm môn tự chọn phải hoàn thành (tìm trong DB) | `api/app/routers/modules.py`, `api/app/services/descriptions.py`, schemas, tests | 1 |
| **B4_footer** | Bỏ câu "Bố cục lấy cảm hứng từ NUSMods…" ở chân trang | `web/src/i18n/*` | 1 |
| **B5_data_ib** | Môn Ngân hàng đầu tư thiếu lớp có lịch 3 tầng ngày: tìm nguyên nhân parser lịch, sửa + test (agy viết code; Claude chạy lại nạp/kiểm) | `api/app/services/schedule*.py`/importer, tests | 1 |
| **T1_timetable** | TKB: "phòng Đào tạo"→"Đào tạo"; "Có tiết học trùng lịch: …"; bỏ "Kéo để đổi lớp" → bấm chọn khối rồi chọn lớp thay thế; quy tắc mã lớp đuôi E chọn môn mã E trong CTĐT + chọn ngành 2 xem/lập lịch cả hai; hiển thị `2 TC | dạng bài cuối kỳ (đồ án/thi… từ đề cương)`; Phòng học: bỏ mã lớp, cấu trúc phòng → ngày; nút "đến kỳ hiện tại" bên phải, cửa sổ chọn kỳ đổi theo tiếng Anh | `web/src/app/timetable/*`, `TimetableGrid.tsx`, `web/src/lib/conflicts.ts`, venues, i18n | 2 (sau đợt 1, vì chung i18n) |
| **T2_colors** | Cài đặt: 8 bảng màu cho TKB (gradient cam–xanh UEL; bộ tham khảo NUSMods; 6 bộ do đề xuất), ô nhập mã hex, nút đặt lại mặc định | `web/src/app/settings/*`, `web/src/lib/store.ts`, `TimetableGrid.tsx` | 3 (sau T1, chung TimetableGrid) |
| **P_calendar** | Lịch năm học (chủ dự án sẽ đưa file trong thư mục làm việc): ánh xạ ngày/tháng vào DB + các tab | — | **Chờ file** |
| **P_backend_login_market** | Backend thu xu hướng chọn môn/xếp TKB + kiểm duyệt bình luận; cửa sổ đăng nhập tùy chọn; chợ trao đổi giáo trình (bắt buộc đăng nhập, gửi bài qua email SV) | — | **Giai đoạn sau**, cần chủ dự án quyết (OAuth, email, lưu trữ) — xem ROADMAP |

## Kiểm tra của Claude cho mỗi gói
`git diff` chỉ đúng file trong brief → `npx tsc --noEmit` + `npx vitest run` (web) / `pytest -q --ignore=tests/rag` (api) → xem trang thật trong trình duyệt → báo cáo đạt/chưa đạt. Sai thì viết brief sửa và giao lại.
