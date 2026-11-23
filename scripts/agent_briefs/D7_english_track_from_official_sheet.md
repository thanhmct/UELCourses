# Brief D7 — Chương trình hệ E phải lấy từ danh sách CHÍNH THỨC, không tự sinh từ bản tiếng Việt

Chạy cùng nhóm với D3 (liên quan chặt). Không chạy lệnh shell, không commit. Chủ dự án chạy pytest, `npx tsc --noEmit`, `npx vitest run`.

## Vấn đề (chủ dự án phát hiện)
Khi lọc theo chương trình hệ E (ví dụ Marketing 410E), danh sách học phần vẫn còn nhiều môn mã tiếng Việt: `BBM4086 Khởi nghiệp Marketing`, `BBM5003 Công nghệ marketing`, `BBM5017 Marketing bằng công cụ tìm kiếm`, `BBM5022 Marketing mạng xã hội`, `BBM5023 Marketing nội dung`, `BBM5057 Thiết kế đồ họa và đa phương tiện`… Chủ dự án hỏi: "Chương trình hệ E thì phải chuyển hết sang tiếng Anh chứ?"

## Nguyên nhân đã xác định
`api/app/services/program_tracks.py` (`build_program_track_mapping`) **tự sinh** bản E: lấy chương trình tiếng Việt, với mỗi môn đổi sang `counterpart_code` bắt đầu bằng E nếu có; **môn nào không có bản E thì giữ nguyên mã tiếng Việt** (dòng 111-112). Kết quả cho `K25410` với `track=en`: 64 môn, trong đó 50 mã E và **14 mã B tiếng Việt**.

Đối chiếu với danh sách **chính thức** — sheet `6. 410E-Marketing(E)` trong `data/raw/ctdt_bdcl/DH_QuanTriKinhDoanh.xlsx` — chương trình E Marketing có 58 mã: 50 mã E và **8 mã B**:
`BDG1001`, `BDG1003`, `BDG1004`, `BDG1005` (lý luận chính trị), `BDG1012`, `BDG1013` (giáo dục thể chất), `BDG1014` (giáo dục quốc phòng), `BEE1002` (Kinh tế chính trị).
Tức **8 môn B là hợp lệ** (các môn bắt buộc chung của Bộ GD&ĐT vẫn học bằng tiếng Việt ở hệ E), nhưng **6 môn còn lại do thuật toán tự sinh là THỪA**: `BBM4086`, `BBM5003`, `BBM5017`, `BBM5022`, `BBM5023`, `BBM5057` không có trong sheet 410E chính thức. Chúng lọt vào vì bản VI của chương trình có các môn đó mà không có bản E tương ứng, nên thuật toán giữ nguyên thay vì loại.

## Yêu cầu

### 1. Nguồn sự thật cho hệ E: sheet chính thức, không suy ra
Khi D3 nạp CTĐT từ các workbook BĐCL (xem D3 mục 1b), mỗi sheet có hậu tố `E`/`TE` (`404E`, `407E`, `410E`, `411E`, `413E`, `502E`, `503E`, `408E`, `405E`…) phải được lưu thành **chương trình riêng với danh sách học phần của chính sheet đó** (hệ E có `program_modules` riêng). Không dựng hệ E bằng cách ánh xạ từ chương trình VI nữa.

### 2. API dùng danh sách thật khi có
- `GET /api/programs/{id}?track=en` (và mọi endpoint liên quan: graph, module tree, check, elective-groups, `get_program_track_codes`, lọc học phần `program_ids=`): nếu tồn tại chương trình hệ E **thật** trong DB cho (khóa, mã ngành) → dùng nó.
- Chỉ khi **chưa nạp** được chương trình E thật mới tạm rơi về cách ánh xạ cũ, và phải gắn cờ rõ trong phản hồi (`track_source: "derived"` thay vì `"official"`) để giao diện/nhà phát triển biết dữ liệu là suy ra.
- Hệ E mà không có sheet chính thức (ví dụ Công nghệ tài chính 414 — không có sheet `414E`) thì trả 404 như W30 yêu cầu, **không** tự sinh.

### 3. Môn B hợp lệ trong hệ E
Giữ lại các môn mã B có trong sheet chính thức của hệ E (lý luận chính trị, giáo dục thể chất, quốc phòng, Kinh tế chính trị…); đây là đặc điểm thật của chương trình, không phải lỗi. Giao diện nên hiện nhãn nhỏ "Học bằng tiếng Việt" cạnh các môn này ở hệ E để người dùng khỏi thắc mắc.

### 4. Báo cáo đối chiếu
Lệnh CLI (dry-run) in cho từng chương trình hệ E: số môn theo sheet chính thức, số môn theo cách tự sinh cũ, danh sách môn **thừa** (có trong cách cũ, không có trong sheet) và **thiếu** (có trong sheet, không có trong cách cũ). Xuất `data/processed/english_track_diff.csv`. Mục đích: chủ dự án thấy mức độ sai lệch trước khi chuyển sang dữ liệu thật.

### 5. Test
pytest: chương trình `410E` lấy từ sheet có đúng 58 mã (50 E + 8 B), không chứa `BBM5023`; `track=en` của chương trình có sheet E thật trả `track_source="official"`; chương trình không có sheet E trả 404; cách suy ra cũ chỉ dùng khi chưa nạp, kèm cờ `derived`. Vitest: môn B trong hệ E có nhãn "Học bằng tiếng Việt"; môn không thuộc sheet E không xuất hiện.

Báo cáo cuối: bảng mỗi chương trình hệ E (số môn chính thức / số môn cũ / thừa / thiếu), và những hệ E không có sheet chính thức.
