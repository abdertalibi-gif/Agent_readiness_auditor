"""Audit orchestration service.

Lifecycle: create -> enqueue -> run_audit_job (crawl -> analyze -> score -> AI ->
persist). All user-facing error messages are safe and generic; detailed errors
go to structured logs, never to users.
"""

import logging
import math
import time
import traceback
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analyzers.base import CrawlContext
from app.analyzers.registry import run_analyzers
from app.config import settings
from app.core.queue import job_runner
from app.core.security import SecurityError, validate_public_url
from app.crawler.client import FetchError
from app.crawler.crawler import crawl_website, normalize_url
from app.database import async_session_factory
from app.models import Audit, AuditCheck, Page, Recommendation, Website
from app.scoring.engine import score_checks

logger = logging.getLogger("auditor.audit_service")

STEPS = [
    "Validating URL",
    "Fetching robots.txt",
    "Analyzing sitemap",
    "Crawling pages",
    "Analyzing structure",
    "Checking metadata",
    "Checking structured data",
    "Calculating score",
    "Generating recommendations",
]

# Machine-readable keys aligned 1:1 with STEPS (order matters). These are stored
# in ``audits.failed_step`` and surfaced to clients so the UI can name the step.
STEP_KEYS = [
    "validating_url",
    "fetching_robots",
    "analyzing_sitemap",
    "crawling_pages",
    "analyzing_structure",
    "checking_metadata",
    "checking_structured_data",
    "calculating_score",
    "generating_recommendations",
]

SEVERITY_PRIORITY = {"CRITICAL": "CRITICAL", "HIGH": "HIGH", "MEDIUM": "MEDIUM", "LOW": "LOW", "INFO": "LOW"}


def _step_label(step_key: str | None) -> str:
    try:
        return STEPS[STEP_KEYS.index(step_key)]
    except (ValueError, TypeError):
        return "Processing"


def _log_audit_error(
    audit_id: str,
    step: str | None,
    url: str | None,
    exc: BaseException,
    *,
    page_url: str | None = None,
) -> None:
    """Log a pipeline error with the fields the on-call/dev team needs.

    Severity/URLs only — never credentials, tokens or request bodies.
    """
    lines = [
        "[Audit] audit_id=%s" % audit_id,
        "[Audit] step=%s" % (step or "unknown"),
        "[Audit] url=%s" % (url or "-"),
    ]
    if page_url:
        lines.append("[Audit] page=%s" % page_url)
    lines.append("[Audit] error_type=%s" % type(exc).__name__)
    lines.append("[Audit] error=%s" % exc)
    lines.append("[Audit] traceback=%s" % (traceback.format_exc().strip() or "none"))
    logger.error("\n".join(lines))


# ---------- Creation ----------
async def create_audit(
    session: AsyncSession,
    user_id: str | None,
    raw_url: str,
    max_pages: int | None = None,
) -> Audit:
    """Validate, persist a Website + Audit owned by ``user_id`` (or anonymous if None), and dispatch the job."""
    try:
        validate_public_url(raw_url)
    except SecurityError as exc:
        raise ValueError(str(exc)) from exc

    base_url = normalize_url(raw_url)
    domain = _domain_of(base_url)

    # FREE MODE caps every audit to a small, fast scope (no payment required).
    if not settings.monetization_enabled:
        max_pages = 5

    website = (await session.scalars(select(Website).where(Website.domain == domain))).first()
    if not website:
        website = Website(domain=domain, base_url=base_url, owner_id=user_id)
        session.add(website)
        await session.flush()
    elif website.owner_id is None and user_id is not None:
        website.owner_id = user_id
        await session.flush()

    audit = Audit(
        website_id=website.id,
        user_id=user_id,
        target_url=base_url,
        max_pages=max_pages,
        status="QUEUED",
        progress_json={
            "stage": "queued",
            "steps": [{"label": s, "done": s == "Validating URL"} for s in STEPS],
            "pages_crawled": 0,
            "pages_total": max_pages or settings.crawl_max_pages,
            "message": "Audit queued.",
        },
    )
    session.add(audit)
    await session.commit()
    await session.refresh(audit)

    try:
        job_runner.enqueue(audit.id)
    except Exception:  # noqa: BLE001
        logger.exception("failed to enqueue audit job for audit_id=%s", audit.id)

    return audit


