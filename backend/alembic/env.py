import asyncio
import os

import sqlalchemy as sa
from alembic import context
from sqlalchemy import inspect
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool

from app.config import settings
from app.database import Base
import app.models  # noqa: F401  (register models)

config = context.config

if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


def _ensure_version_table(connection: Connection) -> None:
    """Create the alembic version table with a column wide enough for this
    project's revision ids, some of which exceed Alembic's default
    ``varchar(32)`` (e.g. ``0009_merge_admin_preferred_language``).

    Alembic only checks whether the table exists (``checkfirst``), so a
    pre-created table with a wider column is used as-is.
    """
    if inspect(connection).has_table("alembic_version"):
        return
    sa.Table(
        "alembic_version",
        sa.MetaData(),
        sa.Column("version_num", sa.String(64), nullable=False, primary_key=True),
    ).create(connection)


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    # Create the version table in its own committed transaction. Doing it on
    # the migration connection would open a transaction Alembic then believes
    # is already managed, so it would never commit the migrations themselves.
    async with connectable.begin() as connection:
        await connection.run_sync(_ensure_version_table)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
