# Agent-Readiness Auditor

A production-ready SaaS web application that audits a website and determines how ready it is to be **discovered, understood, navigated and used by AI agents**.

The system crawls a website, runs deterministic technical checks, scores eight categories, generates a transparent **Agent Readiness Score (/100)**, adds grounded AI explanations where valuable, and exports a professional PDF report.

> **Honest positioning:** no tool can guarantee compatibility with every AI agent. This product measures *Agent Readiness*, *AI discoverability*, *machine readability* and *agent accessibility* against transparent, verifiable checks.

---

## What it does

1. Enter any public website URL
2. Backend validates the URL (SSRF-safe)
3. A safe crawler walks the site (respecting `robots.txt`, depth/size limits, rate limits)
4. Analyzers run ~60 deterministic checks: robots.txt, sitemap, metadata, semantic HTML, Schema.org/Open Graph, links, content, HTTPS, security headers, performance signals
5. Scoring engine computes 8 weighted category scores → overall score /100
6. Optional LLM layer adds explanations and recommendations grounded in collected evidence
7. Dashboard shows score, category cards, issues (critical/high/warnings/passed), pages, recommendations
8. PDF report export

## Score bands

| Score | Rating |
|-------|--------|
| 0–39  | Critical |
| 40–59 | Poor |
| 60–74 | Moderate |
| 75–89 | Good |
| 90–100 | Excellent |

## Repo layout

```
agent-readiness-auditor/
├── frontend/          Next.js 15 + TypeScript + Tailwind + shadcn/ui
├── backend/           FastAPI application (clean architecture)
├── worker/            Celery worker entrypoint + celery config
├── database/          SQL migrations (Alembic) + init scripts
├── docs/              architecture, API, deployment, security
├── tests/             cross-service notes
├── docker/            Dockerfiles + nginx
├── docker-compose.yml
├── .env.example
└── README.md
```

## Quick start

### Without Docker (local development, Windows)

Prerequisites: Python 3.12+, Node 20+, pnpm.

A ready-to-run `.env` with **Windows-localhost defaults** (SQLite + inline job mode,
no Docker/Redis required) is shipped with the repo — just copy it:

```powershell
# 1. backend (in agent-readiness-auditor/)
copy .env.example .env       # or use the shipped .env directly

cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# 2. frontend (new terminal)
cd frontend
pnpm install
pnpm dev
```

Open http://localhost:3000 — API docs at http://localhost:8000/docs.

> **Windows shells:** the above separates each command onto its own line. `cmd.exe`
> does **not** join commands with `;` (that is PowerShell only). In Command Prompt
> use one command per line or `&&`, e.g.
> `cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload --port 8000`.
> The SQLite database is created automatically at `backend\data\auditor.db`
> (the folder is created for you on first start).

> **Database:** the default is SQLite (`sqlite+aiosqlite:///./data/auditor.db`), so
> no database server is needed to run it. For the recommended PostgreSQL setup,
> first provision the role/database (only once):
>
> ```powershell
> psql -U postgres -c "CREATE ROLE auditor LOGIN PASSWORD 'auditor' CREATEDB;"
> psql -U postgres -c "CREATE DATABASE auditor OWNER auditor;"
> ```
> then uncomment the `postgresql+psycopg://auditor:auditor@localhost:5432/auditor`
> line in `.env`.
>
> **Platform validation:** if `.env` points at a `postgres`/`redis` host while
> running locally, startup fails with a clear message — those hostnames are only
> valid inside the Docker network. Use `localhost` for native development.

### With Docker

```bash
docker compose up --build
```

Services: `frontend` (:3000), `backend` (:8000, docs at /docs), `worker`, `postgres`, `redis`, `nginx` (:8080).

## Environment

Copy `.env.example` → `.env` and configure. Key switches:

- `DATABASE_URL` — PostgreSQL (prod) or SQLite (dev). Local dev uses `localhost`;
  Docker Compose overrides it to the `postgres` host internally.
- `JOB_MODE` — `inline` (in-process background task, no Redis) or `celery`
- `AI_PROVIDER` — `none` or `openai` (AI analysis is additive and never blocks the audit)
- `NEXT_PUBLIC_API_BASE_URL` — frontend API base (`http://localhost:8000/api`)

## Documentation

- [Architecture](docs/architecture.md)
- [API reference](docs/api.md)
- [Security model](docs/security.md)
- [Scoring model](docs/scoring.md)
- [Deployment](docs/deployment.md)

## Tests

```bash
cd backend; pytest
cd frontend; pnpm test
```

## License

MIT — see [LICENSE](LICENSE).
