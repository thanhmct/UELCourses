# Nhiệm vụ cho Gemini: viết script lấy TOÀN BỘ dữ liệu "Tra cứu học phần" của dkhp.uel.edu.vn

Bạn là kỹ sư Python. Hãy đọc kỹ file này rồi viết code đúng như yêu cầu. Mọi "sự thật" về API bên dưới đã được kiểm chứng trực tiếp ngày 2026-11-20 — không cần đoán lại.

## 1. Mục tiêu

Viết `D:\UELCourse\fetch_all_dkhp.py` lấy **tất cả lớp học phần** mà trang https://dkhp.uel.edu.vn/Student/FilterScheduleUnit có thể tra cứu, lưu ra file JSON/CSV, chạy được lặp lại và có thể tiếp tục (resume) nếu bị ngắt.

## 2. Giới hạn — ĐỌC TRƯỚC KHI VIẾT

- Chỉ gọi **một** endpoint chỉ-đọc ở mục 3. **Tuyệt đối không** gọi các endpoint đăng ký/hủy/khóa học phần (`RegistScheduleStudyUnit`, `RemoveScheduleStudyUnit`, `LockScheduleStudyUnitByID`, `UnLockScheduleStudyUnitByID`, `sendOtpByUser`…).
- Token là của sinh viên đang dùng máy: đọc từ biến môi trường `UEL_DKHP_TOKEN` hoặc file `token.txt` (dòng đầu, có hay không tiền tố `Bearer ` đều chấp nhận). **Không** hard-code, **không** in ra log/console, **không** ghi vào file kết quả. `token.txt` đã nằm trong `.gitignore`.
- Lịch sự với server: tối đa **4 request đồng thời**, nghỉ ≥ 0,2 giây giữa các request trên mỗi luồng, retry có backoff khi gặp 429/5xx/timeout (tối đa 5 lần). Gặp 401/403 → dừng ngay, lưu checkpoint, in hướng dẫn lấy token mới (không in token).
- Chỉ tạo/sửa: `fetch_all_dkhp.py`, `tests/test_fetch_all_dkhp.py`, `data/`. Không sửa `api/`, `web/`, `research/`, `regulations/`, `fetch_courses.py`.
- Windows + PowerShell, Python 3.14, đã có `requests`. Code/tên biến tiếng Anh; comment và thông báo cho người dùng bằng tiếng Việt.

## 3. API (đã kiểm chứng)

```
POST https://dkhpapi.uel.edu.vn/api/Schedule/GetAllScheduleStudyUnit
Authorization: Bearer <token>
Content-Type: application/json
{"ReqParam1": "<từ khóa>", "ReqParam2": "0" | "1"}
```

Hành vi thực tế:

| Điều kiện | Kết quả đo được |
|---|---|
| `ReqParam1` rỗng | HTTP 400 `"ReqParam1 And ReqParam2 is require!"` |
| `ReqParam2 = "0"` | tìm theo **mã học phần** `CurriculumID`; khớp **chứa chuỗi con** (substring), không phân biệt hoa/thường (`KT` = `kt`; `EIE300` ra `EIE3004`) |
| `ReqParam2 = "1"` | tìm theo **tên học phần**; substring, không phân biệt hoa/thường nhưng **phân biệt dấu** (`kinh te` → 0 kết quả, `kinh` → có) |
| **Giới hạn kết quả** | mỗi truy vấn trả **tối đa 100 dòng**. Truy vấn `KT`, `K`, `2`, `%`, `a`, `Kinh` đều trả đúng 100 → bị cắt cụt. `EIE`→64, `25`→60 là kết quả đầy đủ |
| Tìm theo mã học phần không khớp `ScheduleStudyUnitAlias` | `ReqParam1="251"`, `"0"` → 0 kết quả (251 là tiền tố của mã lớp, không phải của mã môn) |
| Response | mảng JSON các object (không bọc) |

Các trường của mỗi dòng (kiểm chứng):
`ScheduleStudyUnitName, ScheduleStudyUnitID, ScheduleStudyUnitAlias, CurriculumID, StudyUnitTypeName, StudentQuotas, Schedules, ProfessorName, Credits, StudyUnitTypeID, StudyUnitID, ClassOfStudentID, BeginDate, EndDate`.

