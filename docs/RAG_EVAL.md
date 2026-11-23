# Đánh giá hỏi đáp quy chế UEL

Đo ngày 2026-11-23 trên 66 câu UTF-8. Có 48 câu gán nhãn Điều/Khoản từ quy định ngoại ngữ K24, quy định rèn luyện và quy định cố vấn học tập. 18 câu cần từ chối gồm 6 câu ngoài phạm vi và 12 câu thử prompt injection. Chỉ mục trước OCR có 167 đoạn từ 5/50 văn bản trong catalog.

| Chỉ số | R1. Chỉ mục file/BM25 | R3. Lưu và đọc lại bằng SQL | Sau R4–R5 và kiểm soát phạm vi |
|---|---:|---:|---:|
| Recall@1 | 85,42% | 85,42% | 85,42% |
| Recall@3 | 100% | 100% | 100% |
| Recall@5 | 100% | 100% | 100% |
| MRR@5 | 0,9201 | 0,9201 | 0,9201 |
| Trích dẫn đầu đúng | 41/48 | 41/48 | 41/48 |
| Có ít nhất một trích dẫn đúng | 46/48 | 46/48 | 46/48 |
| Trích dẫn nguyên văn | 100% | 100% | 100% |
| Từ chối đúng | 12/18 | 12/18 | 18/18 |
| Từ chối sai | 0/48 | 0/48 | 0/48 |

Hai cột sau dùng SQL trên SQLite trong bộ nhớ để kiểm chứng tính tương đương của lưu trữ và lọc ứng viên. PostgreSQL dùng chỉ mục GIN trigram trên `search_text` đã bỏ dấu và cùng bộ xếp hạng BM25. Chưa đo thứ hạng và thời gian trên bảng PostgreSQL đã nạp. PostgreSQL hiện ở revision `0027` và `alembic check` báo cơ sở dữ liệu chưa cập nhật.

Bảy câu còn sai trích dẫn đầu là `r07`, `r09`, `r16`, `r19`, `r20`, `r45` và `r47`. Trong đó `r09` và `r45` thiếu trích dẫn đúng trong câu trả lời, dù nguồn đúng có trong ba kết quả đầu của truy hồi. Bộ đánh giá hiện tập trung vào ba văn bản có lớp chữ dùng được. Các số này chưa đại diện cho văn bản không có file hoặc cần OCR.

## Sửa bốn test R1

- Tách câu giữ nhãn số của Khoản cùng câu đầu, để so sánh `1. ...` và `2. ...` đúng đơn vị.
- Câu không dấu bổ sung hành động đăng ký và mốc học kỳ. Câu cũ chỉ hỏi mức tối đa bao nhiêu tín chỉ nên không xác định được đó là giới hạn đăng ký mỗi kỳ.
- Hai test đồ thị giữ kỳ vọng `references`. Cụm “thực hiện theo” trong điều khoản chuyển tiếp dẫn chiếu đến quy chế cũ. `guides` áp dụng khi câu nói rõ việc hướng dẫn hoặc quy định chi tiết.

## Kiểm soát LLM

- API dùng Codex theo cấu hình khi khả dụng. Mỗi lần thử, kể cả lần thử lại, trừ vào hạn mức PostgreSQL dùng chung cho hai phạm vi. Cache lưu theo câu hỏi đã chuẩn hóa, khóa và phiên bản nội dung. Các thiết lập ngân sách, timeout, kích thước và nhật ký nằm trong `.env.example`.
- Phản hồi công khai chỉ sử dụng đoạn đối chiếu được trong dữ liệu nguồn. Phép so khớp chấp nhận khác biệt khoảng trắng và chữ hoa, sau đó lấy lại nguyên văn từ nguồn. Khi hậu kiểm thất bại, API trả bản trích xuất và ghi bộ đếm `rag_postcheck`.
- Các test dùng provider giả và HTTP mô phỏng. Bộ 18 câu cần từ chối được thử ở cả hai phạm vi, tổng 36 lượt. Có 0 lời gọi LLM và 0 lần lộ system prompt. Trong suite API, 8/12 phản hồi mô phỏng bị bỏ khi hậu kiểm. Mẫu này cố ý chứa phản hồi lỗi nên tỷ lệ 66,7% chỉ mô tả suite kiểm thử. Nhật ký câu hỏi mặc định tắt. Khi bật, chỉ ghi mã băm theo ngày, phạm vi, chế độ và kết quả tìm thấy.

## Lặp lại phép đo

Từ thư mục `api`, dùng Python đã cài các phụ thuộc trong `requirements.txt` và `requirements-rag.txt`.

