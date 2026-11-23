# Brief W31 — Đổi hậu tố chương trình `-V2`/`-V3` thành hậu tố thật (E / T / H / TE)

Chạy **SAU D3 và D6** (hai brief đó nạp lại CTĐT và có migration trên bảng `programs`). Không chạy lệnh shell (chủ dự án chạy), không commit.

## Vấn đề (chủ dự án phát hiện)
Mã chương trình trong DB đang dùng hậu tố vô nghĩa `-V2`, `-V3` do bước nạp danh mục tự đánh số biến thể. Chủ dự án yêu cầu: **`K25414-V2` phải là `K25414H`, `K26414-V2` phải là `K26414H`** (H = Coop) — tức dùng đúng quy ước hậu tố của mã lớp thật.

14 chương trình đang sai, tên của chúng cho biết hậu tố đúng:

| Mã hiện tại | Tên trong DB | Hậu tố đúng |
|---|---|---|
| K25414-V2, K26414-V2 | Công nghệ tài chính – CN COOP | **H** |
| K25405-V3, K26405-V3 | Kế toán – DLG Kế toán **(E)** | **E** |
| K25411-V2, K26411-V2 | Thương mại điện tử – CN thương mại điện tử **(E)** | **E** |
| K25LKT-V2, K26LKT-V2 | Luật kinh tế – Luật TMQT **(TV)** | cần xác định, xem mục 2 |
| K25405-V2, K26405-V2 | Kế toán – "DLGChuyên ngành Kế toán và P" (tên lỗi, bị cắt) | cần xác định |
| K25409-V2, K26409-V2 | Kiểm toán – "TV rà soát" | nghi là rác, xem mục 3 |
| K25418-V2, K26418-V2 | Quản lý công – "QLC_Tài liệu" | nghi là rác, xem mục 3 |

## Quy ước hậu tố (giống mã lớp)
`E` = chương trình tiếng Anh · `T` = cử nhân tài năng · `TE` = tài năng tiếng Anh · `H` = Coop · **không hậu tố** = chương trình chuẩn tiếng Việt.

## Yêu cầu

### 1. Nguồn sự thật: tên sheet của Phòng BĐCL
`data/raw/ctdt_bdcl/SHEETS.md` (và `SHEETS_THS.md`) liệt kê tên sheet dạng `406 HTTTQL`, `406H Coop-K25/K26`, `411E TMĐT tiếng Anh`, `411T CNTN`, `411TE`, `404`, `414`. **Đây là danh sách chính thức các chương trình có thật và hậu tố của chúng.** Xây bảng ánh xạ từ đây, không đoán từ tên chương trình trong DB (tên đó đã bị cắt/lỗi). Đối chiếu thêm với nhóm lớp thật trong `class_sections.student_groups` (ví dụ `K24414H` tồn tại ⇒ hậu tố H đúng).

### 2. Đổi mã (migration Alembic)
- Đổi `programs.id` từ `-V2`/`-V3` sang hậu tố đúng, cập nhật mọi khóa ngoại trỏ tới nó (`program_modules`, và mọi bảng khác tham chiếu `program_id` — rà `api/app/models.py` cho đủ).
- Migration đi được **cả hai chiều**; `alembic check` sạch sau khi chạy.
- Chương trình nào BĐCL không có sheet tương ứng thì **giữ nguyên mã cũ**, đừng tự đặt hậu tố.
- Trường hợp `K25LKT-V2` "Luật TMQT (TV)": mã ngành đang là `LKT` (chữ) chứ không phải số như các ngành khác — xem sheet BĐCL của Khoa Luật kinh tế để lấy mã ngành số đúng, và nêu trong báo cáo nếu không xác định được.

### 3. Ba cặp còn lại — chủ dự án đã xác định, KHÔNG phải rác

