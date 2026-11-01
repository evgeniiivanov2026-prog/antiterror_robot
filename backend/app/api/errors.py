from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.logging import log_event
from app.core.security import AuthError
from app.services.errors import DomainError


def error_body(code: str, message: str, details: list[dict] | None = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or []}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(_request: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content=error_body(exc.code, exc.message))

    @app.exception_handler(AuthError)
    async def _auth(_request: Request, _exc: AuthError) -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content=error_body("unauthorized", "Откройте приложение из Telegram."),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_request: Request, exc: RequestValidationError) -> JSONResponse:
        details = []
        for item in exc.errors():
            loc = [str(part) for part in item.get("loc", []) if part not in {"body", "query", "path"}]
            message = item.get("msg", "Проверьте поле")
            if message.startswith("Value error, "):
                message = message.removeprefix("Value error, ")
            details.append({"field": ".".join(loc), "message": message})
        return JSONResponse(
            status_code=422,
            content=error_body("validation_error", "Проверьте поля формы", details),
        )

    @app.exception_handler(Exception)
    async def _unexpected(_request: Request, exc: Exception) -> JSONResponse:
        log_event("unhandled_error", error_type=type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content=error_body("internal_error", "Не удалось выполнить запрос. Попробуйте ещё раз."),
        )
