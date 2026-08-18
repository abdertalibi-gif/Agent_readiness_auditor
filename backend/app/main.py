"""FastAPI application entrypoint."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, OperationalError

from app.api.router import api_router
from app.config import settings
from app.core.rate_limit import RateLimitExceeded
from app.core.security import SecurityError
from app.logging_conf import configure_logging

logger = logging.getLogger("auditor")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging(level="DEBUG" if settings.debug else "INFO")
    if settings.app_env in ("development", "testing"):
        from app.database import create_schema

        try:
            await create_schema()
        except Exception:  # noqa: BLE001 - startup must survive a temporarily unavailable DB
            logger.exception(
                "database unavailable during startup. Check that PostgreSQL/SQLite is running "
                "and that DATABASE_URL is correct. The API will start anyway; requests that "
                "need the database will return a clear error until it is reachable.",
                extra={"database_url": settings.database_url},
            )
    if settings.app_env == "production" and (
        settings.secret_key in ("dev-secret-change-me", "change-me-in-production")
    ):
        logger.warning("SECRET_KEY is still set to the development default. Set a strong value in production.")
    logger.info("application started", extra={"env": settings.app_env, "job_mode": settings.job_mode})
    yield
    logger.info("application stopped")


app = FastAPI(
    title="Agent-Readiness Auditor API",
    version="1.0.0",
    description=(
        "Audit websites for Agent Readiness: discoverability, crawlability, semantic structure, "
        "structured data, content accessibility, navigation, technical quality and performance. "
        "All analysis is deterministic and evidence-based; AI is used only for grounded explanations."
    ),
    lifespan=lifespan,
)

# CORS is registered before the routers so every response (including the
# OPTIONS preflight for /api/auth/login) carries the correct headers.
# Origins come from settings (localhost dev defaults + FRONTEND_URL + CORS_ORIGINS),
# so the LAN origin is configurable and never a wildcard.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Anonymous-Audit-Id"],
)

app.include_router(api_router)


@app.exception_handler(SecurityError)
async def security_error_handler(_request: Request, exc: SecurityError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(_request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please wait and try again."},
        headers={"Retry-After": str(int(exc.retry_after))},
    )


@app.exception_handler(OperationalError)
async def db_operational_handler(_request: Request, _exc: OperationalError):
    logger.warning("database unavailable: %s", _exc.orig)
    return JSONResponse(
        status_code=503,
        content={"detail": "Database unavailable. Please try again in a moment."},
    )


@app.exception_handler(DBAPIError)
async def db_api_error_handler(_request: Request, _exc: DBAPIError):
    logger.warning("database error: %s", _exc.orig)
    return JSONResponse(
        status_code=503,
        content={"detail": "Database error. Please try again in a moment."},
    )


@app.exception_handler(Exception)
async def unhandled_handler(_request: Request, _exc: Exception):
    logger.exception("unhandled error")
    return JSONResponse(status_code=500, content={"detail": "An unexpected error occurred."})


@app.get("/")
async def root():
    return {"service": "Agent-Readiness Auditor", "docs": "/docs"}
