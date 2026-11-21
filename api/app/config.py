"""Cấu hình ứng dụng: DB, CORS, khung tiết UEL, nguồn dữ liệu portal.

Mọi giá trị có thể ghi đè bằng biến môi trường (hoặc file `api/.env`).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parent.parent
SEED_DIR = API_DIR / "seed"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(API_DIR / ".env"), extra="ignore")

    # Thư mục chứa dữ liệu chạy của ứng dụng (SQLite dev, chỉ mục RAG, file tạm). Mặc định <repo>/data/db.
    # Dữ liệu nguồn nằm ở <repo>/data/raw (xem data/README.md). Docker đặt DATA_DIR qua biến môi trường.
    data_dir: Path = API_DIR.parent / "data" / "db"
    # Mặc định: SQLite trong DATA_DIR (tương đương sqlite:///./data/uelplan.db khi chạy
    # từ api/). Docker: postgresql+psycopg://uelplan:...@db:5432/uelplan
    database_url: str | None = None
    # Thư mục chứa file Excel/JSON thật cho `seed` (mặc định DATA_DIR/raw, rồi <repo>/data/raw).
    raw_data_dir: Path | None = None
    # Danh sách origin phân tách bởi dấu phẩy.
    cors_origins: str = "http://localhost:3000"

    # Tự nạp dữ liệu mẫu khi DB chưa có học phần nào (tiện cho dev frontend).
    auto_seed: bool = True
    # Bỏ qua học phần mã hệ cũ (4 ký tự có chữ số: AA01, EN21…) khi nạp dữ liệu — xem app/services/legacy.py.
    skip_legacy_codes: bool = True
    # Bỏ qua chương trình đào tạo của các khóa cũ hơn (K19–K22 đã/đang tốt nghiệp). 0 = nạp tất cả.
    min_program_cohort: int = 23
    # Cho phép tắt việc nạp router RAG (vd. khi chạy test backend riêng).
    enable_rag: bool = True
    # Nếu đặt, các endpoint import/sync/export yêu cầu header `X-Admin-Key`.
    admin_key: str | None = None
    # Đăng nhập (xem app/services/auth.py). Để trống thì đăng nhập trả 503.
    session_secret: str = "dev-only-change-me"  # production: đặt SESSION_SECRET ngẫu nhiên, dài
    oauth_redirect_base: str = "http://localhost:8001"  # URL công khai của API
    frontend_base_url: str = "http://localhost:3001"  # web sau khi đăng nhập quay về
    google_client_id: str = ""
    google_client_secret: str = ""
    facebook_app_id: str = ""
    facebook_app_secret: str = ""

    max_upload_bytes: int = 30 * 1024 * 1024

    # Nguồn học phần tương đương (portal UEL). Token do người dùng gửi kèm request,
    # chỉ dùng một lần, không lưu và không ghi log.
    portal_equivalent_url: str = "https://portal.uel.edu.vn/backend/api/student/equivalentcourse"
    portal_timeout_seconds: float = 30.0

    @property
    def resolved_data_dir(self) -> Path:
        d = Path(self.data_dir)
        return d if d.is_absolute() else (API_DIR / d).resolve()

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{(self.resolved_data_dir / 'uelplan.db').as_posix()}"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


# ---------------------------------------------------------------------------
# Khung tiết UEL. Mỗi tiết 50 phút.
# Đã đối chiếu với thời khóa biểu thật (portal DrawingSchedules_v2):
#   giờ bắt đầu T1 07:00, T2 07:50, T4 09:45, T7 12:30, T8 13:20, T10 15:15;
#   giờ kết thúc quan sát được: T3 09:30, T5 11:25, T6 12:15, T9 15:00, T12 17:45.
# T3, T5, T6, T9, T11, T12 nội suy (tiết liên tiếp 50', nghỉ 15' sau T3 và T9)
# và khớp các giờ kết thúc ở trên. Sáng = T1–6, chiều = T7–12.
# T13–15 (buổi tối) CHƯA có dữ liệu thật — giả định bắt đầu 18:00.
# ---------------------------------------------------------------------------
# Khung tiết UEL — giờ chính thức do chủ dự án cung cấp (2026-11-21, GMT+7).
# PERIOD_TIMES[tiết] = (giờ bắt đầu, giờ kết thúc). Tiết nửa (4.5, 10.5, 11.5) có giờ riêng.
PERIOD_TIMES: dict[float, tuple[str, str]] = {
    1: ("07:00", "07:50"), 2: ("07:50", "08:40"), 3: ("08:40", "09:30"),
    4: ("09:45", "10:35"), 5: ("10:35", "11:25"), 6: ("11:25", "12:15"),
    7: ("12:30", "13:20"), 8: ("13:20", "14:10"), 9: ("14:10", "15:00"),
    10: ("15:15", "16:05"), 11: ("16:05", "16:55"), 12: ("16:55", "17:45"),  # tiết 11 kết thúc 16:55 (chủ dự án xác nhận 2026-11-21)
    13: ("17:45", "18:35"), 14: ("18:35", "19:25"), 15: ("19:25", "20:15"),
    # Tiết nửa = 25 phút đầu của tiết kế tiếp. 4.5/10.5/11.5 do chủ dự án cung cấp; 5.5 kết thúc 11:50 (chủ dự án, 2026-11-21),
    # bắt đầu 11:25 theo cùng quy luật (hết tiết 5).
    4.5: ("10:35", "11:00"), 5.5: ("11:25", "11:50"), 10.5: ("16:05", "16:30"), 11.5: ("16:55", "17:20"),
}
PERIOD_STARTS: dict[float, str] = {p: s for p, (s, _) in PERIOD_TIMES.items()}
MAX_PERIOD = 15


def _norm_period(period) -> float:
    """4 -> 4 (int-valued), 4.5 -> 4.5; tiết không có trong bảng -> ValueError."""
    p = float(period)
    if p not in PERIOD_TIMES:
        raise ValueError(f"Tiết không hợp lệ: {period}")
    return int(p) if p.is_integer() else p


def period_start_time(period) -> str:
    return PERIOD_TIMES[_norm_period(period)][0]


def period_end_time(period) -> str:
    return PERIOD_TIMES[_norm_period(period)][1]


def period_from_time(hhmm: str, *, end: bool = False):
    """Ánh xạ giờ (HH:MM) về tiết gần nhất (kể cả tiết nửa); dùng khi dữ liệu chỉ có giờ."""
    try:
        t = datetime.strptime(hhmm.strip().lower().replace("h", ":"), "%H:%M")
    except ValueError:
        return None
    best, best_diff = None, None
    for p, (s, e) in PERIOD_TIMES.items():
        ref = datetime.strptime(e if end else s, "%H:%M")
        diff = abs((ref - t).total_seconds())
        if best_diff is None or diff < best_diff:
            best, best_diff = p, diff
    return int(best) if best is not None and float(best).is_integer() else best
