# Brief D8 — Nhận diện bậc đào tạo từ mã lớp (thạc sĩ `C…`, tiến sĩ `N…`), và chuẩn hóa tên chương trình thạc sĩ

Chạy SAU D6 (D6 tạo `programs.degree`, `modules.degree`, lệnh `import-ths`). Không chạy lệnh shell (chủ dự án chạy), không commit.

## 1. Sửa lỗi viết hoa tên chương trình thạc sĩ (gấp — sửa TRƯỚC khi chạy `import-ths` thật)
`import-ths --dry-run` hiện sinh tên lẫn hoa thường ngẫu nhiên:
`"Thương MẠI ĐIỆN TỬ - Thạc sĩ"`, `"KINH TẾ Chính TRỊ - Thạc sĩ nghiên cứu"`, `"QUẢN TRỊ KINH Doanh - Thạc sĩ ứng dụng"`, `"TÀI Chính NGÂN HÀNG - Thạc sĩ"`, `"CÔNG NGHỆ TÀI Chính - Thạc sĩ"`, `"PHÂN TÍCH DỮ LIỆU VÀ AI Trong KINH TẾ VÀ KINH Doanh - Thạc sĩ"`, `"Chuyên Ngành KẾ TOÁN - Thạc sĩ"`.
Nguyên nhân nghi: code thay cụm từ (`chính`, `doanh`, `trong`, `chuyên ngành`…) trên chuỗi đang VIẾT HOA lấy từ dòng `NGÀNH: … - CHƯƠNG TRÌNH: …`, nên chữ thay vào giữ nguyên dạng thường.
Sửa: hạ toàn bộ về chữ thường rồi viết hoa chữ cái đầu câu (giữ nguyên viết tắt toàn chữ hoa như `AI`, `CNTT`); bỏ tiền tố thừa `Chuyên ngành`. Áp dụng quy tắc tên của W31: `<Tên ngành> – Thạc sĩ[ nghiên cứu| ứng dụng]`, dùng gạch ngang dài `–`. Kết quả mong muốn: `Thương mại điện tử – Thạc sĩ`, `Kinh tế chính trị – Thạc sĩ nghiên cứu`, `Phân tích dữ liệu và AI trong kinh tế và kinh doanh – Thạc sĩ`. Có test cho đúng các chuỗi đầu vào ở trên.

## 2. Nhận diện bậc từ mã lớp
Dữ liệu lớp học phần thật (`class_sections.student_groups`) cho thấy mã lớp sau đại học KHÔNG bắt đầu bằng `K`:

| Tiền tố | Dạng | Số mã | Ví dụ | Bậc |
|---|---|---|---|---|
| `K` | `K<khóa><ngành 3 số>[hậu tố]` | — | `K24404E` | Đại học |
| `C` | `C<khóa><ngành 6xx>[-đợt][-NC/-UD]` | 81 | `C24601`, `C25603-2-UD`, `C26657-1-UD` | **Thạc sĩ** |
| `N` | `N<khóa><ngành 7xx>[-đợt]` | 16 | `N25701-1`, `N26710-1`, `N25704-DB` | **Tiến sĩ** |
| `B` | `B<khóa>50x<chữ>` | 9 | `B24501BDTH`, `B26503KTL` | Chưa rõ — xem mục 5 |

Bằng chứng khớp: mã ngành trong nhóm `C` là 601, 602, 603, 604, 605, 607, 608, 609, 610, 611, 614, 657 — trùng với mã ngành thạc sĩ mà `import-ths` đọc được từ workbook BĐCL (601–619, 657). Hậu tố `-NC` = nghiên cứu, `-UD` = ứng dụng, khớp hai nhánh của D6. Số giữa `-1`, `-2` là đợt tuyển trong năm, không phải ngành.

