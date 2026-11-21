# UELCourses — Kiến trúc & hợp đồng giữa các module

Khóa luận: nền tảng lập kế hoạch học tập cho sinh viên UEL (lấy cảm hứng chức năng từ NUSMods, thương hiệu/giao diện riêng), kèm AI tra cứu quy chế học vụ dạng RAG. Phát triển theo **Design Thinking** (xem `research/`).

## Thư mục (mỗi agent chỉ sửa thư mục của mình)

| Thư mục | Chủ sở hữu | Nội dung |
|---|---|---|
| `web/` | agent `web-frontend` | Next.js 15 (App Router, TypeScript, Tailwind) |
| `api/` (trừ `api/app/rag/`) | agent `api-backend` | FastAPI + SQLAlchemy, **một** PostgreSQL (SQLite chỉ cho test) |
| `api/app/rag/`, `api/scripts/ingest_regulations.py`, `api/tests/rag/` | agent `regulations-rag` | Pipeline RAG quy chế |
| `regulations/` | agent `regulations-collector` | Văn bản quy chế gốc + `catalog.json` |
| `research/` | agent `ux-research` | Khảo sát, persona, kế hoạch kiểm thử, phân tích feedback |
| `fetch_courses.py`, `UEL_DKHP_API.md` | (đã có) | Script lấy dữ liệu lớp học phần |

## Nguồn dữ liệu UEL (API nội bộ, cần Bearer token của chính sinh viên)

- `POST https://dkhpapi.uel.edu.vn/api/Schedule/GetAllScheduleStudyUnit` body `{"ReqParam1": kw, "ReqParam2": "0"|"1"}` → lớp học phần: `CurriculumID, ScheduleStudyUnitAlias, ScheduleStudyUnitName, Credits, StudyUnitTypeName, Schedules, ProfessorName, StudentQuotas, BeginDate, EndDate`.
- `GET https://portal.uel.edu.vn/backend/api/student/equivalentcourse` → học phần tương đương: `MaMon, TenMon, STC, MaMonTuongDuong, TenMonTuongDuong, STCTuongDuong`.
- Token **không bao giờ** lưu trên server lâu dài hay commit. Hệ thống nhận dữ liệu qua: (a) import file JSON do `fetch_courses.py` sinh ra; (b) endpoint sync nhận token trong request, dùng một lần rồi bỏ.
- Khi chưa có dữ liệu thật: dùng `api/seed/*.json` (dữ liệu mẫu, đánh dấu rõ là mẫu).

## Hợp đồng REST (prefix `/api`, JSON, cổng mặc định 8000)

```
GET  /api/health                                   -> {"status":"ok"}
GET  /api/semesters                                -> [{id, name, year, term, is_current}]
GET  /api/modules?q=&faculty=&credits=&type=&page=&size=
                                                   -> {items:[ModuleSummary], total}
GET  /api/modules/{code}                           -> ModuleDetail
GET  /api/modules/{code}/classes?semester=         -> [ClassSection]
GET  /api/equivalents?q=                           -> [{code, name, credits, equivalents:[{code,name,credits}]}]
GET  /api/equivalents/{code}                       -> same item
POST /api/import/classes      (multipart JSON file từ fetch_courses.py)  -> {imported}
POST /api/import/equivalents  (multipart JSON file)                      -> {imported}
POST /api/sync/equivalents    {token}  (dùng token 1 lần, không lưu)      -> {imported}
GET  /api/venues?q=                                -> [{room, sessions:[...]}]
POST /api/feedback            {page, rating(1-5), category, message, contact?, app_version}
GET  /api/feedback/stats                           -> tổng hợp cho phân tích

# RAG quy chế (router do regulations-rag cung cấp tại api/app/rag/router.py, biến `router`)
GET  /api/regulations?cohort=&status=&q=           -> [RegulationDoc]
GET  /api/regulations/{doc_id}                     -> RegulationDoc + articles[]
POST /api/regulations/ask   {question, cohort?, mode?:"extractive"|"llm"}
     -> {answer, citations:[{doc_id, decision_no, article, clause, quote, effective_from, effective_to, status}], warnings:[...], mode}
POST /api/regulations/compare {topic, cohorts:[..]} -> {rows:[{cohort, doc, article, quote}], differences:[...]}
GET  /api/regulations/expiring?within_days=90      -> [RegulationDoc]

# Không gian văn bản kiểu Obsidian (vault + liên kết + đồ thị)
GET  /api/regulations/{doc_id}/markdown             -> {doc_id, frontmatter:{...RegulationDoc}, markdown}
     # Markdown chuẩn hóa: "## Điều N. Tiêu đề" (anchor dieu-N), khoản "**1.**" (anchor dieu-N-khoan-1),
     # tham chiếu chéo đã chuyển thành wikilink [[doc_id#dieu-N-khoan-M|Khoản M Điều N QĐ 1268]]
GET  /api/regulations/{doc_id}/backlinks            -> [{from_doc_id, from_anchor, context_snippet}]
GET  /api/regulations/graph?cohort=                 -> {nodes:[{id, label, type:"doc"|"article", status, cohorts}],
                                                        edges:[{source, target, type:"supersedes"|"amends"|"references"|"guides"}]}
GET  /api/regulations/resolve?ref=                  -> {doc_id, anchor} # phân giải "Điều 10 QĐ 1268" → link
```