async def associate_audits_with_user(session: AsyncSession, user_id: str, anonymous_user_id: str | None = None) -> int:
    """Associate all audits owned by anonymous_user_id (or all NULL user_id) with the given user.

    Returns the number of audits updated.
    """
    from app.models import Audit, Website

    if anonymous_user_id is not None:
        # Specific anonymous user - associate their audits
        audits_to_update = (await session.scalars(
            select(Audit).where(Audit.user_id == anonymous_user_id)
        )).all()
        for audit in audits_to_update:
            audit.user_id = user_id
        # Also update websites
        websites_to_update = (await session.scalars(
            select(Website).where(Website.owner_id == anonymous_user_id)
        )).all()
        for website in websites_to_update:
            website.owner_id = user_id
    else:
        # No specific anonymous user - associate all NULL user_id audits
        # This is a broader claim - use with caution
        audits_to_update = (await session.scalars(
            select(Audit).where(Audit.user_id.is_(None))
        )).all()
        for audit in audits_to_update:
            audit.user_id = user_id
        websites_to_update = (await session.scalars(
            select(Website).where(Website.owner_id.is_(None))
        )).all()
        for website in websites_to_update:
            website.owner_id = user_id

    if audits_to_update or websites_to_update:
        await session.commit()

    return len(audits_to_update)


def _domain_of(url: str) -> str:
    from urllib.parse import urlparse

    return urlparse(url).netloc.lower()


# ---------- Background job ----------
async def run_audit_job(audit_id: str) -> None:
    async with async_session_factory() as session:
        audit = await session.get(Audit, audit_id)
        if audit is None:
            logger.error("audit job referenced missing audit_id=%s", audit_id)
            return
        try:
            await _execute_audit(session, audit)
        except Exception as exc:  # noqa: BLE001 - the outer guard keeps the worker alive
            step = getattr(audit, "_pipeline_step", None) or "unknown"
            _log_audit_error(audit_id, step, audit.target_url, exc)
            audit.status = "FAILED"
            audit.failed_step = step
            audit.error_message = _safe_failure_message(step)
            audit.completed_at = _now()
            try:
                await session.commit()
            except Exception:  # noqa: BLE001
                await session.rollback()
                logger.exception("failed to persist failure state for audit_id=%s", audit_id)


def _safe_failure_message(step: str | None) -> str:
    label = _step_label(step)
    if step and step != "unknown":
        return f"The audit failed while {label.lower()}. Please check the website and try again."
    return "The audit failed to complete. Please try again later."


