# UELCourses Frontend (web/)

Frontend Next.js 15 của dự án UELCourses — Nền tảng lập kế hoạch học tập, xếp thời khóa biểu và tra cứu quy chế dành cho sinh viên Trường Đại học Kinh tế – Luật (UEL).

## 🚀 Tính năng đã hoàn thiện

1. **Trang chủ (`/`)**:
   - Giới thiệu tổng quan các phân hệ, điều hướng nhanh tới Thời khóa biểu, Quy chế, CTĐT, Kế hoạch.

2. **Tra cứu & Chi tiết học phần (`/modules`, `/modules/[code]`)**:
   - Tìm kiếm học phần theo mã, tên; lọc theo khoa quản lý, số tín chỉ, loại môn (bắt buộc/tự chọn/điều kiện), môn giảng dạy bằng tiếng Anh.
   - **Cây quan hệ học phần trực quan 2 chiều (Prerequisite Tree)**: Chuyển đổi giữa *Điều kiện cần (Học phần cần học trước / Tiên quyết)* và *Mở khóa môn sau (Học phần mở khóa)* với độ sâu tùy biến, phân biệt rõ quan hệ Tiên quyết (phải đạt), Học trước (đã học), Song hành.
   - Bảng các lớp học phần mở trong từng học kỳ: mã lớp, lịch học, giảng viên, sĩ số / chỗ trống, thời gian học.
   - Học phần tương đương và kế hoạch dự kiến mở môn.
   - Thao tác nhanh: thêm vào Thời khóa biểu (`+ Thời khóa biểu`) hoặc thêm vào Kế hoạch (`+ Kế hoạch`).

3. **Chương trình đào tạo & Sơ đồ lộ trình (`/programs`, `/programs/[id]`)**:
   - Danh mục tra cứu đầy đủ 86 chương trình đào tạo của UEL qua các khóa tuyển sinh (K19 – K26) và các khoa.
   - **Sơ đồ Flowchart tương tác (`@xyflow/react` + `@dagrejs/dagre`)**: Tự động dàn trang theo học kỳ (HK1 – HK8), phân màu theo khối kiến thức, hiển thị đường nối trực quan (nét liền cho tiên quyết, nét đứt cho học trước, chấm tròn cho song hành).
   - Bộ lọc sơ đồ theo học kỳ, khối kiến thức, tìm kiếm môn và làm nổi bật chuỗi phụ thuộc (`relatedChain`).
   - Bảng danh mục theo khối kiến thức (Đại cương, Cơ sở ngành, Chuyên ngành...) với số tín chỉ bắt buộc của từng khối.
   - **Đối chiếu kế hoạch cá nhân (Check Eligibility)**: Tự động kiểm tra danh sách môn của sinh viên với CTĐT để phát hiện các môn đủ điều kiện học ngay và các môn đang bị chặn do thiếu tiên quyết.
   - Bảng thông tin học phần bên phải (Sidebar drawer): xem chi tiết, điều kiện mở khóa, và thêm nhanh vào TKB/Kế hoạch.

4. **Thời khóa biểu thông minh (`/timetable`)**:
   - Lưới lịch trực quan Thứ 2 – Chủ nhật &times; tiết 1 – 13.
   - Phát hiện và tô màu cảnh báo trùng lịch học.
   - Kéo-thả khối lịch để xem các lớp thay thế cùng môn và chọn đổi lớp nhanh.
   - Bật/tắt ẩn môn, đổi màu sắc theo bảng màu sinh động, tính tổng tín chỉ tự động.
   - Chia sẻ thời khóa biểu qua liên kết (URL params) và nhập TKB từ link chia sẻ.
   - Xuất thời khóa biểu ra file ảnh **PNG** chất lượng cao và file lịch **.ics** để đồng bộ vào Google Calendar / Apple Calendar.

5. **Lập kế hoạch nhiều học kỳ (`/planner`)**:
   - Kéo-thả học phần giữa các học kỳ hoặc đưa vào danh sách chờ (backlog).
   - Phân loại trạng thái học phần trực quan:
     - 🟢 **Đã đạt**: Môn đã hoàn thành.
     - 🔵 **Đủ điều kiện**: Đã thỏa mãn tất cả các môn tiên quyết.
     - 🔴 **Bị chặn**: Xếp vào kỳ khi chưa hoàn thành môn tiên quyết ở các kỳ trước (kèm cảnh báo chi tiết).
   - Tính tổng tín chỉ theo từng kỳ, đánh giá tải học tập (bình thường, quá thấp, quá tải).
   - Gợi ý và thay thế nhanh môn học bằng học phần tương đương.

6. **Phòng học (`/venues`)**:
   - Tra cứu phòng học, xem lịch sử dụng phòng theo ngày và khung giờ.
   - Tìm kiếm phòng học còn trống theo tiết và thứ trong tuần.

7. **Học phần tương đương (`/equivalents`)**:
   - Tra cứu danh mục học phần thay thế/tương đương của UEL, nhóm theo môn gốc.

8. **Quy chế học vụ & Không gian văn bản (`/regulations`, `/regulations/[docId]`, `/regulations/graph`)**:
   - Cây thư mục văn bản quy chế theo chủ đề, cấp ban hành, trạng thái hiệu lực (Đang có hiệu lực, Sắp hết hiệu lực, Hết hiệu lực, Bị thay thế).
   - Trình đọc văn bản Markdown chuẩn hóa Obsidian vault với anchor Điều/Khoản, hover preview, panel backlinks.
   - Khung **Hỏi AI quy chế** (chế độ extractive BM25 trích dẫn nguyên văn Điều/Khoản, không bịa nguồn).
   - Tab **So sánh quy định giữa các khóa** (K22, K23, K24...).
   - **Đồ thị quan hệ văn bản (`/regulations/graph`)**: Trực quan hóa quan hệ thay thế, sửa đổi, dẫn chiếu, hướng dẫn bằng force-directed graph 2D.

9. **Cài đặt & Widget phản hồi (`/settings`)**:
   - Tùy chọn khóa tuyển sinh (K19 – K26) để tự động lọc quy chế và CTĐT phù hợp.
   - Chế độ sáng / tối (Dark Mode).
   - Widget **Góp ý** nổi ở mọi trang hỗ trợ gửi đánh giá 1–5 sao và phản hồi (tự động lưu hàng đợi cục bộ nếu offline).

## 🛠️ Công nghệ sử dụng

- **Framework**: Next.js 15 (App Router, TypeScript, React 19)
- **Styling**: Tailwind CSS
- **Interactive Graphs & Flowcharts**: `@xyflow/react`, `@dagrejs/dagre`, `react-force-graph-2d`
- **Drag & Drop**: `@dnd-kit/core`
- **State Management**: Zustand (kèm persist localStorage)
- **Exporting**: `html-to-image` (PNG), custom RFC 5545 generator (.ics)
- **Testing**: Vitest + Testing Library

## 💻 Hướng dẫn chạy và kiểm thử

### Cài đặt dependencies:
```bash
npm install
```

### Chạy dev server:
```bash
npm run dev
```
Truy cập ứng dụng tại `http://localhost:3000`. Khi backend FastAPI chưa chạy, hệ thống tự động kích hoạt chế độ Fallback Mock Data để toàn bộ giao diện và chức năng vẫn demo mượt mà.

### Chạy kiểm thử:
```bash
npm test
```

### Build kiểm tra production:
```bash
npm run build
```
