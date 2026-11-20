# Yêu cầu thay đổi hợp đồng API

## 2026-11-21 — web-frontend (giao diện kiểu NUSMods, `docs/UI_STYLE_GUIDE.md`)

1. `GET /api/modules/{code}/outline` (mới): trả đề cương học phần. Frontend (`web/src/components/OutlineBlock.tsx`) chỉ hiện khối "Đề cương" khi nhận 200; 404 hoặc lỗi thì ẩn êm. Trường đọc được (đều tùy chọn): các chuỗi/số cấp 1 (thông tin chung), `objectives`/`co` và `clos`/`clo` (`[{code, description}]`), `assessments` (`[{name, weight}]`), `weekly_plan` (`[{week, topic}]`), `textbooks` (`[{title, author}]`).
2. `ModuleSummary` (`/api/modules`): bổ sung `language_track` / `is_talent_program` (để hiện huy hiệu CNTN, hiện đang ẩn) và `description` ngắn (đoạn mô tả trên thẻ học phần).
3. `GET /api/modules`: hỗ trợ `semester` hoặc `open_in=<academic_year>-<term>` để lọc "Mở trong học kỳ" phía server, và trả đếm facet (khoa, loại, số tín chỉ). Hiện lọc phía client trên các kết quả đã tải; `size` tối đa 500 nên danh sách khoa/loại lấy từ 3 trang đầu.
4. Chưa có `exam`/`lịch thi` và `LT/TH/tự học` theo học phần trong API; cần để hiện "Thi: …" và "Khối lượng" trên thẻ.
5. `ClassSection.lessons[]`: bổ sung loại buổi (`kind`: LT/TH) để khối TKB ghi "LT"/"TH".
