# regulations/ — Văn bản quy chế học vụ (UEL, ĐHQG-HCM, Bộ GD&ĐT)

Thư mục do agent `regulations-collector` quản lý. Ngày thu thập: 2026-11-20.

- `catalog.json`: danh mục 50 văn bản (28 bản đầu 2026-11-20 + 22 bản bổ sung 2026-11-21). Trường `source_url` là nguồn chính thức để người dùng mở văn bản gốc.
- `raw/`: chỗ chứa PDF tải về **chỉ trên máy cục bộ** để lập lại chỉ mục. PDF trong thư mục này bị gitignore và không được lưu trong repo.
- `manual/`: bản chép tay `.txt` dùng khi văn bản gốc không có lớp chữ hoặc chưa tải được.
- `.venv/`: môi trường Python chỉ chứa `pypdf` để đọc metadata. Không commit thư mục này.

## PDF và cách nạp lại chỉ mục cục bộ

Repo không lưu PDF toàn văn. Ứng dụng chỉ hiển thị metadata và dẫn người dùng tới URL chính thức trong `source_url` của `catalog.json`.

Khi cần lập lại chỉ mục trên máy cục bộ, tự tải văn bản từ `source_url` về đúng đường dẫn `regulations/raw/<doc_id>.pdf`, rồi chạy pipeline ingest. Với văn bản đã có `regulations/manual/<doc_id>.txt`, pipeline dùng bản chép tay có sẵn; không cần thêm PDF vào repo.

**Lưu ý độ tin cậy:** phần lớn PDF của UEL là **bản scan**. Có 8 file không có lớp chữ (cần OCR) và một số file có OCR rất lỗi (mất dấu, sai số). Chỉ đánh `verified: true` khi số QĐ/ngày đọc được trong chính văn bản. Các trường lấy từ trang web hoặc từ trích dẫn trong văn bản khác có `verified: false` và ghi nguồn trong `notes`. Pipeline RAG nên OCR lại các file scan (vd. Tesseract `vie`) trước khi chunk.

## Bảng tổng hợp

| doc_id | Văn bản | Số hiệu | Ngày BH | Khóa | Trạng thái | File | Tin cậy |
|---|---|---|---|---|---|---|---|
| uel-qcdt-2261-2025 | Quy chế đào tạo ĐH (từ khóa 2025) | 2261/QĐ-ĐHKTL | 2025-09-04 | K25+ | active | — | trang PĐT |
| uel-qcdt-1268-2022 | Quy chế đào tạo ĐH 2022 | 1268/QĐ-ĐHKTL | 2022-10-14 | K22–K24 | active | ✓ (scan OCR) | **đã đọc** |
| uel-qcdt-118-2024 | Sửa đổi QC 1268 | 118/QĐ-ĐHKTL | 2024-01-18 | K22–K24 | active | — | trang PĐT |
| uel-qcdt-789-2017 | Quy chế đào tạo ĐH 2017 | 789/QĐ-ĐHKTL | 2017-08-09 | ≤K21 (suy luận) | superseded | ✓ (scan, không chữ) | trích dẫn |
| uel-cnkq-494-2023 | Công nhận KQHT & chuyển đổi tín chỉ | 494/QĐ-ĐHKTL | 2023-04-28? | K23+ | active | ✓ (OCR lỗi) | ngày mâu thuẫn |
| uel-hocphi-558-2023 | Quy trình quản lý học phí | 558/QĐ-ĐHKTL (OCR: 559) | 2023-05-16 | all | active | ✓ | OCR |
| uel-kientap-472-2021 | Học phần kiến tập | 472/QĐ-ĐHKTL | 2021-05-04 | K19 | active? | ✓ | trang PĐT + OCR |
| uel-cdr-ngoaingu-1390-2025 | Chuẩn đầu ra ngoại ngữ | 1390/QĐ-ĐHKTL | 2025-06-10 | Từng nhóm khóa theo phụ lục (IV từ K24) | active | Bản ký số công khai ở `source_url` | **đã đọc** |
| uel-ngoaingu-1579-k22 | Tiếng Anh & chuẩn NN (K22) | ? | ? | K22 | active? | — (server lỗi) | thấp |
| uel-ngoaingu-2024-k24 | Tiếng Anh & chuẩn NN (từ khóa 2024) | (để trống) | 2024-08-13 | K24 | active | ✓ (ký số) | chữ ký số |
| uel-thi-1622-2022 | Tổ chức thi, kiểm tra kết thúc HP | ? (file "1622") | ? | all | active | ✓ (scan, không chữ) | thấp |
| uel-drl-2024 | Đánh giá kết quả rèn luyện | (để trống) | 2024-08-13 | all | active | ✓ | **đã đọc** |
| uel-drl-2021 | ĐGKQRL 2021 | 952/QĐ-ĐHKTL | 2021-11-10 | all | superseded | ✓ (scan) | trích dẫn |
| uel-hocbong-2024 | Xét cấp học bổng 2024 | ? | ? | all | superseded? | — (404) | thấp |
| uel-hocbong-2025-hk2 | Học bổng từ HK2 2025-2026 | ? | ? | all | superseded? | — (404) | thấp |
| uel-hocbong-2025-hk3 | Học bổng từ HK3 2025-2026 | ? | ? | all | active? | — (404) | thấp |
| uel-hocbong-nckh-2037-2023 | Cộng điểm NCKH vào xét HB | ? (file "2037-2023") | ? | all | active? | ✓ (scan) | thấp |
| uel-ctsv-2017 | Quy chế công tác SV UEL | 1046/QĐ-ĐHKTL | 2017-10-03 | all | active | ✓ (OCR) | trích dẫn |
| uel-cvht-2024 | Công tác cố vấn học tập | (để trống) | 2024-08-13 | all | active | ✓ | **đã đọc** |
| uel-ctxh-2020 | Chuẩn tham gia CTXH | ? | ? | all | active? | ✓ (scan) | thấp |
| vnu-qcdt-1342-2022 | Quy chế đào tạo ĐH ĐHQG-HCM | 1342/QĐ-ĐHQG | 2022-09-30 | K22–K24? | active? | — | trích dẫn |
| vnu-ctsv-2019 | Quy chế CTSV ĐHQG-HCM | ? | 2019-07-15 | all | active? | ✓ (OCR) | OCR |
| vnu-drl-2019 | Quy chế ĐGKQRL ĐHQG-HCM | 964/QĐ-ĐHQG | 2019-07-19 | all | active? | ✓ (OCR) | **đã đọc** |
| moet-tt08-2021 | TT Quy chế đào tạo ĐH | 08/2021/TT-BGDĐT | 2021-03-18 | K21+ | superseded? | — | nguồn thứ cấp |
| moet-qcdt-2026 | TT Quy chế đào tạo ĐH mới (2026) | ? (thứ cấp: 56/2026) | ? | ? | active? | — | thấp |
| moet-ctsv-2016 | Quy chế CTSV (Bộ) | 10/2016/TT-BGDĐT | 2016-04-05 | all | active? | ✓ (scan) | trích dẫn |
| moet-drl-2015 | Quy chế ĐGKQRL (Bộ) | 16/2015/TT-BGDĐT | 2015-08-12 | all | active? | ✓ (scan) | trích dẫn |
| gov-hocphi-nd238-2025 | NĐ học phí, miễn giảm | 238/2025/NĐ-CP | 2025-09-03 | all | active | — | trang chinhphu.vn |

