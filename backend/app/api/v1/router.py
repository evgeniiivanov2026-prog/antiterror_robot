from fastapi import APIRouter

from app.api.v1 import admin, emergency, health, meta, reports

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(meta.router, tags=["meta"])
api_router.include_router(reports.router, tags=["reports"])
api_router.include_router(emergency.router, tags=["emergency"])
api_router.include_router(admin.router, tags=["admin"])
