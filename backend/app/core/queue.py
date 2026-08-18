"""Job queue abstraction.

Audits run as background jobs. Two implementations exist:

- `InlineJobRunner` — runs the audit pipeline as an in-process asyncio task.
  Zero infrastructure; used in development, tests and small single-instance
  deployments.
- `CeleryJobRunner` — dispatches to a Celery worker + Redis broker (production).

Switching is done via `JOB_MODE` in settings. The rest of the app never talks
to a specific runner.
"""

import asyncio
import logging
from typing import Protocol

from app.config import settings

logger = logging.getLogger("auditor.queue")


class JobRunner(Protocol):
    mode: str

    def enqueue(self, audit_id: str) -> None: ...


class InlineJobRunner:
    """Runs audits in-process via asyncio background tasks."""

    mode = "inline"

    def enqueue(self, audit_id: str) -> None:
        from app.services.audit_service import run_audit_job

        async def _run() -> None:
            try:
                await run_audit_job(audit_id)
            except Exception:  # noqa: BLE001 - job errors are handled inside the pipeline
                logger.exception("inline audit job crashed for audit_id=%s", audit_id)

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        loop.create_task(_run())


class CeleryJobRunner:
    """Dispatches audits to a Celery worker via Redis broker."""

    mode = "celery"

    def enqueue(self, audit_id: str) -> None:
        from app.workers.tasks import run_audit_task

        run_audit_task.delay(audit_id)


def get_job_runner() -> JobRunner:
    if settings.job_mode == "celery":
        return CeleryJobRunner()
    return InlineJobRunner()


job_runner = get_job_runner()