### Bổ sung ngày 2026-11-21

| doc_id | Văn bản | Số hiệu | Ngày BH | Khóa | Trạng thái | File | Tin cậy |
|---|---|---|---|---|---|---|---|
| uel-sotay-sv-2025 | Sổ tay sinh viên 2025-2026 (có mục CTĐT tiếng Anh, phụ lục chuẩn NN theo 1390, tốt nghiệp, tạm dừng, song bằng) | — | ~2025-08-26 | K22–K25 | active | ✓ (có chữ) | **đã đọc**, nguồn thứ cấp |
| uel-giangday-tienganh-1286 | Giảng dạy chuyên môn bằng tiếng Anh | 1286/QĐ-ĐHKTL | ? | ? | unknown | — (Drive) | tiêu đề trang |
| uel-ctdt-tienganh-642-dhqg-2023 | ĐHQG phê duyệt CTĐT dạy-học bằng tiếng Anh | 642/QĐ-ĐHQG | 2023-06-01 | ? | active | — | trích dẫn Sổ tay |
| vnu-ctdt-tienganh-358-2024 | ĐHQG phê duyệt CTĐT tiếng Anh (bổ sung) | 358/QĐ-ĐHQG | 2024-04-17 | ? | active | — | trích dẫn Sổ tay |
| gov-nd222-2025 | NĐ dạy và học bằng tiếng nước ngoài | 222/2025/NĐ-CP | 2025-08-08 | all | active | ✓ (ký số, không chữ) | trang chính phủ |
| uel-clc-857-2021 | Đào tạo cử nhân chất lượng cao (từ K21) | 857/QĐ-ĐHKTL | ? | K21+ | unknown | — (server trả lỗi) | tiêu đề trang |
| uel-clc-790-2017 | Đào tạo cử nhân CLC (bản trước) | 790/QĐ-ĐHKTL | ? | <K21 (suy luận) | superseded | ✓ (scan) | thấp |
| uel-cntai-621-2018 | Đào tạo cử nhân tài năng 2018-2022 | 621/QĐ-ĐHKTL | ? | K18–K22 (suy luận) | superseded | ✓ (scan) | thấp |
| uel-cntai-780-2024 | Đề án sinh viên tài năng 2023-2027 | 780/QĐ-ĐHKTL | 2024-04-17 | ? | active | — | trích dẫn Sổ tay |
| uel-ctdt-1007-2025 | Ban hành CTĐT đại học 2025 (đợt 2) | 1007/QĐ-ĐHKTL | 2025-04-23 | K25 | active | ✓ (có chữ) | **đã đọc**; số/ngày để trống trong file |
| uel-ctdt-1652-2024, uel-ctdt-1823-2024 | Bản mô tả CTĐT CNTC, HTTTQL khóa 2024 | 1652, 1823/QĐ-ĐHKTL | 2024-07-19, 2024-08-05 | K24 | active | — | trích dẫn Sổ tay |
| moet-tt17-2021 | TT chuẩn CTĐT, xây dựng/thẩm định/ban hành CTĐT | 17/2021/TT-BGDĐT | 2021-06-22 | K21+ | unknown | — | đọc trong căn cứ QĐ 1007 |
| vnu-qcdt-262-2017 | Quy chế đào tạo đại học ĐHQG-HCM 2017 | 262/QĐ-ĐHQG | 2017-04-20 | ≤K21 (suy luận) | superseded | ✓ (OCR lỗi) | trích dẫn 3 nguồn |
| vnu-songnganh-1195-2019 | Quy định đào tạo song ngành ĐHQG-HCM | 1195/QĐ-ĐHQG-HCM | 2019-09-27 | ? | unknown | — | trích dẫn Sổ tay |
| uel-vanbang-370-2025 | Quy chế quản lý văn bằng, chứng chỉ | 370/QĐ-ĐHKTL | 2025-04-04 | all | active | — (Drive) | tiêu đề trang |
| uel-trogiang-142-2019 | Quy định trợ giảng | 142/QĐ-ĐHKTL | ? | — | unknown | ✓ (OCR) | thấp |
| uel-daotaomang-786 | Ứng dụng CNTT đào tạo qua mạng | 786/QĐ-ĐHKTL | ? | ? | unknown | ✓ (scan) | thấp |
| uel-tb-diemtongket-vb2vlvh | TB tính điểm tổng kết VB2/VLVH | ? | ~2017-18 | không áp dụng chính quy | unknown | ✓ (OCR) | thấp |
| uel-hocbong-sdbs-1225-2023 | Sửa đổi QĐ học bổng KKHT 2023 | 1225/QĐ-ĐHKTL | ? | all | superseded | ✓ (scan) | thấp |
| uel-nckh-sv-2018 | Quy định NCKH sinh viên (trang web) | ? | 2018-01-06 | all | unknown | — | trang web |
| uel-mghp-huongdan | Hướng dẫn chính sách MGHP, TCXH (trang web) | — | — | all | active | — | trang web |

