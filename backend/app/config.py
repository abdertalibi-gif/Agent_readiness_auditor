from functools import lru_cache
from urllib.parse import urlparse

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Docker Compose exposes services under these hostnames. They are only
# reachable inside the compose network; on a native Windows/macOS/Linux dev
# machine they must be replaced with "localhost" (or your real host).
DOCKER_ONLY_HOSTS = {"postgres", "redis"}


def _url_host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower().rstrip(".")
    except ValueError:
        return ""


class Settings(BaseSettings):
    """Application settings loaded from environment / .env file."""

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    # Runtime
    app_env: str = "development"  # development | testing | production
    debug: bool = False
    secret_key: str = "dev-secret-change-me"

    # Database / infra
    database_url: str = "sqlite+aiosqlite:///./data/auditor.db"
    redis_url: str = "redis://localhost:6379/0"
    job_mode: str = "inline"  # inline | celery
    celery_broker_url: str = ""

    # Crawler limits
    crawl_max_pages: int = 50
    crawl_max_depth: int = 3
    crawl_timeout_seconds: float = 8.0
    crawl_meta_timeout_seconds: float = 5.0
    crawl_rate_limit_seconds: float = 0.0
    crawl_max_response_bytes: int = 5 * 1024 * 1024
    crawl_concurrency: int = 5
    max_urls_per_sitemap: int = 500

    # SSRF protection
    allow_private_ip_ranges: bool = False
    blocked_hostnames: str = "localhost,127.0.0.1,[::1],0.0.0.0"

    # AI
    ai_provider: str = "none"  # none | openai
    ai_api_key: str = ""
    ai_model: str = "gpt-4o-mini"
    ai_timeout_seconds: float = 45.0

    # Rate limiting
    rate_limit_requests: int = 60
    rate_limit_window_seconds: int = 60

    # Authentication
    auth_token_ttl_days: int = 7
    password_reset_token_ttl_minutes: int = 60
    invitation_token_ttl_days: int = 7

    # Email (password reset). SMTP_* are optional; when unset, emails are
    # written to a local dev mailbox under backend/data/emails (development only).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # Public URL used to build reset links (email button target).
    frontend_url: str = "http://localhost:3000"

    # Comma-separated extra browser origins allowed by CORS (e.g. LAN IPs the
    # frontend is opened from). The standard localhost origins and the origin
    # derived from FRONTEND_URL are always allowed.
    cors_origins: str = ""

    # Monetization (FREE MODE = false)
    monetization_enabled: bool = False

    @property
    def blocked_hostname_set(self) -> set[str]:
        return {h.strip().lower() for h in self.blocked_hostnames.split(",") if h.strip()}

    @property
    def cors_origin_list(self) -> list[str]:
        """Origins the browser is allowed to call the API from.

        Always allows the standard localhost dev origins, the origin derived
        from ``FRONTEND_URL`` (the project's frontend URL configuration) and
        any extra origins listed in ``CORS_ORIGINS``.
        """
        origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://localhost:8080",
        ]
        configured = [self.frontend_url.rstrip("/")]
        configured += [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]
        for origin in configured:
            if origin and origin not in origins:
                origins.append(origin)
        return origins

    @property
    def effective_celery_broker(self) -> str:
        return self.celery_broker_url or self.redis_url

    @property
    def is_ai_enabled(self) -> bool:
        return self.ai_provider == "openai" and bool(self.ai_api_key)

    @model_validator(mode="after")
    def _validate_local_infra(self) -> "Settings":
        """Fail fast with a human-readable message when a Docker-only hostname
        is used in a non-Docker environment.

        Docker Compose overrides ``APP_ENV=production`` for the backend/worker
        services, which is the only mode where ``postgres``/``redis`` are valid
        hosts. Native local development must use ``localhost``.
        """
        if self.app_env in ("development", "testing"):
            for name, url in (
                ("DATABASE_URL", self.database_url),
                ("REDIS_URL", self.redis_url),
            ):
                host = _url_host(url)
                if host in DOCKER_ONLY_HOSTS:
                    raise ValueError(
                        f"{name}={url!r} points to '{host}', which is only reachable "
                        "inside the Docker Compose network. On a local Windows/macOS/Linux "
                        "machine use 'localhost' instead, e.g.:\n"
                        f"  DATABASE_URL=postgresql+psycopg://auditor:auditor@localhost:5432/auditor\n"
                        f"  REDIS_URL=redis://localhost:6379/0\n"
                        "or start the whole stack with `docker compose up --build`."
                    )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
