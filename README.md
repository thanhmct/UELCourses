# UELCourses — Nền tảng Kế hoạch Học tập & Trợ lý Quy chế UEL

> **UELCourses** là nền tảng số hỗ trợ sinh viên Trường Đại học Kinh tế – Luật (ĐHQG-HCM) trong việc tra cứu học phần, thiết kế lộ trình học tập, xếp thời khóa biểu không trùng lịch và tra cứu quy chế học vụ qua trợ lý AI trích dẫn chính xác.

---

## 📌 Danh mục Nguồn Dữ Liệu & Liên Kết Thu Thập (Crawl Data)

Dưới đây là tổng hợp toàn bộ các đường link, nguồn dữ liệu và API đã được sử dụng để khảo sát, trích xuất và nạp dữ liệu cho dự án UELCourses:

### 1. Chương trình đào tạo (CTĐT) & Đề cương môn học (Google Drive)
*Theo đúng yêu cầu, dữ liệu CTĐT và đề cương chi tiết được tiếp nhận và dẫn chiếu qua nguồn Google Drive:*

- **Tệp gốc lưu trữ bộ 18 CTĐT Đại học chính quy 2025**:
  - Gói tài liệu Google Drive chia sẻ nội bộ: `1. FILE ĐỀ CƯƠNG THEO CTĐT ĐH 2025` (gồm 18 file Excel đề cương các ngành: Hệ thống thông tin quản lý, Kinh tế, Tài chính – Ngân hàng, Kế toán, Quản trị kinh doanh, Luật...).
