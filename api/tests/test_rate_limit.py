"""Tests cho Brief S1: Chống cào dữ liệu, giới hạn tần suất, chặn User-Agent rỗng, Cache-Control."""

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.rate_limit import (
    AppRateLimitMiddleware,
    RateLimitExceeded,
    cache_control_middleware,
    create_limiter,
    get_cache_control_header,
    get_real_ip,
    limiter,
    rate_limit_exceeded_handler,
    user_agent_block_middleware,
)


# ---------------------------------------------------------------------------
# 1. Test get_real_ip với X-Forwarded-For
# ---------------------------------------------------------------------------

def test_get_real_ip_with_multiple_forwarded_ips():
    """X-Forwarded-For có nhiều IP -> lấy IP đầu tiên."""
    scope = {
        "type": "http",
        "headers": [(b"x-forwarded-for", b"203.0.113.195, 70.41.3.18, 150.172.238.178")],
        "client": ("127.0.0.1", 12345),
    }
    req = Request(scope)
    assert get_real_ip(req) == "203.0.113.195"


def test_get_real_ip_with_single_forwarded_ip():
    scope = {
        "type": "http",
        "headers": [(b"x-forwarded-for", b"198.51.100.22")],
        "client": ("127.0.0.1", 12345),
    }
    req = Request(scope)
    assert get_real_ip(req) == "198.51.100.22"


def test_get_real_ip_without_forwarded_header():
    """Khi không có X-Forwarded-For thì lấy IP kết nối trực tiếp."""
    scope = {
        "type": "http",
        "headers": [],
        "client": ("192.168.1.50", 12345),
    }
    req = Request(scope)
    assert get_real_ip(req) == "192.168.1.50"


# ---------------------------------------------------------------------------
# 2. Test Rate Limiting (Vượt hạn mức -> 429, Retry-After, Health exempt, IP separation)
# ---------------------------------------------------------------------------

def test_rate_limit_exceeded_returns_429_and_retry_after(monkeypatch):
    """Vượt hạn mức trả 429 có header Retry-After và thông báo JSON tiếng Việt."""
    test_app = FastAPI()
    test_limiter = create_limiter("3/minute")
    test_limiter.enabled = True
    if hasattr(test_limiter, "reset"):
        test_limiter.reset()

    test_app.state.limiter = test_limiter
    test_app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    test_app.add_middleware(AppRateLimitMiddleware)

    @test_app.get("/api/test-limit")
    def test_endpoint(request: Request):
        return {"ok": True}

    client = TestClient(test_app)

    # 3 request đầu tiên thành công (200)
    for _ in range(3):
        res = client.get("/api/test-limit", headers={"X-Forwarded-For": "10.0.0.99"})
        assert res.status_code == 200
        assert res.json() == {"ok": True}

    # Request thứ 4 vượt hạn mức -> 429
    res4 = client.get("/api/test-limit", headers={"X-Forwarded-For": "10.0.0.99"})
    assert res4.status_code == 429
    assert "Retry-After" in res4.headers
    assert int(res4.headers["Retry-After"]) > 0
    # Thông báo tiếng Việt ngắn gọn, không lộ chi tiết hạn mức
    assert res4.json() == {"detail": "Bạn gửi quá nhiều yêu cầu, vui lòng thử lại sau."}


def test_different_ips_have_separate_counters():
    """Hai IP khác nhau có bộ đếm riêng; IP thứ nhất bị 429 không ảnh hưởng IP thứ hai."""
    test_app = FastAPI()
    test_limiter = create_limiter("2/minute")
    test_limiter.enabled = True
    if hasattr(test_limiter, "reset"):
        test_limiter.reset()

    test_app.state.limiter = test_limiter
    test_app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    test_app.add_middleware(AppRateLimitMiddleware)

    @test_app.get("/api/test-sep")
    def test_endpoint(request: Request):
        return {"ok": True}

    client = TestClient(test_app)

    # IP 10.0.0.1 dùng hết 2 lượt
    assert client.get("/api/test-sep", headers={"X-Forwarded-For": "10.0.0.1"}).status_code == 200
    assert client.get("/api/test-sep", headers={"X-Forwarded-For": "10.0.0.1"}).status_code == 200
    assert client.get("/api/test-sep", headers={"X-Forwarded-For": "10.0.0.1"}).status_code == 429

    # IP 10.0.0.2 có bộ đếm riêng -> vẫn gọi được 2 lượt thành công
    assert client.get("/api/test-sep", headers={"X-Forwarded-For": "10.0.0.2"}).status_code == 200
    assert client.get("/api/test-sep", headers={"X-Forwarded-For": "10.0.0.2"}).status_code == 200
    assert client.get("/api/test-sep", headers={"X-Forwarded-For": "10.0.0.2"}).status_code == 429


def test_health_check_never_rate_limited():
    """Endpoint /api/health được miễn trừ, gọi liên tục không bao giờ bị 429."""
    test_app = FastAPI()
    test_limiter = create_limiter("2/minute")
    test_limiter.enabled = True
    if hasattr(test_limiter, "reset"):
        test_limiter.reset()

    test_app.state.limiter = test_limiter
    test_app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    test_app.add_middleware(AppRateLimitMiddleware)

    @test_app.get("/api/health")
    @test_limiter.exempt
    def health_check(request: Request):
        return {"status": "ok"}

    client = TestClient(test_app)

    # Gọi 10 lần liên tiếp với cùng một IP -> luôn trả 200
    for _ in range(10):
        res = client.get("/api/health", headers={"X-Forwarded-For": "10.0.0.5"})
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}


