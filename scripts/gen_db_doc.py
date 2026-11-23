"""Sinh docs/DATA_DICTIONARY.md (từ điển dữ liệu) từ schema + số liệu THẬT của database đang chạy.

Chạy trong container workspace (cần DATABASE_URL tới Postgres):
    .\\scripts\\dev.ps1 run sh -c "cd /workspace/api && python /workspace/scripts/gen_db_doc.py"

Phần tự động: kiểu, NULL, khóa chính/ngoại/duy nhất, số dòng, ví dụ lấy từ dữ liệu, số liệu chất lượng.
Phần viết tay (trong file này): nhóm bảng, "một dòng = gì", mô tả từng cột, quy tắc diễn giải. Cột chưa có mô tả sẽ được liệt kê
ở cuối lần chạy để bổ sung. Không đưa dữ liệu cá nhân vào ví dụ: các bảng users/reviews/feedback chỉ ghi cấu trúc.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))  # để import được `app` khi chạy trực tiếp file này

from sqlalchemy import inspect, text  # noqa: E402

from app.db import engine  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "docs" / "DATA_DICTIONARY.md"
VERSION = "1.0"

# Bảng chứa dữ liệu người dùng: không lấy ví dụ từ dữ liệu thật.
NO_EXAMPLES = {"users", "reviews", "feedback"}

GROUPS = [
    ("A. Lịch học và học phần", ["semesters", "modules", "module_offering_plans", "class_sections", "lessons", "venues"]),
    ("B. Chương trình đào tạo và quan hệ học phần", ["programs", "program_modules", "module_relations", "equivalents"]),
    ("C. Danh mục CTĐT 2025 và đề cương học phần", [
        "program_catalog_entries", "outline_resources", "outline_documents", "outline_sections", "outline_courses",
        "outline_module_links", "outline_objectives", "outline_clos", "outline_assessments", "outline_schedule", "outline_materials"]),
    ("D. Quy chế học vụ", ["regulation_documents", "regulation_chunks"]),
    ("E. Người dùng và vận hành", ["users", "reviews", "feedback", "import_runs"]),
]

# one_row: "một dòng là gì"; key: khóa nhận diện; note: ghi chú sau bảng
META = {
    "semesters": dict(one_row="Một học kỳ.", key="id (dạng 2026-2027-1)", note="Học kỳ 3 là học kỳ chính thức (không phải học kỳ hè), cùng với học kỳ 1 và 2. Có thể có học kỳ chưa bắt đầu (kế hoạch)."),
    "modules": dict(one_row="Một học phần (theo mã).", key="code", note="`name_en` là tên tiếng Anh để hiển thị khi giao diện ở chế độ EN; NULL = chưa có nguồn (giao diện dùng tên tiếng Việt, không tự dịch). Thứ tự ưu tiên nguồn: outline > catalog > seed_table > portal (cột `name_en_source`); giá trị nhập tay (`name_en` có, `name_en_source` NULL) không bị ghi đè. Mô tả song ngữ: `description` (VI) và `description_en` (EN) lấy từ đề cương, nhận diện ngôn ngữ từng đoạn; môn thiếu một bản có thể chép từ bản Anh↔Việt tương ứng (`*_source = counterpart`); lệnh `python -m app.cli fill-descriptions`."),
    "module_offering_plans": dict(one_row="Một học phần và một năm học trong kế hoạch mở môn.", key="id (duy nhất: module_code + academic_year)", note="Nguồn là kế hoạch mở môn tiếng Anh; không phải lớp học thực tế."),
    "class_sections": dict(one_row="Một lớp học phần trong một học kỳ.", key="id (duy nhất: class_code + semester_id)", note="`semester_id` có thể NULL khi không suy ra được học kỳ từ mã lớp (khi đó khóa duy nhất không chặn trùng trên PostgreSQL). `cohorts` chỉ suy được từ lớp sinh viên bắt đầu bằng K."),
    "lessons": dict(one_row="Một buổi học lặp lại hàng tuần của một lớp (một khối tiết).", key="id", note="`weekday` 2–8 (8 = Chủ nhật). `end_period` là số thực vì có tiết lẻ. `weeks` giữ nguyên văn các tuần học; `date_start/date_end` là khoảng ngày thật nếu suy ra được."),
    "venues": dict(one_row="Một phòng học.", key="room", note="Sức chứa lấy từ dữ liệu lịch học, có thể NULL."),
    "programs": dict(one_row="Một chương trình đào tạo (CTĐT) của một khóa.", key="id", note="`source`: `ctdt` = lấy từ cổng portal (K23, K24); `catalog2025` = dựng từ danh mục Đề cương CTĐT 2025 (K25, K26 — xem Quy tắc diễn giải)."),
    "program_modules": dict(one_row="Một học phần trong một CTĐT.", key="id (duy nhất: program_id + module_code)", note="Cột `*_raw` là nguyên văn nguồn; cột `*_tree` là cây điều kiện đã phân tích (`{\"and\": [...]}` / `{\"or\": [...]}` / mã môn). `suggested_order` là thứ tự học kỳ trong khóa (1 = sớm nhất)."),
    "module_relations": dict(one_row="Một cạnh quan hệ giữa hai học phần trong phạm vi một CTĐT.", key="id (duy nhất: source + target + type + program_id)", note="Cạnh `source → target`: phải có `source` mới học `target` (với type prereq/previous/coreq); với `equivalent`: `source` thay thế được `target`. `source`/`target` là liên kết mềm tới modules.code (không ép khóa ngoại)."),
    "equivalents": dict(one_row="Một cặp học phần tương đương (mã cũ ↔ mã mới).", key="id (duy nhất: code + equivalent_code)", note="Nguồn gồm: (1) các dòng lấy từ cổng portal (endpoint chỉ trả học phần tương đương của các CTĐT của tài khoản đã lấy: K22404, K22406 Ngành 2) và (2) các dòng khôi phục từ file cũ bị hỏng (chỉ giữ dòng còn bắt đầu bằng mã, tên có thể trống). Không phủ toàn trường. Tên Việt là bản chụp lúc nhập; tên tiếng Anh lấy từ modules.name_en."),
    "program_catalog_entries": dict(one_row="Một dòng môn trong một sheet của workbook Đề cương CTĐT 2025.", key="id (duy nhất: source_file + source_sheet + source_row)", note="Cùng một môn xuất hiện ở nhiều nhánh/bản rà soát nên KHÔNG dùng module_code làm khóa. `term` (HK01…) chỉ là thứ tự học kỳ, chỉ có ở các sheet \"Dữ liệu gốc\"/bản chương trình."),
    "outline_resources": dict(one_row="Một liên kết đề cương (URL) của một dòng catalog.", key="id", note="`status`: downloaded / failed / no_url."),
    "outline_documents": dict(one_row="Một file đề cương PDF đã tải.", key="id (duy nhất: sha256)", note="File PDF nằm ngoài DB (`rel_path`); DB giữ metadata và văn bản trích xuất. `text_status`: pending / extracted / needs_ocr / failed."),
    "outline_sections": dict(one_row="Một phần có đánh số của đề cương (nguyên văn).", key="id", note="`kind` ví dụ front, objectives, clo, content, assessment, textbooks, other."),
    "outline_courses": dict(one_row="Thông tin tổng quát đã phân tích của một đề cương.", key="document_id", note="`parse_status`: ok / partial / failed / skipped. Các trường `*_raw` giữ nguyên văn."),
    "outline_module_links": dict(one_row="Liên kết một đề cương với một mã học phần.", key="id (duy nhất: document_id + module_code)", note="`module_code` là liên kết mềm. `source` cho biết liên kết suy ra từ đâu (catalog, mã trong đề cương…)."),
    "outline_objectives": dict(one_row="Một mục tiêu học phần (CO) của đề cương.", key="id", note=""),
    "outline_clos": dict(one_row="Một chuẩn đầu ra học phần (CLO) của đề cương.", key="id", note=""),
    "outline_assessments": dict(one_row="Một thành phần/mục đánh giá của đề cương.", key="id", note=""),
    "outline_schedule": dict(one_row="Một dòng kế hoạch giảng dạy theo tuần.", key="id", note=""),
    "outline_materials": dict(one_row="Một giáo trình hoặc tài liệu tham khảo.", key="id", note="`kind`: textbook / reference / software."),
    "regulation_documents": dict(one_row="Một văn bản quy chế/quy định.", key="id", note="Không bịa số quyết định/ngày: trường không rõ để NULL; `verified` = đã đọc trong chính văn bản."),
    "regulation_chunks": dict(one_row="Một Điều/Khoản/Điểm nguyên văn của văn bản quy chế (đơn vị truy xuất và trích dẫn của RAG).", key="id (duy nhất: doc_id + anchor)", note="Hiện CHƯA nạp (0 dòng): RAG quy chế đang chạy bằng chỉ mục riêng ngoài DB."),
    "users": dict(one_row="Một người dùng đăng nhập.", key="id (duy nhất: provider + subject)", note="Chứa dữ liệu cá nhân khi có người dùng thật — không đưa vào ví dụ hay commit."),
    "reviews": dict(one_row="Một đánh giá học phần của người dùng.", key="id", note="Có kiểm duyệt (`status`, `moderation_reasons`)."),
    "feedback": dict(one_row="Một lượt góp ý từ widget trên web.", key="id", note="Phục vụ vòng Design Thinking."),
    "import_runs": dict(one_row="Một lần nhập một file/nguồn dữ liệu.", key="id", note="Dùng để truy vết nguồn gốc dữ liệu (chương đánh giá khóa luận)."),
}

COMMON = {
    "is_sample": "Cờ dữ liệu mẫu; `clear-sample` xóa các dòng này khi đã có dữ liệu thật.",
    "updated_at": "Thời điểm cập nhật gần nhất (múi giờ UTC).",
    "created_at": "Thời điểm tạo.",
    "search_text": "Bản không dấu, chữ thường để tìm kiếm tiếng Việt (chỉ mục trigram GIN trên PostgreSQL).",
}

COLS = {
    "semesters": {
        "id": "Mã học kỳ dạng `năm học-kỳ`, ví dụ 2026-2027-1 (suy từ mã lớp: `261` → 2026-2027-1).",
        "name": "Tên hiển thị, ví dụ \"Học kỳ 1, năm học 2025–2026\".", "year": "Năm học dạng 2025-2026.",
        "term": "Số kỳ trong năm: 1, 2 hoặc 3 (cả ba đều là học kỳ chính thức).", "start_date": "Ngày bắt đầu học kỳ, nếu biết.", "end_date": "Ngày kết thúc học kỳ, nếu biết.",
        "is_current_override": "Ép đánh dấu học kỳ hiện tại; NULL = tự suy theo ngày.",
    },
    "modules": {
        "code": "Mã học phần (khóa chính). Bản tiếng Anh mã `E…`, bản tiếng Việt `B…`; không gộp chỉ dựa vào tên.",
        "name": "Tên học phần (tiếng Việt, đôi khi còn hậu tố lớp vét/học ghép từ nguồn).", "credits": "Số tín chỉ.",
        "type": "Loại học phần theo nguồn (vd Lý thuyết).", "faculty": "Khoa quản lý theo nguồn; một số khoa viết hai kiểu (có/không \"Khoa \").",
        "department": "Bộ môn theo nguồn.", "is_english": "Tên có hậu tố `(E)`/ghi chú dạy bằng tiếng Anh (cờ cũ; ưu tiên dùng `language_track`).",
        "description": "Mô tả học phần bằng TIẾNG VIỆT (giao diện VI hiển thị cột này). Điền bởi `fill-descriptions` từ đề cương; NULL nếu chưa có.",
        "description_source": "Nguồn của `description`: outline | counterpart (chép từ bản Anh↔Việt tương ứng); NULL + có nội dung = nhập tay.",
        "description_en": "Mô tả học phần bằng TIẾNG ANH (giao diện EN hiển thị cột này); NULL nếu chưa có — không tự dịch, giao diện sẽ dùng bản tiếng Việt và báo rõ.",
        "description_en_source": "Nguồn của `description_en`: outline | counterpart; NULL + có nội dung = nhập tay.",
        "prerequisites": "Danh sách mã tiên quyết (cột cũ, JSONB); quan hệ chính thức nằm ở module_relations/program_modules.",
        "language_track": "Ngôn ngữ giảng dạy suy ra: `en` hoặc `vi`.", "language_basis": "Căn cứ phân loại ngôn ngữ (code_pattern, name_marker, cntn_confirmed, default…).",
        "counterpart_code": "Mã bản tương ứng Anh↔Việt (EEE1038 ↔ BEE1038).", "is_talent_program": "Môn thuộc chương trình Cử nhân tài năng (CNTN).",
        "name_en": "Tên tiếng Anh; NULL nếu chưa có nguồn.", "name_en_source": "Nguồn của name_en: outline | catalog | seed_table | portal; NULL + name_en có giá trị = nhập tay.",
    },
    "module_offering_plans": {
        "id": "Khóa thay thế tự tăng.", "module_code": "Học phần được lên kế hoạch mở.", "academic_year": "Năm học của kế hoạch (2026-2027).",
        "terms": "Danh sách học kỳ dự kiến mở, ví dụ [1, 3].", "terms_text": "Nguyên văn cột học kỳ trong file nguồn.",
        "open_pct": "Phần trăm khả năng mở theo kế hoạch.", "lecture_hours": "Số giờ giảng.", "note": "Ghi chú nguồn.", "source": "Mã nguồn kế hoạch (vd ta-plan).",
    },
    "class_sections": {
        "id": "Khóa thay thế tự tăng.", "class_code": "Mã lớp học phần, dạng `<kỳ 3 ký tự><mã môn><số lớp>` (251EIE300401).",
        "module_code": "Học phần của lớp.", "semester_id": "Học kỳ của lớp; NULL nếu không suy ra được.", "lecturer": "Giảng viên (nguyên văn, có thể nhiều người).",
        "quota": "Sĩ số tối đa.", "quota_min": "Sĩ số tối thiểu để mở lớp.", "registered": "Số đã đăng ký.", "available": "Số chỗ còn trống (có thể âm nếu vượt sĩ số).",
        "student_groups": "Danh sách lớp sinh viên được phép đăng ký (K24404E…).", "cohorts": "Khóa suy từ lớp sinh viên bắt đầu bằng K (K24). Rỗng/NULL = chưa suy được.",
        "rooms": "Danh sách phòng kèm sức chứa: [{room, capacity, capacity_gap}].", "notes": "Ghi chú của nguồn (vd \"Giảng bằng Tiếng Anh\").",
        "source": "Nguồn của lớp: uis | dkhp | portal | sample.", "start_date": "Ngày bắt đầu lớp.", "end_date": "Ngày kết thúc lớp.",
        "study_type": "Hình thức học (Lý thuyết, Thực hành…).", "schedule_raw": "Chuỗi lịch học nguyên văn từ nguồn (để rà soát bộ phân tích).",
    },
    "lessons": {
        "id": "Khóa thay thế tự tăng.", "class_id": "Lớp học phần chứa buổi học.", "weekday": "Thứ trong tuần: 2–7 = Thứ 2–7, 8 = Chủ nhật.",
        "start_period": "Tiết bắt đầu.", "end_period": "Tiết kết thúc (số thực vì có tiết lẻ).", "start_time": "Giờ bắt đầu HH:MM theo bảng tiết.",
        "end_time": "Giờ kết thúc HH:MM.", "room": "Phòng học (có thể NULL).", "weeks": "Các tuần học, nguyên văn (vd `4-12`).",
        "raw": "Đoạn lịch nguyên văn đã tách ra buổi học này.", "date_start": "Ngày đầu tiên của buổi học (nếu suy ra được).", "date_end": "Ngày cuối cùng của buổi học (nếu suy ra được).",
    },
    "venues": {"room": "Tên phòng (khóa chính), vd B2.202.", "capacity": "Sức chứa (chỗ), NULL nếu không rõ."},
    "programs": {
        "id": "Mã CTĐT: `K` + 2 số cuối năm nhập học + mã ngành, vd K24404 (khóa 24, ngành 404).", "name": "Tên CTĐT kèm khóa.",
        "cohort": "Khóa dạng K24 (2 số cuối năm tuyển sinh).", "faculty": "Khoa phụ trách.", "source": "Nguồn dữ liệu: ctdt (portal) | catalog2025 (dựng từ danh mục 2025).",
    },
    "program_modules": {
        "id": "Khóa thay thế tự tăng.", "program_id": "CTĐT chứa học phần.", "module_code": "Học phần.", "block": "Khối kiến thức (nguyên văn).",
        "parent_block": "Khối kiến thức cha.", "required": "Bắt buộc. Với CTĐT từ catalog: `X` → true, ô trống → false (không đánh dấu bắt buộc: tự chọn/chưa rõ).",
        "suggested_term": "Học kỳ gợi ý nguyên văn. CTĐT cổng: `HK02 năm học 2022-2023`; CTĐT catalog: chỉ thứ tự `HK03`.",
        "suggested_semester": "Học kỳ gợi ý đã chuẩn hóa dạng `2022-2023-2`; NULL nếu nguồn không ghi năm học (CTĐT catalog luôn NULL).",
        "suggested_order": "Thứ tự học kỳ trong khóa (1 = sớm nhất).", "prereq_raw": "Học phần tiên quyết nguyên văn.", "previous_raw": "Học phần học trước nguyên văn (CTĐT catalog: chỉ giữ mã).",
        "coreq_raw": "Học phần song hành nguyên văn.", "equivalent_raw": "Học phần tương đương nguyên văn.", "prereq_tree": "Cây điều kiện tiên quyết (JSONB).",
        "previous_tree": "Cây điều kiện học trước (JSONB).", "coreq_tree": "Cây điều kiện song hành (JSONB).", "note": "Ghi chú của nguồn.",
    },
    "module_relations": {
        "id": "Khóa thay thế tự tăng.", "source": "Mã học phần điều kiện (phải có trước).", "target": "Mã học phần bị ràng buộc.",
        "type": "Loại: prereq | previous | coreq | equivalent.", "program_id": "CTĐT mà quan hệ áp dụng.",
    },
    "equivalents": {
        "id": "Khóa thay thế tự tăng.", "code": "Mã học phần gốc (thường là mã cũ).", "name": "Tên học phần gốc (tiếng Việt, bản chụp lúc nhập).", "credits": "Số tín chỉ học phần gốc.",
        "equivalent_code": "Mã học phần tương đương (thường là mã mới).", "equivalent_name": "Tên học phần tương đương (tiếng Việt).", "equivalent_credits": "Số tín chỉ học phần tương đương.",
    },
    "program_catalog_entries": {
        "id": "Mã băm của dòng (khóa chính).", "program_label": "Tên ngành/chương trình của workbook.", "track_label": "Tên sheet (nhánh/bản rà soát).",
        "category": "`curriculum_source` (dữ liệu gốc) | `track_or_review` (nhánh/rà soát).", "module_code": "Mã học phần (liên kết mềm tới modules.code).",
        "module_code_en": "Mã bản tiếng Anh nếu có.", "module_name": "Tên học phần (Việt).", "module_name_en": "Tên tiếng Anh ghi trong workbook — CÓ giá trị rác (vd `v`); dùng modules.name_en thay vì cột này.",
        "term": "Thứ tự học kỳ HK01…HK10; NULL nếu sheet không có cột học kỳ.", "academic_year": "Năm học nếu workbook ghi.", "credits": "Số tín chỉ.",
        "required_raw": "`X` hoặc trống — không suy diễn thêm.", "department": "Bộ môn.", "previous_raw": "Học phần học trước nguyên văn, dạng `[MÃ]Tên, [MÃ]Tên` hoặc văn bản tự do.",
        "source_file": "Tên file workbook nguồn.", "source_sheet": "Tên sheet nguồn.", "source_row": "Số dòng trong sheet.", "original": "Toàn bộ ô gốc [{column, header, value}].",
        "import_run_id": "Lần nhập tạo ra dòng này.", "language_track": "Ngôn ngữ giảng dạy suy ra: en | vi.",
    },
    "outline_resources": {
        "id": "Mã băm (khóa chính).", "entry_id": "Dòng catalog sở hữu liên kết.", "kind": "Loại liên kết (vd \"Link đề cương hiện tại (chuẩn)\").", "label": "Nhãn/tên file hiển thị.",
        "url": "URL đề cương (thường Google Drive).", "source_column": "Cột trong Excel chứa liên kết.", "status": "downloaded | failed | no_url.",
        "failure_reason": "Lý do tải lỗi.", "document_id": "File PDF đã tải tương ứng.",
    },
    "outline_documents": {
        "id": "Khóa thay thế tự tăng.", "sha256": "Mã băm nội dung file (duy nhất).", "file_name": "Tên file PDF.", "rel_path": "Đường dẫn tương đối tới file PDF.",
        "size_bytes": "Dung lượng file (byte).", "page_count": "Số trang.", "text_status": "pending | extracted | needs_ocr | failed.", "text_method": "pdf_text hoặc ocr.",
        "text_chars": "Số ký tự đã trích.", "language": "Mã ngôn ngữ phát hiện.", "text": "Văn bản trích xuất toàn bộ.", "extracted_at": "Thời điểm trích văn bản.",
        "ocr_status": "OCR để làm sau: NULL = không cần (PDF có lớp chữ); pending = PDF scan cần OCR; done = đã OCR và đưa vào phân tích.",
        "ocr_text": "Văn bản OCR (với 'pending': bản chạy thử chưa duyệt, chưa dùng để phân tích).",
        "ocr_engine": "Công cụ/tham số OCR, vd 'tesseract vie+eng psm4 300dpi'.", "ocr_at": "Thời điểm OCR.",
    },
    "outline_sections": {
        "id": "Khóa thay thế tự tăng.", "document_id": "Đề cương chứa phần này.", "kind": "Loại phần (front, objectives, clo, content, assessment, textbooks, other…).",
        "ord": "Thứ tự trong đề cương.", "heading": "Tiêu đề mục.", "text": "Nội dung nguyên văn.",
    },
    "outline_courses": {
        "document_id": "Đề cương (khóa chính, 1–1 với outline_documents).", "doc_type": "Loại tài liệu: đề cương, khung… (other nếu không rõ).", "faculty": "Khoa ghi trong đề cương.",
        "department": "Bộ môn ghi trong đề cương.", "name_vi": "Tên học phần tiếng Việt trong đề cương.", "name_en": "Tên học phần tiếng Anh trong đề cương (có thể thiếu hoặc sai lỗi chính tả).",
        "course_code": "Mã học phần như ghi trong đề cương.", "course_code_norm": "Mã đã chuẩn hóa (dùng để liên kết).", "knowledge_block": "Khối kiến thức.", "level": "Trình độ (Undergraduate…).",
        "major": "Ngành.", "cohort_range": "Khóa áp dụng, dạng 2025-2029.", "academic_year": "Năm học trong khung chương trình.", "term": "Học kỳ trong khung chương trình.",
        "credits": "Số tín chỉ.", "hours_lecture": "Giờ lý thuyết.", "hours_practice": "Giờ thực hành.", "hours_self_study": "Giờ tự học.",
        "prerequisite_raw": "Tiên quyết nguyên văn.", "previous_raw": "Học trước nguyên văn.", "next_raw": "Học sau nguyên văn.", "corequisite_raw": "Song hành nguyên văn.",
        "teaching_language": "Ngôn ngữ giảng dạy nguyên văn.", "lecturers": "Danh sách giảng viên (JSONB).", "assistants": "Danh sách trợ giảng (JSONB).", "description": "Mô tả học phần.",
        "parse_status": "ok | partial | failed | skipped.", "parse_detail": "Chi tiết kết quả phân tích (đếm số mục…).", "parse_method": "Phiên bản bộ phân tích (vd rules-5).",
        "parsed_at": "Thời điểm phân tích.", "language_track": "Ngôn ngữ giảng dạy suy ra: en | vi.",
    },
    "outline_module_links": {"id": "Khóa thay thế tự tăng.", "document_id": "Đề cương.", "module_code": "Học phần được liên kết (liên kết mềm).", "source": "Cách suy ra liên kết (catalog…)."},
    "outline_objectives": {"id": "Khóa thay thế tự tăng.", "document_id": "Đề cương.", "code": "Mã mục tiêu (CO1…).", "description": "Nội dung mục tiêu.", "clo_codes": "Các CLO tương ứng (JSONB).", "competency_level": "Mức năng lực."},
    "outline_clos": {"id": "Khóa thay thế tự tăng.", "document_id": "Đề cương.", "code": "Mã CLO (CLO1…).", "description": "Nội dung chuẩn đầu ra.", "teaching_levels": "Mức giảng dạy I/T/U."},
    "outline_assessments": {
        "id": "Khóa thay thế tự tăng.", "document_id": "Đề cương.", "ord": "Thứ tự.", "component": "Thành phần đánh giá (A1, A2…).", "item_code": "Mã mục (A1.1…).",
        "item_name": "Tên mục.", "clo_codes": "CLO được đánh giá (JSONB).", "criteria": "Tiêu chí.", "duration": "Thời lượng.", "weight_pct": "Trọng số thành phần (%).", "sub_weight_pct": "Trọng số mục trong thành phần (%).",
    },
    "outline_schedule": {"id": "Khóa thay thế tự tăng.", "document_id": "Đề cương.", "ord": "Thứ tự.", "week_label": "Nhãn tuần/buổi.", "content": "Nội dung giảng dạy.", "clo_codes": "CLO liên quan (JSONB).", "activities": "Hoạt động dạy và học.", "assessment": "Mục đánh giá liên quan."},
    "outline_materials": {"id": "Khóa thay thế tự tăng.", "document_id": "Đề cương.", "kind": "Loại: textbook | reference | software.", "ord": "Thứ tự.", "citation": "Trích dẫn tài liệu nguyên văn."},
    "regulation_documents": {
        "id": "Mã văn bản (khóa chính), vd uel-qcdt-1268-2022.", "title": "Tiêu đề văn bản.", "issuer": "Cơ quan ban hành.", "decision_no": "Số quyết định (NULL nếu không đọc được trong văn bản).",
        "issued_date": "Ngày ban hành.", "effective_from": "Ngày bắt đầu hiệu lực.", "effective_to": "Ngày hết hiệu lực.", "status": "active | expired | superseded | upcoming.",
        "superseded_by": "Mã văn bản thay thế (liên kết mềm).", "supersedes": "Mã văn bản bị thay thế (JSONB).", "applies_to_cohorts": "Khóa áp dụng, vd [\"K25\",\"K26\"] hoặc [\"all\"].",
        "topics": "Chủ đề (JSONB).", "source_url": "URL nguồn.", "file": "Đường dẫn file gốc trong thư mục regulations/.", "verified": "Đã đối chiếu số/ngày trong chính văn bản.", "notes": "Ghi chú.",
    },
    "regulation_chunks": {
        "id": "Khóa thay thế tự tăng.", "doc_id": "Văn bản chứa đoạn.", "chapter": "Chương.", "article": "Điều.", "clause": "Khoản.", "point": "Điểm.", "heading": "Tiêu đề Điều.",
        "anchor": "Neo trích dẫn, vd dieu-10-khoan-2.", "page": "Số trang trong file gốc.", "text": "Nội dung NGUYÊN VĂN.",
    },
    "users": {"id": "Khóa thay thế tự tăng.", "provider": "Nhà cung cấp đăng nhập.", "subject": "Định danh người dùng tại nhà cung cấp.", "display_name": "Tên hiển thị.", "created_at": "Thời điểm tạo tài khoản.", "last_login_at": "Lần đăng nhập gần nhất."},
    "reviews": {
        "id": "Khóa thay thế tự tăng.", "module_code": "Học phần được đánh giá.", "user_id": "Người viết.", "display_name": "Tên hiển thị trên đánh giá.", "semester": "Học kỳ đã học.",
        "professor": "Giảng viên.", "cohort": "Khóa của người đánh giá.", "rating": "Điểm tổng thể.", "difficulty": "Độ khó.", "workload": "Khối lượng học tập.", "content": "Nội dung đánh giá.",
        "status": "Trạng thái kiểm duyệt.", "moderation_reasons": "Lý do kiểm duyệt (JSONB).", "created_at": "Thời điểm tạo.",
    },
    "feedback": {"id": "Khóa thay thế tự tăng.", "page": "Trang web gửi góp ý.", "rating": "Điểm hài lòng.", "category": "Loại góp ý.", "message": "Nội dung.", "contact": "Liên hệ (tùy chọn).", "app_version": "Phiên bản ứng dụng.", "created_at": "Thời điểm gửi."},
    "import_runs": {
        "id": "Khóa thay thế tự tăng.", "source": "Nguồn nhập (uis-classes, ctdt, equivalents…).", "file_name": "Tên file nguồn.", "file_sha256": "Mã băm file nguồn.",
        "rows_in": "Số dòng đọc vào.", "rows_ok": "Số dòng nhập thành công.", "rows_skipped": "Số dòng bỏ qua.", "rows_error": "Số dòng lỗi.", "status": "ok | partial | failed.",
        "detail": "Chi tiết kết quả (JSONB).", "started_at": "Bắt đầu.", "finished_at": "Kết thúc.",
    },
}

# Ví dụ ghi đè khi giá trị lấy từ dữ liệu là rác/không đại diện
EXAMPLE_OVERRIDE = {("program_catalog_entries", "module_name_en"): "Marketing Research", ("program_catalog_entries", "term"): "HK03"}

SOURCES = [
    ("Excel UIS — lịch lớp học phần 2025–2026 HK01", "class_sections, lessons, venues, modules (nguồn chính thức, 225 lớp)"),
    ("Quét trang Tra cứu học phần (DKHP)", "class_sections, lessons, modules (6.089 lớp, các kỳ 251–271)"),
    ("Cổng portal — chương trình đào tạo (studyProgram)", "programs, program_modules, module_relations (K23, K24)"),
    ("Cổng portal — học phần tương đương (equivalentcourse)", "equivalents (chỉ các CTĐT của tài khoản lấy dữ liệu)"),
    ("Kế hoạch môn học tiếng Anh 2026–2027 (Excel)", "module_offering_plans"),
    ("Đề cương CTĐT 2025 (18 workbook Excel)", "program_catalog_entries, outline_resources; dựng CTĐT K25/K26"),
    ("Đề cương học phần dạng PDF (783 file)", "outline_documents và các bảng outline_*"),
    ("Danh mục văn bản quy chế (regulations/catalog.json)", "regulation_documents (regulation_chunks chưa nạp)"),
    ("Bảng đối chiếu tên Việt–Anh do chủ dự án cung cấp", "modules.name_en (api/seed/module_names_en.tsv)"),
    ("Ứng dụng web (đăng nhập, đánh giá, góp ý)", "users, reviews, feedback"),
]


def N(x) -> str:
    return f"{x:,}".replace(",", ".")  # dấu chấm phân cách hàng nghìn kiểu Việt


def short(v: str, n: int = 36) -> str:
    v = re.sub(r"\s+", " ", v)
    return v if len(v) <= n else v[: n - 1] + "…"


def md_cell(s: str) -> str:
    return s.replace("|", "\\|").replace("\n", " ")


def sql_type(t: str) -> str:
    t = t.upper().replace("TIMESTAMP WITH TIME ZONE", "TIMESTAMPTZ").replace("DOUBLE PRECISION", "DOUBLE")
    return t


def main() -> int:
    insp = inspect(engine)
    tables = sorted(t for t in insp.get_table_names() if t != "alembic_version")
    views = sorted(insp.get_view_names())
    info: dict[str, dict] = {}
    with engine.connect() as c:
        for t in tables:
            cols = insp.get_columns(t)
            pk = insp.get_pk_constraint(t).get("constrained_columns") or []
            fks = insp.get_foreign_keys(t)
            uq = [tuple(u["column_names"]) for u in insp.get_unique_constraints(t)]
            n = c.execute(text(f'select count(*) from "{t}"')).scalar()
            ex: dict[str, str] = {}
            if t not in NO_EXAMPLES:
                for col in cols:
                    if (t, col["name"]) in EXAMPLE_OVERRIDE:
                        ex[col["name"]] = EXAMPLE_OVERRIDE[(t, col["name"])]
                        continue
                    v = c.execute(text(f'select "{col["name"]}" from "{t}" where "{col["name"]}" is not null limit 1')).scalar()
                    if v is not None:
                        ex[col["name"]] = short(v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, default=str)
                                                if isinstance(v, (dict, list)) else str(v))
            info[t] = dict(cols=cols, pk=pk, fks=fks, uq=uq, rows=n, ex=ex)
        vinfo = {v: dict(cols=insp.get_columns(v), rows=c.execute(text(f'select count(*) from "{v}"')).scalar()) for v in views}

        def q(sql: str):
            return c.execute(text(sql)).scalar()

        stats = {
            "modules": q("select count(*) from modules"), "modules_en": q("select count(*) from modules where name_en is not null"),
            "class_no_sem": q("select count(*) from class_sections where semester_id is null"),
            "class_no_cohort": q("select count(*) from class_sections where cohorts is null or cohorts::text in ('[]','null')"),
            "eq_rows": q("select count(*) from equivalents"),
            "eq_in_modules": q("select count(*) from equivalents where equivalent_code in (select code from modules)"),
            "rel_equiv": q("select count(*) from module_relations where type='equivalent'"),
            "rel_equiv_ok": q("select count(*) from module_relations where type='equivalent' and source in (select code from modules)"),
            "rel_other_bad": q("select count(*) from module_relations where type<>'equivalent' and source !~ '^[A-Z]{1,4}[0-9]{2,5}[A-Z]?$'"),
            "rel_src_missing": q("select count(*) from module_relations where type<>'equivalent' and source not in (select code from modules)"),
            "prog_by_src": dict(c.execute(text("select coalesce(source,'?'), count(*) from programs group by 1 order by 1")).all()),
            "prog_by_cohort": dict(c.execute(text("select coalesce(cohort,'?'), count(*) from programs group by 1 order by 1")).all()),
            "pm_no_order": q("select count(*) from program_modules where suggested_order is null"),
            "pm_cat": q("select count(*) from program_modules where program_id in (select id from programs where source='catalog2025')"),
            "cat_junk_en": q("select count(*) from program_catalog_entries where module_name_en is not null and length(trim(module_name_en)) < 4"),
            "chunks": q("select count(*) from regulation_chunks"),
            "no_class_modules": q("select count(*) from modules where code not in (select module_code from class_sections)"),
            "alembic": q("select version_num from alembic_version"),
        }

    n_fk = sum(len(i["fks"]) for i in info.values())
    n_cols = sum(len(i["cols"]) for i in info.values())
    L: list[str] = []
    a = L.append
    a("# UELPATH — Từ điển dữ liệu (Data Dictionary)")
    a("")
    a("*Tra cứu học phần, thời khóa biểu, kế hoạch học tập, CTĐT, học phần tương đương và quy chế học vụ của Trường ĐH Kinh tế – Luật (UEL)*")
    a("")
    a(f"Phiên bản tài liệu {VERSION} · sinh tự động ngày {date.today().isoformat()} từ database PostgreSQL đang chạy (Alembic `{stats['alembic']}`). "
      "Tham chiếu độc lập cho database `uelplan` (tên giữ nguyên để không mất dữ liệu; thương hiệu là UELPATH). Số liệu và ví dụ lấy từ dữ liệu thật; "
      "thiết kế và vận hành xem `docs/DATABASE.md`.")
    a("")
    a("| Bảng vật lý | Trường vật lý | Ràng buộc khóa ngoại | View SQL |")
    a("|---:|---:|---:|---:|")
    a(f"| **{len(tables)}** | **{n_cols}** | **{n_fk}** | **{len(views)}** |")
    a("")
    a("## Nguồn dữ liệu")
    a("")
    a("| # | Nguồn | Dùng cho |")
    a("|---:|---|---|")
    for i, (s, u) in enumerate(SOURCES, 1):
        a(f"| {i} | {md_cell(s)} | {md_cell(u)} |")
    a("")
    a("## Lưu ý và cờ chất lượng dữ liệu")
    a("")
    pc = stats["prog_by_cohort"]
    a(f"- **Khác kỳ, khác đơn vị đo:** lớp học theo học kỳ (2025–2026 đến 2027–2028), CTĐT theo khóa (K23–K26), danh mục đề cương theo bản 2025. Không trộn các mốc này khi so sánh.")
    a(f"- **CTĐT K25/K26 là bản dựng giả định** từ danh mục Đề cương CTĐT 2025 (`programs.source = 'catalog2025'`, {stats['prog_by_src'].get('catalog2025', 0)} chương trình, {N(stats['pm_cat'])} dòng môn). Cổng portal chưa trả CTĐT K25/K26; K26 được coi giống K25 theo chủ dự án. Khi có dữ liệu cổng cùng mã thì `import-ctdt` ghi đè.")
    a(f"- **Tên tiếng Anh chưa đủ:** {N(stats['modules_en'])}/{N(stats['modules'])} học phần có `name_en`; phần còn lại giao diện hiển thị tên tiếng Việt. Cột `program_catalog_entries.module_name_en` có {N(stats['cat_junk_en'])} giá trị rác (vd `v`) — không dùng cột này để hiển thị.")
    a(f"- **Học phần tương đương không phủ toàn trường:** bảng `equivalents` có {N(stats['eq_rows'])} dòng, chỉ {N(stats['eq_in_modules'])} dòng có mã tương đương nằm trong `modules`. Endpoint nguồn chỉ trả dữ liệu của các CTĐT của tài khoản đã lấy; phần lớn cặp là mã cũ ↔ mã mới.")
    a(f"- **Quan hệ tương đương trong `module_relations` còn rác:** {N(stats['rel_equiv'])} cạnh `equivalent` (K23, K24) nhưng chỉ {N(stats['rel_equiv_ok'])} cạnh có `source` nằm trong `modules`. Nguyên nhân: chuỗi `equivalent_raw` dạng `EN03-Tiếng Anh 3 [5 TC]; EN13-…` bị tách thành mảnh (\"3\", \"C\", \"ANH\"…) ở bước nhập CTĐT. Không dùng các cạnh `equivalent` này cho tới khi sửa; dùng bảng `equivalents`. Các cạnh `prereq/previous/coreq` không có mã rác (đếm mã sai định dạng: {N(stats['rel_other_bad'])}).")
    a(f"- **Lớp học:** {N(stats['class_no_sem'])} lớp chưa suy ra học kỳ (`semester_id` NULL); {N(stats['class_no_cohort'])} lớp chưa suy ra khóa (`cohorts` rỗng); {N(stats['no_class_modules'])} học phần chưa từng có lớp.")
    a(f"- **Quy chế:** `regulation_chunks` có {N(stats['chunks'])} dòng (RAG chưa nạp vào DB).")
    a("- **View lệch cột:** `v_modules_english` / `v_modules_vietnamese` được tạo bằng `SELECT *` ở migration 0003 nên không có các cột thêm sau đó (`is_talent_program`, `name_en`, `name_en_source`); cần tạo lại view bằng migration mới nếu muốn dùng.")
    a("")

    a("## Tra cứu từng bảng")
    a("")
    a("Mỗi mục nêu một dòng là gì, khóa chính và số dòng hiện tại. Thẻ **PK** / **FK** / **UQ** là khóa chính, khóa ngoại, ràng buộc duy nhất. Ví dụ lấy từ dữ liệu thật (bảng chứa dữ liệu người dùng không có ví dụ).")
    a("")
    missing: list[str] = []
    num = 0
    for gtitle, tlist in GROUPS:
        a(f"### {gtitle}")
        a("")
        for t in tlist:
            if t not in info:
                missing.append(f"[bảng không có trong DB] {t}")
                continue
            num += 1
            i, m = info[t], META[t]
            fk_by_col = {col: f for f in i["fks"] for col in f["constrained_columns"]}
            uq_cols = {col for u in i["uq"] for col in u}
            a(f"#### {num:02d}. `{t}`")
            a("")
            a(f"**Một dòng:** {m['one_row']} **Khóa:** {m['key']}. **Số dòng hiện tại:** {N(i['rows'])}.")
            a("")
            a("| Cột | Kiểu / khóa | Ví dụ | Mô tả |")
            a("|---|---|---|---|")
            for col in i["cols"]:
                nm = col["name"]
                tags = [sql_type(str(col["type"]))]
                tags.append("NOT NULL" if not col["nullable"] else "NULL")
                if nm in i["pk"]:
                    tags.append("**PK**" if len(i["pk"]) == 1 else "**PK (phần)**")
                if nm in fk_by_col:
                    f = fk_by_col[nm]
                    tags.append(f"**FK** → {f['referred_table']}.{f['referred_columns'][0]}")
                if nm in uq_cols and nm not in i["pk"]:
                    tags.append("UQ")
                desc = COLS.get(t, {}).get(nm) or COMMON.get(nm)
                if not desc:
                    missing.append(f"{t}.{nm}")
                    desc = "(chưa có mô tả)"
                a(f"| `{nm}` | {md_cell(' · '.join(tags))} | {md_cell(i['ex'].get(nm, '—'))} | {md_cell(desc)} |")
            if i["uq"]:
                a("")
                a("Ràng buộc duy nhất: " + "; ".join("(" + ", ".join(u) + ")" for u in i["uq"]) + ".")
            if m.get("note"):
                a("")
                a(f"> {m['note']}")
            a("")

    a("## View SQL")
    a("")
    for v, vi in vinfo.items():
        a(f"### `{v}`")
        a("")
        a(f"Một dòng mỗi học phần có `language_track` tương ứng ({'en' if v.endswith('english') else 'vi'}). Số dòng hiện tại: {N(vi['rows'])}. Các cột: " + ", ".join(f"`{c['name']}`" for c in vi["cols"]) + ".")
        a("")
    a("> Hai view này là tiện ích đọc nhanh; ứng dụng không dựa vào chúng. Xem cờ \"View lệch cột\" ở đầu tài liệu.")
    a("")

    a("## Khóa ngoại và cách nối bảng an toàn")
    a("")
    a(f"{n_fk} ràng buộc khóa ngoại được ép ở mức database:")
    a("")
    a("| Bảng con (cột) | Bảng cha (cột) | Khi xóa cha |")
    a("|---|---|---|")
    for t in tables:
        for f in info[t]["fks"]:
            od = (f.get("options") or {}).get("ondelete") or "NO ACTION"
            a(f"| `{t}` ({', '.join(f['constrained_columns'])}) | `{f['referred_table']}` ({', '.join(f['referred_columns'])}) | {od} |")
    a("")
    a("**Liên kết mềm (không ép khóa ngoại, có thể mồ côi):** `module_relations.source/target`, `equivalents.code/equivalent_code`, `program_catalog_entries.module_code`, "
      "`outline_module_links.module_code`, `regulation_documents.superseded_by`, `lessons` ↔ tên phòng chỉ ép tới `venues.room`. Khi nối qua các cột này dùng LEFT JOIN và chịu được thiếu tên môn.")
    a("")
    a("### Bản đồ nối nhanh")
    a("")
    a("| Câu hỏi | Đường nối khuyến nghị |")
    a("|---|---|")
    for qn, path in [
        ("Lịch một lớp", "`class_sections` → `lessons` (class_id) → `venues` (room); học kỳ qua `semesters` (semester_id, có thể NULL)."),
        ("Lớp mở của một học phần", "`modules` → `class_sections` (module_code), lọc `semester_id`."),
        ("Môn trong một CTĐT", "`programs` → `program_modules` (program_id) → `modules` (module_code); thứ tự kỳ theo `suggested_order`."),
        ("Cây tiên quyết/học trước", "`module_relations` lọc `program_id` và `type IN ('prereq','previous','coreq')`; hoặc dùng `*_tree` của `program_modules`."),
        ("Học phần tương đương", "`equivalents` (hai chiều: code ↔ equivalent_code); không dùng cạnh `equivalent` của `module_relations` (còn rác)."),
        ("Đề cương của một môn", "`outline_module_links` (module_code) → `outline_documents` → `outline_courses` / `outline_sections` / `outline_clos`…"),
        ("Tên tiếng Anh", "`modules.name_en` (NULL → dùng `modules.name`); khoa/bộ môn dịch ở phía web (không có cột trong DB)."),
        ("Quy chế theo khóa", "`regulation_documents.applies_to_cohorts` (JSONB) và `effective_from/to`; nội dung Điều/Khoản qua RAG (chưa vào `regulation_chunks`)."),
    ]:
        a(f"| {qn} | {path} |")
    a("")
    a("### Quy tắc diễn giải")
    a("")
    for r in [
        "**Khóa:** `K22` = tuyển sinh 2022 (2 số cuối năm). Quy định ghi áp dụng khóa nào thì chỉ áp dụng khóa đó.",
        "**CTĐT từ catalog (K25, K26):** mã = `K25`/`K26` + mã ngành theo K24 cùng tên; riêng `…402` (Kinh tế quốc tế) là suy đoán từ K24402 (Kinh tế đối ngoại). Ngành chưa rõ mã dùng mã chữ (`K25LUAT`, `K25LKT`, `K25KDNNS`, `K25KDTMHQ`, `K25KTDD`); các bản phụ của một ngành có hậu tố `-V2`, `-V3`.",
        "**`HK01…HK10` trong catalog chỉ là thứ tự học kỳ**, không phải học kỳ có năm học: `suggested_semester` để NULL và thứ tự nằm ở `suggested_order`.",
        "**Bắt buộc:** với CTĐT từ catalog, `X` = bắt buộc; ô trống = không đánh dấu bắt buộc (tự chọn hoặc chưa rõ), không suy diễn thêm.",
        "**Học trước của catalog:** chỉ giữ mã trong ngoặc vuông (`[BAA2028]…` → `BAA2028`); văn bản tự do không có mã bị bỏ. Các mã nối bằng dấu phẩy được hiểu theo cùng quy ước với dữ liệu cổng.",
        "**Thiếu dữ liệu là NULL, không phải 0.** `NULL` ở `name_en`, `semester_id`, `cohorts` nghĩa là chưa có nguồn/chưa suy ra được.",
        "**Dữ liệu số quyết định/ngày của quy chế không được bịa:** để NULL khi không đọc được trong văn bản (`verified = false`).",
        "**Dữ liệu cá nhân** (`users`, `reviews`, `feedback`, TKB cá nhân) không đưa vào tài liệu, ví dụ hay commit.",
    ]:
        a(f"- {r}")
    a("")
    OUT.write_text("\n".join(L), encoding="utf-8")
    print(f"ghi {OUT} ({len(L)} dòng): {len(tables)} bảng, {n_cols} cột, {n_fk} FK, {len(views)} view")
    if missing:
        print("THIẾU MÔ TẢ:", ", ".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
