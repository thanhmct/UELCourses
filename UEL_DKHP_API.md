# UEL DKHP – API danh sách môn học

Tìm được bằng cách đọc JS bundle của `https://dkhp.uel.edu.vn` (React/Vite) và bắt request trên trang "Tra cứu học phần". Ngày kiểm tra: 2026-11-20.

- **Base URL:** `https://dkhpapi.uel.edu.vn/api/`
- **Auth:** `Authorization: Bearer <access_token>`. Token lấy qua SSO Keycloak (`https://sso.uel.edu.vn/realms/UEL/protocol/openid-connect/auth`) khi đăng nhập dkhp.uel.edu.vn. Không có token thì API không trả dữ liệu.

## 1. Tra cứu học phần (dùng được ngoài đợt đăng ký) — khuyến nghị

`POST /api/Schedule/GetAllScheduleStudyUnit`

```json
{ "ReqParam1": "<từ khóa>", "ReqParam2": "0" }
```

| Field | Ý nghĩa |
|---|---|
| `ReqParam1` | Từ khóa tìm kiếm (bắt buộc, không được rỗng) |
| `ReqParam2` | `"0"` = tìm theo Mã học phần, `"1"` = theo Tên học phần |

Response: mảng các lớp học phần. Các field mà giao diện dùng:

| Field | Cột trên giao diện |
|---|---|
| `CurriculumID` | Mã HP |
| `ScheduleStudyUnitAlias` | Mã LHP (lớp học phần) |
| `ScheduleStudyUnitName` | Tên HP |
| `Credits` | Số tín chỉ |
| `StudyUnitTypeName` | Loại |
| `Schedules` | Thông tin lịch học |
| `ProfessorName` | Giảng viên |
| `StudentQuotas` | Giới hạn sĩ số |
| `BeginDate`, `EndDate` | Từ ngày / Đến ngày |

Ví dụ:

```bash
curl -X POST "https://dkhpapi.uel.edu.vn/api/Schedule/GetAllScheduleStudyUnit" \
  -H "Authorization: Bearer $UEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ReqParam1":"Kinh tế","ReqParam2":"1"}'
```

## 2. Danh sách lớp được phép đăng ký (chỉ có dữ liệu trong đợt đăng ký)

Controller `Regist`, tức `/api/Regist/...` (tên controller suy ra từ bundle, chưa gọi thử):

| Method | Endpoint | Ghi chú |
|---|---|---|
| GET | `Regist/GetAllStudyProgramRegist` | Các chương trình đào tạo của SV |
| GET | `Regist/GetAllStudyType` | Loại học (VD `NCT`) |
| GET | `Regist/GetAllRegistSemester` | Năm học – học kỳ |
| GET | `Regist/GetRegistSemesterCreditQuota` | Hạn mức tín chỉ, cờ `RegistAble` |
| POST | `Regist/GetAllClassAllowRegist` | **Danh sách lớp được đăng ký** |
| POST | `Regist/GetAllScheduleUnitAllowRegist` | Danh sách học phần được đăng ký |
| POST | `Regist/GetAllClassRegisted` | Lớp đã đăng ký |

Body của `GetAllClassAllowRegist`:

```json
{
  "ReqParam1": "<StudyProgramID>",
  "ReqParam2": "<StudyType>",
  "ReqParam3": "<YearStudy>",
  "ReqParam4": "<TermID>",
  "ReqParam5": "<từ khóa mã/tên môn>"
}
```

Các endpoint ghi dữ liệu (`RegistScheduleStudyUnit`, `RemoveScheduleStudyUnit`, `Lock/UnLockScheduleStudyUnitByID`, `sendOtpByUser`) **không** cần cho việc lấy danh sách môn và không nên gọi tự động.

## Lưu ý

- API nội bộ, không có tài liệu chính thức; có thể đổi bất cứ lúc nào.
- Gọi với tần suất thấp, dùng token của chính bạn, không chia sẻ token.
