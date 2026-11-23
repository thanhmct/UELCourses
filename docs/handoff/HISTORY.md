# HANDOFF — lịch sử (không đọc khi bắt đầu phiên; chỉ tra cứu)

Chuyển từ `docs/HANDOFF.md` ngày 2026-11-23 khi rút gọn ngữ cảnh. Giữ nguyên văn.

## Khóa phiên đã nhả (2026-11-22, 2026-11-23)

| Antigravity D7 | 2026-11-22 | Hoàn thành Brief D7 (Chương trình hệ E chính thức từ sheet BĐCL). Đã kiểm tra diff, đã viết test pytest & vitest. Đã nhả khóa. |
| Antigravity D6 | 2026-11-23 | Hoàn thành Brief D6 (Thêm bậc đào tạo degree: dai_hoc/thac_si/tien_si và nạp CTĐT Thạc sĩ: Migration 0023, CLI import-ths, API degree filter, Web UI toggle tabs, Pytest test_thac_si.py, Vitest degree_filter.test.tsx, DECISIONS D22). Đã nhả khóa. |

### Bản vá Thời khóa biểu W23 và Prompt.docx

Codex đã sửa nhãn thêm/gỡ và màu hover của nút học phần trong repo chính. Luồng Báo lỗi có sẵn gửi qua API góp ý. API cục bộ trả cùng mô tả tiếng Anh dài 1.280 ký tự của `BBB1068` ở danh sách và trang chi tiết.

Bản vá `data/processed/Prompt-timetable-20261123.patch` đã được triển khai trong bản sao `data/processed/prompt-20261123/web` và chờ khóa W23. Nhóm hiển thị dùng mã học phần, mã lớp, thứ và khung giờ thực tế. Mỗi ngày cao 52 px. Nút `+N` ở nhãn ngày mở các ô trùng giờ vượt chỗ. Bấm ô gộp để xem từng lịch gốc. Khi chọn tuần, lưới dùng ngày học thực tế theo quy tắc ngoại lệ hiện có. Bản vá cũng thêm ô nhập tên phương án tại chỗ, nhân bản ngay và đổi tên bằng bấm đúp hoặc F2. Danh sách lớp dịch thứ và tiết, đồng thời chỉ hiện khoảng ngày. Bản sao qua 560 test, 31 ca thời khóa biểu qua sau lần chỉnh cuối, TypeScript và lint các file sửa đều qua. Route dev thử trả HTTP 200. Chrome headless chưa hoàn tất kiểm tra desktop/mobile.

Sau khi Antigravity nhả khóa W23, chạy lần lượt từ thư mục gốc.

```powershell
git apply --check --whitespace=error-all data/processed/Prompt-timetable-20261123.patch
git apply data/processed/Prompt-timetable-20261123.patch
.\scripts\dev.ps1 web npm test -- src/app/timetable/__tests__/timetable.test.tsx src/lib/__tests__/drafts.test.ts src/lib/__tests__/conflicts.test.ts src/lib/__tests__/ics.test.ts src/lib/__tests__/workload.test.ts src/lib/__tests__/oneDayOverride.test.ts
```

## Chờ chủ dự án

- Chọn SMTP cho A7 (đăng nhập sinh viên và chợ giáo trình).
- Xác nhận khóa và CTĐT của lớp `C24605`, `MPL1`, và cách xử lý các mã đặc biệt `GDQP`, `TATC*`, `TEST`, `2NL01`.
- Cung cấp bản gốc QĐ 2261/2025, 118/2024, 1390/2025 vào `regulations/manual/`, xác nhận quyền tải đề cương còn thiếu và thời điểm phát khảo sát.

## Kiểm chứng gần nhất

