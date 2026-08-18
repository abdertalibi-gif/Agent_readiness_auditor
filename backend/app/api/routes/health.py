from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=dict)
async def health() -> dict:
    return {"status": "ok", "service": "agent-readiness-auditor"}


@router.get("/ready", response_model=dict)
async def readiness() -> dict:
    return {"status": "ready"}
