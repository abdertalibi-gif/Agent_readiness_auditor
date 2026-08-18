"""Celery application for background audit jobs.

Configure the broker via `REDIS_URL`/`CELERY_BROKER_URL`. Run with:

    celery -A app.workers.celery_app.celery worker --loglevel=info -Q audit_crawl
"""

from celery import Celery

from app.config import settings

celery = Celery(
    "agent_readiness_auditor",
    broker=settings.effective_celery_broker,
    backend=settings.effective_celery_broker,
    include=["app.workers.tasks"],
)

celery.conf.update(
    task_default_queue="audit_crawl",
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_time_limit=600,
    task_soft_time_limit=540,
    broker_connection_retry_on_startup=True,
)
