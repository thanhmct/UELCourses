# Brief W30 — Kiểm tra mã lớp/CTĐT có thật (vd K24414E KHÔNG tồn tại) và chặn mã giả

Tự tìm file: `web/src/lib/programCode.ts`, `web/src/components/ProgramProfileDialog.tsx`, `web/src/lib/myProgram.ts`/store hồ sơ CTĐT, `api/app/services/program_tracks.py` (`resolve_program_and_track`), `api/app/routers/programs.py`, i18n `web/src/i18n/vi.ts`/`en.ts`. Không chạy lệnh shell, không commit.

## Vấn đề (chủ dự án phát hiện)
Hộp thoại chương trình đào tạo chấp nhận mọi mã có hậu tố E, ví dụ `K24414E`, và mô tả "Khóa 2024, ngành Công nghệ tài chính, chương trình tiếng Anh" — nhưng **lớp K24414E không có thật**. Dữ liệu lớp học (bảng `class_sections`, cột `student_groups`/`cohorts`) cho thấy các nhóm lớp THẬT của hai ngành:
- Tài chính – Ngân hàng (404): K23404, K23404A/B, K24404A/B/**E**, K25404A/B/**E**, K26404A/B/C/**E**
- Công nghệ tài chính (414): K23414A/B, K24414 (không hậu tố), K24414H (Coop), K25414, K25414H, K26414A/B/H — **KHÔNG có bất kỳ lớp E nào** cho ngành 414 ở mọi khóa.
Bằng chứng khác: CTĐT 2023 và 2025 của Khoa cho Công nghệ tài chính không có chương trình tiếng Anh; danh mục 2025 (`program_catalog_entries.language_track`) của Công nghệ tài chính chỉ có `vi`, còn Tài chính – Ngân hàng có cả `vi` và `en`. API hiện vẫn "tự sinh" bản E cho mọi chương trình (`/api/programs/K24414?track=en` trả 43 mã E) — sai với thực tế.

## Việc cần làm
1. **API: nguồn sự thật "mã nào có thật".** Thêm endpoint đọc `GET /api/programs/valid-groups` (hoặc tên tương tự, đặt TRƯỚC route `/{program_id}` để không bị nuốt) trả về danh sách mã lớp hợp lệ dạng `{code, cohort, major, suffix, kind: standard|english|coop|talent, program_id, source: "class_sections"|"catalog"}`. Nguồn: (a) các nhóm lớp thật trong `class_sections` (tách bằng cùng regex/hàm parse mã mà web dùng; nhóm không hậu tố = hệ chuẩn); (b) với khóa 25/26: tổ hợp (chương trình, hệ) có trong `program_catalog_entries` (language_track en ⇒ cho phép hậu tố E). Hợp nhất, bỏ trùng, ổn định thứ tự. Có cache nhẹ (không truy vấn nặng mỗi request).
2. **API: không tự sinh hệ E khi không có thật.** `resolve_program_and_track` / các endpoint `track=en` cho chương trình mà (cohort, major) không có hệ E hợp lệ (theo mục 1) phải trả 404 với thông báo rõ ("Chương trình này không có hệ tiếng Anh") thay vì sinh bản E. `/api/programs/K24404?track=en` vẫn phải hoạt động (404 có thật).
3. **Web: kiểm tra khi nhập.** Trong `ProgramProfileDialog`, sau khi mã được parse, kiểm tra với danh sách hợp lệ (tải một lần, dùng `useApi`, fallback không chặn nếu API lỗi): nếu (khóa + mã ngành + hậu tố) không có trong danh sách thì HIỆN LỖI dưới ô (đỏ): "Không tìm thấy lớp {mã}. Các mã hợp lệ của ngành này: K24414, K24414H" (liệt kê các mã hợp lệ cùng khóa+ngành, nếu ngành không tồn tại ở khóa đó thì "Không tìm thấy ngành mã 414 ở khóa 24") và KHÔNG cho Lưu; EN tương ứng. Mã hợp lệ thì hiện mô tả như cũ. Không chặn khi danh sách chưa tải được.
4. **Hồ sơ đã lưu có mã không hợp lệ** (vd người dùng đang lưu K24414E): khi tải trang, nếu mã đã lưu không còn hợp lệ thì hiện thẻ CTĐT trên thanh trên kiểu cảnh báo nhẹ (chip vàng "Mã K24414E không hợp lệ — bấm để sửa") thay vì mô tả sai, bấm mở hộp thoại; không tự xóa/đổi mã.
5. Test: pytest cho endpoint hợp lệ-nhóm (có K24404E, không có K24414E; K24414H có) và `track=en` của K24414 → 404; Vitest cho hộp thoại (K24414E → lỗi + nút Lưu bị chặn, K24414 hợp lệ, K24404E hợp lệ; API lỗi → không chặn).

## BỔ SUNG (chủ dự án yêu cầu sửa ngay, cùng file nên làm luôn trong brief này)

6. **Hộp thoại chương trình đào tạo phải TỰ MỞ khi chưa có chương trình nào được lưu.**
   - Mở ứng dụng mà trong bộ nhớ (store `useSettings`, phần hồ sơ CTĐT trong localStorage) **chưa có mã ngành chính** → hộp thoại "Chương trình đào tạo của bạn" hiện ngay, không cần bấm gì.
   - Áp dụng ở **mọi trang**, không riêng trang chủ, vì người dùng có thể vào thẳng `/modules` hay `/timetable` từ link.
   - Đã có mã hợp lệ rồi → **không** mở lại, để yên cho người dùng làm việc.
   - Mã đã lưu nhưng **không còn hợp lệ** (theo mục 1–4 ở trên, ví dụ `K24414E`) → coi như chưa chọn: mở lại hộp thoại, điền sẵn mã cũ vào ô để người dùng sửa, kèm dòng lỗi.
   - Bấm "Hủy" hoặc đóng bằng `×`/Esc thì đóng hộp thoại và **không mở lại trong phiên đó** (nhớ bằng `sessionStorage`), để người dùng vẫn xem được web nếu chưa muốn nhập. Lần mở ứng dụng sau vẫn hiện lại vì bộ nhớ vẫn trống.
   - Chỉ mở **sau khi đã đọc xong** dữ liệu từ localStorage (tránh nhấp nháy mở rồi đóng ở lần render đầu) và sau khi component đã `mounted` (tránh lệch giữa máy chủ và trình duyệt của Next.js).
   - Giữ nguyên thành phần hộp thoại dùng chung đã có (nút "Đổi" ở thanh chương trình cũng mở đúng hộp thoại này, xem W16) — chỉ thêm điều kiện tự mở, không tạo bản sao.
   - Test Vitest (`cleanup()`): bộ nhớ trống → hộp thoại hiện (`role="dialog"`) ngay khi vào `/modules`; đã có mã hợp lệ → không hiện; mã lưu không hợp lệ → hiện và ô được điền sẵn mã cũ kèm lỗi; bấm Hủy → đóng và không hiện lại khi chuyển trang trong cùng phiên.

Báo cáo cuối: file thay đổi, tên endpoint, danh sách mã hợp lệ API trả cho 404/414, và cách đã xử lý việc tự mở hộp thoại.
