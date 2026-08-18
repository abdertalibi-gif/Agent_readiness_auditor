"""Shared API dependencies."""

from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import hash_token
from app.core.rate_limit import RateLimitExceeded, check_rate_limit
from app.core.roles import ROLE_SUPER_ADMIN, STATUS_ACTIVE
from app.database import get_db_session
from app.models import Audit, AuthSession, User

bearer_scheme = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(status_code=401, detail="Not authenticated.")

_FORBIDDEN = HTTPException(status_code=403, detail="You do not have access to this audit.")

_SUSPENDED = HTTPException(
    status_code=403, detail="Your account has been suspended. Please contact support."
)


async def rate_limited(request: Request) -> None:
    """Per-IP rate limiting for audit creation and crawl-heavy endpoints."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "unknown"
    try:
        await check_rate_limit(f"api:{client_ip}")
    except RateLimitExceeded as exc:
        raise exc


async def get_current_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db_session),
) -> tuple[User, AuthSession]:
    """Resolve the bearer token to a live (non-expired, non-revoked) session.

    This is the server-side enforcement point for all authenticated endpoints.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _UNAUTHORIZED

    auth_session = await session.scalar(
        select(AuthSession).where(AuthSession.token_hash == hash_token(credentials.credentials))
    )
    if auth_session is None:
        raise _UNAUTHORIZED

    # Load the user first so suspension/deletion takes precedence over session
    # state: a suspended/deleted account must see 403 (with a clear message)
    # even though its sessions were revoked.
    user = await session.get(User, auth_session.user_id)
    if user is None:
        raise _UNAUTHORIZED
    if user.status != STATUS_ACTIVE:
        raise _SUSPENDED

    if auth_session.revoked_at is not None:
        raise _UNAUTHORIZED
    if _as_utc(auth_session.expires_at) <= datetime.now(UTC):
        raise _UNAUTHORIZED

    return user, auth_session


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db_session),
) -> User | None:
    """Optional authentication - returns User if valid token, None otherwise.
    
    Used for endpoints that work both with and without authentication (FREE MODE).
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None

    auth_session = await session.scalar(
        select(AuthSession).where(AuthSession.token_hash == hash_token(credentials.credentials))
    )
    if auth_session is None:
        return None
    if auth_session.revoked_at is not None:
        return None
    if _as_utc(auth_session.expires_at) <= datetime.now(UTC):
        return None

    user = await session.get(User, auth_session.user_id)
    return user


def _as_utc(dt: datetime) -> datetime:
    """Normalize datetimes that SQLite may have persisted as aware or naive."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


async def get_current_user(auth: tuple[User, AuthSession] = Depends(get_current_auth)) -> User:
    return auth[0]


async def require_super_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Authorize only platform SUPER_ADMIN accounts for /admin endpoints."""
    if user.role != ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Administrator privileges required.")
    return user


async def get_owned_audit(
    audit_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Audit:
    """Fetch an audit and enforce ownership. 404 for unknown ids, 403 if the
    audit belongs to another user."""
    audit = await session.get(Audit, audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit not found.")
    if audit.user_id != user.id:
        raise _FORBIDDEN
    return audit