"""FastAPI entrypoint for the AntiTerror Robot API."""

import logging
import re
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.bot_webhook import router as bot_router
from app.api.errors import register_exception_handlers
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.database import get_engine
from app.core.errors import error_body
from app.core.logging import setup_logging
from app.core.rate_limit import RedisRateLimiter, get_limiter
from app.core.security import request_is_secure

logger = logging.getLogger(__name__)
_REQUEST_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    if settings.environment != "test" and settings.bot_token and settings.webhook_url:
        from app.bot.runtime import configure_bot, get_bot

        await configure_bot(get_bot())
    yield
    limiter = get_limiter()
    if isinstance(limiter, RedisRateLimiter):
        await limiter.close()
    await get_engine().dispose()


def create_app() -> FastAPI:
    setup_logging()
    import app.models  # noqa: F401

    settings = get_settings()
    app = FastAPI(
        title="AntiTerror Robot API",
        version="1.0.0",
        description=(
            "Фиксация сообщений о мошенничестве, вербовке и шантаже. "
            "Сервис не является правоохранительным органом."
        ),
        lifespan=lifespan,
        docs_url=None if settings.environment == "production" else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.environment == "production" else "/api/openapi.json",
    )
    app.middleware("http")(security_middleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Dev-Telegram-Id", "X-Request-ID"],
    )
    register_exception_handlers(app)
    app.include_router(api_router, prefix="/api/v1")
    app.include_router(bot_router)
    return app


async def security_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
    request_id = request.headers.get("x-request-id", "")
    if not _REQUEST_ID.fullmatch(request_id):
        request_id = uuid.uuid4().hex
    settings = get_settings()
    if not request_is_secure(settings.environment, request.url.path, request.headers.get("x-forwarded-proto", "")):
        response = JSONResponse(status_code=403, content=error_body("https_required", "Откройте сервис по HTTPS."))
        response.headers["X-Request-ID"] = request_id
        return response
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Frame-Options"] = "DENY"
    logger.info(
        "request",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": int((time.perf_counter() - started) * 1000),
        },
    )
    return response


app = create_app()
