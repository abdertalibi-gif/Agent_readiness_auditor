"""Audit REST endpoints. Every endpoint requires authentication and scope
every result to the authenticated user's own audits.

In FREE MODE (MONETIZATION_ENABLED=false), anonymous audit creation is allowed.
"""

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_optional_user, get_owned_audit, rate_limited
from app.config import settings
from app.database import get_db_session
from app.models import Audit, AuditCheck, Page, Recommendation, Report, User, Website
from app.schemas.audit import (
    AuditCreate,
    AuditOut,
    AuditStatusOut,
    AuditSummaryOut,
    CheckOut,
    IssuesOut,
    PageOut,
    RecommendationOut,
)
from app.schemas.common import CATEGORY_LABELS
from app.services.audit_service import associate_audits_with_user, cancel_audit, create_audit

logger = logging.getLogger("auditor.api.audits")

router = APIRouter(prefix="/audits", tags=["audits"])

_MISSING = HTTPException(status_code=404, detail="Audit not found.")


async def get_audit_or_anonymous(
    audit_id: str,
    user: User | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db_session),
) -> Audit:
    """Fetch an audit, allowing access if:
    - User is authenticated and owns the audit, OR
    - Audit has no owner (anonymous audit) and MONETIZATION_ENABLED is false.
    """
    audit = await session.get(Audit, audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit not found.")
    
    # If user is authenticated, enforce ownership
    if user is not None:
        if audit.user_id != user.id:
            raise HTTPException(status_code=403, detail="You do not have access to this audit.")
        return audit
    
    # No authenticated user - allow access only to anonymous audits in FREE MODE
    if not settings.monetization_enabled and audit.user_id is None:
        return audit
    
    raise HTTPException(status_code=401, detail="Not authenticated.")


@router.post("", response_model=AuditOut, status_code=201)
async def start_audit(
    payload: AuditCreate,
    request: Request,
    user: User | None = Depends(get_optional_user),
    session: AsyncSession = Depends(get_db_session),
    _: None = Depends(rate_limited),
) -> Audit:
    # In FREE MODE, allow anonymous audit creation
    if not settings.monetization_enabled:
        try:
            audit = await create_audit(session, user.id if user else None, payload.url, max_pages=payload.max_pages)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return audit
    
    # Monetization enabled - require authentication
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        audit = await create_audit(session, user.id, payload.url, max_pages=payload.max_pages)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return audit


@router.get("", response_model=list[AuditOut])
async def list_audits(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[Audit]:
    audits = (
        await session.scalars(
            select(Audit)
            .where(Audit.user_id == user.id)
            .order_by(Audit.created_at.desc(), Audit.id.asc())
        )
    ).all()
    return list(audits)


@router.get("/{audit_id}", response_model=AuditOut)
async def get_audit(
    audit: Audit = Depends(get_audit_or_anonymous),
) -> Audit:
    return audit


@router.get("/{audit_id}/status", response_model=AuditStatusOut)
async def get_audit_status(
    audit: Audit = Depends(get_audit_or_anonymous),
) -> Audit:
    return audit


@router.get("/{audit_id}/summary", response_model=AuditSummaryOut)
async def get_audit_summary(
    audit: Audit = Depends(get_audit_or_anonymous),
) -> dict:
    summary = audit.summary_json or {}
    categories = []
    for cat in summary.get("categories", []):
        categories.append(
            {
                "category": cat["category"],
                "label": CATEGORY_LABELS.get(cat["category"], cat.get("label", cat["category"])),
                "score": cat["score"],
                "weight": cat["weight"],
                "status": cat["status"],
                "checks_total": cat["checks_total"],
                "checks_passed": cat["checks_passed"],
                "checks_failed": cat["checks_failed"],
                "checks_warning": cat["checks_warning"],
            }
        )
    rating_label = summary.get("rating_label") or (audit.rating or "").capitalize()
    return {
        "id": audit.id,
        "target_url": audit.target_url,
        "status": audit.status,
        "score": audit.score,
        "rating": audit.rating,
        "rating_label": rating_label,
        "overall_status": audit.rating,
        "categories": categories,
        "counts": summary.get("counts", {}),
        "ai_summary": summary.get("ai_summary"),
        "coverage": summary.get("coverage", {}),
        "platform": summary.get("platform"),
        "created_at": audit.created_at,
        "completed_at": audit.completed_at,
    }


@router.get("/{audit_id}/issues", response_model=IssuesOut)
async def get_issues(
    audit: Audit = Depends(get_audit_or_anonymous),
    severity: str | None = Query(default=None),
    status: str | None = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    query = select(AuditCheck).where(AuditCheck.audit_id == audit.id)
    if status:
        query = query.where(AuditCheck.status == status.upper())
    if severity:
        query = query.where(AuditCheck.severity == severity.upper())
    checks = (await session.scalars(query)).all()
    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
    checks = sorted(checks, key=lambda c: (order.get(c.severity, 9), c.id))
    return {"total": len(checks), "items": [CheckOut.model_validate(c).model_dump() for c in checks]}


@router.get("/{audit_id}/pages", response_model=list[PageOut])
async def get_pages(
    audit: Audit = Depends(get_audit_or_anonymous),
    session: AsyncSession = Depends(get_db_session),
) -> list[Page]:
    pages = (await session.scalars(select(Page).where(Page.audit_id == audit.id))).all()
    return list(pages)


@router.get("/{audit_id}/recommendations", response_model=list[RecommendationOut])
async def get_recommendations(
    audit: Audit = Depends(get_audit_or_anonymous),
    session: AsyncSession = Depends(get_db_session),
) -> list[Recommendation]:
    recs = (
        await session.scalars(
            select(Recommendation)
            .where(Recommendation.audit_id == audit.id)
            .order_by(Recommendation.priority.asc(), Recommendation.id.asc())
        )
    ).all()
    return list(recs)


@router.get("/{audit_id}/report")
async def get_report(
    audit: Audit = Depends(get_audit_or_anonymous),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    if audit.status not in ("COMPLETED", "PARTIAL", "FAILED"):
        raise HTTPException(status_code=409, detail="Report is not available until the audit finishes.")

    from app.services.report_service import generate_report_pdf

    try:
        pdf_bytes = await generate_report_pdf(session, audit)
    except Exception:  # noqa: BLE001
        logger.exception("report generation failed for audit_id=%s", audit.id)
        raise HTTPException(
            status_code=500, detail="Report generation failed. Please try again."
        ) from None

    session.add(Report(audit_id=audit.id, format="pdf", size_bytes=len(pdf_bytes)))
    await session.commit()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="agent-readiness-report-{audit.id[:8]}.pdf"'},
    )


@router.post("/{audit_id}/cancel", response_model=AuditStatusOut)
async def cancel(
    audit: Audit = Depends(get_audit_or_anonymous),
    session: AsyncSession = Depends(get_db_session),
) -> Audit:
    cancelled = await cancel_audit(session, audit.id)
    if cancelled is None:
        raise _MISSING
    return cancelled


@router.post("/claim-anonymous", response_model=dict)
async def claim_anonymous_audits(
    user: User = Depends(get_current_user),
    anonymous_audit_id: str | None = Header(default=None, alias="x-anonymous-audit-id"),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Associate the anonymous audit identified by ``x-anonymous-audit-id`` with the
    authenticated user. Only claims that specific audit (and its website) so one
    account can't scoop up other visitors' anonymous audits.
    """
    count = 0
    if anonymous_audit_id:
        result = await session.execute(
            select(Audit).where(Audit.id == anonymous_audit_id, Audit.user_id.is_(None))
        )
        audit = result.scalar_one_or_none()
        if audit is not None:
            audit.user_id = user.id
            if audit.website_id is not None:
                website = await session.get(Website, audit.website_id)
                if website is not None and website.owner_id is None:
                    website.owner_id = user.id
            await session.commit()
            count = 1
    return {"claimed": count}