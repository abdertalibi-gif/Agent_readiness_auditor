"""Celery task definitions. Thin wrappers over the audit service pipeline."""

import asyncio
import logging

from celery import shared_task

logger = logging.getLogger("auditor.workers.tasks")


@shared_task(name="audit.run")
def run_audit_task(audit_id: str) -> str:
    from app.services.audit_service import run_audit_job

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    loop.run_until_complete(run_audit_job(audit_id))
    return audit_id
