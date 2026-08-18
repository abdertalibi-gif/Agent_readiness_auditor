from collections.abc import AsyncGenerator
from pathlib import Path
from urllib.parse import unquote, urlparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


def _engine_kwargs(url: str) -> dict:
    kwargs: dict = {"echo": False, "pool_pre_ping": True}
    if url.startswith("sqlite"):
        # check_same_thread: aiosqlite shares its connection across the event loop.
        # timeout: SQLite's busy-timeout (seconds) — without it concurrent writes
        # from audit jobs + API requests surface as "database is locked".
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
    return kwargs


def _resolve_sqlite_url(url: str) -> str:
    """Anchor CWD-relative SQLite paths to the backend project root and create
    the parent directory.

    Without this, ``sqlite+aiosqlite:///./data/auditor.db`` fails with
    "unable to open database file" whenever the ``data/`` folder does not exist
    yet. In-memory and absolute paths pass through unchanged.
    """
    if not url.startswith("sqlite") or ":memory:" in url or url.endswith(":memory:"):
        return url
    scheme, _, rest = url.partition("://")
    parsed = urlparse(url)
    raw = unquote((parsed.path or parsed.netloc).lstrip("/"))
    if not raw:
        return url
    path = Path(raw)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return f"{scheme}:///{path.as_posix()}"


_database_url = _resolve_sqlite_url(settings.database_url)

engine = create_async_engine(_database_url, **_engine_kwargs(_database_url))

async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session


async def create_schema() -> None:
    """Create tables from metadata. Used in dev/testing; production uses Alembic."""

    from app.models import BaseModel  # noqa: F401  (ensure models registered)

    async with engine.begin() as conn:
        if _database_url.startswith("sqlite"):
            # WAL drastically improves concurrent read/write throughput and avoids
            # "database is locked" under the audit job's async writers. It persists
            # per database file, so this only needs to run once.
            for pragma in (
                "PRAGMA journal_mode=WAL",
                "PRAGMA busy_timeout=30000",
                "PRAGMA synchronous=NORMAL",
                "PRAGMA foreign_keys=ON",
            ):
                try:
                    await conn.exec_driver_sql(pragma)
                except Exception:  # noqa: BLE001 - pragmas are best-effort tuning
                    pass
        await conn.run_sync(Base.metadata.create_all)
