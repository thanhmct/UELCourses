# W43 — Quy chế: thẻ thông tin + link văn bản gốc, bỏ PDF khỏi git

Người giao: Claude. Người làm: Codex. Không commit. Làm SAU W42 (đã xong).

## Quyết định của người dùng

Hệ thống không lưu/hiển thị toàn văn PDF. Mỗi văn bản chỉ hiện thông tin tóm tắt và nút dẫn tới nguồn chính thức (trang Phòng Đào tạo / CTSV / Chính phủ); sinh viên tự bấm sang nguồn. Hỏi đáp AI vẫn trích nguyên văn Điều/Khoản (giữ nguyên), nhưng trích dẫn dẫn tới link gốc.

## Hiện trạng

- `web/src/app/regulations/page.tsx` cột giữa render `<MarkdownReader docId=…>` = toàn văn văn bản (từ `/api/regulations/{id}/markdown`), có link "Nguồn" nhỏ ở dòng ~145 của `components/regulations/MarkdownReader.tsx`.
- `RegulationDoc` (web/src/lib/types.ts) đã có `source_url`. 27 văn bản có file PDF đều có `source_url` trong `regulations/catalog.json`; 15 văn bản không có URL.
- `Citation` (web + API `api/app/rag/answer.py` `make_citation`) chưa có `source_url`. `/ask` (app/ask/page.tsx ~dòng 112) và ChatPanel dẫn trích dẫn về `/regulations?doc=<id>#<anchor>`.
- `regulations/raw/*.pdf` (27 file, ~166 MB) đang nằm trong git; production đọc chỉ mục quy chế từ Postgres, không cần PDF.

## Việc cần làm

1. **Thẻ thông tin văn bản** — tạo `web/src/components/regulations/RegulationInfoCard.tsx`, thay chỗ dùng `MarkdownReader` trong `regulations/page.tsx`:
   - Lấy dữ liệu bằng hàm `api.*` hiện có cho 1 văn bản (metadata, không cần markdown).
   - Hiện: tiêu đề, số quyết định, cơ quan ban hành (nếu có), ngày ban hành, hiệu lực từ–đến, nhãn trạng thái (dùng `effectiveBadge` sẵn có), khóa áp dụng, văn bản thay thế/bị thay thế (nút mở văn bản đó trong workspace như cũ), cảnh báo `metadata_verified === false` nếu đang có.
   - Nút chính nổi bật: "Xem văn bản gốc" + tên miền nguồn (vd `pdt.uel.edu.vn`), `<a href={source_url} target="_blank" rel="noopener noreferrer">`. Không có `source_url` → dòng chữ "Chưa có link văn bản gốc chính thức" (không nút).
   - Không hiển thị toàn văn, không nhúng iframe/PDF.
   - Chuỗi giao diện qua i18n (`vi.ts`, `en.ts`) — CHỈ thêm khóa mới cần thiết, không sửa khóa khác (file này đang có thay đổi dở của người dùng: chèn khóa mới gọn một chỗ, không định dạng lại file).
   - Deep link `/regulations?doc=<id>#<anchor>` vẫn mở đúng thẻ (bỏ qua anchor).
   - Nếu `MarkdownReader`, `WikiLink` và hàm web gọi `/markdown` không còn ai dùng (kể cả CommandPalette, graph, test) thì xóa; test liên quan sửa/xóa cho khớp. Giữ nguyên endpoint phía API.
2. **Trích dẫn dẫn về nguồn gốc**:
   - API: `make_citation` thêm trường `source_url` (lấy từ văn bản trong index; `None` nếu không có). Cập nhật schema Pydantic tương ứng nếu có, và test `api/tests/rag` liên quan.
   - Web: thêm `source_url?: string | null` vào `Citation`; ở `/ask` và `ChatPanel`, link trích dẫn ưu tiên `source_url` (mở tab mới); không có thì giữ link nội bộ `/regulations?doc=…` (mở thẻ thông tin). Sửa `app/ask/ask.test.tsx` cho khớp.
3. **Bỏ PDF khỏi git (chỉ sửa cấu hình, KHÔNG chạy `git rm`)**:
   - `.gitignore` thêm `regulations/raw/*.pdf`.
   - `regulations/README.md`: ghi rõ PDF không lưu trong repo; nguồn chính thức là `source_url` trong `catalog.json`; muốn nạp lại chỉ mục cục bộ thì tự tải PDF từ `source_url` về `regulations/raw/<doc_id>.pdf` (văn bản có `manual/*.txt` dùng bản chép tay sẵn có).
4. Đề cương học phần: giữ nguyên cách hiện tại (đã chỉ dẫn link Google Drive qua `outline_url`), chỉ rà để chắc không có chỗ nào nhúng/hiển thị PDF đề cương trên web; báo lại nếu có.

## Không được làm

- Không đụng: `web/src/app/today/*`, `components/CampusMap.tsx`, `lib/campusTour.ts`, `campusMapData.ts`, `campusPlaces.ts`, `web/public/campus/`, `docs/HANDOFF.md`, `AppShell.tsx`, `FooterAndToday.test.tsx`.
- Không commit, không `git rm`, không xóa file trong `regulations/raw/`, không gọi mạng tới trang trường.

## Kiểm tra (dán kết quả)

- `cd web; npx tsc --noEmit`; `npx vitest run` (số test pass).
- `cd api; .venv\Scripts\python.exe -m pytest -q` (cả tests/rag nếu chạy được bằng `.venv`; nếu tests/rag cần `.venv-rag` thì chạy bằng `.venv-rag`).
- `cd web; $env:UEL_PREVIEW_DIST_DIR='.next-test'; npx next build` thành công; gỡ lại dòng `.next-test` nếu Next tự thêm vào tsconfig.
