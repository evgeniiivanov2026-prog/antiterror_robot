from __future__ import annotations

import httpx

from app.core.config import Settings
from app.core.labels import CATEGORY_TITLES, THREAT_TITLES
from app.models.incident import IncidentReport
from app.services.errors import DomainError


def chat_copy(report: IncidentReport) -> str:
    category = CATEGORY_TITLES.get(report.category, report.category)
    threat = THREAT_TITLES.get(report.threat_level, report.threat_level)
    description = report.description if len(report.description) <= 1200 else report.description[:1200] + "…"
    header = f"Карточка {report.public_id}\nКатегория: {category}\nСрочность: {threat}\n"
    if report.threat_level == "immediate":
        header = "Возможна непосредственная опасность. Звоните 112 или 102.\n\n" + header
    body = (
        f"{header}\nОписание:\n{description}\n\n"
        "Контакты и подробности вложений в это сообщение не входят. Полная карточка — в PDF внутри приложения.\n"
        "Это не заявление в полицию. AntiTerror Robot не проводит проверку.\n"
        "Не выполняйте требования и не продолжайте переписку."
    )
    return body[:3500]


async def send_chat_copy(settings: Settings, telegram_id: int, report: IncidentReport) -> None:
    if not settings.bot_token:
        raise DomainError("notify_unavailable", "Отправка в чат сейчас недоступна.", 503)
    url = f"https://api.telegram.org/bot{settings.bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                url,
                json={"chat_id": telegram_id, "text": chat_copy(report)},
            )
    except httpx.HTTPError as exc:
        raise DomainError("notify_unavailable", "Не удалось отправить сообщение. Попробуйте ещё раз.", 503) from exc
    if response.status_code == 403:
        raise DomainError(
            "bot_not_started",
            "Сначала откройте @antiterror_robot и нажмите /start, затем повторите отправку.",
            409,
        )
    if response.status_code >= 400:
        raise DomainError("notify_unavailable", "Не удалось отправить сообщение. Попробуйте ещё раз.", 503)