- **2026-11-23, Codex.** Nút “Gỡ khỏi thời khóa biểu” ở giao diện học phần dùng viền xanh khi nghỉ và nền xanh khi rê chuột hoặc lấy tiêu điểm bằng bàn phím, ở cả giao diện sáng và tối. Từ `web/`, chạy `npm.cmd test -- src/components/__tests__/moduleFilters.test.tsx src/app/timetable/__tests__/timetable.test.tsx` (34 ca đã qua). ESLint các file sửa và kiểm tra biên dịch lớp Tailwind đều qua.
- **2026-11-23, Antigravity (Fix Brief D6):** Đã sửa lỗi TypeScript TS2322 trong [programs.ts](file:///D:/UELCourse/web/src/mocks/programs.ts#L78) (`let list: ProgramSummary[] = ...`), bổ sung test case lọc `mockPrograms({ degree: "thac_si" })` trong [programs.test.ts](file:///D:/UELCourse/web/src/lib/__tests__/programs.test.ts#L31-L40).
- **2026-11-23, Codex.** Sửa lỗi ngưỡng tín chỉ hiển thị lặp ở trang Kế hoạch cho cả hai ngôn ngữ. Từ `web/`, chạy `npm.cmd test -- src/app/planner/__tests__/plannerHeader.test.tsx src/i18n/__tests__/i18n.test.ts` (15 ca đã qua).
- **2026-11-23, Codex.** `npm.cmd test -- src/app/timetable/__tests__/timetable.test.tsx` qua 24 ca. Bản xem trước ở `3002` trả 200 cho `/timetable`, `/modules/BAA2028`, `/programs` và các API dữ liệu chính qua cùng địa chỉ. Kiểm tra trực quan bị chặn do phiên Computer Use chưa được duyệt sử dụng Chrome.
- **2026-11-22, Codex (Prompt.docx mới).** Repo đã có luồng áp dụng lộ trình khi bấm nút, danh sách chờ trống mặc định, gỡ môn khi bấm lại, nút báo lỗi qua API góp ý, mô tả đầy đủ, tên CTĐT tự xuống dòng và lọc học kỳ hiện tại/tương lai. `npm.cmd test` qua 549 ca, hai bộ test của phần chỉnh cuối qua 18 ca, TypeScript qua và lint phần sửa còn bảy cảnh báo có sẵn. `/modules/BAA2028` trả HTTP 200 trên localhost:3000 và máy chủ dev tách riêng. Lỗi React Client Manifest trong ảnh chưa tái hiện.
- **2026-11-22, Codex (Prompt.docx).** Hồ sơ CTĐT và trang học phần đã cập nhật trong repo. Nút thêm thời khóa biểu lưu vào kỳ 2 của năm học do API đánh dấu hiện tại. Hai nút thêm lấy trạng thái từ dữ liệu đã lưu. `npm.cmd test` qua 545 ca và `tsc --noEmit --incremental false` qua.
- **2026-11-22, Antigravity (Brief D7):**
  - Đã triển khai phân định nguồn CTĐT hệ E: `track_source` gồm `"official"` (khi có trong DB từ sheet BĐCL) và `"derived"` (khi fallback từ bản VI).
  - Khắc phục triệt để vấn đề 6 môn tiếng Việt thừa của Marketing `410E` (chỉ còn đúng 58 môn: 50 E + 8 B hợp lệ; loại bỏ hoàn toàn `BBM4086`, `BBM5003`, `BBM5017`, `BBM5022`, `BBM5023`, `BBM5057`).
  - Chặn sinh ảo hệ E cho các ngành không có sheet chính thức (như `414` Fintech -> trả 404).
  - Giao diện web hiển thị nhãn "Học bằng tiếng Việt" cho các môn B đại cương hợp lệ của hệ E.
  - Đã xuất báo cáo đối chiếu `data/processed/english_track_diff.csv` và CLI `python -m app.cli diff-english-tracks`.
  - Đã khắc phục 2 lỗi blocker trong code base: duplicate index `AdminSession.token_hash` trong `models.py` và regex parse filename / semester ID trong `ctdt_files_import.py`.
- **2026-11-22, Codex.** `npm.cmd test` qua 541 ca, TypeScript qua với `--noEmit --incremental false`. X2 qua hai ca SQLite. `alembic heads` trả một head `0022`. SQLite tái hiện lỗi chỉ mục, D3 tái hiện hai lỗi riêng và RAG tái hiện bốn lỗi nêu trên. Docker từ phiên này bị từ chối truy cập, kiểm chứng migration trên PostgreSQL còn mở.
- PostgreSQL Docker là DB chuẩn. Lệnh vận hành ở [AGENTS.md](../AGENTS.md) và [DEPLOY.md](../DEPLOY.md). Nguồn dữ liệu ở `data/`. Phạm vi dài hạn ở [ROADMAP.md](ROADMAP.md) và [PLAN_ADMIN.md](PLAN_ADMIN.md).
