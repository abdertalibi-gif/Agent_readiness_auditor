from fastapi import APIRouter

from app.api.routes import admin, audits, auth, feedback, health, reviews, team

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(audits.router)
api_router.include_router(reviews.router)
api_router.include_router(feedback.router)
api_router.include_router(team.team_router)
api_router.include_router(team.invitations_router)
api_router.include_router(admin.router)
