# Brief S1 — Chống cào dữ liệu ở tầng API (giới hạn tần suất, hạ size, chặn User-Agent rỗng)

Tự tìm file: `api/app/main.py` (nơi thêm middleware, đã có CORSMiddleware + GZipMiddleware), `api/app/config.py` (Settings, `validate_production`), `api/app/routers/modules.py` (dòng ~517 `size: int = Query(20, ge=1, le=500)`), `api/app/routers/reviews.py`, `api/requirements.txt`, `.env.example`, test trong `api/tests/`. Không chạy lệnh shell, không commit, không sửa web.

## Bối cảnh
API sẽ chạy công khai ở `https://api.uelcourses.id.vn` (Render free) trước Cloudflare. Hiện **không có lớp chống cào nào**: mọi endpoint đọc đều công khai, không giới hạn tần suất, và `size` tối đa 500 nên lấy hết 1486 học phần chỉ cần 3 request. Cloudflare sẽ lo lớp ngoài, nhưng ai biết URL gốc `*.onrender.com` thì gọi thẳng vào, bỏ qua Cloudflare — nên cần lớp phòng thủ ngay trong API.

## Yêu cầu

### 1. Giới hạn tần suất theo IP
- Dùng `slowapi` (thêm vào `api/requirements.txt`, ghim phiên bản cụ thể). Render free chạy một tiến trình duy nhất nên bộ đếm trong bộ nhớ là đủ, không cần Redis.
- Lấy IP thật từ `X-Forwarded-For` (uvicorn đã chạy với `--proxy-headers`); khi có nhiều IP trong header thì lấy IP **đầu tiên**. Nếu header không có thì dùng IP kết nối trực tiếp.
- Hạn mức mặc định, **đọc từ biến môi trường** (thêm vào `config.py` + `.env.example`):
  - `RATE_LIMIT_DEFAULT` mặc định `"240/minute"` cho mọi `/api/*`.
  - `RATE_LIMIT_HEAVY` mặc định `"20/minute"` cho các endpoint nặng: hỏi đáp quy chế (`/api/ask`, `/api/compare` nếu có), xuất dữ liệu, và các endpoint gọi LLM.
  - `RATE_LIMIT_ENABLED` mặc định `true`; đặt `false` thì tắt hoàn toàn (dùng khi chạy test/dev).
- **Miễn trừ**: `/api/health` (Render dùng để kiểm tra sống chết — bị chặn là Render coi như service chết và khởi động lại), và `/docs`, `/openapi.json` nếu còn mở.
- **Vì sao 240/phút chứ không phải 100**: sinh viên trong trường dùng chung IP công cộng qua NAT, nhiều người truy cập cùng lúc sẽ bị tính chung một IP. Đặt thấp quá sẽ chặn nhầm người dùng thật.
- Khi vượt hạn mức trả **429** kèm header `Retry-After`, thân phản hồi JSON tiếng Việt ngắn gọn (`{"detail": "Bạn gửi quá nhiều yêu cầu, vui lòng thử lại sau."}`), không lộ chi tiết hạn mức.

### 2. Hạ giới hạn phân trang
- `api/app/routers/modules.py` (~dòng 517): `size` từ `le=500` xuống `le=100`.
- Rà mọi endpoint khác có tham số `size`/`limit` (grep `le=` trong `api/app/routers/`): không để chỗ nào cho phép quá 100.
- Giữ mặc định `size=20` như hiện tại để không ảnh hưởng web.
- **Kiểm tra web không hỏng**: grep trong `web/src/lib/api.ts` và các trang xem có chỗ nào đang gọi `size` lớn hơn 100 không; nếu có thì ghi rõ vào báo cáo cuối (KHÔNG sửa web trong brief này, chỉ báo).

### 3. Chặn request không có User-Agent
- Thêm biến `BLOCK_EMPTY_USER_AGENT`, **mặc định `false`**. Khi bật, request vào `/api/*` không có header `User-Agent` (hoặc rỗng) bị trả **403**.
- Mặc định tắt vì Next.js khi dựng trang phía máy chủ có thể gọi API mà không gửi User-Agent — bật ngay sẽ làm hỏng web. Chủ dự án sẽ bật sau khi kiểm chứng trên môi trường thật.
- Luôn miễn trừ `/api/health`.

### 4. Cho phép Cloudflare cache
- Các endpoint đọc dữ liệu ít đổi (`/api/modules`, `/api/modules/{code}`, `/api/classes`, `/api/venues`, `/api/programs*`, `/api/semesters`) trả header `Cache-Control: public, max-age=300, s-maxage=3600` để Cloudflare cache được và giảm tải Render.
- Các endpoint có dữ liệu người dùng (feedback, reviews, đăng nhập, `/api/health`) trả `Cache-Control: no-store`.
- Làm bằng một middleware nhỏ dựa trên đường dẫn, không rải rác từng router.

### 5. Test pytest
- Vượt hạn mức → 429 có `Retry-After`; dưới hạn mức → 200.
- `/api/health` không bao giờ bị 429 dù gọi liên tục.
- `X-Forwarded-For` có nhiều IP → đếm theo IP đầu tiên; hai IP khác nhau có bộ đếm riêng.
- `RATE_LIMIT_ENABLED=false` → không giới hạn (và đặt `false` trong conftest để các test sẵn có không bị 429).
- `size=500` → 422; `size=100` → 200.
- `BLOCK_EMPTY_USER_AGENT=true` + không có User-Agent → 403; mặc định tắt → 200.
- Header `Cache-Control` đúng cho endpoint đọc và cho endpoint người dùng.

### 6. Tài liệu
- Ghi vào `docs/DECISIONS.md`: lý do chọn ngưỡng 240/phút (NAT của trường), vì sao `BLOCK_EMPTY_USER_AGENT` mặc định tắt.
- Bổ sung các biến mới vào `.env.example` kèm chú thích tiếng Việt, và vào `render.yaml` (giá trị mặc định, không cần `sync: false`).

Báo cáo cuối: file đã sửa, các ngưỡng mặc định, và kết luận về việc web có gọi `size > 100` hay không. Chủ dự án chạy `cd api; .venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --ignore=tests/rag`.

## LƯU Ý PHỐI HỢP (thêm 2026-11-22): các file này đã/đang được Codex sửa song song
`.env.example`, `render.yaml`, `api/app/db.py` (chỉ hàm tạo engine: prepare_threshold, pool từ env), docs/DEPLOY_FREE.md, docs/DEPLOY_CHECKLIST.md, scripts/deploy/. Khi sửa `.env.example` và `render.yaml` cho S1 phải ĐỌC LẠI bản hiện tại và chỉ THÊM biến/mục của S1 (RATE_LIMIT_*, BLOCK_EMPTY_USER_AGENT…); tuyệt đối không ghi đè hay xóa chú thích Supabase, DB_POOL_SIZE, DB_MAX_OVERFLOW hay phần engine trong db.py.

## Quy tắc ghi HANDOFF (thêm 2026-11-23): khi cập nhật docs/HANDOFF.md chỉ THÊM một dòng ngắn vào đúng mục (Đang làm dở / Việc tiếp theo / Chờ chủ dự án); KHÔNG dán lại khối lịch sử dài (lịch sử nằm ở docs/handoff/HISTORY.md). Đọc lại file hiện tại trước khi sửa.
