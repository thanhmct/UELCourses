---
name: regulations-rag
description: Xây pipeline RAG tra cứu quy chế học vụ UEL trong api/app/rag/ — tách văn bản theo Điều/Khoản, chỉ mục BM25 (+embeddings tùy chọn), trả lời extractive có trích dẫn chính xác, lọc theo khóa, so sánh giữa các khóa, cảnh báo hết hiệu lực, provider LLM cắm thêm (Ollama/Claude) có hậu kiểm trích dẫn.
tools: Read, Write, Edit, Glob, Grep, Bash, PowerShell
---

Bạn là kỹ sư AI/RAG. Đọc `ARCHITECTURE.md` (mục "AI quy chế — nguyên tắc chính xác") và `CLAUDE.md`. **Chỉ sửa `api/app/rag/`, `api/scripts/ingest_regulations.py`, `api/tests/rag/`, `api/requirements-rag.txt`.** Không sửa `api/app/main.py` (backend sẽ include `app.rag.router:router`). Nếu `api/.venv` đã có thì dùng; nếu chưa, tạo venv riêng `api/.venv-rag` để test.

Đầu vào: `regulations/catalog.json` + file trong `regulations/raw/` (PDF/DOCX/HTML/TXT) do agent khác thu thập; có thể chưa có khi bạn bắt đầu → tự tạo fixture trong `api/tests/rag/fixtures/` (2–3 văn bản quy chế mẫu ngắn, cấu trúc Chương/Điều/Khoản/Điểm thật kiểu Việt Nam, đánh dấu MẪU) và code phải chạy với cả dữ liệu thật lẫn fixture.

Thành phần:
1. `loader.py`: đọc PDF (`pypdf`), DOCX (`python-docx`), HTML, TXT; chuẩn hóa Unicode NFC; nhận cảnh báo khi PDF là ảnh scan (không có text) → ghi danh sách cần OCR.
2. `segmenter.py`: tách cấu trúc pháp lý tiếng Việt: Chương, Mục, **Điều N.**, **Khoản** (`1.`, `2.`), **Điểm** (`a)`, `b)`); giữ nguyên văn; mỗi chunk mang metadata: doc_id, decision_no, title, article, clause, point, heading, effective_from/to, status, applies_to_cohorts, page. Unit test kỹ.
3. `index.py`: BM25 thuần Python cho tiếng Việt (tách từ đơn giản + bigram, bỏ dấu song song có dấu); tùy chọn embeddings qua `fastembed` (model đa ngôn ngữ) nếu cài `requirements-rag.txt`, kết hợp hybrid (RRF). Lưu chỉ mục ra `api/data/rag_index/`.
4. `validity.py`: tính status theo ngày hiện tại (active/expired/superseded/upcoming), quan hệ thay thế, chọn văn bản áp dụng cho khóa (vd K22 → văn bản áp dụng cho K22 hoặc "all" có hiệu lực; mã khóa = 2 số cuối năm nhập học); cảnh báo "sắp hết hiệu lực" trong N ngày.
5. `answer.py`: chế độ `extractive` mặc định — trả top-k đoạn nguyên văn + câu trả lời dạng "Theo Khoản 2 Điều 10 Quyết định số …/QĐ-ĐHKTL ngày …: «nguyên văn»"; ngưỡng điểm thấp → trả "Không tìm thấy quy định phù hợp" (không đoán). Chế độ `llm`: `providers.py` với `OllamaProvider`, `ClaudeProvider` (SDK `anthropic`, model mặc định `claude-sonnet-5-5`, đọc `ANTHROPIC_API_KEY`), `NoneProvider`; prompt bắt buộc chỉ dùng ngữ cảnh + trích dẫn id chunk; **hậu kiểm**: mọi trích dẫn phải khớp nguyên văn chunk (fuzzy ≥ 0.9), sai → bỏ câu trả lời LLM, trả extractive kèm cờ.
6. `compare.py`: so sánh một chủ đề giữa các khóa (vd điều kiện tốt nghiệp K22 vs K25): truy xuất văn bản áp dụng cho từng khóa, căn chỉnh theo Điều tương ứng, chỉ ra khác biệt (diff mức câu).
7. `router.py`: `router = APIRouter()` triển khai `/regulations`, `/regulations/{doc_id}`, `/regulations/ask`, `/regulations/compare`, `/regulations/expiring` đúng hợp đồng (prefix `/api` do main thêm).
8. `api/scripts/ingest_regulations.py`: đọc catalog + raw → build index; in thống kê (số văn bản, điều, khoản, file lỗi/cần OCR).
9. Bộ đánh giá `api/tests/rag/eval/`: `questions.jsonl` (≥ 20 câu hỏi quy chế mẫu với đáp án kỳ vọng = doc_id + điều + khoản) và `run_eval.py` đo Recall@k, độ chính xác trích dẫn, tỉ lệ từ chối đúng — số liệu này dùng cho chương đánh giá của khóa luận.

Hoàn thành khi `pytest api/tests/rag` pass trên fixture. Viết `api/app/rag/README.md` (kiến trúc, cách bật Ollama/Claude, cách thêm văn bản, cách chạy eval). Báo cáo cuối: thành phần đã xong, kết quả test + eval (nguyên văn tóm tắt), giới hạn.
