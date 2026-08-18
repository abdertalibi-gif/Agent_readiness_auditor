"""Authentication endpoints: register, login, logout, me, password reset."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_auth, get_current_user
from app.config import settings
from app.core.auth import (
    generate_bearer_token,
    generate_reset_token,
    hash_password,
    hash_token,
    password_reset_expiry,
    session_expiry,
    verify_password,
)
from app.database import get_db_session
from app.models import AuthSession, PasswordResetToken, User
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenOut,
    UpdatePreferencesRequest,
    UserOut,
)
from app.services.email_service import (
    EmailConfigurationError,
    EmailDeliveryError,
    send_password_reset_email,
)

logger = logging.getLogger("auditor.api.auth")

router = APIRouter(prefix="/auth", tags=["auth"])

_INVALID_RESET_TOKEN = HTTPException(
    status_code=400, detail="Ce lien de réinitialisation est invalide ou a expiré."
)


@router.post("/register", response_model=UserOut, status_code=201)
async def register(
    payload: RegisterRequest,
    session: AsyncSession = Depends(get_db_session),
) -> User:
    email = payload.email.lower().strip()

    existing = await session.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = User(
        email=email,
        name=payload.name.strip(),
        password_hash=hash_password(payload.password),
        company_name=(payload.company_name or "").strip() or None,
        preferred_language=payload.preferred_language,
    )
    session.add(user)
    try:
        await session.commit()
    except Exception:  # noqa: BLE001 - concurrent duplicate emails
        await session.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from None
    await session.refresh(user)

    # Provision the new account's personal workspace and auto-connect any
    # pending team invitations addressed to this email.
    from app.services import team_service

    await team_service.get_or_create_personal_workspace(session, user)
    await team_service.accept_pending_invitations_for_email(session, user)

    logger.info("user registered", extra={"user_id": user.id, "email": user.email})
    return user


@router.post("/login", response_model=TokenOut)
async def login(
    payload: LoginRequest,
    session: AsyncSession = Depends(get_db_session),
) -> TokenOut:
    email = payload.email.lower().strip()
    user = await session.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        # Always verify against a hash to keep timing roughly uniform.
        verify_password(payload.password, hash_password("dummy-password-verification"))
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    # Suspended and soft-deleted accounts must not be able to log in.
    if user.status == "SUSPENDED":
        raise HTTPException(status_code=403, detail="Your account has been suspended. Please contact support.")
    if user.status == "DELETED":
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = generate_bearer_token()
    auth_session = AuthSession(
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=session_expiry(),
    )
    session.add(auth_session)
    await session.commit()

    logger.info("user logged in", extra={"user_id": user.id})
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/logout", status_code=204)
async def logout(
    auth: tuple[User, AuthSession] = Depends(get_current_auth),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    _user, auth_session = auth
    auth_session.revoked_at = datetime.now(UTC)
    await session.commit()
    logger.info("session revoked", extra={"session_id": auth_session.id})


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserOut)
async def update_preferences(
    payload: UpdatePreferencesRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> User:
    """Update the authenticated user's preferences (e.g. UI language)."""
    user.preferred_language = payload.preferred_language
    await session.commit()
    await session.refresh(user)
    logger.info("user preferences updated", extra={"user_id": user.id, "language": user.preferred_language})
    return user


@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Request a password reset email.

    Always returns the same response whether or not the email exists so that
    the endpoint cannot be used to enumerate registered accounts. The email is
    only sent when the account exists.
    """
    email = payload.email.lower().strip()
    logger.info("Forgot password request received", extra={"email_normalized": bool(email)})
    user = await session.scalar(select(User).where(User.email == email))
    logger.info("User lookup: %s", "FOUND" if user is not None else "NOT FOUND")

    if user is not None:
        now = datetime.now(UTC)

        # Invalidate any previous unused tokens so only the newest link works.
        await session.execute(
            update(PasswordResetToken)
            .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
            .values(used_at=now)
        )

        token = generate_reset_token()
        reset = PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=password_reset_expiry(),
        )
        session.add(reset)
        await session.commit()
        logger.info("Reset token generated: YES (stored as hash, not logged)")

        reset_url = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"
        try:
            send_password_reset_email(user.email, reset_url, language=user.preferred_language or "en")
            logger.info("Forgot password email sent successfully", extra={"to": user.email})
        except EmailConfigurationError as exc:
            # SMTP vars are missing. Do not pretend the email was sent: log a
            # clear, diagnosable error. The client still receives the generic
            # response so account existence is never leaked.
            logger.error(
                "password reset email NOT sent - SMTP is not configured: %s",
                exc,
                extra={"to": user.email},
            )
        except EmailDeliveryError as exc:
            logger.error("password reset email delivery FAILED: %s", exc, extra={"to": user.email})

    return {"detail": "Si un compte existe pour cet email, un lien de réinitialisation a été envoyé."}


@router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordRequest,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Validate a single-use reset token and set a new password."""
    reset = await session.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == hash_token(payload.token)
        )
    )
    if reset is None:
        raise _INVALID_RESET_TOKEN

    now = datetime.now(UTC)
    expires_at = reset.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if reset.used_at is not None or expires_at <= now:
        raise _INVALID_RESET_TOKEN

    user = await session.get(User, reset.user_id)
    if user is None:
        raise _INVALID_RESET_TOKEN

    user.password_hash = hash_password(payload.new_password)
    reset.used_at = now

    # Revoke all existing sessions so any live tokens for this user are invalidated.
    await session.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )

    await session.commit()
    logger.info("password reset completed", extra={"user_id": user.id})
    return {"detail": "Votre mot de passe a été réinitialisé avec succès."}