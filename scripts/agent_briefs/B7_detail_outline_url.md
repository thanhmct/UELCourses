# Brief B7 — Trang chi tiết học phần không có link PDF đề cương (BKB4060)

Không chạy lệnh shell, không commit. Chủ dự án chạy `cd api; .venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --ignore=tests/rag` và, nếu có UI liên quan, `cd web; npx tsc --noEmit; npx vitest run`.

## Chẩn đoán đã có
- BKB4060 "Luật sở hữu trí tuệ" CÓ đề cương trong DB (API trả `has_outline: true`, có mô tả) và CÓ link Drive trong bảng `outline_resources` (qua `program_catalog_entries.module_code='BKB4060'`): vd `https://drive.google.com/file/d/1DUmavTFNn-Hh3VC2TDY2pDo18VKnaPMF/view?usp=sharing` (kind "Link đề cương hiện tại") và bản (E) `.../1aJ0fWojSP3_np7ZgAouLXMJnvm6unRPR/...` (kind "Link đề cương hiện tại (E)").
- Nhưng `GET /api/modules/BKB4060` trả `outline_url` rỗng. Nguyên nhân: endpoint chi tiết `get_module` trong `api/app/routers/modules.py` (khoảng dòng 295-330) gọi `_summary(...)` KHÔNG truyền `outline_url` (chỉ endpoint danh sách `list_modules` ~dòng 252 gọi `_outline_urls_for`). Vì vậy trang chi tiết không có link PDF.

## Yêu cầu
1. API chi tiết trả `outline_url` bằng `_outline_urls_for(db, [m.code])`. Mở rộng `_outline_urls_for`/schema: ngoài `outline_url` (link tiếng Việt/chuẩn), thêm `outline_url_en` (link kind chứa "(E)"/"E" cho bản tiếng Anh) và danh sách `outline_links: [{kind, url}]` (loại bỏ trùng url, bỏ url rỗng) để giao diện chọn đúng link theo ngôn ngữ; `outline_url` ưu tiên link "chuẩn/hiện tại" không phải (E); nếu giao diện EN và có `outline_url_en` thì dùng nó. Cập nhật `ModuleSummary` trong `api/app/schemas.py` (trường optional, tương thích ngược), endpoint danh sách cũng trả `outline_url_en`.
2. Nếu module không có entry trực tiếp nhưng có `outline_module_links` (nguồn `catalog`) trỏ tới tài liệu đề cương, hãy tìm link qua cùng catalog entry của tài liệu đó (hoặc ghi rõ trong báo cáo nếu không thể).
3. Web: `web/src/lib/types.ts` thêm `outline_url_en?`/`outline_links?`; trang chi tiết `web/src/app/modules/[code]/page.tsx` hiện nút/liên kết "Đề cương (PDF) ↗" (EN: "Syllabus (PDF) ↗"); khi có cả hai link thì hiện hai nút "Tiếng Việt" / "English" hoặc chọn theo ngôn ngữ giao diện; không hiện khi không có link. Danh sách học phần (`modules/page.tsx`) dùng `outline_url` hoặc `outline_url_en` theo ngôn ngữ. Nhớ mock trong `web/src/lib/mockData*` nếu có.
4. Test pytest: BKB4060-like (entry có hai link chuẩn + (E), bản ghi rỗng "Phòng BĐCL rà soát đề cương") → chi tiết trả `outline_url` chuẩn, `outline_url_en` bản E, không có link rỗng; module không có link → null. Test Vitest cho hiển thị nút theo ngôn ngữ (cleanup()).

Báo cáo cuối: file thay đổi.
