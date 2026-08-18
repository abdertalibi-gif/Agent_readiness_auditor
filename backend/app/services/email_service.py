"""Transactional email delivery over real SMTP.

Requires ``SMTP_HOST`` (and usually ``SMTP_USER``/``SMTP_PASSWORD``) to be set
in the environment. No fake delivery: if SMTP is not configured or the send
fails, ``EmailConfigurationError``/``EmailDeliveryError`` is raised so callers
can log a diagnosable error instead of pretending the email was sent.

In non-production environments without SMTP configured, emails are written to a
local dev mailbox under ``backend/data/emails`` so the full flow (invite ->
accept/reject) can be tested without a mail server.

Reset tokens and passwords are never included in logs.
"""

import logging
import smtplib
import ssl
from datetime import UTC, datetime
from email.message import EmailMessage
from pathlib import Path

from app.config import settings

logger = logging.getLogger("auditor.email")

# Env vars that must be configured for real delivery to work.
REQUIRED_SMTP_VARS = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
    "FRONTEND_URL",
]


class EmailConfigurationError(RuntimeError):
    """Raised when SMTP is not configured (missing env vars)."""


class EmailDeliveryError(RuntimeError):
    """Raised when SMTP is configured but the send operation fails."""


# --- Localized email copy (en | fr | ar | es) -------------------------------
# Used for password reset and team-invitation emails. Falls back to English
# when an unknown/unsupported language is requested.

_SUPPORTED_LANGS = {"en", "fr", "ar", "es"}


def _norm_lang(language: str | None) -> str:
    lang = (language or "en").strip().lower()
    return lang if lang in _SUPPORTED_LANGS else "en"


_RESET_EMAILS: dict[str, dict[str, str]] = {
    "en": {
        "subject": "Reset your Agent Readiness Auditor password",
        "hello": "Hello,",
        "intro": "We received a request to reset your password for Agent Readiness Auditor.",
        "cta": "Click the button below to create a new password:",
        "button": "Reset Password",
        "orCopy": "Or copy this link:",
        "expires": "This link expires in {minutes} minutes.",
        "ignore": "If you did not request this, you can safely ignore this email.",
    },
    "fr": {
        "subject": "Réinitialisation de votre mot de passe",
        "hello": "Bonjour,",
        "intro": "Nous avons reçu une demande de réinitialisation de votre mot de passe pour Agent Readiness Auditor.",
        "cta": "Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :",
        "button": "Réinitialiser le mot de passe",
        "orCopy": "Ou copiez ce lien :",
        "expires": "Ce lien expire dans {minutes} minutes.",
        "ignore": "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.",
    },
    "ar": {
        "subject": "إعادة تعيين كلمة المرور",
        "hello": "مرحباً،",
        "intro": "لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بك لوكيل جاهزية المدقق.",
        "cta": "انقر على الزر أدناه لإنشاء كلمة مرور جديدة:",
        "button": "إعادة تعيين كلمة المرور",
        "orCopy": "أو انسخ هذا الرابط:",
        "expires": "تنتهي صلاحية هذا الرابط خلال {minutes} دقيقة.",
        "ignore": "إذا لم تكن أنت من أرسل هذا الطلب، يمكنك تجاهل هذا البريد الإلكتروني بأمان.",
    },
    "es": {
        "subject": "Restablecer tu contraseña",
        "hello": "Hola,",
        "intro": "Hemos recibido una solicitud para restablecer tu contraseña de Agent Readiness Auditor.",
        "cta": "Haz clic en el botón de abajo para crear una nueva contraseña:",
        "button": "Restablecer contraseña",
        "orCopy": "O copia este enlace:",
        "expires": "Este enlace caduca en {minutes} minutos.",
        "ignore": "Si no solicitaste esto, puedes ignorar este correo de forma segura.",
    },
}

