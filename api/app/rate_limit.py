from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from functools import wraps
from typing import Any, Callable
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings

log = logging.getLogger("uelcourses")

# ---------------------------------------------------------------------------
# Rate limit & IP detection
# ---------------------------------------------------------------------------

def get_real_ip(request: Request) -> str:
    """IP khách không thể giả mạo.

    - Sau Cloudflare (TRUST_CLOUDFLARE_IP=true): dùng CF-Connecting-IP.
    - Sau proxy đáng tin (Render): proxy nối IP khách vào CUỐI X-Forwarded-For, nên lấy phần tử thứ
      TRUSTED_PROXY_HOPS tính từ cuối. Phần đầu danh sách do khách tự gửi nên không được tin.
    - Không có proxy (TRUSTED_PROXY_HOPS=0, dev) hoặc không có header: dùng IP kết nối trực tiếp.
    """
    settings = get_settings()
    if settings.trust_cloudflare_ip:
        cf_ip = (request.headers.get("cf-connecting-ip") or "").strip()
        if cf_ip:
            return cf_ip
    hops = settings.trusted_proxy_hops
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and hops > 0:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if parts:
            return parts[max(len(parts) - hops, 0)]
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


def _rate_limit_key(request: Request) -> str:
    if request.url.path in {"/api/regulations/ask", "/api/modules/ask", "/api/ask/feedback"}:
        from app.rag.safety import private_hash

        # Băm một chiều theo ngày để không lưu IP gốc; dùng IP khách thật (không phải IP của proxy Render).
        peer = get_real_ip(request)
        return private_hash(f"rate:{peer}", datetime.now(timezone.utc).date().isoformat())
    return get_real_ip(request)


def _parse_limit_string(limit_str: str) -> tuple[int, int]:
    """Phân tích chuỗi hạn mức dạng '240/minute' -> (240, 60s)."""
    parts = limit_str.strip().lower().split("/")
    amount = int(parts[0])
    unit = parts[1] if len(parts) > 1 else "minute"
    if "sec" in unit:
        seconds = 1
    elif "min" in unit:
        seconds = 60
    elif "hour" in unit:
        seconds = 3600
    elif "day" in unit:
        seconds = 86400
    else:
        seconds = 60
    return amount, seconds


# Kiểm tra xem slowapi có sẵn trong môi trường không
try:
    from slowapi import Limiter as _SlowLimiter
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware as _SlowAPIMiddleware
    SLOWAPI_AVAILABLE = True
except ImportError:
    SLOWAPI_AVAILABLE = False

    class RateLimitExceeded(Exception):
        """Lỗi vượt quá hạn mức tần suất (fallback khi chưa cài slowapi)."""
        def __init__(self, detail: str = "Rate limit exceeded"):
            self.detail = detail
            super().__init__(detail)

    class _SlowAPIMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            return await call_next(request)

    class _SlowLimiter:
        pass