Vault Markdown được sinh ra tại `REGULATIONS_DIR/vault/<doc_id>.md` (YAML frontmatter + nội dung), mở được trực tiếp bằng app Obsidian thật như một bonus. Giao diện `/regulations` theo bố cục Obsidian: cây văn bản trái (lọc khóa/chủ đề/hiệu lực) · trình đọc giữa (anchor từng Điều/Khoản, hover preview link, panel backlinks "Được dẫn chiếu bởi", outline) · chat AI phải (trích dẫn là wikilink, click mở đúng Khoản và highlight) · Graph view (văn bản & quan hệ thay thế/sửa đổi/dẫn chiếu, màu theo hiệu lực) · split view so sánh 2 khóa · ghi chú/highlight cá nhân theo Điều (localStorage) · command palette Ctrl+K.

Kiểu dữ liệu chính:

```ts
ModuleSummary = { code, name, credits, type, faculty?, has_equivalents: boolean }
ModuleDetail  = ModuleSummary & { description?, prerequisites?: string[], equivalents: {code,name,credits}[], semesters: string[] }
ClassSection  = { class_code, module_code, lecturer?, quota?, start_date?, end_date?,
                  lessons: { weekday: 2..8 /* 2=Thứ 2, 8=CN */, start_period, end_period, start_time, end_time, room?, weeks?: string }[] }
RegulationDoc = { doc_id, title, decision_no, issued_date, effective_from, effective_to?, status: "active"|"expired"|"superseded"|"upcoming",
                  superseded_by?, applies_to_cohorts: string[] /* vd "K22","K23" hoặc "all" */, source_url?, file }
```

Khung tiết UEL (mặc định, có thể chỉnh trong `api/app/config.py`): tiết 1 bắt đầu 07:00, mỗi tiết 50 phút; tiết 1–5 sáng, 6–10 chiều, 11–13 tối. Parser `Schedules` phải chịu lỗi (định dạng chưa xác minh với dữ liệu thật).

## Chương trình đào tạo & cây môn học (tiên quyết / học trước)

Nguồn: `GET https://portal.uel.edu.vn/backend/api/student/studyProgram?StudyProgramID=K22404` (mã CTĐT = `K` + 2 số năm + mã ngành, vd K22404 = Tài chính khóa 22; ngành 2 dạng `K22406NGANH2`) → `tbStudyPrograms[]` mỗi dòng: `MaCTDT, TenCTDT, KhoaHoc, HocKy/HocKyHienThi ("HK02 năm học 2022-2023" | "Chưa phân học kỳ"), BatBuoc ("Bắt Buộc"/tự chọn), MaHP, TenHP, STC, LT, TH, TL, BoMon, Khoa, HPHocTruoc (" TATC", "KT48" — có thể nhiều mã, có khoảng trắng), HPTienQuyet, HPTuongDuong, TenKhoiKienThuc, TenKhoaKienThucCha, GhiChu`. Dữ liệu đã lấy (bỏ trường cá nhân như IsPass) nằm ở `DATA_DIR/raw/ctdt_programs.json` dạng `{ "<StudyProgramID>": [rows] }`.

Quy ước quan hệ (theo quy chế đào tạo tín chỉ):
- **Tiên quyết (prerequisite):** phải học và **đạt** học phần A mới được đăng ký B → cạnh `prereq` (nét liền).
- **Học trước (previous):** phải **đã học** A (được phép chưa đạt, điểm ≥ ngưỡng theo quy chế khóa) mới đăng ký B → cạnh `previous` (nét đứt).
- **Song hành (corequisite)** nếu có: học cùng kỳ → cạnh `coreq`.
- **Tương đương:** A thay thế được B → dùng bảng tương đương để thỏa điều kiện.
Điều kiện cụ thể (vd ngưỡng điểm "học trước") lấy từ quy chế áp dụng cho khóa (liên kết sang `/regulations` đúng Điều/Khoản).