Việc cần làm:
- Mở rộng hàm phân tích mã lớp (`web/src/lib/programCode.ts` và phía API `api/app/services/program_tracks.py` nếu có hàm tương ứng) để trả thêm `degree`: `K…` → `dai_hoc`, `C…` → `thac_si`, `N…` → `tien_si`. Giữ nguyên toàn bộ hành vi hiện có với mã `K`.
- Ánh xạ mã lớp thạc sĩ sang chương trình: `C<khóa><ngành>` + hậu tố `-NC`/`-UD` → `program_id` tương ứng của D6 (hiện D6 đặt `M601NC`, `M603UD`…). **Mã chương trình thạc sĩ hiện KHÔNG chứa khóa**, trong khi mã lớp có (`C24601` là khóa 24). Chọn một trong hai và nêu rõ trong báo cáo: (a) đổi `program_id` thạc sĩ thành dạng có khóa (`M24601NC`) cho đồng nhất với đại học, hoặc (b) giữ không khóa và lưu khóa ở cột riêng. Phải thống nhất với bảng chuyển tiếp mã của W31.
- Mã lớp không có hậu tố `-NC`/`-UD` (vd `C24601`, các khóa 24) thì khớp chương trình nhánh chuẩn; nếu ngành đó chỉ có hai nhánh NC/UD thì để người dùng chọn, không tự đoán.

## 3. Hộp thoại chương trình đào tạo
`ProgramProfileDialog` hiện chỉ nhận mã `K…` (xem W30). Mở rộng:
- Nhận cả `C…` và `N…`; mô tả đúng bậc, ví dụ `→ Khóa 2024, chương trình thạc sĩ ngành Kinh tế chính trị, hướng ứng dụng.`
- Bậc suy ra từ mã, **không** bắt người dùng chọn bậc trước.
- Mã không có thật vẫn báo lỗi theo cơ chế W30 (danh sách mã hợp lệ phải gồm cả `C…`, `N…` lấy từ `class_sections`).
- Chọn mã thạc sĩ → toàn bộ bộ lọc, Học phần, Thời khóa biểu, Kế hoạch chuyển sang `degree=thac_si`; không trộn môn đại học. Trang Chương trình đào tạo tự chọn tab bậc tương ứng (D6).
- Tiến sĩ chưa có dữ liệu chương trình: nhận mã `N…`, hiện đúng bậc, nhưng báo rõ "chưa có dữ liệu chương trình tiến sĩ" thay vì danh sách rỗng khó hiểu.
- i18n vi/en cho các chuỗi mới.

## 4. Test
pytest: phân tích `C24601`, `C25603-2-UD`, `C26657-1-UD`, `N25701-1`, `N25704-DB`, `K24404E` ra đúng bậc/khóa/ngành/nhánh; mã lớp thạc sĩ khớp đúng chương trình; mã sai → không khớp.
Vitest (`cleanup()`): nhập `C24601` vào hộp thoại → mô tả bậc thạc sĩ, lưu được, bộ lọc chuyển sang thạc sĩ; nhập `N25701-1` → nhận bậc tiến sĩ kèm thông báo chưa có dữ liệu; `K24404E` giữ nguyên hành vi cũ.

## 5. Cần chủ dự án xác nhận (ghi vào báo cáo, đừng đoán)
- Tiền tố `B` (9 mã: `B24501BDTH`, `B24503KTL`, `B25501DTH`, `B26503KTL`…) là hệ gì? Nghi văn bằng 2 hoặc liên thông, mã ngành 501/503 trùng dải Luật. Chưa xác định thì để `degree='dai_hoc'` và liệt kê trong báo cáo.
- Các mã lẻ `MPL1`, `MPL02`, `MDAFA05`, `MDAFA06`, `UKB01408A`… (xem mục "Chờ chủ dự án" trong HANDOFF).
- Ngành 608 có lớp thạc sĩ (`C24608`) nhưng `import-ths` không đọc được chương trình 608 từ workbook; ngược lại 618, 619 có chương trình nhưng chưa thấy lớp. Nêu trong báo cáo.

Báo cáo cuối: quy tắc nhận diện đã cài, quyết định về mã chương trình thạc sĩ (có khóa hay không), danh sách mã chưa phân loại được.
