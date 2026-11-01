"""FastAPI application factory."""

import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import __version__
from app.api.deps import client_host
from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.errors import error_body, register_exception_handlers
from app.core.logging import configure_logging, request_id_var
from app.core.rate_limit import MemoryRateLimiter, RedisRateLimiter
from app.models import Base
from app.services.encryption import ContactCipher
from app.services.notifier import TelegramNotifier
from app.services.storage import S3Storage, build_storage
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)


def resolve_encryption_key(settings: Settings) -> str:
    if settings.contact_encryption_key:
        return settings.contact_encryption_key
    if settings.app_env == "production":
        raise RuntimeError("CONTACT_ENCRYPTION_KEY is required in production")
    logger.warning(
        "CONTACT_ENCRYPTION_KEY is empty; using an ephemeral key",
        extra={"event": "ephemeral_encryption_key"},
    )
    return Fernet.generate_key().decode()


async def build_limiter(settings: Settings):
    if not settings.redis_url:
        return MemoryRateLimiter()
    client = Redis.from_url(settings.redis_url, socket_connect_timeout=1)
    try:
        await client.ping()
    except Exception:
        logger.error("redis is unavailable; using an in-memory rate limiter", extra={"event": "redis_unavailable"})
        await client.aclose()
        return MemoryRateLimiter()
    return RedisRateLimiter(client)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if getattr(app.state, "sessionmaker", None) is None:
            engine = create_async_engine(settings.database_url, pool_pre_ping=True)
            app.state.engine = engine
            app.state.sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
            if settings.auto_create_db and settings.app_env != "production":
                async with engine.begin() as connection:
                    await connection.run_sync(Base.metadata.create_all)
        if getattr(app.state, "limiter", None) is None:
            app.state.limiter = await build_limiter(settings)
        if getattr(app.state, "storage", None) is None:
            storage = build_storage(settings)
            if isinstance(storage, S3Storage):
                await storage.ensure_bucket()
            app.state.storage = storage
        if getattr(app.state, "cipher", None) is None:
            app.state.cipher = ContactCipher(resolve_encryption_key(settings))
        if getattr(app.state, "notifier", None) is None and settings.bot_token:
            app.state.notifier = TelegramNotifier(settings.bot_token)

        bot_task = None
        if settings.bot_mode == "polling" and settings.bot_token:
            from aiogram import Bot

            from app.bot.factory import build_dispatcher, configure_bot

            bot = Bot(token=settings.bot_token)
            dispatcher = build_dispatcher(settings, app.state.sessionmaker)
            app.state.bot = bot
            app.state.dispatcher = dispatcher

            async def _poll() -> None:
                try:
                    await configure_bot(bot, settings)
                except Exception:
                    logger.exception("bot menu was not updated")
                await dispatcher.start_polling(bot, handle_signals=False)

            bot_task = asyncio.create_task(_poll())
        elif settings.bot_mode == "webhook" and settings.bot_token and getattr(app.state, "bot", None) is None:
            from aiogram import Bot

            from app.bot.factory import build_dispatcher, configure_bot

            bot = Bot(token=settings.bot_token)
            app.state.bot = bot
            app.state.dispatcher = build_dispatcher(settings, app.state.sessionmaker)

            async def _prepare_webhook_bot() -> None:
                try:
                    await configure_bot(bot, settings)
                except Exception:
                    logger.exception("bot menu was not updated")

            app.state.bot_setup = asyncio.create_task(_prepare_webhook_bot())
        try:
            yield
        finally:
            setup_task = getattr(app.state, "bot_setup", None)
            if setup_task is not None:
                setup_task.cancel()
            if bot_task is not None:
                bot_task.cancel()
                try:
                    await bot_task
                except Exception:
                    logger.info("bot polling stopped", extra={"event": "bot_stopped"})
            bot = getattr(app.state, "bot", None)
            if bot is not None:
                await bot.session.close()
            engine = getattr(app.state, "engine", None)
            if engine is not None:
                await engine.dispose()

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        description=(
            "Фиксация сообщений о мошенничестве, вербовке и шантаже. "
            "Сервис не является правоохранительным органом."
        ),
        lifespan=lifespan,
        docs_url="/api/docs" if settings.app_env != "production" else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.app_env != "production" else None,
    )
    app.state.settings = settings
    register_exception_handlers(app)

    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_credentials=False,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "X-Dev-User-Id", "X-Telegram-Init-Data"],
        )

    @app.middleware("http")
    async def protect_and_log(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        path = request.url.path

        def finish(response, status_code: int):
            response.headers["X-Request-Id"] = request_id
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["Referrer-Policy"] = "no-referrer"
            response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
            logger.info(
                "request",
                extra={
                    "event": "http_request",
                    "method": request.method,
                    "path": path,
                    "status": status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                },
            )
            return response

        try:
            if settings.force_https and path.startswith("/api/") and path not in {"/api/v1/health", "/api/v1/ready"}:
                proto = request.headers.get("x-forwarded-proto", request.url.scheme)
                if proto != "https":
                    denied = JSONResponse(
                        status_code=400,
                        content=error_body("https_required", "Запрос принимается только по HTTPS"),
                    )
                    return finish(denied, 400)
            if path.startswith("/api/") and path not in {"/api/v1/health", "/api/v1/ready"}:
                limiter = getattr(request.app.state, "limiter", None)
                if limiter is not None:
                    limit = 300 if path.endswith("/telegram/webhook") else settings.rate_limit_requests
                    group = path.split("/")[3] if path.count("/") > 3 else "api"
                    allowed = await limiter.allow(
                        f"ip:{client_host(request, settings)}:{group}",
                        limit,
                        settings.rate_limit_window_seconds,
                    )
                    if not allowed:
                        denied = JSONResponse(
                            status_code=429,
                            content=error_body("rate_limited", "Слишком много запросов. Подождите немного."),
                        )
                        return finish(denied, 429)
            response = await call_next(request)
            return finish(response, response.status_code)
        finally:
            request_id_var.reset(token)

    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()