```powershell
python tests/rag/eval/run_eval.py --today 2026-11-23
python tests/rag/eval/run_eval.py --today 2026-11-23 --db-roundtrip
python tests/rag/eval/run_eval.py --fixture
python -m pytest -q tests/rag
```

Sau khi Docker hoạt động, chạy ở thư mục gốc.

```powershell
.\scripts\db_backup.ps1 -Tag truoc-rag-r3
.\scripts\dev.ps1 migrate
.\scripts\dev.ps1 api python scripts/ingest_regulations.py --publish-db --no-vault
.\scripts\dev.ps1 api alembic check
.\scripts\dev.ps1 api python tests/rag/eval/run_eval.py --today 2026-11-23 --database
.\scripts\dev.ps1 test-rag
```

Chỉ chạy lệnh migration và nạp sau khi đã xác nhận sao lưu thành công. `data/processed/regulations_status.md` lưu kiểm kê trước OCR.

## R6 — Sổ tay sinh viên và OCR

Chỉ mục cục bộ có 52 mục catalog, 29 nguồn có đoạn truy xuất và 2.288 đoạn. Sổ tay K24 có 290 đoạn, sổ tay K25 có 344 đoạn. Mỗi đoạn sổ tay dài tối đa 1.200 ký tự và trích dẫn theo thứ tự trang vật lý trong PDF. Bản K25 ngày 25/09/2025 thay mục danh mục của bản ngày 26/08/2025. Bản PDF tháng 8 vẫn lưu trong `regulations/raw/`.