_INVITE_EMAILS: dict[str, dict[str, str]] = {
    "en": {
        "subject": "You've been invited to join {workspace} on Agent Readiness Auditor",
        "hello": "Hello,",
        "intro": "You have been invited to join {workspace} on Agent Readiness Auditor.",
        "invitedBy": "Invited by",
        "role": "Role",
        "accept": "ACCEPT INVITATION",
        "reject": "REJECT INVITATION",
        "expires": "This invitation expires in {days} days.",
        "ignore": "If you were not expecting this invitation, you can safely ignore or reject it.",
    },
    "fr": {
        "subject": "Vous êtes invité à rejoindre {workspace} sur Agent Readiness Auditor",
        "hello": "Bonjour,",
        "intro": "Vous avez été invité à rejoindre {workspace} sur Agent Readiness Auditor.",
        "invitedBy": "Invité par",
        "role": "Rôle",
        "accept": "ACCEPTER L'INVITATION",
        "reject": "REFUSER L'INVITATION",
        "expires": "Cette invitation expire dans {days} jours.",
        "ignore": "Si vous n'attendiez pas cette invitation, vous pouvez l'ignorer ou la refuser en toute sécurité.",
    },
    "ar": {
        "subject": "تمت دعوتك للانضمام إلى {workspace} على وكيل جاهزية المدقق",
        "hello": "مرحباً،",
        "intro": "تمت دعوتك للانضمام إلى {workspace} على وكيل جاهزية المدقق.",
        "invitedBy": "دعاك",
        "role": "الدور",
        "accept": "قبول الدعوة",
        "reject": "رفض الدعوة",
        "expires": "تنتهي صلاحية هذه الدعوة خلال {days} أيام.",
        "ignore": "إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهلها أو رفضها بأمان.",
    },
    "es": {
        "subject": "Has sido invitado a unirte a {workspace} en Agent Readiness Auditor",
        "hello": "Hola,",
        "intro": "Has sido invitado a unirte a {workspace} en Agent Readiness Auditor.",
        "invitedBy": "Invitado por",
        "role": "Rol",
        "accept": "ACEPTAR INVITACIÓN",
        "reject": "RECHAZAR INVITACIÓN",
        "expires": "Esta invitación caduca en {days} días.",
        "ignore": "Si no esperabas esta invitación, puedes ignorarla o rechazarla de forma segura.",
    },
}


def _dev_mailbox_dir() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "data" / "emails"


def _write_dev_mailbox(message: EmailMessage, event: str) -> None:
    """In development, persist the email as a .eml file so flows are testable
    without a real SMTP server."""
    directory = _dev_mailbox_dir()
    directory.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S-%f")
    to_addr = (message["To"] or "unknown").replace("@", "_at_").replace("/", "_")
    path = directory / f"{timestamp}-{event}-{to_addr}.eml"
    try:
        path.write_text(message.as_string(), encoding="utf-8")
    except OSError:
        logger.exception("failed to write dev mailbox email to %s", path)
        raise
    logger.info("email written to local dev mailbox", extra={"path": str(path), "to": message["To"]})


def _smtp_login(smtp: smtplib.SMTP) -> None:
    """Authenticate with the configured credentials (when present).

    Never logs the password; failures are logged with a hint and re-raised
    so the caller can convert them into a controlled ``EmailDeliveryError``.
    """
    if not settings.smtp_user:
        return
    try:
        smtp.login(settings.smtp_user, settings.smtp_password)
    except smtplib.SMTPAuthenticationError:
        logger.error(
            "SMTP authentication failed (check SMTP_USER and SMTP_PASSWORD)",
            extra={"host": settings.smtp_host, "port": settings.smtp_port},
        )
        raise
    logger.info("SMTP authentication successful")