class InMemoryFallbackLimiter:
    """Bộ đếm tần suất trong bộ nhớ tương thích interface của SlowAPI (dùng làm fallback)."""

    def __init__(self, key_func: Callable[[Request], str], default_limits: list[str] | None = None,
                 enabled: bool = True, headers_enabled: bool = True):
        self.key_func = key_func
        self.default_limits = default_limits or ["240/minute"]
        self.enabled = enabled
        self.headers_enabled = headers_enabled
        self._history: dict[tuple[str, str], list[float]] = {}
        self._exempt_routes: set[str] = set()
        self._lock = threading.Lock()

    def reset(self) -> None:
        self._history.clear()

    def exempt(self, obj: Any) -> Any:
        name = getattr(obj, "__name__", str(obj))
        self._exempt_routes.add(name)
        return obj

    def limit(self, limit_value: str | Callable[..., str], **kwargs: Any) -> Callable:
        def decorator(func: Callable) -> Callable:
            name = getattr(func, "__name__", str(func))
            @wraps(func)
            def sync_or_async_wrapper(*args: Any, **func_kwargs: Any):
                if not self.enabled:
                    return func(*args, **func_kwargs)
                # Tìm request trong args hoặc kwargs
                request: Request | None = None
                for a in args:
                    if isinstance(a, Request):
                        request = a
                        break
                if not request:
                    for v in func_kwargs.values():
                        if isinstance(v, Request):
                            request = v
                            break
                if request:
                    lim_str = limit_value(request) if callable(limit_value) else limit_value
                    self.check_limit(request, lim_str)
                return func(*args, **func_kwargs)

            @wraps(func)
            async def async_wrapper(*args: Any, **func_kwargs: Any):
                if not self.enabled:
                    return await func(*args, **func_kwargs)
                request: Request | None = None
                for a in args:
                    if isinstance(a, Request):
                        request = a
                        break
                if not request:
                    for v in func_kwargs.values():
                        if isinstance(v, Request):
                            request = v
                            break
                if request:
                    lim_str = limit_value(request) if callable(limit_value) else limit_value
                    self.check_limit(request, lim_str)
                return await func(*args, **func_kwargs)

            import inspect
            wrapper = async_wrapper if inspect.iscoroutinefunction(func) else sync_or_async_wrapper
            wrapper.__name__ = getattr(func, "__name__", "wrapper")
            wrapper.__doc__ = getattr(func, "__doc__", None)
            return wrapper
        return decorator

    def check_limit(self, request: Request, limit_str: str) -> None:
        if not self.enabled:
            return
        ip = self.key_func(request)
        max_requests, window_seconds = _parse_limit_string(limit_str)
        now = time.time()
        key = (ip, limit_str)
        with self._lock:
            timestamps = [t for t in self._history.get(key, []) if t > now - window_seconds]
            if len(timestamps) >= max_requests:
                oldest = timestamps[0]
                retry_after = max(1, int(oldest + window_seconds - now + 1))
                request.state.retry_after = retry_after
                raise RateLimitExceeded(f"{max_requests} per {window_seconds} second")
            timestamps.append(now)
            self._history[key] = timestamps


def create_limiter(default_limit: str | None = None) -> Any:
    """Tạo bộ giới hạn tần suất. `default_limit` (vd "3/minute") ghi đè RATE_LIMIT_DEFAULT (dùng trong test)."""
    settings = get_settings()
    limit = default_limit or settings.rate_limit_default
    if SLOWAPI_AVAILABLE:
        return _SlowLimiter(
            key_func=_rate_limit_key,
            default_limits=[limit],
            enabled=settings.rate_limit_enabled,
            headers_enabled=True,
        )
    return InMemoryFallbackLimiter(
        key_func=_rate_limit_key,
        default_limits=[limit],
        enabled=settings.rate_limit_enabled,
        headers_enabled=True,
    )


limiter = create_limiter()