Tệp `K26_STSV_2026.pdf` ghi năm 2019 trên bìa và mục lục. Mục `uel-sotay-sv-k26` trong catalog đang chờ PDF đúng bản K26. Văn bản OCR của tệp năm 2019 lưu trong `data/processed/sotay_sv_text/UEL_STSV_2019_R6.txt`. [Danh mục sổ tay UEL](https://ctsv.uel.edu.vn/so-tay-12/so-tay-sinh-vien-cac-khoa)

Tesseract `vie` đã chạy trên 24 PDF quy chế (480 trang) và 20 trang được chọn từ ba tệp sổ tay. Tỷ lệ ký tự có dấu của 24 PDF quy chế là 0,261–0,315. Ingest đọc được 24 bản OCR và lập đoạn Điều/Khoản cho 23 bản. Thông báo 88/TB-ĐHKTL-ĐT về cách tính điểm Văn bằng 2 và Vừa làm vừa học đã có bản TXT, trình tách Điều/Khoản hiện cho 0 đoạn. Báo cáo từng tệp và thời gian nằm tại `data/processed/ocr_report.md`.

Đo R6 trên SQLite trong bộ nhớ sau khi ghi và đọc lại chỉ mục. Bộ quy chế giữ nguyên 66 câu và nhãn gốc. Bộ sổ tay có 18 câu K24/K25, gán tài liệu, trang và cụm chứa đáp án. Tỷ lệ nguyên văn đo theo bản văn đã lập chỉ mục. Hậu kiểm LLM dùng provider giả trong pytest.

| Chỉ số | Quy chế trước R6 (66 câu) | Quy chế sau R6 (66 câu) | Sổ tay sau R6 (18 câu) |
|---|---:|---:|---:|
| Recall@1 | 85,42% | 89,58% | 83,33% |
| Recall@3 | 100% | 100% | 83,33% |
| Recall@5 | 100% | 100% | 83,33% |
| MRR@5 | 0,9201 | 0,9410 | 0,8333 |
| Trích dẫn đầu đúng | 41/48 | 43/48 | 15/18 |
| Có ít nhất một trích dẫn đúng | 46/48 | 47/48 | 17/18 |
| Trích dẫn đầu có cụm đáp án | — | — | 13/18 |
| Có ít nhất một trích dẫn chứa cụm đáp án | — | — | 15/18 |
| Trích dẫn nguyên văn | 100% | 100% | 100% |
| Từ chối đúng | 18/18 | 18/18 | — |
| Từ chối sai | 0/48 | 0/48 | 0/18 |

Các chỉ số trên bộ quy chế cũ giữ nguyên hoặc tăng. Năm câu sai trích dẫn đầu là `r07`, `r09`, `r16`, `r20` và `r45`. `r09` có nguồn đúng ở hạng 3 của truy hồi nhưng thiếu trong câu trả lời. Ba câu sổ tay thiếu đoạn chứa đáp án là `h06`, `h08` và `h17`.

Kiểm chứng cuối qua 116 ca pytest RAG, 8 ca Vitest của `/ask` và thành phần quy chế, cùng TypeScript `--noEmit --incremental false`. JSON theo từng câu lưu ở `data/processed/rag_r6_before.json`, `data/processed/rag_r6_after_regulations.json` và `data/processed/rag_r6_after_handbook.json`. PostgreSQL chờ lượt nạp của Claude.

Chạy lại từ `api/`.

```powershell
$env:DATABASE_URL = "sqlite://"
.\.venv\Scripts\python.exe -X utf8 tests/rag/eval/run_eval.py --today 2026-11-23 --db-roundtrip --subset regulations
.\.venv\Scripts\python.exe -X utf8 tests/rag/eval/run_eval.py --today 2026-11-23 --db-roundtrip --subset handbook
.\.venv\Scripts\python.exe -m pytest -o addopts="" -q -p no:cacheprovider --basetemp=../data/processed/rag_r6_verification tests/rag
```

## R8 — Sổ tay K26 và hoàn tất bản chép QĐ 2261/QĐ 370

Đã nạp bản chính thức Sổ tay sinh viên K26 (64 trang, 314 đoạn), hoàn tất QĐ
2261 với 45 Điều (171 đoạn) và QĐ 370 với 37 Điều cùng Phụ lục I–VIII (116
đoạn). Toàn bộ 52 ảnh QĐ 2261 và 41 ảnh QĐ 370 đã được xem trực tiếp. Hai bản
chép màn hình có `ocr_transcript: true`, `verified: false`; không có dấu
`[không rõ]`, nhưng vẫn chưa được đối chiếu với PDF gốc do nguồn hiện có chỉ là
ảnh chụp trình xem Google Drive.

Thêm 26 câu có đáp án: 10 câu QĐ 2261, 4 câu QĐ 370 và 12 câu sổ tay K26.
Bộ 84 câu cũ được chạy riêng sau thay đổi để phát hiện hồi quy.

| Chỉ số | Trước R8 (84 câu) | Sau R8, chỉ 84 câu cũ | Sau R8, toàn bộ 110 câu |
|---|---:|---:|---:|
| Recall@1 | 86,36% | 87,88% | 79,35% |
| Recall@3 | 93,94% | 95,45% | 84,78% |
| Recall@5 | 93,94% | 95,45% | 84,78% |
| MRR@5 | 0,8990 | 0,9116 | 0,8170 |
| Trích dẫn đầu đúng | 86,36% | 87,88% | 75,00% |
| Có ít nhất một trích dẫn đúng | 95,45% | 96,97% | 88,04% |
| Trích dẫn đầu có cụm đáp án | 72,22% | 72,22% | 50,00% |
| Có ít nhất một trích dẫn chứa cụm đáp án | 83,33% | 83,33% | 70,45% |
| Trích dẫn nguyên văn | 100% | 100% | 100% |
| Từ chối đúng | 100% | 100% | 100% |
| Từ chối sai | 0% | 0% | 6,52% |

Các chỉ số của 84 câu K24/K25/quy chế cũ giữ nguyên hoặc tăng. Điểm toàn bộ
110 câu thấp hơn vì các câu mới đồng thời đo khả năng ưu tiên bản chép OCR trước
các quy định chung; các lỗi mới còn tập trung ở nhóm QĐ 2261/QĐ 370 và bốn câu
sổ tay K26 có đáp án ngắn/số điện thoại. Đây là việc tối ưu truy hồi tiếp theo,
không sửa nhãn để làm xanh phép đo.

Chạy lại từ thư mục gốc:

```powershell
api\.venv\Scripts\python.exe -X utf8 api/tests/rag/eval/run_eval.py --today 2026-11-23
$old = Get-Content -Encoding utf8 api/tests/rag/eval/questions.jsonl | Select-Object -First 84
[IO.File]::WriteAllLines((Join-Path $PWD 'tmp/r8_questions_old.jsonl'), $old, [Text.UTF8Encoding]::new($false))
api\.venv\Scripts\python.exe -X utf8 api/tests/rag/eval/run_eval.py --today 2026-11-23 --questions tmp/r8_questions_old.jsonl
api\.venv\Scripts\python.exe -X utf8 -m pytest -q -p no:cacheprovider --basetemp=.pytest-r8-final api/tests/rag
```

## R9 — Tăng Recall truy xuất

Đo trên SQLite, ngày hiệu lực cố định `2026-11-23`, toàn bộ 110 câu (92 trong
phạm vi, 18 ngoài phạm vi). Không sửa nhãn hoặc thêm câu hỏi. JSON chi tiết nằm
trong `data/processed/rag_r9_step0.json` đến `rag_r9_step5.json` và
`rag_r9_final.json`; thư mục `data/` không commit.

| Mốc | Recall@1 | Recall@3 | Trích dẫn đầu đúng | Từ chối sai trong phạm vi | Từ chối đúng ngoài phạm vi | Nguyên văn |
|---|---:|---:|---:|---:|---:|---:|
| Trước R9 | 79,35% | 84,78% | 75,00% | 6,52% | 18/18 | 100% |
| Sau bước 1 — tách phụ lục/cửa sổ | 80,43% | 86,96% | 75,00% | 6,52% | 18/18 | 100% |
| Sau bước 2 — ngưỡng phủ 0,45 | 80,43% | 86,96% | 75,00% | 5,43% | 18/18 | 100% |
| Sau bước 3 — bigram | 80,43% | 86,96% | 75,00% | 5,43% | 18/18 | 100% |
| Sau bước 4 — ưu tiên nguồn/khóa | 89,13% | 96,74% | 83,70% | 5,43% | 18/18 | 100% |
| Sau bước 5 — metric mới | 89,13% | 96,74% | 83,70% | 5,43% | 18/18 | 100% |
| Bản cuối — tinh chỉnh bước 2/4 | **90,22%** | **97,83%** | **90,22%** | **0/92** | **18/18** | **100%** |

Bước 1 tăng số chunk từ 2.889 lên 3.223, tách 229 cửa sổ phụ lục; không còn
chunk dài hơn 1.400 ký tự (trước đó có 68 chunk trên 1.500 và 14 chunk trên
5.000, lớn nhất 54.010). Mỗi cửa sổ là chuỗi con nguyên văn, có chồng lấn 180
ký tự và giữ `doc_id`, Điều, Khoản, Điểm, phần văn bản cùng số cửa sổ.

Bước 2 quét `MIN_COVERAGE` từ 0,20 đến 0,50 và `MIN_SCORE` từ 0,5 đến 2,0.
Ngưỡng phủ 0,45 là điểm cao nhất có ích; hạ tiếp không thu hồi thêm câu nào.
Cổng chủ đề được bổ sung các chủ đề hẹp có thật trong bộ nguồn (dạy trực tuyến,
văn bằng/bản sao, ban cán sự/công tác xã hội, sổ tay, hotline và y tế), vẫn từ
chối đủ 18/18 câu ngoài phạm vi.

Bước 3 giữ bigram âm tiết có dấu và bỏ dấu đã có từ R1–R5. Thử thêm trigram
nhưng loại bỏ vì làm ca chuẩn “đăng ký tối đa bao nhiêu tín chỉ” xếp nhầm Điều
13; không sửa test để che hồi quy. Vì vậy số sau bước 3 bằng bước 2.

Bước 4 chỉ đổi thứ tự giữa các nhóm nguồn khi nguồn riêng cho khóa hoặc sổ tay
được gọi đích danh có điểm từ khóa chung ít nhất 60% nguồn tốt nhất; thứ tự BM25
trong cùng nhóm được giữ nguyên. Catalog QĐ 1390/2025 ghi rõ chưa xác định khóa
áp dụng và chưa rõ quan hệ thay thế, nên không đặt `applies_until_cohort` cho
`uel-ngoaingu-2024-k24` khi chưa có căn cứ.

Bước 5 chấm Điểm nằm trong chunk cấp Khoản và chiều ngược lại, chọn cửa sổ tốt
nhất của cùng locator, đồng thời chấm sổ tay bằng đúng trang hoặc đoạn chứa
`evidence`. Metric cũ và mới cùng cho Recall@1 90,22%, Recall@3 97,83%, MRR
0,9384, trích dẫn đầu 90,22% và trích dẫn bất kỳ 96,74%; thay đổi metric không
làm tăng điểm giả. Recall@3 đã trên 0,95 sau bước 5, vì vậy **không làm bước 6**
và không thêm phụ thuộc embedding/migration.

Các câu còn sai trích dẫn đầu:

- `r03` và `q370_01`: nguồn đúng chưa vào 5 locator đầu; từ khóa chung kéo nhầm
  quy chế đào tạo/sổ tay.
- `r07`, `r09`, `r16`, `r20`: nguồn đúng ở hạng 2 nhưng điều/khoản gần nhau
  trong cùng chủ đề có điểm BM25 cao hơn.
- `r45`: nguồn đúng ở hạng 3 trong cùng văn bản cố vấn học tập.
- `q2261_04`, `q2261_06`: nguồn đúng ở hạng 2; văn bản thi/công nhận kết quả có
  cụm từ gần hơn câu hỏi.

Các câu đã đúng locator nhưng trích dẫn chưa chứa nguyên cụm đáp án là `h08`,
`h17`, `h26_03`, `h26_12`; cụm đáp án nằm ở cửa sổ khác cùng trang. Không nới
metric này vì trích dẫn hiện tại chưa đủ bằng chứng. `q370_01` sai cả locator và
đoạn đáp án.

Chạy lại từ thư mục gốc:

```powershell
api\.venv\Scripts\python.exe -X utf8 api/tests/rag/eval/run_eval.py --today 2026-11-23
api\.venv\Scripts\python.exe -X utf8 api/tests/rag/eval/run_eval.py --today 2026-11-23 --db-roundtrip
$ragTmp = Join-Path $env:TEMP ('uelpath-rag-r9-' + [guid]::NewGuid().ToString('N'))
api\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --basetemp $ragTmp api/tests/rag
```

## R10 — Precision kèm trích dẫn (Claude)

**Định nghĩa.** Precision chặt = số câu được trả lời có trích dẫn đầu đúng Điều/Khoản (sổ tay: đúng trang) **và**, nếu câu có `evidence`, đoạn trích chứa `evidence` / số câu hệ thống trả lời (kể cả câu ngoài phạm vi bị trả lời nhầm). Kèm khoảng tin cậy Wilson 95%. "Precision mọi trích dẫn" = tỷ lệ mọi trích dẫn hiển thị đúng vị trí. `run_eval.py` in cả hai; `--mode llm` gọi LLM thật theo `LLM_PROVIDER` (tốn phí, không dùng trong pytest).

Đo 110 câu, ngày `2026-11-23`, văn bản giống container (venv host phải `pypdf==7.1.1`; bản 6.19 tách chữ "tí n chỉ" ở 3 văn bản và làm SQLite lệch PostgreSQL một câu).

| Cấu hình | Precision chặt (KTC95%) | Mọi trích dẫn | Được trả lời | Nguyên văn | Ngoài phạm vi |
|---|---:|---:|---:|---:|---:|
| Extractive trước R10 (3 trích dẫn/câu) | 86,96% | 43,84% | 100% | 100% | 18/18 |
| Extractive, 1 trích dẫn chính (PostgreSQL) | 85,87% (77,3–91,6) | 89,13% | 100% | 100% | 18/18 |
| LLM `gpt-6-sol`, lần 1 | 94,57% | 90,82% | 100% | 98,98% | 18/18 |
| LLM `gpt-6-sol`, bản cuối | **97,73% (92,1–99,4)** | **98,86%** | **95,65%** | **100%** | **18/18** |

Thay đổi:
1. Gỡ luật cộng điểm riêng cho chữ "đợi" (chỉ khớp câu h26_03).
2. Extractive chỉ trả **một** trích dẫn có đoạn trích; hạng thấp hơn chuyển sang `related` (không có đoạn trích). Trên bộ eval chỉ 13/127 trích dẫn phụ đúng nhãn.
3. LLM: trích dẫn sổ tay gắn đúng chunk chứa cửa sổ đã gửi (trước đó nguyên văn 98,98%); lời nhắc yêu cầu trích dẫn đầu là đoạn trả lời trực tiếp, ưu tiên văn bản gốc; so khớp nguyên văn bỏ qua khoảng trắng (OCR "fo r") nhưng vẫn công bố chữ của nguồn.
4. **Từ chối khi LLM đã đọc ngữ cảnh mà không có căn cứ** (KHONG_TIM_THAY, trích không khớp, chunk ngoài ngữ cảnh): trả `found=false`, `abstained=true`, liệt kê "Có thể liên quan" không kèm đoạn trích. Trước đây các ca này quay về extractive và cả 3 ca đều sai. Lỗi mạng/hết hạn mức vẫn quay về extractive.
5. Sửa ba lỗi khiến LLM chưa từng chạy: container thiếu biến `CODEX_*`; hạn mức PostgreSQL luôn báo hết (`rowcount=-1` với `ON CONFLICT`, nay dùng `RETURNING`); model gpt-5+/o không nhận `max_tokens`/`temperature=0` (nay `max_completion_tokens` + `reasoning_effort`, mặc định `low`).

Còn lại (LLM): r03, q370_01 — đoạn đúng không vào top ngữ cảnh (lỗi truy xuất); r09, r16, r30 — từ chối; h26_03 — đúng trang nhưng đoạn trích thiếu "5-7 ngày làm việc". Model không cho đặt `temperature=0`, hai lần chạy có thể lệch 1 câu. 110 câu chưa đủ để khẳng định 95% chặt chẽ; cần bộ ≥ 300 câu.