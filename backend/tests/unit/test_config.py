"""Settings validation tests (Docker-only hostname guard)."""

import pytest

from app.config import Settings


def test_docker_only_database_host_rejected_in_development():
    with pytest.raises(ValueError, match="Docker Compose"):
        Settings(_env_file=None, app_env="development", database_url="postgresql+psycopg://u:p@postgres:5432/db")


def test_docker_only_redis_host_rejected_in_development():
    with pytest.raises(ValueError, match="redis"):
        Settings(_env_file=None, app_env="development", redis_url="redis://redis:6379/0")


def test_docker_hosts_allowed_in_production():
    settings = Settings(
        _env_file=None,
        app_env="production",
        database_url="postgresql+psycopg://u:p@postgres:5432/db",
        redis_url="redis://redis:6379/0",
    )
    assert settings.app_env == "production"


def test_localhost_hosts_allowed_in_development():
    settings = Settings(
        _env_file=None,
        app_env="development",
        database_url="sqlite+aiosqlite:///./data/auditor.db",
        redis_url="redis://localhost:6379/0",
    )
    assert settings.database_url.startswith("sqlite")
