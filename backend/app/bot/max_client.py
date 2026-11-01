"""Small client for the MAX bot API. The token stays in the Authorization header."""

import logging
from typing import Any

import httpx

from app.bot.max_flow import MaxReply
from app.core.errors import AppError

logger = logging.getLogger(__name__)
API_ROOT = "https://platform-api2.max.ru"


class MaxClient:
    def __init__(self, token: str) -> None:
        self._client = httpx.AsyncClient(
            base_url=API_ROOT,
            headers={"Authorization": token},
            timeout=httpx.Timeout(40.0, read=100.0),
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def send_reply(self, reply: MaxReply) -> None:
        if reply.callback_id:
            await self._client.post(
                "/answers",
                params={"callback_id": reply.callback_id},
                json={"notification": "Готово"},
            )
        body: dict[str, Any] = {"text": reply.text}
        if reply.buttons:
            body["attachments"] = [{"type": "inline_keyboard", "payload": {"buttons": reply.buttons}}]
        response = await self._client.post("/messages", params={"user_id": reply.user_id}, json=body)
        if response.status_code >= 400:
            logger.error("max message was rejected", extra={"event": "max_send_failed", "status": response.status_code})
            raise AppError(
                "max_unavailable",
                "Не удалось отправить сообщение. Откройте чат с ботом в MAX и нажмите «Старт».",
                502,
            )

    async def updates(self, marker: int | None) -> dict[str, Any]:
        params: dict[str, Any] = {
            "timeout": 25,
            "limit": 100,
            "types": "message_created,bot_started,message_callback",
        }
        if marker is not None:
            params["marker"] = marker
        response = await self._client.get("/updates", params=params)
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, dict) else {}
