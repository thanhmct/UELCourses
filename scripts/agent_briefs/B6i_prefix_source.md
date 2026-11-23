# Brief B6i — Thêm nguồn thứ ba: tiền tố mã học phần → khoa (chỉ khi dữ liệu chứng minh), chạy SAU B6h

Không chạy lệnh shell, không commit. Sửa `api/app/services/faculty_names.py` (hàm `apply_outline_faculties` đã có từ B6h), `api/app/cli.py` (`audit-faculty`, `fix-module-faculty`), seed, test. Chủ dự án chạy pytest `cd api; .venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --ignore=tests/rag`.

## Quy tắc của chủ dự án
Mã học phần dạng `[B|E][XX][chữ số…]` (ký tự đầu B = hệ chuẩn, E = hệ tiếng Anh; **hai chữ cái ngay sau đó là mã đơn vị**, vd BBB1068 → "BB", EFF2045 → "FF", BEE1050 → "EE"). Chủ dự án xác nhận: EE ~ khoa Kinh tế, BB ~ Quản trị kinh doanh, AA ~ Kế toán – Kiểm toán… và đồng ý dùng đây là **một nguồn** để bổ sung khoa cho môn chưa có đề cương.

## Bằng chứng từ DB (đối chiếu tiền tố mã ↔ khoa ghi trong đề cương, số học phần)
AA→Kế toán–Kiểm toán 20; AU→Kế toán–Kiểm toán 29; BB→Quản trị kinh doanh 50; BM→QTKD 75; BU→QTKD 19; EE→Kinh tế 29; EM→Kinh tế 10; FB→Tài chính–NH 29; FF→Tài chính–NH 75; IE→Hệ thống thông tin 46 (lẫn QTKD 3); IM→HTTT 49; KB→Luật kinh tế 48; KT→Luật kinh tế 39; LB→Luật 38; LC→Luật 33; LD→Luật 7; MA→Toán kinh tế 39; MM→Toán kinh tế 9; RB→Kinh tế đối ngoại 34; RE→Kinh tế đối ngoại 22; **DG lẫn (QTKD 6, Toán kinh tế 3) → KHÔNG dùng**. Các tiền tố khác (vd mã đầu M, L, D, H, "BLB…" các tiền tố ít mẫu) chưa đủ dữ liệu → KHÔNG dùng.

## Yêu cầu
1. **Bảng tiền tố → khoa tự dựng từ dữ liệu, không gõ tay**: tính trên các học phần đã có khoa xác nhận từ đề cương (nguồn `outline`/`counterpart_outline`, qua `outline_module_links` như B6h): với mỗi tiền tố hai chữ cái, đếm khoa chuẩn; chỉ đưa vào bảng khi **≥ 5 mẫu và ≥ 90% cùng một khoa**. Lưu bảng vào `api/seed/prefix_to_faculty.tsv` (cột: prefix, faculty_chuẩn, số mẫu, tỷ lệ, ghi chú) để người xem và sửa được; lệnh `audit-faculty` có tuỳ chọn `--rebuild-prefix-table` tạo lại file từ DB (mặc định đọc file có sẵn). Kiểm chứng nhanh bằng bảng ở trên (IE đạt ~94% → dùng; DG không đạt → bỏ).
2. **Thứ tự nguồn (cuối cùng)**: (a) đề cương của chính môn (qua `outline_module_links`/mã); (b) đề cương của bản tương ứng một bước; (c) **tiền tố mã** (chỉ khi môn chưa có khoa từ (a)/(b) VÀ tiền tố nằm trong bảng); (d) giữ nguyên giá trị cũ. Nguồn (c) ghi `nguồn = prefix` trong CSV kèm tỷ lệ tin cậy; chỉ **điền chỗ trống** — nếu môn đã có khoa hiện tại KHÁC khoa theo tiền tố thì KHÔNG ghi đè, mà đưa vào CSV với kết luận `mâu thuẫn tiền tố – cần duyệt` (vd BBB1068 đang ghi Khoa Tài chính - Ngân hàng nhưng tiền tố BB → Khoa Quản trị kinh doanh; đây là ca chủ dự án đã báo là SAI; đối với ca như vậy hãy xuất ra riêng một danh sách `data/processed/module_faculty_prefix_conflicts.csv` để chủ dự án duyệt hàng loạt).
3. `audit-faculty` in thêm: số môn điền theo tiền tố, số môn mâu thuẫn tiền tố, số môn còn không có nguồn nào; bảng tiền tố đã dùng.
4. Test pytest: bảng tiền tố dựng đúng (ngưỡng 5 mẫu/90%; tiền tố hỗn hợp loại), môn E (EFF…) dùng đúng tiền tố sau chữ đầu; môn trống có tiền tố BB → Khoa Quản trị kinh doanh (nguồn prefix); môn có khoa cũ khác tiền tố → không ghi đè, vào danh sách mâu thuẫn; idempotent.
5. Cập nhật `docs/DECISIONS.md` (nguồn thứ ba: tiền tố, điều kiện) và README `api/`.

Báo cáo cuối: bảng tiền tố đã dựng, số môn điền được/mâu thuẫn, lệnh chạy.
