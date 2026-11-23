# Brief W7 — Rà soát và hoàn tất các mục còn sót từ file Word "UEL Course.docx"

Tự tìm file, không chạy lệnh shell, không commit, không sửa backend (trừ khi mục ghi rõ). Với mỗi mục: nếu ĐÃ làm đúng thì ghi "đã đạt" trong báo cáo cuối, nếu chưa thì sửa. Thêm test Vitest (nhớ `cleanup()`).

1. Chân trang: bỏ câu "Bố cục lấy cảm hứng từ NUSMods (NUS) và các công cụ lập thời khóa biểu mã nguồn mở." (vi) và câu "Layout is inspired by NUSMods (NUS) and open-source timetable tools." (en) khỏi khóa `footer.text` trong `web/src/i18n/vi.ts`, `en.ts`; giữ phần còn lại. Cập nhật test nếu có kiểm chuỗi này.
2. Tab Hôm nay: khóa `today.subtitle` ("Xem nhanh các tiết học trong ngày, phòng học và giảng viên phụ trách.") và đoạn mô tả tương tự không được hiển thị trên trang `/today`. Nếu còn dùng thì bỏ chỗ hiển thị.
3. Trang Thời khóa biểu: có nút "Đến kỳ hiện tại" ngay bên phải bộ chọn học kỳ; cửa sổ/ô chọn học kỳ (tên kỳ, nhãn năm học, nút) đổi đúng sang tiếng Anh khi giao diện là EN (kiểm tra tên học kỳ lấy từ `semester.name` có dịch "Học kỳ 1 năm học 2026-2027" → "Semester 1, 2026-2027" khi EN). Tương tự trong trang Phòng học (`venues`).
4. Trang chi tiết học phần và danh sách học phần: có ô/nhãn hiển thị rõ môn là **Bắt buộc** hay **Tự chọn** theo chương trình đào tạo của người dùng (dữ liệu API đã có `required` trong `GET /api/programs/{id}`), và nếu môn thuộc nhóm tự chọn có quy định "phải hoàn thành X tín chỉ/Y môn" thì hiện câu quy định (API `GET /api/programs/{id}/elective-groups` đã có; xem kiểu trả về ở `api/app/routers/programs.py`). Thêm hàm client trong `web/src/lib/api.ts` nếu thiếu. Trang `programs/[id]` hiển thị các nhóm tự chọn với yêu cầu hoàn thành.
5. Khi giao diện EN, mô tả học phần dùng `description_en` (không rơi về tiếng Việt khi có bản tiếng Anh); khoa/bộ môn EN dùng tên tiếng Anh (API trả `faculty_en`, kiểm tra tên trường trong `api/app/schemas.py`). Không hiện "Chưa rõ khoa" khi có thể ánh xạ.

Báo cáo cuối: liệt kê từng mục đạt/đã sửa, file thay đổi. Chủ dự án chạy `npx tsc --noEmit` và `npx vitest run`.
