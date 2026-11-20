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

    # Thư mục chứa mọi file dữ liệu (SQLite, file tạm...). Mặc định api/data.
    data_dir: Path = API_DIR / "data"
    # Mặc định: SQLite trong DATA_DIR (tương đương sqlite:///./data/uelplan.db khi chạy
    # từ api/). Docker: postgresql+psycopg://uelplan:...@db:5432/uelplan
    database_url: str | None = None
    # Thư mục chứa file Excel/JSON thật cho `seed` (mặc định DATA_DIR/raw, rồi <repo>/data/raw).
    raw_data_dir: Path | None = None
    # Danh sách origin phân tách bởi dấu phẩy.
    cors_origins: str = "http://localhost:3000"

    # Tự nạp dữ liệu mẫu khi DB chưa có học phần nào (tiện cho dev frontend).
    auto_seed: bool = True
    # Cho phép tắt việc nạp router RAG (vd. khi chạy test backend riêng).
    enable_rag: bool = True
    # Nếu đặt, các endpoint import/sync/export yêu cầu header `X-Admin-Key`.
    admin_key: str | None = None

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
PERIOD_MINUTES = 50
PERIOD_STARTS: dict[int, str] = {
    1: "07:00", 2: "07:50", 3: "08:40",
    4: "09:45", 5: "10:35", 6: "11:25",
    7: "12:30", 8: "13:20", 9: "14:10",
    10: "15:15", 11: "16:05", 12: "16:55",
    13: "18:00", 14: "18:50", 15: "19:40",  # giả định
}
MAX_PERIOD = max(PERIOD_STARTS)


def _period_start_dt(period: int) -> datetime:
    if period not in PERIOD_STARTS:
        raise ValueError(f"Tiết không hợp lệ: {period}")
    return datetime.strptime(PERIOD_STARTS[period], "%H:%M")


def period_start_time(period: int) -> str:
    return _period_start_dt(period).strftime("%H:%M")


def period_end_time(period: int) -> str:
    return (_period_start_dt(period) + timedelta(minutes=PERIOD_MINUTES)).strftime("%H:%M")


def period_from_time(hhmm: str, *, end: bool = False) -> int | None:
    """Ánh xạ giờ (HH:MM) về tiết gần nhất; dùng khi dữ liệu chỉ có giờ."""
    try:
        t = datetime.strptime(hhmm.strip().lower().replace("h", ":"), "%H:%M")
    except ValueError:
        return None
    best, best_diff = None, None
    for p in range(1, MAX_PERIOD + 1):
        ref = _period_start_dt(p) + (timedelta(minutes=PERIOD_MINUTES) if end else timedelta())
        diff = abs((ref - t).total_seconds())
        if best_diff is None or diff < best_diff:
            best, best_diff = p, diff
    return best