- **Các liên kết Google Drive / Google Docs chia sẻ đề cương chi tiết học phần**:
  - [Google Drive Folder] Đề cương chuyên ngành Thương mại điện tử: [https://drive.google.com/drive/folders/1bb-4U-qkrUmtsv9X_fh9NHSGqgMi_qpu](https://drive.google.com/drive/folders/1bb-4U-qkrUmtsv9X_fh9NHSGqgMi_qpu)
  - [Google Drive Folder] Đề cương môn Quản lý dự án HTTT: [https://drive.google.com/drive/folders/192VzZBSJa4UFX0pWt2EXr8batyXoxRuO](https://drive.google.com/drive/folders/192VzZBSJa4UFX0pWt2EXr8batyXoxRuO)
  - [Google Drive File] Đề cương Pháp luật về Thương mại điện tử: [https://drive.google.com/file/d/1-p4G-ed6vrC0EkH2_cwI2yzK74AkWVT1/view?usp=sharing](https://drive.google.com/file/d/1-p4G-ed6vrC0EkH2_cwI2yzK74AkWVT1/view?usp=sharing)
  - [Google Drive File] Đề cương Quản trị mua hàng toàn cầu: [https://drive.google.com/file/d/1ZMcOm1dT1S6vXdCvqtYvcBv6lv3drPRc/view?usp=sharing](https://drive.google.com/file/d/1ZMcOm1dT1S6vXdCvqtYvcBv6lv3drPRc/view?usp=sharing)
  - [Google Drive File] Đề cương Quản lý dự án đầu tư: [https://drive.google.com/file/d/1LYwQ8kYvjU4mENiq6EiUobfDi0Q-5Fe0/view?usp=drive_link](https://drive.google.com/file/d/1LYwQ8kYvjU4mENiq6EiUobfDi0Q-5Fe0/view?usp=drive_link)
  - *Xem danh sách đầy đủ 28 liên kết Google Docs đề cương các môn bổ sung tại [data/outlines_2025/additional_access_required.md](data/outlines_2025/additional_access_required.md).*

---

### 2. Cộng đồng Sinh viên UEL & Khảo sát Nhu cầu (Design Thinking)
- **Group Facebook Sinh viên UEL**: [https://www.facebook.com/groups/434618089935655/](https://www.facebook.com/groups/434618089935655/)
  - Nguồn theo dõi thực tế các vấn đề sinh viên UEL thường gặp trong các đợt ĐKHP (trùng lịch, cháy lớp, thắc mắc môn tiên quyết / học trước).
  - Thu thập insight người dùng cho giai đoạn Empathize & Define theo quy trình Design Thinking (`research/`).
- **Cổng thông tin Trường Đại học Kinh tế – Luật**: [https://www.uel.edu.vn](https://www.uel.edu.vn)

---

### 3. Dữ liệu Lớp học phần & Thời khóa biểu
- **Google Sheets Kế hoạch mở lớp học phần dự kiến Năm học 2026–2027**:
  - [Google Sheet] [Danh sách học phần dự kiến mở Năm học 2026-2027 (có thể thay đổi, cập nhật thường xuyên)](https://docs.google.com/spreadsheets/d/1ES4AQqMeP3_WvHCxwxjhyDcHqKythipSKjbrJs-aDKA/edit?usp=drivesdk)
  - Dữ liệu thu thập: 3.127 lớp học phần dự kiến mở trong 3 học kỳ (HK1, HK2, HK3) năm học 2026–2027 cho 798 học phần, phân bổ theo khóa/lớp sinh viên.
  - File trích xuất lưu tại: `data/raw/DanhSachHocPhan_DuKienMo_2026_2027.xlsx`, `data/courses_2026_2027_planned.json`, `data/courses_2026_2027_planned.csv`.
- **API Cổng Đăng ký học phần UEL**:
  - Endpoint: `POST https://dkhpapi.uel.edu.vn/api/Schedule/GetAllScheduleStudyUnit`
  - Cổng ĐKHP trực tuyến: [https://dkhp.uel.edu.vn](https://dkhp.uel.edu.vn)
  - Dữ liệu thu thập: Mã lớp học phần, tên môn học, số tín chỉ, giảng viên, sức chứa, sĩ số đăng ký, phòng học, thứ và tiết học.
  - Script trích xuất tự động: `fetch_courses.py` (tham khảo tài liệu chi tiết tại [UEL_DKHP_API.md](UEL_DKHP_API.md)).

---

### 4. Dữ liệu Học phần tương đương
- **API Cổng Thông tin đào tạo sinh viên UEL**:
  - Endpoint: `GET https://portal.uel.edu.vn/backend/api/student/equivalentcourse`
  - Dữ liệu thu thập: Mã môn gốc, Tên môn, Số tín chỉ, Mã môn tương đương thay thế, Tên môn tương đương, Số tín chỉ tương đương.

---

### 5. Văn bản Quy chế học vụ & Quy định Đào tạo
- **Phòng Đào tạo UEL**: [https://pdt.uel.edu.vn/](https://pdt.uel.edu.vn/)
  - Quy chế đào tạo đại học chính quy (QĐ 1268/QĐ-ĐHKTL, QĐ 2261/QĐ-ĐHKTL, QĐ 118/QĐ-ĐHKTL...).
  - Quy định chuẩn đầu ra ngoại ngữ, tin học, quy chế đánh giá điểm rèn luyện và công tác sinh viên.
- **Đại học Quốc gia TP.HCM (VNU-HCM)**: [https://vnuhcm.edu.vn/](https://vnuhcm.edu.vn/)
  - Khung quy chế đào tạo tín chỉ và các quyết định liên thông trong hệ thống ĐHQG.
- **Bộ Giáo dục & Đào tạo**: [https://moet.gov.vn/](https://moet.gov.vn/)
  - Thông tư 08/2021/TT-BGDĐT ban hành Quy chế đào tạo trình độ đại học.

---

## 🚀 Các Tính Năng Cốt Lõi Của UELCourses

1. **Tra cứu học phần ([`/modules`](web/src/app/modules/page.tsx))**:
   - Tìm kiếm theo mã/tên môn không dấu, lọc theo số tín chỉ, loại môn, khoa quản lý, môn dạy bằng tiếng Anh.
   - Chi tiết môn: Cây quan hệ 2 chiều (tiên quyết & mở khóa), định lượng khối lượng giờ học/tuần (`Workload Breakdown`), danh sách lớp mở và chỗ trống.
   - **Đánh giá & Review môn học**: Sinh viên chia sẻ kinh nghiệm, độ khó, khối lượng và vote hữu ích.
2. **Sơ đồ Chương trình đào tạo ([`/programs`](web/src/app/programs/page.tsx))**:
   - Tra cứu 86 CTĐT chính quy, sơ đồ Flowchart node-based trực quan theo học kỳ (`@xyflow/react`), kiểm tra điều kiện *Đã đạt / Đủ điều kiện / Bị chặn*.
3. **Xếp Thời khóa biểu ([`/timetable`](web/src/app/timetable/page.tsx))**:
   - Lưới Thứ 2–CN × Tiết 1–13, phát hiện và tô đỏ trùng lịch.
   - Kéo-thả đổi lớp cùng môn, chia sẻ qua URL, xuất ảnh PNG và file lịch `.ics`.
   - **Nhiều kịch bản TKB dự phòng (Multiple Drafts)**: Quản lý Phương án 1, Phương án 2 và nhân bản kịch bản.
   - **Đồng bộ Webcal trực tiếp (Live Sync)**: Đồng bộ tự động vào Google Calendar, Apple Calendar, Outlook.
4. **Kế hoạch nhiều học kỳ & GPA ([`/planner`](web/src/app/planner/page.tsx))**:
   - Bảng kéo thả môn giữa các học kỳ, kiểm tra ràng buộc tiên quyết.
   - **Bộ tính điểm GPA / CAP**: Quy đổi thang điểm 4.0 và 10.0 UEL, tính GPA kỳ, CPA tích lũy và mô phỏng mục tiêu tốt nghiệp (Target Simulator).
5. **Lịch học hôm nay & PWA ([`/today`](web/src/app/today/page.tsx))**:
   - Xem nhanh tiết học đang diễn ra, đếm ngược ca học tiếp theo, phòng học và giảng viên.
   - Hoạt động ngoại tuyến (Offline PWA) với Service Worker và Web App Manifest.
6. **Phòng học ([`/venues`](web/src/app/venues/page.tsx)) & Học phần tương đương ([`/equivalents`](web/src/app/equivalents/page.tsx))**:
   - Xem lịch phòng và tìm phòng trống tự học theo khung giờ. Bảng tra cứu môn tương đương portal.
7. **Trợ lý AI Quy chế học vụ ([`/regulations`](web/src/app/regulations/page.tsx))**:
   - Giao diện Obsidian vault Markdown với wikilinks, so sánh quy chế giữa các khóa SV, cảnh báo văn bản hết hiệu lực.
   - Chatbot AI trích dẫn nguyên văn số Quyết định, Điều, Khoản (không bịa thông tin).

---

## 💻 Cài Đặt & Chạy Ứng Dụng

### Cách 1: Chạy bằng Docker (Khuyến nghị cho cả nhóm)

Xem hướng dẫn chi tiết tại [DEPLOY.md](DEPLOY.md):

```bash
# Khởi động cả web (Next.js) và backend (FastAPI + Postgres)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```
- Frontend: `http://localhost:3000`
- Backend API Docs: `http://localhost:8000/docs`

### Cách 2: Chạy trực tiếp ngoài Docker

**Frontend (Next.js 15):**
```bash
cd web
npm install
npm run dev        # Chạy môi trường development
npm run build      # Biên dịch production build
npm test           # Chạy unit tests (Vitest)
```

**Backend (FastAPI):**
```bash
cd api
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --reload
```