async def _execute_audit(session: AsyncSession, audit: Audit) -> None:
    audit.status = "RUNNING"
    audit.started_at = _now()
    audit._pipeline_step = "validating_url"
    await _set_progress(session, audit, "running", 1, "Validating URL", percent=0)
    await session.commit()

    # --- Crawl ---
    page_limit = audit.max_pages or settings.crawl_max_pages

    async def on_stage(stage: str, info: dict | None = None) -> None:
        if stage == "robots":
            audit._pipeline_step = "fetching_robots"
            ok = bool(info.get("ok", True)) if info else True
            msg = "robots.txt fetched" if ok else "robots.txt unavailable — continuing"
            await _set_progress(session, audit, "running", 2, msg, percent=10)
        elif stage == "sitemap":
            audit._pipeline_step = "analyzing_sitemap"
            ok = bool(info.get("ok", True)) if info else True
            count = info.get("count", 0) if info else 0
            msg = (
                "sitemap analyzed"
                if ok
                else "sitemap unavailable — continuing"
            )
            if ok and count:
                msg += f" ({count} URLs)"
            await _set_progress(session, audit, "running", 3, msg, percent=20)
        elif stage == "crawling":
            audit._pipeline_step = "crawling_pages"
            await _set_progress(session, audit, "crawling", 4, "Crawling pages", percent=40)
        await session.commit()

    async def on_page(crawled: int, total: int) -> None:
        nonlocal last_progress_commit
        audit._pipeline_step = "crawling_pages"
        pct = 40 + int(20 * crawled / max(total, 1))
        await _set_progress(
            session,
            audit,
            "crawling",
            4,
            f"Crawling {crawled}/{total} pages",
            percent=pct,
            pages_crawled=crawled,
        )
        # Committing once per page is up to 50 writes for a full crawl; the
        # progress bar only needs ~2 updates/second. Always flush the last page
        # so the "crawled N pages" state is durable before analysis starts.
        now = time.monotonic()
        if crawled >= total or now - last_progress_commit >= 0.5:
            last_progress_commit = now
            await session.commit()

    last_progress_commit = time.monotonic()

    try:
        crawl = await crawl_website(
            audit.target_url,
            max_pages=page_limit,
            on_stage=on_stage,
            on_page=on_page,
        )
    except SecurityError:
        await _fail(session, audit, "This URL could not be validated as a public website address.")
        return
    except (FetchError, ValueError) as exc:
        _log_audit_error(audit.id, audit._pipeline_step, audit.target_url, exc)
        await _fail(session, audit, str(exc))
        return

    if not crawl.pages:
        await _fail(session, audit, "Unable to access this website.")
        return

    await _set_progress(
        session,
        audit,
        "crawling",
        4,
        f"Crawled {len(crawl.pages)} page(s)",
        percent=60,
        pages_crawled=len(crawl.pages),
    )
    await session.commit()

    # --- Analyze ---
    audit._pipeline_step = "analyzing_structure"
    ctx = CrawlContext(base_url=crawl.base_url, crawl=crawl)
    checks = await run_analyzers(ctx)

    await _set_progress(session, audit, "analyzing", 7, "Analyzing structure and metadata", percent=80)
    await session.commit()

    # --- Score ---
    audit._pipeline_step = "calculating_score"
    score_result = score_checks(checks)

    await _set_progress(session, audit, "scoring", 8, "Calculating score", percent=90)
    await session.commit()

    # --- AI (best effort, grounded) ---
    ai_summary = None
    if settings.is_ai_enabled:
        try:
            from app.ai.analysis import generate_summary

            ai_summary = await generate_summary(audit.target_url, score_result, checks)
        except Exception as exc:  # noqa: BLE001
            _log_audit_error(audit.id, "ai_summary", audit.target_url, exc)

    # --- Persist pages ---
    audit._pipeline_step = "persisting_results"
    for page in crawl.pages:
        session.add(
            Page(
                audit_id=audit.id,
                url=page.url,
                final_url=page.final_url,
                status_code=page.status_code,
                depth=page.depth,
                is_same_domain=True,
                content_type=page.content_type,
                response_time_ms=page.response_time_ms,
                title=page.title,
                meta_description=page.meta_description,
                canonical=page.canonical,
                robots_meta=_json_safe(page.robots_meta),
                headings=_json_safe(page.headings),
                links_count=len(page.links),
                broken_links=_json_safe(page.broken_links_for_page),
                images=_json_safe([{"src": i.src, "alt": i.alt} for i in page.images][:50]),
                structured_data=_json_safe(page.structured_data),
                open_graph=_json_safe(page.open_graph),
                text_preview=page.text[:500] if page.text else None,
                word_count=page.word_count,
                lang=page.lang,
                has_forms=page.has_forms,
                has_buttons=page.has_buttons,
                js_dependency_count=page.js_scripts,
            )
        )

    # --- Persist checks + recommendations ---
    for check in checks:
        session.add(
            AuditCheck(
                audit_id=audit.id,
                check_id=check.check_id,
                category=check.category,
                name=check.name,
                description=check.description,
                status=check.status,
                severity=check.severity,
                score=check.score,
                weight=check.weight,
                evidence=_json_safe(check.evidence),
                recommendation=check.recommendation,
                why_matters=check.why_matters,
                ai_explanation=check.ai_explanation,
            )
        )

    for check in checks:
        if check.status in ("FAIL", "WARNING") and check.recommendation:
            session.add(
                Recommendation(
                    audit_id=audit.id,
                    check_id=check.check_id,
                    priority=SEVERITY_PRIORITY.get(check.severity, "MEDIUM"),
                    title=check.name,
                    description=check.description,
                    how_to_fix=check.recommendation,
                    effort=_effort_for(check.severity),
                    impact=_impact_for(check.severity),
                    source="engine",
                )
            )

    # --- Summary + finalize ---
    status = "COMPLETED"
    if crawl.truncated or len(crawl.pages) < page_limit:
        status = "PARTIAL"

    summary = {
        "categories": [
            {
                "category": cat.category,
                "label": cat.label,
                "score": cat.score,
                "weight": cat.weight,
                "status": cat.status,
                "checks_total": cat.checks_total,
                "checks_passed": cat.checks_passed,
                "checks_failed": cat.checks_failed,
                "checks_warning": cat.checks_warning,
            }
            for cat in score_result.categories.values()
        ],
        "counts": score_result.counts,
        "coverage": {
            "pages": len(crawl.pages),
            "sitemap_urls": len(crawl.sitemap_urls),
            "crawl_errors": len(crawl.crawl_errors),
            "truncated": crawl.truncated,
        },
        "ai_summary": ai_summary,
        "rating_label": score_result.rating_label,
        "platform": ctx.extra.get("platform", "Unknown"),
    }

    audit.status = status
    audit.score = score_result.overall
    audit.rating = score_result.rating
    audit.summary_json = _json_safe(summary)
    audit.completed_at = _now()
    audit.error_message = None
    audit.failed_step = None

    await _set_progress(
        session,
        audit,
        "completed",
        9,
        "Audit complete" + (" with limited coverage." if status == "PARTIAL" else "."),
        percent=100,
    )
    await session.commit()
    logger.info(
        "audit completed",
        extra={"audit_id": audit.id, "score": audit.score, "pages": len(crawl.pages)},
    )