def _send_smtp(message: EmailMessage) -> None:
    context = ssl.create_default_context()
    logger.info(
        "SMTP configuration loaded",
        extra={
            "host": settings.smtp_host,
            "port": settings.smtp_port,
            "user_set": bool(settings.smtp_user),
            "password_set": bool(settings.smtp_password),
            "from_set": bool(settings.smtp_from),
        },
    )
    if settings.smtp_host and not settings.smtp_user:
        logger.warning(
            "SMTP host is configured but SMTP_USER is empty: the server may "
            "reject unauthenticated sends (e.g. Gmail requires an app password)."
        )
    if settings.smtp_user and not settings.smtp_password:
        logger.warning(
            "SMTP_USER is configured but SMTP_PASSWORD is empty: authentication will fail."
        )

    if settings.smtp_port == 465:
        # Implicit TLS (SMTPS).
        logger.info("Connecting to SMTP server (implicit TLS)", extra={"host": settings.smtp_host, "port": settings.smtp_port})
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15, context=context) as smtp:
            smtp.ehlo()
            _smtp_login(smtp)
            smtp.send_message(message)
    else:
        # Plain SMTP + STARTTLS (587/25).
        logger.info("Connecting to SMTP server (STARTTLS)", extra={"host": settings.smtp_host, "port": settings.smtp_port})
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.ehlo()
            try:
                smtp.starttls(context=context)
                smtp.ehlo()
                logger.info("STARTTLS successful")
            except smtplib.SMTPNotSupportedError:
                pass
            _smtp_login(smtp)
            smtp.send_message(message)
    logger.info("Email accepted by SMTP server")


def _deliver(message: EmailMessage, event: str) -> None:
    """Deliver via SMTP, or write to the local dev mailbox when SMTP is not
    configured in a non-production environment."""
    if not settings.smtp_host:
        if settings.app_env != "production":
            _write_dev_mailbox(message, event)
            return
        raise EmailConfigurationError(
            "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, "
            "SMTP_PASSWORD and SMTP_FROM in the .env file to send real emails. "
            f"Required env vars: {', '.join(REQUIRED_SMTP_VARS)}."
        )
    _send_smtp(message)


def send_password_reset_email(to_email: str, reset_url: str, language: str | None = None) -> None:
    """Send the password-reset email in the user's preferred language.

    Raises ``EmailConfigurationError`` when SMTP is not configured (production)
    and ``EmailDeliveryError`` when the SMTP send fails. In development without
    SMTP the message is written to the local dev mailbox.
    """
    message = _build_reset_email(to_email, reset_url, language)
    if settings.smtp_host:
        try:
            _send_smtp(message)
            logger.info("password reset email sent via smtp", extra={"to": to_email})
            return
        except (smtplib.SMTPException, OSError) as exc:
            raise EmailDeliveryError(f"SMTP delivery failed: {exc}") from exc
    _deliver(message, "password-reset")


def _build_reset_email(to_email: str, reset_url: str, language: str | None = None) -> EmailMessage:
    from_addr = settings.smtp_from or settings.smtp_user or "no-reply@localhost"
    expiry_minutes = settings.password_reset_token_ttl_minutes
    copy = _RESET_EMAILS[_norm_lang(language)]

    message = EmailMessage()
    message["Subject"] = copy["subject"]
    message["From"] = from_addr
    message["To"] = to_email

    expires_text = copy["expires"].format(minutes=expiry_minutes)
    text = (
        f"{copy['hello']}\n\n"
        f"{copy['intro']}\n\n"
        f"{copy['cta']}\n\n"
        f"{reset_url}\n\n"
        f"{expires_text}\n\n"
        f"{copy['ignore']}\n\n"
        "Agent Readiness Auditor"
    )
    html = (
        "<html><body style='font-family:sans-serif;color:#1f2937'>"
        f"<p>{copy['hello']}</p>"
        f"<p>{copy['intro'].replace('Agent Readiness Auditor', '<strong>Agent Readiness Auditor</strong>')}</p>"
        f"<p>{copy['cta']}</p>"
        f"<p style='margin:24px 0'>"
        f"<a href='{reset_url}' "
        "style='background-color:#0f766e;color:#ffffff;padding:12px 24px;"
        "border-radius:6px;text-decoration:none;font-weight:600'>"
        f"{copy['button']}</a></p>"
        f"<p style='font-size:12px;color:#6b7280'>{copy['orCopy']} "
        f"<a href='{reset_url}'>{reset_url}</a></p>"
        f"<p style='font-size:12px;color:#6b7280'>{expires_text}</p>"
        f"<p style='font-size:12px;color:#6b7280'>{copy['ignore']}</p>"
        "<p style='margin-top:32px'><strong>Agent Readiness Auditor</strong></p>"
        "</body></html>"
    )
    message.set_content(text)
    message.add_alternative(html, subtype="html")
    return message


