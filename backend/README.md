# Agent-Readiness Auditor backend

FastAPI backend: safe crawler, analyzers, scoring engine, AI analysis, PDF reports, background jobs.

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

API docs at http://localhost:8000/docs

## Layout

- `app/main.py` — application entrypoint
- `app/api/` — REST routes
- `app/core/` — security, rate limiting, job queue abstraction
- `app/models/` — SQLAlchemy entities
- `app/schemas/` — Pydantic schemas
- `app/services/` — audit orchestration, report generation
- `app/analyzers/` — deterministic checks
- `app/crawler/` — safe crawler
- `app/scoring/` — scoring engine
- `app/ai/` — optional LLM analysis
- `app/reports/` — PDF report rendering
- `app/workers/` — Celery app + tasks