async def _fail(session: AsyncSession, audit: Audit, message: str) -> None:
    audit.status = "FAILED"
    audit.error_message = message
    audit.failed_step = getattr(audit, "_pipeline_step", None) or "unknown"
    audit.completed_at = _now()
    await _set_progress(session, audit, "failed", None, message)
    await session.commit()
    logger.info("audit failed: %s", message, extra={"audit_id": audit.id})


async def _set_progress(
    session: AsyncSession,
    audit: Audit,
    stage: str,
    step_index: int | None,
    message: str,
    *,
    percent: int | None = None,
    pages_crawled: int | None = None,
) -> None:
    progress = dict(audit.progress_json or {})
    steps = progress.get("steps") or [{"label": s, "done": False} for s in STEPS]
    if step_index is not None:
        for i, step in enumerate(steps):
            step["done"] = i < step_index
    progress.update(
        {
            "stage": stage,
            "steps": steps,
            "pages_crawled": pages_crawled if pages_crawled is not None else progress.get("pages_crawled", 0),
            "pages_total": audit.max_pages or settings.crawl_max_pages,
            "message": message,
            "percent": percent if percent is not None else progress.get("percent", 0),
        }
    )
    audit.progress_json = progress


async def cancel_audit(session: AsyncSession, audit_id: str) -> Audit | None:
    audit = await session.get(Audit, audit_id)
    if audit is None:
        return None
    if audit.status in ("QUEUED", "RUNNING"):
        audit.status = "CANCELLED"
        audit.completed_at = _now()
        audit.progress_json = {**(audit.progress_json or {}), "stage": "cancelled", "message": "Audit cancelled."}
        await session.commit()
    return audit


def _json_safe(value: Any) -> Any:
    """Sanitize arbitrary crawl data into a bounded, JSON-encodable structure.

    JSON-LD from real sites can be arbitrarily deep and can contain weird
    Python objects; cap the depth and size so persistence can never blow the
    stack or produce non-JSON values (NaN/Infinity would break Postgres JSONB).
    """
    if value is None:
        return None
    return _clean(value)


def _clean(value, _depth: int = 0):
    if _depth > 8:
        return str(value)[:200]
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return value
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple, set)):
        return [_clean(v, _depth + 1) for v in list(value)[:50]]
    if isinstance(value, dict):
        return {str(k)[:200]: _clean(v, _depth + 1) for k, v in list(value.items())[:50]}
    return str(value)[:200]


def _effort_for(severity: str) -> str:
    return {"CRITICAL": "High", "HIGH": "Medium", "MEDIUM": "Medium", "LOW": "Low", "INFO": "Low"}.get(severity, "Medium")


def _impact_for(severity: str) -> str:
    return {"CRITICAL": "High", "HIGH": "High", "MEDIUM": "Medium", "LOW": "Low", "INFO": "Low"}.get(severity, "Medium")


def _now() -> datetime:
    return datetime.now(UTC)