API (thêm):
```
GET /api/programs?cohort=&q=                       -> [{program_id, name, cohort, faculty, total_credits}]
GET /api/programs/{program_id}                     -> {program, blocks:[{name, parent, required_credits, modules:[{code,name,credits,required,suggested_term,prereq,previous,coreq,equivalents}]}]}
GET /api/programs/{program_id}/graph               -> {nodes:[{code,name,credits,required,suggested_term,block}], edges:[{source,target,type:"prereq"|"previous"|"coreq"|"equivalent"}]}
GET /api/modules/{code}/tree?program_id=&direction=prereq|unlocks&depth=
                                                   -> cây đệ quy (giống prereq tree của NUSMods): {code,name,type,children:[...]}
POST /api/programs/{program_id}/check              {completed:[{code,grade?}], planned:{term:[codes]}}
     -> {eligible_now:[codes], blocked:[{code, missing:[{code,type}]}], warnings:[...], rule_refs:[{doc_id, anchor}]}
POST /api/import/ctdt   (upload ctdt_programs.json)
```
Frontend: trang `/programs/[id]` (sơ đồ CTĐT theo học kỳ gợi ý + khối kiến thức, kiểu flowchart), cây tiên quyết trong `/modules/[code]` (2 chiều: "cần học trước" ← môn → "mở khóa"), `/planner` kiểm tra điều kiện khi kéo môn vào kỳ, tô màu môn đã đạt/đủ điều kiện/bị chặn.

## AI quy chế — nguyên tắc chính xác

1. **Không có nguồn thì không trả lời.** Mọi câu trả lời phải kèm trích dẫn nguyên văn (số quyết định, Điều, Khoản, Điểm).
2. **Chế độ mặc định `extractive` (miễn phí, không LLM):** truy xuất BM25 (+ embeddings tùy chọn) trên chunk cấp Khoản/Điều, trả về các đoạn nguyên văn xếp hạng. Không sinh văn bản → không bịa.
3. **Chế độ `llm` (bật sau):** provider `ollama` hoặc `claude` qua biến môi trường `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `OLLAMA_URL`. LLM chỉ được tóm tắt từ các đoạn đã truy xuất; hậu kiểm: mọi trích dẫn trong câu trả lời phải khớp nguyên văn một chunk, nếu không thì hạ về `extractive`.
4. **Theo khóa:** lọc văn bản theo `applies_to_cohorts` + hiệu lực tại thời điểm hỏi; cảnh báo nếu văn bản `expired/superseded` hoặc sắp hết hiệu lực.

## Tính năng frontend (tương đương nhóm chức năng NUSMods)

Tra cứu học phần (search, lọc), trang chi tiết học phần, **Thời khóa biểu** (chọn môn, chọn lớp, kéo-thả đổi lớp, phát hiện trùng lịch, nhiều học kỳ, chia sẻ qua URL, xuất PNG/ICS, ẩn môn, màu), **Lập kế hoạch nhiều học kỳ** (kéo-thả môn vào kỳ, tổng tín chỉ, cảnh báo thiếu tiên quyết), **Phòng học** (lịch trống), **Học phần tương đương**, **Quy chế** (duyệt + hỏi AI + so sánh khóa + cảnh báo hết hiệu lực), **Cài đặt** (chế độ tối, khóa tuyển sinh), **Widget feedback** trên mọi trang. Lưu trạng thái người dùng ở localStorage (không cần đăng nhập ở MVP).

## Chạy

Cách chuẩn cho cả nhóm: Docker — xem `DEPLOY.md` (`docker-compose.yml`, `docker-compose.dev.yml`, `docker/`). Cấu hình qua biến môi trường `DATABASE_URL, DATA_DIR, REGULATIONS_DIR, RAG_INDEX_DIR, CORS_ORIGINS, LLM_PROVIDER, OLLAMA_URL, OLLAMA_MODEL, ANTHROPIC_API_KEY, NEXT_PUBLIC_API_URL`. **Một database duy nhất là PostgreSQL** (từ 2026-11-21): không có `DATABASE_URL` thì API/CLI chạy trên máy tự ghép kết nối `localhost:5432` từ `POSTGRES_*` trong `<repo>/.env` (Docker `db` phải đang chạy); SQLite chỉ dùng trong test. Không tự nạp dữ liệu mẫu (`AUTO_SEED=false` mặc định). Kế hoạch tối ưu và lộ trình: `docs/ROADMAP.md`. Chạy API/web trực tiếp trên máy (DB vẫn là Postgres trong Docker):

```bash
cd api && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt && .venv\Scripts\uvicorn app.main:app --reload
cd web && npm install && npm run dev      # NEXT_PUBLIC_API_URL=http://localhost:8000
```
