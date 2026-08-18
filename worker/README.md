# Worker

Background processing for audits.

## Celery (production)

```bash
cd ../backend
pip install -e ".[dev]"
celery -A app.workers.celery_app.celery worker --loglevel=info -Q audit_crawl
```

Requires Redis (see `.env.example` `REDIS_URL`) and `JOB_MODE=celery` on the backend.

## Inline (development)

Set `JOB_MODE=inline` in the backend `.env`. Audits then run as in-process
asyncio tasks — no broker or worker process needed.
