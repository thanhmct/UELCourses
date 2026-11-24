# W44 — Build được từ bản clone sạch (Vercel) khi không có dữ liệu mock

Người giao: Claude. Người làm: Codex. Không commit. Làm sau W42, W43.

## Vấn đề (đã xác minh)

`.gitignore` có `data/` nên `web/src/data/*.json` (programs_catalog.json 1,2 MB, courses.json, courses_2026_2027_planned.json, mis_standard_curriculum.json) CHƯA BAO GIỜ nằm trong git. Chỉ `program_ids.json` được mở lại (`!web/src/data/program_ids.json`). Vercel clone từ git → mọi import tới các file đó báo "Module not found" và build hỏng:

- `web/src/mocks/modules.ts`, `web/src/mocks/programs.ts` import tĩnh các JSON trên.
- `web/src/lib/api.ts` nạp mock bằng `import()` động — webpack vẫn phân giải đường dẫn lúc build.
- `web/src/app/api/webcal/route.ts` import tĩnh `@/mocks/modules` và còn tạo file ICS từ dữ liệu mock cũ (sai dữ liệu ở production).

Không đưa các JSON này vào git (giữ quy tắc dữ liệu).

## Việc cần làm

1. **api.ts**: mọi chỗ `import("@/mocks/...")` đặt trong nhánh điều kiện mà webpack gấp được lúc build, viết trực tiếp biểu thức env trong `if` (không qua biến trung gian), ví dụ:
   ```ts
   if (process.env.NODE_ENV === "test" || process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
     return import("@/mocks/modules");
   }
   throw new Error("Mock data is disabled in this build");
   ```
   Giữ hành vi test hiện có.
2. **webcal route**: bỏ hoàn toàn mock. Lấy dữ liệu thật từ API backend (`process.env.NEXT_PUBLIC_API_URL`): lớp học phần qua `/api/modules/{code}/classes?semester=…`, tên học phần qua endpoint chi tiết module đang có — mỗi mã môn gọi một lần, chạy song song có giới hạn. API lỗi → trả 502 với thông báo tiếng Việt ngắn. Viết/cập nhật test vitest cho route (mock `fetch`).
3. `web/README.md`: một dòng ghi rằng `NEXT_PUBLIC_USE_MOCKS=true` và test dùng mock cần các file `web/src/data/*.json` cục bộ (không có trong git; sinh bằng `api/scripts/build_programs_catalog.py` và `fetch_courses.py`).

## Không được làm

- Không đụng: `web/src/app/today/*`, `CampusMap.tsx`, `campusTour.ts`, `campusMapData.ts`, `campusPlaces.ts`, `web/public/campus/`, `docs/HANDOFF.md`, `AppShell.tsx`, `FooterAndToday.test.tsx`, các file chat (`ChatWindow.tsx`, `chatContext.ts`, `chatLookup.ts`, `api/app/rag/user_context.py`) — đang có phiên khác sửa.
- Không commit, không thêm JSON dữ liệu vào git.

## Kiểm tra bắt buộc (dán kết quả)

1. `cd web; npx tsc --noEmit`; `npx vitest run`.
2. **Giả lập clone sạch**: chuyển tạm 4 file `courses.json`, `courses_2026_2027_planned.json`, `mis_standard_curriculum.json`, `programs_catalog.json` sang `tmp/w44-data-backup/`, chạy `$env:UEL_PREVIEW_DIST_DIR='.next-test'; npx next build` → PHẢI thành công; sau đó CHUYỂN TRẢ 4 file về `web/src/data/` (kể cả khi build lỗi) và xác nhận đã trả.
3. Gỡ dòng `.next-test` nếu Next tự thêm vào `tsconfig.json`.