**a) `K25405-V2` / `K26405-V2` → ngành RIÊNG mã `422`: "Kế toán và Phân tích dữ liệu"**
Tên trong DB bị cắt thành "Kế toán – DLGChuyên ngành Kế toán và P". Chủ dự án xác nhận đây là **Kế toán và Phân tích dữ liệu**, và sheet BĐCL `4.422-Kế toán&PTDL` (69 dòng, trong `DH_KeToanKiemToan.xlsx`) cho mã ngành là **422**.
→ Đổi mã thành `K25422` / `K26422`, đặt lại tên đúng là "Kế toán và Phân tích dữ liệu Khóa 25/26". Đây là ngành riêng, KHÔNG phải biến thể của 405.
→ **Quan trọng:** danh sách học phần hiện tại của `-V2` có **đúng 61 môn, bằng y hệt `K25405` (Kế toán)** ⇒ nhiều khả năng bước nạp cũ đã chép nhầm danh sách của Kế toán sang. Phải **nạp lại danh sách học phần từ sheet `4.422-Kế toán&PTDL`** (69 dòng) thay cho danh sách hiện có, và ghi số môn trước/sau vào báo cáo.

**b) `K25409-V2` / `K26409-V2` → chỉ là Kiểm toán, trùng lặp**
Chủ dự án xác nhận "Kiểm toán vẫn là Kiểm toán", không có biến thể "TV rà soát". Bản `-V2` có **61 môn, bằng y hệt `K25409`** ⇒ là bản trùng do nạp hai lần.
→ Gộp vào `K25409` / `K26409`: giữ chương trình gốc, xóa bản `-V2` sau khi xác nhận danh sách học phần trùng khớp hoàn toàn. Nếu danh sách KHÁC nhau dù cùng số lượng thì **đừng xóa**, báo cáo lại.

**c) `K25418-V2` / `K26418-V2` → chỉ là Quản lý công, trùng lặp**
Tương tự: 57 môn, bằng y hệt `K25418`. Chủ dự án xác nhận "Quản lý công vẫn vậy".
→ Gộp vào `K25418` / `K26418` theo cùng cách và cùng điều kiện an toàn như (b).

Trước khi xóa bản trùng, chuyển mọi tham chiếu (hồ sơ người dùng, link `?program=`) sang mã gốc theo mục 4.

### 3b. Cần kiểm tra thêm
Tên sheet trong `DH_KeToanKiemToan.xlsx` ghi Kiểm toán dưới số **405** (`2.405-Kiểm toán`, `5.405T-Kiểm toán(T)`) trong khi DB dùng **409** cho Kiểm toán. Xác minh mã ngành đúng của Kiểm toán (đối chiếu `class_sections.student_groups`: có nhóm lớp `K__409*` hay `K__405*`?) và ghi kết luận vào báo cáo. **Không đổi mã 409 nếu chưa chắc.**

### 4. Tương thích ngược
Người dùng có thể đã lưu mã cũ trong hồ sơ (localStorage) hoặc chia sẻ link `?program=K25414-V2`:
- API: khi nhận mã cũ `-V2`/`-V3` đã được đổi, trả về chương trình mới (ánh xạ mã cũ → mã mới, giữ bảng ánh xạ nhỏ trong code hoặc seed).
- Web: mã cũ trong hồ sơ tự chuyển sang mã mới khi tải, không báo lỗi cho người dùng.
- Phối hợp với W30: mã sau khi đổi phải nằm trong danh sách hợp lệ mà W30 trả về.

### 5. Test
pytest: migration lên/xuống sạch; `K25414-V2` → `K25414H` và khóa ngoại `program_modules` còn nguyên số dòng; gọi API bằng mã cũ vẫn ra chương trình đúng; chương trình không có sheet BĐCL thì mã không đổi; mục nghi rác vẫn còn trong DB và có trong CSV.
Vitest: hồ sơ lưu mã cũ `K25414-V2` tự hiển thị thành `K25414H`, không báo lỗi.

