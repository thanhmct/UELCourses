# W42 — Tối ưu dung lượng và gỡ chặn build để triển khai (Vercel + Render)

Người giao: Claude. Người làm: Codex. Không commit (Claude kiểm rồi commit).

## Bối cảnh (đã đo)

- `cd web; npx next build` hiện THẤT BẠI ở bước lint: 66 lỗi `@typescript-eslint/no-explicit-any` (admin pages, lib/adminApi.ts, lib/types.ts, vài test). Vercel chạy đúng lệnh này nên deploy sẽ fail.
- `web/src/lib/api.ts` import TĨNH `@/mocks/modules`, `@/mocks/programs`, `@/mocks/regulations`(nếu có), `@/mocks/admin`. `mocks/modules.ts` import `programs_catalog.json` (1,2 MB), `courses.json` (141 KB), `courses_2026_2027_planned.json` (1 MB) và tính mảng ngay khi nạp module → toàn bộ bị đóng vào JS phía trình duyệt dù production KHÔNG dùng mock (`NEXT_PUBLIC_USE_MOCKS` mặc định tắt).
- `web/src/lib/programCode.ts` import cả `programs_catalog.json` chỉ để lấy `summaries[].program_id` (86 mã).
- `web/public/festivals/dong-son-drum.svg` 2,4 MB (5.466 path Inkscape) chỉ dùng làm CSS mask hiển thị 2,85rem; đã có `dong-son-drum.png` 256×256 RGBA 53 KB.
- `Header.tsx` hiển thị `/brand/uelpath-wordmark-tight.png` (1827×319, 203 KB) ở cao 29px.
- `@xyflow/react`, `@dagrejs/dagre` không còn được import ở đâu trong `web/src`.
- Image API cài cả `pytest`, `respx` (chỉ để test) và cài lại `psycopg[binary]` thừa; `docker/*.Dockerfile.dockerignore` không loại `tests/`, `.pytest-*/`, `.next-*`, log.

## Việc cần làm

1. **Gỡ chặn build**: trong `web/eslint.config.mjs` thêm khối rules đặt `@typescript-eslint/no-explicit-any` thành `"warn"` (không sửa hàng loạt `any` trong việc này). Kết quả: `npx next build` qua bước lint.
2. **Tách mock khỏi bundle production** (`web/src/lib/api.ts`):
   - Bỏ mọi `import ... from "@/mocks/..."` tĩnh. Nạp mock bằng `await import("@/mocks/...")` chỉ bên trong nhánh dùng mock.
   - Đổi chữ ký `withFallback` cho phép `fallback: () => T | Promise<T>` và `await` nó; giữ nguyên hành vi hiện tại (test NODE_ENV=test + mocksEnabled, nhánh real-only, nhánh fallback khi API lỗi).
   - Các chỗ dùng mock ngoài `withFallback` (vd. `mockProgram(...)` ở khoảng dòng 264, 612–670, `mockModuleComments` dòng ~680) cũng chuyển sang dynamic import trong nhánh mock.
   - Không đổi API công khai của `api.*` (các hàm vốn đã trả Promise).
3. **programCode.ts**: thay `import catalog from "@/data/programs_catalog.json"` bằng file nhỏ `web/src/data/program_ids.json` (mảng chuỗi `program_id` từ `summaries`, sắp xếp). Cập nhật `api/scripts/build_programs_catalog.py` để ghi thêm file này mỗi khi sinh catalog. Sinh file lần đầu từ catalog hiện có.
4. **Ảnh**:
   - `globals.css` `.holiday-drum-mark` và `web/src/lib/holidayThemes.ts` dùng `/festivals/dong-son-drum.png` thay cho `.svg`; giữ logic `isDrum`. Xóa `web/public/festivals/dong-son-drum.svg` (vẫn còn trong lịch sử git; giữ dòng ghi nguồn Wikimedia).
   - Sinh `web/public/brand/uelpath-wordmark-tight.webp` từ PNG, cao 116px (4× hiển thị), giữ alpha, quality 90, bằng Pillow: `api\.venv\Scripts\python.exe -c "..."`. `Header.tsx` dùng file webp này, thêm `width`/`height` theo tỉ lệ để tránh nhảy layout. Giữ file PNG gốc.
5. **Gỡ phụ thuộc thừa**: `npm uninstall @xyflow/react @dagrejs/dagre` trong `web/` (cập nhật lockfile). Sửa `README.md` và `web/README.md` cho khớp (không còn nhắc 2 thư viện này).
6. **Image API gọn hơn**:
   - Tạo `api/requirements-dev.txt` gồm `-r requirements.txt` + `pytest`, `respx` (chuyển 2 dòng này khỏi `requirements.txt`, giữ phiên bản).
   - `docker/api.Dockerfile`: bỏ dòng `pip install "psycopg[binary]"` thừa (đã ghim trong requirements); chỉ `COPY requirements.txt requirements-rag.txt*`… sao cho không cài dev deps.
   - `scripts/dev.ps1` nhánh test cài `requirements-dev.txt`. Rà `.github/` (nếu có) và `api/README.md` cho khớp.
7. **dockerignore đặt ở gốc build context** (Render/compose đều nhận chắc chắn): chuyển nội dung `docker/api.Dockerfile.dockerignore` → `api/.dockerignore`, `docker/web.Dockerfile.dockerignore` → `web/.dockerignore`, xóa 2 file cũ. Bổ sung:
   - api: `tests/`, `.pytest*/`, `**/*.pyc`, `*.md`, `data/` (đã có), `.venv*`.
   - web: `.next-*`, `*.log`, `*.err`, `*.tsbuildinfo`, `coverage`, `.vercel`.
8. **tsconfig.json**: trong `include` bỏ các mục `.next-*/types/**/*.ts` (giữ `.next/types/**/*.ts`).

## Không được làm

- Không đụng các file đang dở của người dùng: `web/src/app/today/*`, `web/src/components/CampusMap.tsx`, `web/src/lib/campusTour.ts`, `campusMapData.ts`, `campusPlaces.ts`, `web/public/campus/`, `i18n/*.ts` (trừ khi bắt buộc — nếu bắt buộc thì dừng và báo).
- Không commit, không xóa `data/`, không gọi API trường.

## Kiểm tra (bắt buộc, dán kết quả)

- `cd web; npx tsc --noEmit` sạch.
- `cd web; npx vitest run` pass (báo số test).
- `cd api; .venv\Scripts\python.exe -m pytest -q --ignore=tests/rag` pass.
- `cd web; $env:UEL_PREVIEW_DIST_DIR='.next-test'; npx next build` THÀNH CÔNG (có lint), dán bảng "First Load JS".
- `git diff web/tsconfig.json` không có dòng `.next-test` mới thêm (nếu Next tự thêm thì gỡ lại).
