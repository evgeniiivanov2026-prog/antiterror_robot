from fastapi import APIRouter

from app.api.v1 import emergency, health, max_hook, meta, moderation, reports, telegram

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(meta.router)
api_router.include_router(reports.router)
api_router.include_router(emergency.router)
api_router.include_router(moderation.router)
api_router.include_router(telegram.router)
api_router.include_router(max_hook.router)
