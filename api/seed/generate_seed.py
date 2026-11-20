"""Sinh dữ liệu MẪU (không phải dữ liệu thật của UEL) cho api/seed/*.json.

Chạy lại: .venv\\Scripts\\python seed\\generate_seed.py  (từ thư mục api/)
Kết quả cố định (random seed cố định) để diff dễ đọc.
Mã học phần, giảng viên, phòng đều là GIẢ ĐỊNH, chỉ để phát triển giao diện.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent
rng = random.Random(2026)

SEMESTERS = [
    {"id": "2026-2027-1", "name": "Học kỳ 1, năm học 2026–2027", "year": "2026-2027", "term": 1,
     "start_date": "2026-09-07", "end_date": "2026-12-27"},
    {"id": "2026-2027-2", "name": "Học kỳ 2, năm học 2026–2027", "year": "2026-2027", "term": 2,
     "start_date": "2027-01-18", "end_date": "2027-05-30"},
]

# (mã, tên, tín chỉ, loại, khoa, tiên quyết, mô tả ngắn)
MODULES = [
    ("SAMPLE.LLCT101", "Triết học Mác – Lênin", 3, "Bắt buộc", "Khoa Lý luận chính trị", [], "Thế giới quan và phương pháp luận duy vật biện chứng."),
    ("SAMPLE.LLCT102", "Kinh tế chính trị Mác – Lênin", 2, "Bắt buộc", "Khoa Lý luận chính trị", ["SAMPLE.LLCT101"], "Các phạm trù, quy luật kinh tế cơ bản."),
    ("SAMPLE.LLCT103", "Chủ nghĩa xã hội khoa học", 2, "Bắt buộc", "Khoa Lý luận chính trị", ["SAMPLE.LLCT102"], None),
    ("SAMPLE.LLCT104", "Tư tưởng Hồ Chí Minh", 2, "Bắt buộc", "Khoa Lý luận chính trị", [], None),
    ("SAMPLE.LLCT105", "Lịch sử Đảng Cộng sản Việt Nam", 2, "Bắt buộc", "Khoa Lý luận chính trị", [], None),
    ("SAMPLE.PL101", "Pháp luật đại cương", 2, "Bắt buộc", "Khoa Luật", [], "Những vấn đề cơ bản về nhà nước và pháp luật."),
    ("SAMPLE.TOAN101", "Toán cao cấp", 3, "Bắt buộc", "Khoa Toán kinh tế", [], "Giải tích và đại số tuyến tính cho khối kinh tế."),
    ("SAMPLE.TOAN102", "Lý thuyết xác suất và thống kê toán", 3, "Bắt buộc", "Khoa Toán kinh tế", ["SAMPLE.TOAN101"], None),
    ("SAMPLE.TOAN201", "Kinh tế lượng", 3, "Bắt buộc", "Khoa Toán kinh tế", ["SAMPLE.TOAN102"], "Mô hình hồi quy và kiểm định."),
    ("SAMPLE.TOAN202", "Phân tích dữ liệu với Python", 3, "Tự chọn", "Khoa Toán kinh tế", ["SAMPLE.TOAN102"], None),
    ("SAMPLE.KT101", "Kinh tế vi mô", 3, "Bắt buộc", "Khoa Kinh tế", [], "Hành vi người tiêu dùng, doanh nghiệp và thị trường."),
    ("SAMPLE.KT102", "Kinh tế vĩ mô", 3, "Bắt buộc", "Khoa Kinh tế", ["SAMPLE.KT101"], "Sản lượng, lạm phát, thất nghiệp, chính sách."),
    ("SAMPLE.KT201", "Kinh tế phát triển", 3, "Tự chọn", "Khoa Kinh tế", ["SAMPLE.KT102"], None),
    ("SAMPLE.KT202", "Kinh tế công", 3, "Tự chọn", "Khoa Kinh tế", ["SAMPLE.KT102"], None),
    ("SAMPLE.KTDN201", "Kinh tế quốc tế", 3, "Bắt buộc", "Khoa Kinh tế đối ngoại", ["SAMPLE.KT102"], None),
    ("SAMPLE.KTDN202", "Thương mại quốc tế", 3, "Bắt buộc", "Khoa Kinh tế đối ngoại", ["SAMPLE.KTDN201"], None),
    ("SAMPLE.KTDN203", "Logistics và vận tải quốc tế", 3, "Tự chọn", "Khoa Kinh tế đối ngoại", [], None),
    ("SAMPLE.KTDN204", "Thanh toán quốc tế", 3, "Tự chọn", "Khoa Kinh tế đối ngoại", [], None),
    ("SAMPLE.TCNH201", "Tài chính tiền tệ", 3, "Bắt buộc", "Khoa Tài chính – Ngân hàng", ["SAMPLE.KT102"], None),
    ("SAMPLE.TCNH202", "Tài chính doanh nghiệp", 3, "Bắt buộc", "Khoa Tài chính – Ngân hàng", ["SAMPLE.TCNH201"], None),
    ("SAMPLE.TCNH203", "Ngân hàng thương mại", 3, "Tự chọn", "Khoa Tài chính – Ngân hàng", ["SAMPLE.TCNH201"], None),
    ("SAMPLE.TCNH204", "Đầu tư tài chính", 3, "Tự chọn", "Khoa Tài chính – Ngân hàng", [], None),
    ("SAMPLE.TCNH205", "Thuế", 2, "Tự chọn", "Khoa Tài chính – Ngân hàng", [], None),
    ("SAMPLE.KTKT201", "Nguyên lý kế toán", 3, "Bắt buộc", "Khoa Kế toán – Kiểm toán", [], None),
    ("SAMPLE.KTKT202", "Kế toán tài chính", 3, "Bắt buộc", "Khoa Kế toán – Kiểm toán", ["SAMPLE.KTKT201"], None),
    ("SAMPLE.KTKT203", "Kiểm toán căn bản", 3, "Tự chọn", "Khoa Kế toán – Kiểm toán", ["SAMPLE.KTKT201"], None),
    ("SAMPLE.QTKD201", "Quản trị học", 3, "Bắt buộc", "Khoa Quản trị kinh doanh", [], None),
    ("SAMPLE.QTKD202", "Marketing căn bản", 3, "Bắt buộc", "Khoa Quản trị kinh doanh", [], None),
    ("SAMPLE.QTKD203", "Quản trị nguồn nhân lực", 3, "Tự chọn", "Khoa Quản trị kinh doanh", ["SAMPLE.QTKD201"], None),
    ("SAMPLE.QTKD204", "Khởi nghiệp và đổi mới sáng tạo", 2, "Tự chọn", "Khoa Quản trị kinh doanh", [], None),
    ("SAMPLE.HTTT201", "Tin học ứng dụng", 3, "Bắt buộc", "Khoa Hệ thống thông tin", [], None),
    ("SAMPLE.HTTT202", "Cơ sở dữ liệu", 3, "Bắt buộc", "Khoa Hệ thống thông tin", ["SAMPLE.HTTT201"], None),
    ("SAMPLE.HTTT203", "Lập trình Python", 3, "Tự chọn", "Khoa Hệ thống thông tin", [], None),
    ("SAMPLE.HTTT204", "Thương mại điện tử", 3, "Tự chọn", "Khoa Hệ thống thông tin", [], None),
    ("SAMPLE.LUAT201", "Luật hiến pháp", 3, "Bắt buộc", "Khoa Luật", ["SAMPLE.PL101"], None),
    ("SAMPLE.LUAT202", "Luật dân sự 1", 3, "Bắt buộc", "Khoa Luật", ["SAMPLE.PL101"], None),
    ("SAMPLE.LUAT203", "Luật hình sự", 3, "Bắt buộc", "Khoa Luật", ["SAMPLE.PL101"], None),
    ("SAMPLE.LUAT204", "Luật hành chính", 3, "Tự chọn", "Khoa Luật", ["SAMPLE.LUAT201"], None),
    ("SAMPLE.LKT201", "Luật hợp đồng", 3, "Bắt buộc", "Khoa Luật kinh tế", ["SAMPLE.LUAT202"], None),
    ("SAMPLE.LKT202", "Pháp luật về doanh nghiệp", 3, "Bắt buộc", "Khoa Luật kinh tế", ["SAMPLE.PL101"], None),
    ("SAMPLE.NN101", "Tiếng Anh tổng quát 1", 3, "Bắt buộc", "Trung tâm Ngoại ngữ", [], None),
    ("SAMPLE.NN102", "Tiếng Anh tổng quát 2", 3, "Bắt buộc", "Trung tâm Ngoại ngữ", ["SAMPLE.NN101"], None),
]

LECTURERS = ["Nguyễn Văn An", "Trần Thị Bình", "Lê Minh Châu", "Phạm Quốc Dũng", "Hoàng Thu Hà",
             "Võ Thanh Hải", "Đặng Ngọc Lan", "Bùi Đức Minh", "Đỗ Thị Ngân", "Huỳnh Gia Phúc",
             "Ngô Bảo Quyên", "Dương Hữu Tài"]
ROOMS = ["A.101", "A.102", "A.203", "A.305", "B.101", "B.104", "B.201", "B.302", "B.405",
         "C.106", "C.207", "C.308", "HT.A"]
# Các ca thường gặp trên TKB thật của UEL (1-3, 4-6, 7-9, 10-12, 1-5, 7-11, 2-6)
SLOTS = [(1, 3), (4, 6), (7, 9), (10, 12), (1, 5), (7, 11), (2, 6)]
WEEKDAY_TEXT = {2: "Thứ 2", 3: "Thứ 3", 4: "Thứ 4", 5: "Thứ 5", 6: "Thứ 6", 7: "Thứ 7", 8: "Chủ nhật"}


def schedule_text(weekday: int, slot: tuple[int, int], room: str, style: int) -> str:
    a, b = slot
    if style == 0:
        return f"{WEEKDAY_TEXT[weekday]}, Tiết {a}-{b}, Phòng {room}"
    if style == 1:
        return f"{WEEKDAY_TEXT[weekday]} (Tiết {a} - {b}) - P.{room}"
    day = f"T{weekday}" if weekday < 8 else "CN"
    return f"{day}: tiết {a}-{b}, phòng {room}, tuần 1-15"


def main() -> None:
    modules = [
        {"code": c, "name": n, "credits": cr, "type": t, "faculty": f, "prerequisites": pre,
         "description": d, "is_sample": True}
        for c, n, cr, t, f, pre, d in MODULES
    ]
    classes = []
    for idx, (code, name, credits, typ, _f, _pre, _d) in enumerate(MODULES):
        for sem_i, sem in enumerate(SEMESTERS):
            # Môn bắt buộc mở cả hai kỳ, tự chọn mở 1 kỳ; số lớp 1–2 (môn đại cương 3)
            if typ == "Tự chọn" and (idx + sem_i) % 2:
                continue
            n_classes = 3 if code.startswith(("SAMPLE.LLCT", "SAMPLE.PL", "SAMPLE.NN", "SAMPLE.TOAN10")) and sem_i == 0 else rng.choice([1, 1, 2])
            for k in range(n_classes):
                n_lessons = 2 if credits >= 3 and rng.random() < 0.4 else 1
                days = rng.sample([2, 3, 4, 5, 6, 7], n_lessons) if rng.random() < 0.95 else [8]
                parts = [schedule_text(d, rng.choice(SLOTS), rng.choice(ROOMS), rng.randrange(3)) for d in sorted(days)]
                term_tag = sem["id"].replace("-", "")[-5:]
                classes.append({
                    "CurriculumID": code,
                    "ScheduleStudyUnitAlias": f"{code}.{term_tag}.{k + 1:02d}",
                    "ScheduleStudyUnitName": name,
                    "Credits": credits,
                    "StudyUnitTypeName": typ,
                    "Schedules": "; ".join(parts),
                    "ProfessorName": "ThS. " + rng.choice(LECTURERS) + " (mẫu)",
                    "StudentQuotas": rng.choice([60, 70, 80, 90, 100, 120]),
                    "BeginDate": sem["start_date"] + "T00:00:00",
                    "EndDate": sem["end_date"] + "T00:00:00",
                    "IsSample": True,
                })
    equivalents = [
        {"MaMon": "SAMPLE.TOAN202", "TenMon": "Phân tích dữ liệu với Python", "STC": 3,
         "MaMonTuongDuong": "SAMPLE.HTTT203", "TenMonTuongDuong": "Lập trình Python", "STCTuongDuong": 3},
        {"MaMon": "SAMPLE.KT201", "TenMon": "Kinh tế phát triển", "STC": 3,
         "MaMonTuongDuong": "SAMPLE.KT202", "TenMonTuongDuong": "Kinh tế công", "STCTuongDuong": 3},
        {"MaMon": "SAMPLE.KTDN204", "TenMon": "Thanh toán quốc tế", "STC": 3,
         "MaMonTuongDuong": "SAMPLE.TCNH203", "TenMonTuongDuong": "Ngân hàng thương mại", "STCTuongDuong": 3},
        {"MaMon": "SAMPLE.LUAT204", "TenMon": "Luật hành chính", "STC": 3,
         "MaMonTuongDuong": "SAMPLE.LKT202", "TenMonTuongDuong": "Pháp luật về doanh nghiệp", "STCTuongDuong": 3},
        {"MaMon": "SAMPLE.QTKD204", "TenMon": "Khởi nghiệp và đổi mới sáng tạo", "STC": 2,
         "MaMonTuongDuong": "SAMPLE.TCNH205", "TenMonTuongDuong": "Thuế", "STCTuongDuong": 2},
        {"MaMon": "SAMPLE.HTTT204", "TenMon": "Thương mại điện tử", "STC": 3,
         "MaMonTuongDuong": "SAMPLE.KTDN203", "TenMonTuongDuong": "Logistics và vận tải quốc tế", "STCTuongDuong": 3},
        {"MaMon": "SAMPLE.KTKT203", "TenMon": "Kiểm toán căn bản", "STC": 3,
         "MaMonTuongDuong": "SAMPLE.TCNH204", "TenMonTuongDuong": "Đầu tư tài chính", "STCTuongDuong": 3},
        {"MaMon": "SAMPLE.OLD.KT100", "TenMon": "Kinh tế học đại cương (CTĐT cũ)", "STC": 3,
         "MaMonTuongDuong": "SAMPLE.KT101", "TenMonTuongDuong": "Kinh tế vi mô", "STCTuongDuong": 3},
        {"MaMon": "SAMPLE.OLD.TH100", "TenMon": "Tin học đại cương (CTĐT cũ)", "STC": 2,
         "MaMonTuongDuong": "SAMPLE.HTTT201", "TenMonTuongDuong": "Tin học ứng dụng", "STCTuongDuong": 3},
        {"MaMon": "SAMPLE.OLD.AV100", "TenMon": "Anh văn 1 (CTĐT cũ)", "STC": 3,
         "MaMonTuongDuong": "SAMPLE.NN101", "TenMonTuongDuong": "Tiếng Anh tổng quát 1", "STCTuongDuong": 3},
    ]
    for name, data in (("semesters", SEMESTERS), ("modules", modules), ("classes", classes), ("equivalents", equivalents)):
        (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"semesters={len(SEMESTERS)} modules={len(modules)} classes={len(classes)} equivalents={len(equivalents)}")


if __name__ == "__main__":
    main()
