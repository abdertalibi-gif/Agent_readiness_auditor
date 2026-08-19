"""Thin root-level shim so the backend can be started from the `backend/`
directory either as `uvicorn main:app` or `uvicorn app.main:app`.

The canonical FastAPI app object lives in `app.main`.
"""

from app.main import app

__all__ = ["app"]