Báo cáo cuối: bảng mã cũ → mã mới đầy đủ, danh sách mục nghi rác, và những mã không đổi được kèm lý do.

## THỐNG NHẤT MÃ VÀ TÊN (chủ dự án chốt 2026-11-22 — ƯU TIÊN hơn mọi chỗ khác trong brief này)
Quy tắc mã: `K<khóa><mã ngành số>[hậu tố]`, hậu tố chỉ là một trong E (tiếng Anh), H (Coop), T (cử nhân tài năng), TE (tài năng tiếng Anh); KHÔNG còn `-V2`/`-V3` ở bất kỳ chương trình nào sau khi chạy xong (trừ ngành chưa xác định, xem cuối). Quy tắc tên: `<Tên ngành> [– Hệ tiếng Anh | – Coop | – Cử nhân tài năng | – Cử nhân tài năng tiếng Anh] Khóa NN` (tên ngành lấy từ sheet BĐCL/tên chương trình, bỏ chữ thừa kiểu "DLG", "TV rà soát", "Tài liệu").
Bảng đích (áp dụng cho cả K25 và K26):
| Hiện tại | Mới | Việc cần làm |
|---|---|---|
| K25405-V2 ("DLGChuyên ngành Kế toán và P…") | K25422 "Kế toán và Phân tích dữ liệu Khóa 25" | NẠP LẠI danh sách môn từ sheet BĐCL `4.422-Kế toán&PTDL` (hiện đang chép nhầm 61 môn của 405); ghi số môn trước/sau |
| K25405-V3 ("DLG Kế toán (E)") | K25405E "Kế toán – Hệ tiếng Anh Khóa 25" | danh sách theo sheet `3.405E-Kế toán(E)`; xem D7E |
| K25409-V2 ("TV rà soát") | gộp vào K25409 | chỉ khi danh sách môn trùng khớp 100%, rồi xóa -V2; khác thì giữ và báo cáo |
| K25411-V2 ("CN thương mại điện tử (E)") | K25411E "Thương mại điện tử – Hệ tiếng Anh Khóa 25" | theo sheet `6.411E-TMĐT(E)` |
| K25414-V2 ("CN COOP…") | K25414H "Công nghệ tài chính – Coop Khóa 25" | theo sheet `4.414H-CNTC(CO-OP)-K25` (K26: `…-K26`) |
| K25418-V2 ("QLC_Tài liệu") | gộp vào K25418 | như K25409-V2 |
| K25LKT-V2 ("Luật TMQT (TV)") | K25502 "Luật thương mại quốc tế Khóa 25" | mã ngành 502 theo sheet `2.502_LTMQT`; đồng thời đổi K25LKT (Luật kinh doanh) → K25501 "Luật kinh doanh Khóa 25" theo sheet `1.501_LKD` (kiểm tra bằng số môn/ tên sheet; nếu không chắc 501 hay tên khác thì GIỮ mã cũ và nêu trong báo cáo) |
Quy tắc phụ: mã chữ (K25LUAT, K25KDNNS, K25KDTMHQ, K25KTDD) giữ nguyên nếu không xác định được mã ngành số từ sheet BĐCL (nêu trong báo cáo); nếu xác định được (vd Luật = 503/504/505/506…) thì chỉ ĐỀ XUẤT trong báo cáo, không tự đổi. Mọi mã cũ (-V2, -V3, LKT…) phải còn dùng được qua bảng chuyển tiếp (hồ sơ người dùng đã lưu, link `?program=`). Tên hiển thị trên web (ProgramFilterBar, danh sách Chương trình) phải theo quy tắc tên ở trên, cả VI và EN ("– English track", "– Co-op", "– Talent programme").

Chú giải viết tắt (chủ dự án): TMQT = thương mại quốc tế (Luật thương mại quốc tế, mã 502); TMĐT = thương mại điện tử (mã 411). Đừng nhầm hai chữ này khi đặt tên chương trình.