Ví dụ một dòng:
```json
{"ScheduleStudyUnitName":"Các phương thức giải quyết tranh chấp thay thế","ScheduleStudyUnitID":"253BKT500201","ScheduleStudyUnitAlias":"253BKT500201","CurriculumID":"BKT5002","StudyUnitTypeName":"Lý thuyết","StudentQuotas":"30-70","Schedules":" Thứ 3, Tiết 7->10.5, 02/06/2026->02/06/2026, Phòng A.311<br/>Thứ 3, Tiết 7->10.5, 16/06/2026->16/06/2026, Phòng B1.205<br/>Thứ 6, Tiết 1->3, 24/04/2026->26/06/2026, Phòng A.514","ProfessorName":"","Credits":2,"StudyUnitTypeID":1,"StudyUnitID":"253BKT5002","ClassOfStudentID":"K23501A, K23501B","BeginDate":"24/04/2026","EndDate":"..."}
```

Dữ liệu chứa nhiều học kỳ cùng lúc: tiền tố 3 ký tự của mã lớp quan sát được là `251, 253, 261, 262, 263, 271` (2 số đầu = năm, số thứ 3 = học kỳ: `253` = năm 2025 học kỳ 3). Mã lớp = `<3 ký tự kỳ><CurriculumID><2 số thứ tự lớp>`.

## 4. Thuật toán bắt buộc (vì bị giới hạn 100 dòng/truy vấn)

Chia nhỏ không gian tìm kiếm theo **mã học phần** (`ReqParam2="0"`) bằng các chuỗi con, mở rộng khi bị cắt cụt:

1. Bảng chữ cái: `A–Z` và `0–9` (36 ký tự).
2. Vòng 1: truy vấn mọi **bigram** `c1c2` (1.296 truy vấn).
3. Với mỗi truy vấn `q` có **đúng 100 dòng** (nghi bị cắt): truy vấn thêm mọi `q+c` và `c+q` (c thuộc bảng chữ cái), lặp đệ quy cho tới khi truy vấn trả < 100 dòng. Chứng minh đầy đủ: mọi mã môn X (độ dài L ≥ 2) chứa các n-gram liên tiếp; mở rộng bằng cách nối thêm/đặt trước một ký tự luôn đi qua mọi n-gram của X, và đến n = L thì truy vấn chính X chỉ trả các lớp của X (và vài mã chứa X) nên < 100.
4. Memoize: mỗi chuỗi truy vấn chỉ gọi **một lần** (ghi vào checkpoint). Không mở rộng chuỗi đã có kết quả < 100.
5. Gộp kết quả, **khử trùng theo `ScheduleStudyUnitID`** (nếu trùng khác nội dung thì giữ bản xuất hiện sau cùng và đếm vào báo cáo).
6. Vòng kiểm tra chéo: với mỗi `CurriculumID` phân biệt thu được, truy vấn lại chính mã đầy đủ (`ReqParam2="0"`) và gộp (bắt trường hợp một mã môn có > 100 lớp hoặc bị sót); thêm vòng quét theo tên (`ReqParam2="1"`) với các âm tiết tiếng Việt phổ biến (ít nhất: kinh, tế, luật, quản, trị, tài, chính, kế, toán, hệ, thống, dữ, liệu, tiếng, anh, toán, thống, kê, marketing, thương, mại, đầu, tư, ngân, hàng, bảo, hiểm, pháp, dân, sự, hình, hành, doanh, quốc) để đối chiếu — báo cáo số lớp mới phát hiện thêm (kỳ vọng 0; nếu > 0 thì in cảnh báo "thuật toán có thể thiếu" và thêm chúng vào kết quả).
7. Tốc độ: với ~1.300+ truy vấn và 4 luồng, cần hiển thị tiến độ (số truy vấn xong / dự kiến, số lớp duy nhất đã có, thời gian còn lại ước tính). Có thể mở rộng thông minh để giảm truy vấn (vd chỉ mở rộng bằng các ký tự đã thấy cạnh `q` rồi fallback toàn bảng chữ cái ở vòng kiểm tra) **nhưng** phải giữ đảm bảo đầy đủ ở bước 6 và ghi rõ trong docstring.

## 5. Đầu ra (thư mục `data/`)

- `data/dkhp_classes_raw.json`: danh sách object nguyên bản từ API (đã khử trùng), sắp theo `ScheduleStudyUnitID`.
- `data/dkhp_classes.csv`: UTF-8 **có BOM** (Excel đọc được tiếng Việt), các cột đã chuẩn hóa ở mục 6.
- `data/dkhp_fetch_report.json`: `{fetched_at, queries_total, queries_truncated, unique_classes, unique_modules, by_term:{"251":n,…}, cross_check_new_items, errors[]}` — không chứa token.
- `data/.dkhp_checkpoint.json`: trạng thái để resume (các truy vấn đã xong + kết quả). Chạy lại với `--resume` (mặc định bật) thì bỏ qua truy vấn đã xong; `--fresh` để làm lại từ đầu.

