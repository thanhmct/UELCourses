from app.config import Settings, get_settings


def test_default_cors_origins_include_admin_port():
    default = Settings.model_fields["cors_origins"].default
    assert "http://localhost:3000" in default
    assert "http://localhost:3100" in default


def test_cors_allowed_origin_preflight_allows_credentials(client):
    origin = get_settings().cors_origin_list[0]
    r = client.options(
        "/api/modules",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )
    assert r.headers.get("access-control-allow-origin") == origin
    assert r.headers.get("access-control-allow-credentials") == "true"


def test_cors_allowed_origin_get_allows_credentials(client):
    origin = get_settings().cors_origin_list[0]
    r = client.get("/api/health", headers={"Origin": origin})
    assert r.headers.get("access-control-allow-origin") == origin
    assert r.headers.get("access-control-allow-credentials") == "true"


def test_cors_unlisted_origin(client):
    r = client.get("/api/health", headers={"Origin": "http://evil.com"})
    assert "access-control-allow-origin" not in r.headers
