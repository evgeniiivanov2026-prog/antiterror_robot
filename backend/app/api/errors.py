"""One JSON error body for every failure."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import AppError, error_body

logger = logging.getLogger(__name__)

_HTTP_MESSAGES = {
    404: "Такой страницы нет.",
    405: "Метод не поддерживается.",
    413: "Запрос слишком большой.",
}


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _validation_error)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, _http_error)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, _unexpected)  # type: ignore[arg-type]


async def _app_error(_request: Request, exc: AppError) -> JSONResponse:
    details = [item for item in exc.details if item.get("field") != "retry_after"]
    headers = {}
    if exc.code == "rate_limited":
        retry = next((item["message"] for item in exc.details if item.get("field") == "retry_after"), None)
        if retry:
            headers["Retry-After"] = retry
    return JSONResponse(status_code=exc.status_code, content=error_body(exc.code, exc.message, details), headers=headers)


async def _validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    details = []
    for error in exc.errors():
        loc = [str(part) for part in error.get("loc", []) if part not in {"body", "query", "path"}]
        message = str(error.get("msg", ""))
        if message.startswith("Value error, "):
            message = message.removeprefix("Value error, ")
        else:
            message = "Проверьте это поле."
        details.append({"field": ".".join(loc) or "body", "message": message})
    return JSONResponse(
        status_code=422,
        content=error_body("validation_error", "Проверьте введённые данные.", details),
    )


async def _http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    message = _HTTP_MESSAGES.get(exc.status_code, "Запрос отклонён.")
    return JSONResponse(status_code=exc.status_code, content=error_body("http_error", message))


async def _unexpected(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled_error", extra={"error_type": type(exc).__name__})
    return JSONResponse(
        status_code=500,
        content=error_body(
            "internal_error",
            "Не получилось выполнить запрос. Попробуйте ещё раз. Если опасность сейчас — звоните 112 или 102.",
        ),
    )