Thông tin bổ sung đọc được trong Sổ tay 2025 (chưa ghi vào mục cũ vì giữ nguyên 28 mục đầu): quy định ĐGKQRL 2024 là **QĐ 1911/QĐ-ĐHKTL ngày 13/8/2024**; quy định CVHT 2024 là **QĐ 1912/QĐ-ĐHKTL ngày 13/8/2024**; Chuẩn tham gia CTXH là **QĐ 22/QĐ-ĐHKTL ngày 09/01/2020**. Có thể dùng để điền `decision_no` cho `uel-drl-2024`, `uel-cvht-2024`, `uel-ctxh-2020` (nên đối chiếu với file gốc trước khi đánh `verified`).

Quy ước khóa (xác nhận bởi sinh viên UEL): mã khóa = 2 số cuối năm nhập học — K22 = khóa tuyển sinh 2022, K23 = 2023, K24 = 2024… Khớp với MSSV (K22…) và mã lớp sinh viên (K24404E…). Quy định ghi áp dụng cho khóa nào thì chỉ áp dụng cho khóa đó.

## Văn bản còn thiếu: cần SV/khoa cung cấp

1. **Toàn văn QĐ 2261/QĐ-ĐHKTL (2025)**, quy chế đào tạo cho K25+ (Google Drive, cần email trường).
2. **QĐ 118/QĐ-ĐHKTL (2024)**, sửa đổi QC 1268.
3. **QĐ 1390/QĐ-ĐHKTL (2025)**, chuẩn đầu ra ngoại ngữ.
4. **Quy định học bổng KKHT** bản 2024 và hai bản 2025-2026 (link trên ctsv.uel.edu.vn bị 404).
5. **Quy định ngoại ngữ K22 (file "1579")** (ifl.uel.edu.vn không truy cập được).
6. **QĐ 1342/QĐ-ĐHQG (2022)**, quy chế đào tạo ĐHQG-HCM, cùng quy chế ĐHQG mới nếu có.
7. **Thông tư 08/2021/TT-BGDĐT** và **thông tư quy chế đào tạo mới năm 2026** của Bộ GD&ĐT, bản chính thức.
8. **NĐ 238/2025/NĐ-CP** (bản gốc).
9. Chưa tìm thấy văn bản riêng về: chuẩn đầu ra **tin học**, **chuyển ngành / song ngành (học cùng lúc hai chương trình)**, **tạm dừng / bảo lưu**, **điều kiện xét tốt nghiệp** riêng, **danh mục học phần tương đương**. Các nội dung này có thể nằm trong quy chế đào tạo (1268/2261) hoặc trong sổ tay sinh viên (`ctsv.uel.edu.vn`, bản 2025).
11. **Quy ước mã học phần (E = dạy bằng tiếng Anh, B/khác = tiếng Việt):** không tìm thấy văn bản công khai nào nêu quy ước này; Sổ tay 2025 cũng không nói. Cần khoa/PĐT xác nhận. Cũng chưa thấy văn bản về **điều kiện mở lớp / đăng ký học phần tiếng Anh**, **học phí riêng CTĐT tiếng Anh/CLC**, **quy định xây dựng đề cương chi tiết học phần** của UEL.
12. **QĐ 1286/QĐ-ĐHKTL** (giảng dạy chuyên môn bằng tiếng Anh), **QĐ 370/QĐ-ĐHKTL** (văn bằng, chứng chỉ): chỉ có link Google Drive. **QĐ 857/QĐ-ĐHKTL** (CLC từ K21): file trên pdt.uel.edu.vn trả lỗi khi tải.
13. **QĐ 642/QĐ-ĐHQG (2023), 358/QĐ-ĐHQG (2024)**, **QĐ 780/QĐ-ĐHKTL (2024)**, **QĐ 1195/QĐ-ĐHQG-HCM (2019, song ngành)**: bản gốc.
14. Học bổng bản 2024 và 2025-2026: các link PDF mới lấy từ trang quy chế CTSV (`ctsv.uel.edu.vn/quy-che-quy-dinh-4/quy-che-quy-dinh-7`, ví dụ `Quy dinh xet cap hoc bong sinh vien - Signed (3).pdf`) vẫn trả trang lỗi HTML khi tải bằng script; thử tải bằng trình duyệt rồi bỏ vào `manual/`.
15. Trang ifl.uel.edu.vn vẫn từ chối kết nối (có quy định tiếng Anh K22/K23 ở đó). Chuẩn đầu ra **tin học**: không có văn bản riêng của UEL trong nguồn công khai; hầu như chỉ có điều kiện chung trong Điều kiện tốt nghiệp (Sổ tay) nên có thể UEL không đặt chuẩn tin học riêng.
16. Bản có lớp chữ (không scan) của 789/2017, 1622/2022, 952/2021, CTXH 2020, 2037/2023.