def heavy_rate_limit(request: Request | None = None) -> str:
    """Hạn mức cho các endpoint nặng (20/phút theo mặc định)."""
    return get_settings().rate_limit_heavy


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Xử lý lỗi 429 khi vượt hạn mức: trả JSON tiếng Việt ngắn gọn kèm header Retry-After."""
    response = JSONResponse(
        status_code=429,
        content={"detail": "Bạn gửi quá nhiều yêu cầu, vui lòng thử lại sau."},
    )
    # Thử inject header từ SlowAPI
    limiter_instance = getattr(request.app.state, "limiter", limiter)
    view_rate_limit = getattr(request.state, "view_rate_limit", None)
    if hasattr(limiter_instance, "_inject_headers") and view_rate_limit is not None:
        try:
            response = limiter_instance._inject_headers(response, view_rate_limit)
        except Exception:
            pass

    # Nếu chưa có header Retry-After thì tính từ request.state hoặc mặc định 60 giây
    if "Retry-After" not in response.headers:
        retry_after = getattr(request.state, "retry_after", 60)
        response.headers["Retry-After"] = str(retry_after)

    return response


# Lớp Middleware kế thừa từ SlowAPIMiddleware (hoặc BaseHTTPMiddleware nếu fallback)
_BaseMiddleware = _SlowAPIMiddleware if SLOWAPI_AVAILABLE else BaseHTTPMiddleware


class AppRateLimitMiddleware(_BaseMiddleware):
    """Middleware áp dụng giới hạn tần suất cho các route /api/*:
    - Bỏ qua hoàn toàn khi RATE_LIMIT_ENABLED=false
    - Miễn trừ /api/health và /docs, /openapi.json, /redoc
    """

    async def dispatch(self, request: Request, call_next):
        settings = get_settings()
        limiter_instance = getattr(request.app.state, "limiter", limiter)
        enabled = bool(getattr(limiter_instance, "enabled", settings.rate_limit_enabled))
        if not enabled:
            return await call_next(request)

        path = request.url.path
        if path == "/api/health" or path in ("/docs", "/openapi.json", "/redoc") or not path.startswith("/api/"):
            return await call_next(request)

        # Nếu dùng fallback in-memory limiter
        if not SLOWAPI_AVAILABLE and isinstance(limiter_instance, InMemoryFallbackLimiter):
            if limiter_instance.enabled:
                try:
                    default_limits = limiter_instance.default_limits or [settings.rate_limit_default]
                    limiter_instance.check_limit(request, default_limits[0])
                except RateLimitExceeded as exc:
                    return rate_limit_exceeded_handler(request, exc)
            return await call_next(request)

        return await super().dispatch(request, call_next)


# ---------------------------------------------------------------------------
# Giới hạn số request xử lý đồng thời (bảo vệ máy yếu)
# ---------------------------------------------------------------------------

class InflightLimitMiddleware:
    """ASGI middleware: tối đa N request /api/* chạy cùng lúc. Vượt mức -> 503 + Retry-After ngay, không xếp hàng.

    Máy gói miễn phí (CPU rất nhỏ, ít kết nối DB) bị treo khi quá tải; trả lỗi nhanh giúp phục hồi sớm và để
    người dùng/ trình duyệt thử lại. /api/health được miễn để bộ giám sát không tưởng máy đã chết.
    """

    def __init__(self, app: Any, limit: int | None = None, retry_after: int = 3):
        self.app = app
        self._limit = limit
        self.retry_after = retry_after
        self.inflight = 0

    @property
    def limit(self) -> int:
        return self._limit if self._limit is not None else get_settings().max_inflight_requests

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        path = scope.get("path", "") if scope.get("type") == "http" else ""
        if not path.startswith("/api/") or path == "/api/health" or self.limit <= 0:
            await self.app(scope, receive, send)
            return
        if self.inflight >= self.limit:
            response = JSONResponse(
                status_code=503,
                content={"detail": "Máy chủ đang bận, vui lòng thử lại sau vài giây."},
                headers={"Retry-After": str(self.retry_after)},
            )
            await response(scope, receive, send)
            return
        self.inflight += 1
        try:
            await self.app(scope, receive, send)
        finally:
            self.inflight -= 1


# ---------------------------------------------------------------------------
# Chặn User-Agent rỗng & Cache-Control Cloudflare
# ---------------------------------------------------------------------------

async def user_agent_block_middleware(request: Request, call_next):
    """Chặn request vào /api/* không có header User-Agent (hoặc rỗng) khi BLOCK_EMPTY_USER_AGENT=true."""
    settings = get_settings()
    if settings.block_empty_user_agent:
        path = request.url.path
        if path.startswith("/api/") and path != "/api/health":
            ua = request.headers.get("user-agent", "")
            if not ua or not ua.strip():
                return JSONResponse(
                    status_code=403,
                    content={"detail": "User-Agent header is required."},
                )
    return await call_next(request)


def get_cache_control_header(method: str, path: str, status_code: int) -> str | None:
    """Xác định header Cache-Control phù hợp:
    - no-store cho dữ liệu người dùng, xác thực, kiểm duyệt, /api/health
    - public, max-age=300, s-maxage=3600 cho endpoint đọc ít đổi
    """
    if not path.startswith("/api/"):
        return None

    no_store_prefixes = (
        "/api/feedback",
        "/api/auth",
        "/api/admin",
        "/api/analytics",
        "/api/sync",
        "/api/import",
    )
    if (
        path == "/api/health"
        or any(path.startswith(p) for p in no_store_prefixes)
        or "/reviews" in path
        or "/comments" in path
    ):
        return "no-store"

    if method in ("GET", "HEAD") and 200 <= status_code < 300:
        cacheable_prefixes = (
            "/api/modules",
            "/api/module-facets",
            "/api/classes",
            "/api/venues",
            "/api/programs",
            "/api/semesters",
            "/api/equivalents",
            "/api/calendar",
            "/api/regulations",
        )
        if any(path.startswith(p) for p in cacheable_prefixes):
            return "public, max-age=300, s-maxage=3600"

    return "no-store"


async def cache_control_middleware(request: Request, call_next):
    """Middleware tự động gắn header Cache-Control cho Cloudflare và trình duyệt."""
    response = await call_next(request)
    cc = get_cache_control_header(request.method, request.url.path, response.status_code)
    if cc is not None:
        response.headers["Cache-Control"] = cc
    return response
