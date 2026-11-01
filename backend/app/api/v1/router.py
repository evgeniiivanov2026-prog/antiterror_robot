from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import emergency, meta, reports

router = APIRouter()
router.include_router(meta.router)
router.include_router(emergency.router)
router.include_router(reports.router)