def send_invitation_email(
    to_email: str,
    workspace_name: str,
    inviter_name: str,
    role: str,
    accept_url: str,
    reject_url: str,
    language: str | None = None,
    inviter_language: str | None = None,
) -> None:
    """Send a workspace invitation email with ACCEPT / REJECT actions.

    ``language`` selects the email language (falls back to English). If not
    provided, the inviter's preferred language is used.

    Raises ``EmailConfigurationError`` (production, SMTP unset) or
    ``EmailDeliveryError`` (SMTP send failed). In non-production with no SMTP
    configured the message is written to the local dev mailbox.
    """
    from_addr = settings.smtp_from or settings.smtp_user or "no-reply@localhost"
    copy = _INVITE_EMAILS[_norm_lang(language or inviter_language)]
    invited_by = inviter_name or "a workspace admin"

    message = EmailMessage()
    message["Subject"] = copy["subject"].format(workspace=workspace_name)
    message["From"] = from_addr
    message["To"] = to_email

    expires_days = settings.invitation_token_ttl_days
    expires_text = copy["expires"].format(days=expires_days)

    text = (
        f"{copy['intro'].format(workspace=workspace_name)}\n\n"
        f"{copy['invitedBy']}: {invited_by}\n"
        f"{copy['role']}: {role}\n\n"
        f"{copy['accept']}\n"
        f"{accept_url}\n\n"
        f"{copy['reject']}\n"
        f"{reject_url}\n\n"
        f"{expires_text}\n\n"
        f"{copy['ignore']}\n\n"
        "Agent Readiness Auditor"
    )
    html = (
        "<html><body style='font-family:sans-serif;color:#1f2937'>"
        f"<p>{copy['hello']}</p>"
        f"<p>{copy['intro'].format(workspace=f'<strong>{workspace_name}</strong>').replace('Agent Readiness Auditor', '<strong>Agent Readiness Auditor</strong>')}</p>"
        "<table style='margin:16px 0' cellpadding='0' cellspacing='0'>"
        f"<tr><td style='padding:4px 16px 4px 0;color:#6b7280;font-size:13px'>{copy['invitedBy']}</td>"
        f"<td style='padding:4px 0;font-size:14px'>{invited_by}</td></tr>"
        f"<tr><td style='padding:4px 16px 4px 0;color:#6b7280;font-size:13px'>{copy['role']}</td>"
        f"<td style='padding:4px 0;font-size:14px'>{role}</td></tr>"
        "</table>"
        "<p style='margin:24px 0'>"
        f"<a href='{accept_url}' "
        "style='background-color:#0f766e;color:#ffffff;padding:12px 24px;"
        "border-radius:6px;text-decoration:none;font-weight:600'>"
        f"{copy['accept']}</a></p>"
        "<p style='margin:0 0 24px 0'>"
        f"<a href='{reject_url}' "
        "style='background-color:#ffffff;color:#dc2626;padding:12px 24px;"
        "border-radius:6px;text-decoration:none;font-weight:600;border:1px solid #fecaca;'>"
        f"{copy['reject']}</a></p>"
        f"<p style='font-size:12px;color:#6b7280'>{expires_text}</p>"
        f"<p style='font-size:12px;color:#6b7280'>{copy['ignore']}</p>"
        "<p style='margin-top:32px'><strong>Agent Readiness Auditor</strong></p>"
        "</body></html>"
    )
    message.set_content(text)
    message.add_alternative(html, subtype="html")
    if settings.smtp_host:
        try:
            _send_smtp(message)
            logger.info("invitation email sent via smtp", extra={"to": to_email})
            return
        except (smtplib.SMTPException, OSError) as exc:
            raise EmailDeliveryError(f"SMTP delivery failed: {exc}") from exc
    _deliver(message, "invitation")