## 6. Chuẩn hóa thêm (trong CSV và trong bản `data/dkhp_classes.json` — file này là bản đã phân tích, ngoài bản raw)

Thêm các trường:

- `term_code` (3 ký tự đầu của `ScheduleStudyUnitAlias`), `academic_year_start` (= 2000 + 2 số đầu), `term_no` (số thứ 3).
- `cohorts`: danh sách khóa suy từ `ClassOfStudentID` (tách theo dấu phẩy; `K23501A` → `K23`; `K234111E` → `K23`; quy ước **K + 2 số cuối năm nhập học**, K24 = tuyển sinh 2024). Khóa nào không khớp regex `^K(\d{2})` thì bỏ qua và ghi vào report.
- `quota_min`, `quota_max` từ `StudentQuotas` (`"30-70"` → 30, 70; chuỗi khác → null).
- `is_english`: true nếu `ScheduleStudyUnitName` kết thúc bằng `(E)`.
- `lessons`: parse `Schedules` (các buổi cách nhau bởi `<br/>`, có khoảng trắng đầu/cuối, có thể có buổi bị cắt ngắn như `Tiết 1->4.5` thiếu ngày/phòng). Mỗi buổi: `{weekday, period_start, period_end, date_start, date_end, room, raw}`. Ví dụ ` Thứ 3, Tiết 7->10.5, 02/06/2026->02/06/2026, Phòng A.311` → `weekday=3, period_start=7, period_end=10.5, date_start="2026-06-02", date_end="2026-06-02", room="A.311"`. `Chủ nhật` → `weekday=8` (Thứ 2 = 2…Thứ 7 = 7). Tiết có thể là số thập phân (10.5, 4.5). Không parse được → giữ `raw`, các trường còn lại null, **không** làm hỏng cả dòng.
- `begin_date`, `end_date` ISO từ `BeginDate`, `EndDate` (định dạng `dd/MM/yyyy`; chuỗi lạ → null).

## 7. Kiểm thử (bắt buộc, không gọi server thật)

Viết `tests/test_fetch_all_dkhp.py` (pytest) với **server giả** mô phỏng đúng hành vi mục 3: tập mã môn ngẫu nhiên có seed cố định (khoảng 400 mã, độ dài 3–8 ký tự chữ+số, mỗi mã 1–12 lớp; vài mã hơn 100 lớp để thử vòng kiểm tra), tìm substring không phân biệt hoa/thường, cắt 100 dòng, trả 400 khi rỗng. Test:
1. Thuật toán thu được **100% lớp** của server giả (so sánh tập ID).
2. Số truy vấn không vượt quá ngưỡng hợp lý (in ra, ghi chú).
3. Resume: ngắt giữa chừng (raise sau N truy vấn) rồi chạy lại cho ra cùng kết quả, không gọi lại truy vấn đã xong.
4. Parser `Schedules`/`ClassOfStudentID`/`StudentQuotas` với ≥ 10 mẫu, gồm mẫu thiếu trường và `Chủ nhật`.
5. 401 → dừng sạch, không in token; 429 → backoff rồi thành công.

Chạy `python -m pytest tests/test_fetch_all_dkhp.py -q` và dán kết quả cuối cùng vào báo cáo của bạn.

## 8. Cách người dùng lấy token (ghi vào docstring đầu file)

1. Đăng nhập https://dkhp.uel.edu.vn bằng tài khoản của mình.
2. Nhấn F12 → tab Console → chạy `JSON.parse(localStorage.authorizationData).Token` → copy chuỗi (không kèm dấu ngoặc kép).
3. Dán vào `token.txt` (hoặc đặt biến môi trường `UEL_DKHP_TOKEN`). Token hết hạn sau một thời gian; khi script báo 401 thì lấy lại.

## 9. Việc cuối

- In hướng dẫn chạy: `python fetch_all_dkhp.py` (có `--fresh`, `--workers N` ≤ 4, `--out data`).
- **Không chạy** script với token thật nếu không có token; chỉ chạy test với server giả. Người dùng sẽ tự chạy bản thật.
- Báo cáo: các file đã tạo, kết quả pytest nguyên văn, giả định còn chưa kiểm chứng.
