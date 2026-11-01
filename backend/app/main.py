from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse

from app.api.errors import error_body, install_error_handlers
from app.api.v1.router import router
from app.core.config import Settings, assert_runtime_safe, get_settings
from app.core.db import make_engine, make_sessionmaker
from app.core.logging import configure_logging, log_event
from app.core.ratelimit import make_limiter
from app.models import Base
from app.services.storage import make_storage


def _headers(scope: dict) -> dict[str, str]:
    mapped: dict[str, str] = {}
    for key, value in scope.get("headers", []):
        mapped[key.decode("latin-1").lower()] = value.decode("latin-1")
    return mapped


class RequestGuard:
    def __init__(self, app, settings: Settings) -> None:
        self.app = app
        self.settings = settings

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = _headers(scope)
        path = scope.get("path", "")
        if self.settings.enforce_https and path != "/api/v1/health":
            proto = headers.get("x-forwarded-proto", scope.get("scheme", "http"))
            if proto != "https":
                response = JSONResponse(
                    status_code=403,
                    content=error_body("https_required", "Нужно защищённое соединение."),
                )
                await response(scope, receive, send)
                return
        length = headers.get("content-length")
        if length and length.isdigit():
            size = int(length)
            limit = self.settings.max_video_bytes + 1024 if path.endswith("/evidence") else self.settings.max_json_bytes
            if size > limit:
                response = JSONResponse(
                    status_code=413,
                    content=error_body("payload_too_large", "Запрос слишком большой."),
                )
                await response(scope, receive, send)
                return

        request_id = uuid.uuid4().hex[:16]
        started = time.perf_counter()
        status_code = 500

        async def send_wrapper(message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                mutable = MutableHeaders(scope=message)
                mutable["X-Request-ID"] = request_id
                mutable["X-Content-Type-Options"] = "nosniff"
                mutable["Referrer-Policy"] = "no-referrer"
                mutable["Cache-Control"] = "no-store"
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            log_event(
                "request",
                request_id=request_id,
                method=scope.get("method"),
                path=path,
                status=status_code,
                duration_ms=int((time.perf_counter() - started) * 1000),
            )


async def startup(app: FastAPI) -> None:
    settings: Settings = app.state.settings
    if settings.database_url.startswith("sqlite"):
        async with app.state.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    if settings.bot_mode == "webhook":
        await _start_webhook(app, settings)


async def shutdown(app: FastAPI) -> None:
    bot = getattr(app.state, "bot", None)
    if bot is not None:
        await bot.session.close()
    limiter = app.state.limiter
    client = getattr(limiter, "_client", None)
    if client is not None:
        await client.aclose()
    await app.state.engine.dispose()


async def _start_webhook(app: FastAPI, settings: Settings) -> None:
    from aiogram import Bot

    from app.bot.dispatcher import COMMANDS, build_dispatcher

    bot = Bot(token=settings.bot_token)
    dispatcher = build_dispatcher(settings)
    app.state.bot = bot
    app.state.dispatcher = dispatcher
    if not settings.public_api_url:
        return
    webhook = settings.public_api_url.rstrip("/") + "/api/v1/telegram/webhook"
    try:
        await bot.set_webhook(url=webhook, secret_token=settings.webhook_secret, drop_pending_updates=False)
        await bot.set_my_commands(COMMANDS)
    except Exception:
        log_event("webhook_setup_failed", error_type="telegram")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    assert_runtime_safe(settings)
    configure_logging(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await startup(app)
        yield
        await shutdown(app)

    app = FastAPI(
        title="AntiTerror Robot API",
        version="0.1.0",
        description=(
            "Фиксация сообщений для самостоятельного обращения в МВД. "
            "Сервис не является правоохранительным органом и не проводит проверку."
        ),
        lifespan=lifespan,
        redirect_slashes=False,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.sessionmaker = make_sessionmaker(app.state.engine)
    app.state.limiter = make_limiter(settings)
    app.state.storage = make_storage(settings)

    if settings.environment in {"development", "test"} and settings.origin_list():
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.origin_list(),
            allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "X-Dev-User-Id"],
            allow_credentials=False,
        )
    app.add_middleware(RequestGuard, settings=settings)
    install_error_handlers(app)
    app.include_router(router, prefix="/api/v1")
    if settings.bot_mode == "webhook":
        _mount_webhook(app)
    if settings.environment == "test":

        @app.get("/api/v1/_boom")
        async def _boom() -> dict:
            raise RuntimeError("secret detail")

    return app


def _mount_webhook(app: FastAPI) -> None:
    @app.post("/api/v1/telegram/webhook")
    async def telegram_webhook(request: Request) -> JSONResponse:
        import hmac

        from aiogram.types import Update

        settings: Settings = request.app.state.settings
        supplied = request.headers.get("x-telegram-bot-api-secret-token", "")
        if not settings.webhook_secret or not hmac.compare_digest(supplied, settings.webhook_secret):
            return JSONResponse(status_code=401, content=error_body("unauthorized", "Отклонено."))
        body = await request.body()
        if len(body) > 1024 * 1024:
            return JSONResponse(status_code=413, content=error_body("payload_too_large", "Запрос слишком большой."))
        update = Update.model_validate_json(body, context={"bot": request.app.state.bot})
        await request.app.state.dispatcher.feed_update(request.app.state.bot, update)
        return JSONResponse({"ok": True})


app = create_app()
