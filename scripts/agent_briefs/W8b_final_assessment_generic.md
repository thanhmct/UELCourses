# Brief W8b — Hình thức thi: không suy đoán "Thi viết" khi đề cương chỉ ghi chung là "thi"

Không chạy lệnh shell, không commit. Chủ dự án chạy `cd web; npx tsc --noEmit; npx vitest run`.

Tệp: `web/src/lib/finalAssessment.ts` (re-export ở `web/src/app/timetable/finalAssessment.ts`), test `web/src/app/timetable/__tests__/finalAssessment.test.ts`.

Vấn đề: W8 làm nhánh "thi chung" (exam/test/thi/bài thi/hình thức thi/thi kết thúc, khoảng dòng 134-144) trả `"Thi viết"` — đó là suy đoán, sai nguyên tắc "chỉ dựa vào đề cương". Test hiện có (đang đỏ: expected 'Thi viết' to be 'Thi') kỳ vọng `"Thi"` cho các ca chung.

Sửa:
1. Nhánh thi chung trả `"Thi"` (giữ loại `"Thi"` trong `FinalAssessmentKind`). `formatFinalAssessment`: `"Thi"` → VI "Thi", EN "Exam" (KHÔNG gộp vào "Thi viết"/"Written exam"). Các loại cụ thể (Thi viết do ghi rõ tự luận/thi viết/written; Thi trắc nghiệm; Vấn đáp; Đồ án; Tiểu luận) giữ nguyên.
2. Rà test `finalAssessment.test.ts`: các assert phải khớp hành vi đúng: chỉ khi văn bản có từ khóa cụ thể mới ra loại cụ thể; ca "Thi kết thúc học phần" chung → "Thi"; ca có chữ "trắc nghiệm" → "Thi trắc nghiệm"; ca "vấn đáp" → "Vấn đáp"; v.v. Sửa các assert cũ đang kỳ vọng "Thi" cho những ca có từ khóa cụ thể (đây là test cũ lỗi thời), và thêm ca kiểm tra `formatFinalAssessment` cho "Thi"/"Exam". Kiểm tra các test khác dùng `formatFinalAssessment`/hiển thị `3 TC · Thi viết` (modules, timetable) vẫn khớp.

Báo cáo cuối: file thay đổi.
