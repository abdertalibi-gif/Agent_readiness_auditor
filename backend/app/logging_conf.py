"""Structured JSON logging via structlog.

Logs are emitted as single-line JSON with a stable field set so they can be
shipped to any log aggregator. Never log secrets or raw request bodies.
"""

import logging
import sys

import structlog


# These third-party loggers emit one line per SQL statement at DEBUG. The
# application's own DEBUG level must never turn on per-query SQL logging: it
# dominates log volume and slows request handling. They are capped at WARNING
# regardless of the configured root level (engine ``echo=False`` stays off).
_LOUD_SQL_LOGERS = ("sqlalchemy.engine", "sqlalchemy.pool", "sqlalchemy.dialects", "aiosqlite")


def configure_logging(level: str = "INFO", json_logs: bool = True) -> None:
    """Configure stdlib + structlog once per process."""

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, level.upper(), logging.INFO),
    )

    for name in _LOUD_SQL_LOGERS:
        logging.getLogger(name).setLevel(logging.WARNING)

    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if json_logs:
        processors.append(structlog.processors.JSONRenderer(ensure_ascii=False))
    else:
        processors.append(structlog.dev.ConsoleRenderer())
        structlog.configure(
            processors=processors,
            wrapper_class=structlog.make_filtering_bound_logger(logging.NOTSET),
        )
        return

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(logging.NOTSET),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = "auditor"):
    return structlog.get_logger(name)
