"""Authentication primitives: password hashing and opaque session tokens.

Passwords are hashed with Argon2 (via pwdlib) so they are never stored in
plain text. Sessions use random bearer tokens; only a SHA-256 digest of the
token is persisted, so a leaked database cannot be replayed into API calls.
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from pwdlib import PasswordHash

from app.config import settings

_password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _password_hash.verify(password, hashed)
    except (ValueError, TypeError):  # malformed hash / params
        return False


def generate_bearer_token() -> str:
    return secrets.token_urlsafe(32)


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


def generate_invitation_token() -> str:
    """Cryptographically secure 256-bit token used in invitation links.

    The token itself is only ever sent over email; the database stores only
    ``hash_token(token)``.
    """
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def session_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(days=settings.auth_token_ttl_days)


def password_reset_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(minutes=settings.password_reset_token_ttl_minutes)


def invitation_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(days=settings.invitation_token_ttl_days)