# Brief D2 — Trích xuất chương trình đào tạo (CTĐT) chuẩn từ PDF của Khoa thành bảng TSV

Chỉ đọc file và GHI file bằng công cụ file; TUYỆT ĐỐI không chạy lệnh shell, không sửa mã nguồn/DB, không commit. Chỉ ghi vào `data/ctdt_khoa_2023_2025/parsed/`.

## Bối cảnh
PDF CTĐT của Khoa là bản chuẩn nhất. Quy tắc: CTĐT 2023 áp dụng K23 và K24; CTĐT 2025 áp dụng K25 và K26. Hai ngành: TCNH = Tài chính – Ngân hàng (mã ngành khóa 404), CNTC = Công nghệ tài chính (414). Mỗi ngành có hệ tiếng Việt (chuẩn) và hệ tiếng Anh "E" (mã học phần bắt đầu bằng E thay B ở nhiều môn). Văn bản đã trích sẵn từ PDF (mỗi trang đánh dấu `=== TRANG n ===`):
- `data/ctdt_khoa_2023_2025/text/TCNH_2025.txt`, `data/ctdt_khoa_2023_2025/text/CNTC_2025.txt`: văn bản gốc của PDF (chính xác).
- `data/ctdt_khoa_2023_2025/text/OCR_TCNH_2023.txt`, `OCR_CNTC_2023.txt` (nếu có): bản OCR từ ảnh scan (CÓ THỂ SAI chữ/số, đặc biệt mã học phần và tín chỉ; khi nghi ngờ hãy ghi cờ `ocr_nghi_ngo` thay vì đoán). Chỉ xử lý file nào tồn tại; file chưa có thì bỏ qua và nói rõ.
Bảng trong văn bản bị tách thành từng dòng (mỗi ô một dòng); phải ghép lại. Mục cần dùng: "Kế hoạch giảng dạy" (bảng học phần theo HỌC KỲ 1..8, từng học kỳ chia "Học phần bắt buộc" / "Học phần tự chọn"), danh sách học phần theo khối kiến thức (đại cương, cơ sở khối ngành, cơ sở nhóm ngành, ngành/chuyên ngành, tự chọn), và mọi phần nói về "Chương trình dạy học E" / hệ tiếng Anh.

## Việc cần làm — cho MỖI file nguồn tồn tại, tạo `data/ctdt_khoa_2023_2025/parsed/<TAG>.tsv`
`<TAG>` là TCNH_2025, CNTC_2025, TCNH_2023, CNTC_2023. Mỗi dòng một học phần trong KẾ HOẠCH GIẢNG DẠY, cột (tab, dòng đầu là tiêu đề):
`hoc_ky	nhom	ma_hp	ten_vi	ten_en	tin_chi	tien_quyet	ghi_chu`
- `hoc_ky`: số 1..8 (hoặc 9, 10 nếu có) theo bảng kế hoạch; nếu học phần không gắn học kỳ (tự chọn tự do, ngoại ngữ, GDTC/GDQP…) để `-`.
- `nhom`: `bat_buoc` | `tu_chon` | `ngoai_ngu` | `dieu_kien` (không tính vào 120 TC như GDTC, GDQP) | `khac`; nếu PDF ghi tên nhóm tự chọn (vd "tự chọn nhóm A") thì ghi vào `ghi_chu`.
- `ma_hp`: mã đúng như trong PDF (vd BFF4027); tên tiếng Anh nếu PDF có.
- `tin_chi`: tổng tín chỉ (số). `tien_quyet`: mã điều kiện tiên quyết/học trước như ghi.
Ngoài TSV, tạo `data/ctdt_khoa_2023_2025/parsed/<TAG>_summary.md` gồm: tên/số quyết định ban hành, ngày, tổng tín chỉ toàn khóa, số tín chỉ từng khối kiến thức đúng như PDF, tổng tín chỉ theo từng học kỳ đúng như PDF (dòng "HỌC KỲ n — X TC") và TỰ KIỂM: tổng tín chỉ bạn cộng được theo từng học kỳ có khớp con số PDF ghi không (nếu lệch ghi rõ học kỳ nào, vì sao).

## Hệ tiếng Anh (E) — trả lời bằng chứng cứ, không suy đoán
Trong cùng `_summary.md`, mục "Hệ tiếng Anh": (a) PDF có bảng/cột/chú thích riêng cho chương trình E không? Trích nguyên văn ngắn (dưới 15 từ) và ghi số trang; (b) nếu có: liệt kê MỌI điểm khác nhau giữa hệ chuẩn và hệ E (mã học phần B↔E, tên, tín chỉ, học kỳ, môn chỉ có ở một hệ, chuẩn đầu ra ngoại ngữ, số tín chỉ ngoại ngữ…) thành bảng; nếu PDF cho cả hai hệ dùng CÙNG một kế hoạch thì ghi rõ "cùng kế hoạch" và chép phần PDF nói về khác biệt (nếu có). Không tự suy ra khác biệt khi PDF không nói.
Nếu có bảng mã E riêng, tạo thêm `<TAG>_E.tsv` cùng cột như trên cho hệ E.

Cuối cùng báo cáo: file đã tạo, số dòng mỗi file, các chỗ không chắc chắn.