## Quy tắc ghi HANDOFF (thêm 2026-11-23): khi cập nhật docs/HANDOFF.md chỉ THÊM một dòng ngắn vào đúng mục (Đang làm dở / Việc tiếp theo / Chờ chủ dự án); KHÔNG dán lại khối lịch sử dài (lịch sử nằm ở docs/handoff/HISTORY.md). Đọc lại file hiện tại trước khi sửa.

## BỔ SUNG W31b (từ phiên kiểm tra dry-run `import-ths`, chủ dự án cần thống nhất tên): CHUẨN HÓA TÊN CHƯƠNG TRÌNH THẠC SĨ
Lệnh `import-ths` (api/app/services, brief D6) đặt tên chương trình từ dòng `NGÀNH: … - CHƯƠNG TRÌNH: …` (VIẾT HOA) nhưng chỉ đổi vài từ nên tên lẫn hoa/thường: "Thương MẠI ĐIỆN TỬ - Thạc sĩ", "KINH TẾ Chính TRỊ - Thạc sĩ nghiên cứu", "QUẢN TRỊ KINH Doanh", "TÀI Chính NGÂN HÀNG", "CÔNG NGHỆ TÀI Chính", "PHÂN TÍCH DỮ LIỆU VÀ AI Trong KINH TẾ VÀ KINH Doanh", "Chuyên Ngành KẾ TOÁN". Việc cần làm: (1) viết MỘT hàm chuẩn hóa tên chương trình (đặt cạnh hàm tên chương trình của W31, dùng chung): hạ hết về chữ thường rồi viết hoa chữ cái đầu câu, GIỮ NGUYÊN viết tắt hợp lệ (AI, CNTC, TMĐT…) và tên riêng; bỏ tiền tố thừa kiểu "Chuyên ngành"; định dạng cuối cùng `<Tên chương trình> – Thạc sĩ [nghiên cứu|ứng dụng]` (dấu gạch giữa kiểu "–"), vd "Thương mại điện tử – Thạc sĩ", "Kinh tế chính trị – Thạc sĩ nghiên cứu", "Quản trị kinh doanh – Thạc sĩ ứng dụng", "Tài chính ngân hàng – Thạc sĩ", "Công nghệ tài chính – Thạc sĩ", "Phân tích dữ liệu và AI trong kinh tế và kinh doanh – Thạc sĩ", "Kế toán – Thạc sĩ"; (2) áp dụng cho `programs.name` của cả 18 chương trình thạc sĩ (sửa trong dữ liệu đã nạp NẾU D6 đã nạp, và sửa hàm trong `import-ths` để lần nạp sau ra đúng); (3) test: các tên trên đều ra đúng, idempotent; (4) mã chương trình thạc sĩ hiện dạng `M611`, `M603NC` (không có khóa — khóa tạm 2025–2026): bảo đảm hộp thoại CTĐT/`parseProgramCode` và W30 (danh sách mã hợp lệ) KHÔNG coi mã bắt đầu bằng `M` là lỗi và không giả định mọi mã bắt đầu bằng `K` (mã thạc sĩ chỉ hiện ở bộ chọn bậc, không nhập vào hộp thoại đại học).

## W31c — LÀM THÊM NGAY SAU PHẦN TRÊN: đọc và thực hiện đầy đủ `scripts/agent_briefs/D8_ma_lop_sau_dai_hoc.md` (chuẩn hóa tên chương trình thạc sĩ [trùng với W31b — làm một lần], nhận diện bậc từ mã lớp C/N/B, quyết định program_id thạc sĩ có khóa hay không và ghi vào bảng chuyển tiếp mã). Khi có chỗ mâu thuẫn giữa D8 và các mục W31 phía trên thì theo D8 cho phần thạc sĩ/tiến sĩ, theo W31 cho phần đại học.