## Cách bổ sung bản chép tay (`manual/`)

1. Đặt nội dung chép tay vào `regulations/manual/<doc_id>.txt`. Nếu văn bản đã có trong catalog thì dùng đúng `doc_id` đó; nếu là văn bản mới thì đặt id dạng `uel-<chủ đề>-<số>-<năm>`.
2. Mở `catalog.json` và sửa mục tương ứng (hoặc thêm mục mới):
   - `"file": "manual/<doc_id>.txt"`;
   - điền `source_url` trỏ tới trang hoặc file chính thức;
   - điền `decision_no`, `issued_date`, `effective_from` (YYYY-MM-DD) **đúng như ghi trong văn bản**;
   - `"verified": true` chỉ khi đã đọc trong chính văn bản;
   - cập nhật `status`, `supersedes` / `superseded_by` theo điều khoản thi hành;
   - ghi nguồn (ai cung cấp, ngày) vào `notes`.
3. Không bỏ vào đây văn bản có thông tin cá nhân sinh viên (quyết định xử lý học vụ, danh sách...).
4. Chạy lại ingest của RAG (`api/scripts/ingest_regulations.py`, do agent `regulations-rag` quản lý).

## Cách thu thập đã dùng

- Nguồn: pdt.uel.edu.vn (Văn bản - Quy chế), ctsv.uel.edu.vn (Quy chế - Quy định), bdcl.uel.edu.vn, cùng tìm kiếm web.
- Chỉ tải từ `.edu.vn`/`.gov.vn`. Không tải từ vbpl.vn, thuvienphapluat.vn, Google Drive. Các trang moet.gov.vn và vbpl.moj.gov.vn không kết nối được từ máy thu thập.
- Metadata được đọc bằng `pypdf` (`python -I`, trong `regulations/.venv`): lớp chữ, ngày chữ ký số. Không mở file bằng chương trình khác.