def test_rate_limit_disabled_allows_unlimited():
    """RATE_LIMIT_ENABLED=false thì tắt hoàn toàn, không giới hạn."""
    test_app = FastAPI()
    test_limiter = create_limiter("2/minute")
    test_limiter.enabled = False
    if hasattr(test_limiter, "reset"):
        test_limiter.reset()

    test_app.state.limiter = test_limiter
    test_app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    test_app.add_middleware(AppRateLimitMiddleware)

    @test_app.get("/api/unlimited")
    def unlimited_endpoint(request: Request):
        return {"status": "ok"}

    client = TestClient(test_app)

    # Gọi 5 lần liên tiếp (vượt xa 2/phút) nhưng vẫn 200 vì limiter đã tắt
    for _ in range(5):
        res = client.get("/api/unlimited", headers={"X-Forwarded-For": "10.0.0.6"})
        assert res.status_code == 200


# ---------------------------------------------------------------------------
# 3. Test Hạ giới hạn phân trang (size=500 -> 422, size=100 -> 200)
# ---------------------------------------------------------------------------

def test_pagination_size_limit_on_modules(client):
    """GET /api/modules?size=500 -> 422, size=100 -> 200."""
    res_500 = client.get("/api/modules?size=500")
    assert res_500.status_code == 422

    res_100 = client.get("/api/modules?size=100")
    assert res_100.status_code == 200


def test_pagination_limit_on_equivalents(client):
    """GET /api/equivalents?limit=500 -> 422, limit=100 -> 200."""
    res_500 = client.get("/api/equivalents?limit=500")
    assert res_500.status_code == 422

    res_100 = client.get("/api/equivalents?limit=100")
    assert res_100.status_code == 200


# ---------------------------------------------------------------------------
# 4. Test Chặn request không có User-Agent
# ---------------------------------------------------------------------------

def test_user_agent_block_when_enabled(monkeypatch):
    """BLOCK_EMPTY_USER_AGENT=true + không có User-Agent -> 403; có User-Agent -> 200."""
    monkeypatch.setattr(get_settings(), "block_empty_user_agent", True)

    test_app = FastAPI()

    @test_app.middleware("http")
    async def ua_middleware(request: Request, call_next):
        return await user_agent_block_middleware(request, call_next)

    @test_app.get("/api/modules")
    def dummy_modules():
        return {"modules": []}

    @test_app.get("/api/health")
    def dummy_health():
        return {"status": "ok"}

    client = TestClient(test_app)

    # Không gửi header User-Agent -> 403
    res_no_ua = client.get("/api/modules", headers={"User-Agent": ""})
    assert res_no_ua.status_code == 403
    assert res_no_ua.json() == {"detail": "User-Agent header is required."}

    # User-Agent chỉ toàn khoảng trắng -> 403
    res_blank_ua = client.get("/api/modules", headers={"User-Agent": "   "})
    assert res_blank_ua.status_code == 403

    # Có User-Agent -> 200
    res_ok = client.get("/api/modules", headers={"User-Agent": "Mozilla/5.0 UELBot/1.0"})
    assert res_ok.status_code == 200

    # /api/health luôn được miễn trừ dù không có User-Agent
    res_health = client.get("/api/health", headers={"User-Agent": ""})
    assert res_health.status_code == 200


def test_user_agent_block_when_disabled_default(client):
    """Mặc định BLOCK_EMPTY_USER_AGENT=false -> request không có User-Agent vẫn 200."""
    # Settings mặc định block_empty_user_agent = False
    res = client.get("/api/health", headers={"User-Agent": ""})
    assert res.status_code == 200


# ---------------------------------------------------------------------------
# 5. Test Cache-Control headers cho Cloudflare
# ---------------------------------------------------------------------------

def test_cache_control_headers_read_endpoints(client):
    """Endpoint đọc dữ liệu ít thay đổi trả: public, max-age=300, s-maxage=3600."""
    res_modules = client.get("/api/modules")
    assert res_modules.status_code == 200
    assert res_modules.headers.get("Cache-Control") == "public, max-age=300, s-maxage=3600"

    res_semesters = client.get("/api/semesters")
    assert res_semesters.status_code == 200
    assert res_semesters.headers.get("Cache-Control") == "public, max-age=300, s-maxage=3600"

    res_venues = client.get("/api/venues")
    assert res_venues.status_code == 200
    assert res_venues.headers.get("Cache-Control") == "public, max-age=300, s-maxage=3600"

    res_programs = client.get("/api/programs")
    assert res_programs.status_code == 200
    assert res_programs.headers.get("Cache-Control") == "public, max-age=300, s-maxage=3600"


def test_cache_control_headers_user_data_and_health(client):
    """Endpoint chứa dữ liệu người dùng / xác thực / health trả: no-store."""
    res_health = client.get("/api/health")
    assert res_health.status_code == 200
    assert res_health.headers.get("Cache-Control") == "no-store"

    res_me = client.get("/api/auth/me")
    assert res_me.status_code == 200
    assert res_me.headers.get("Cache-Control") == "no-store"

    res_feedback_stats = client.get("/api/feedback/stats")
    assert res_feedback_stats.status_code == 200
    assert res_feedback_stats.headers.get("Cache-Control") == "no-store"
