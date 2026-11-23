# Brief W6 — Đổi chương trình đào tạo trong hộp thoại thì filter phải áp dụng lại ngay

Bạn tự tìm file liên quan, không cần hỏi lại. Gợi ý: hộp thoại `web/src/components/ProgramProfileDialog.tsx` (nút "Lưu thông tin"), kho trạng thái `web/src/lib/store.ts` (`useSettings`: `programCode`, mã ngành 2…), hook `web/src/lib/myProgram.ts` (`useMyProgramId`), và các trang dùng CTĐT để lọc: `web/src/app/modules/page.tsx` (state `programId`, có `useEffect` đồng bộ khi mở trang bằng `?program=`), `web/src/app/timetable/page.tsx` (+ `TimetableModuleSearch.tsx`), `web/src/app/planner/page.tsx`, `web/src/app/programs/page.tsx`, `web/src/app/modules/[code]/page.tsx` (cây quan hệ theo CTĐT), `web/src/app/venues/page.tsx` nếu có lọc. Được sửa các file đó, `Header.tsx` nếu cần, và thêm test trong `__tests__`. Không sửa backend, không commit, TUYỆT ĐỐI không chạy lệnh shell (chỉ đọc/sửa file).

## Hiện trạng (lỗi chủ dự án báo)
Sau khi nhập mã lớp (vd ngành chính `K25404E`, ngành 2 `K25406`) và bấm **Lưu thông tin**, các trang đang mở KHÔNG lọc lại theo chương trình mới: danh sách học phần, thời khóa biểu (ô tìm môn, chế độ Ngành 1/2/Cả hai, lọc mã E), kế hoạch, danh sách CTĐT vẫn hiện theo dữ liệu cũ cho đến khi tải lại trang.

## Yêu cầu
1. Lưu hộp thoại (và đổi/xóa ngành 2, "Xóa ngành 2", đổi mã ở Cài đặt) phải **cập nhật store ngay** và mọi trang đang mở phải **tự lọc lại** (không cần F5): dùng selector zustand (`useSettings`) trong mọi trang liên quan để state cục bộ phụ thuộc (`programId`, bộ lọc, bộ chọn Ngành 1/2) được đặt lại từ mã mới; sửa các `useState` khởi tạo một lần từ mã cũ (chỉ chạy lúc mount) thành đồng bộ khi mã đổi. Giữ ngoại lệ: nếu URL có `?program=` rõ ràng thì ưu tiên URL cho đến khi người dùng đổi mã.
2. Khi đổi mã: bỏ chọn các lựa chọn không còn hợp lệ (vd học kỳ/lớp đã chọn thuộc CTĐT cũ không còn trong CTĐT mới), nhưng KHÔNG xóa thời khóa biểu đã lưu của người dùng; đặt lại trang về trang 1 của danh sách; đặt lại chế độ Ngành 1/2/Cả hai về hợp lệ (nếu bỏ ngành 2 thì về "Ngành 1").
3. Đảm bảo dữ liệu gọi API (`api.programs()`, `api.program(id)`, lọc học phần theo `program`) phụ thuộc đúng vào mã mới (khóa của `useApi`/deps có mã mới) để không dùng cache cũ.
4. Hiển thị phản hồi nhẹ sau khi lưu: toast/dòng "Đã áp dụng chương trình mới" (vi) / "Programme updated" (en) nếu đã có thành phần thông báo trong dự án; nếu chưa có thì bỏ qua.
5. Test (Vitest + Testing Library): thay đổi `programCode` trong `useSettings` khi trang `modules` (hoặc component lọc dùng chung) đang render → danh sách/bộ lọc đổi theo mã mới mà không remount; đổi ngành 2 → `Cả hai` cập nhật; xóa ngành 2 → chế độ về Ngành 1. Nhớ `cleanup()` trong `afterEach` và dùng `within`/`role` thay `getByText` mơ hồ.

Tiêu chí xong (chủ dự án sẽ chạy kiểm tra, không phải bạn): `cd web; npx tsc --noEmit` sạch, `npx vitest run` toàn bộ qua. Trong báo cáo cuối liệt kê từng trang đã sửa và cách đồng bộ.
