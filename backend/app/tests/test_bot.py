from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.bot.handlers import cmd_emergency, cmd_evidence, cmd_privacy, cmd_report, cmd_start
from app.bot.texts import emergency_text
from app.tests.conftest import make_settings


@pytest.mark.asyncio
async def test_start_explains_limits_and_opens_app() -> None:
    message = AsyncMock()
    settings = make_settings(webapp_url="https://example.com/app")
    await cmd_start(message, settings)
    text = message.answer.await_args.args[0]
    assert "AntiTerror Robot" in text
    assert "Сообщай. Фиксируй. Защищай." in text
    assert "112" in text
    assert "не полиция" in text.lower()
    button = message.answer.await_args.kwargs["reply_markup"].inline_keyboard[0][0]
    assert button.text == "Открыть приложение"
    assert button.web_app.url == "https://example.com/app"


@pytest.mark.asyncio
async def test_commands_cover_emergency_evidence_and_privacy() -> None:
    message = AsyncMock()
    settings = make_settings(retention_days=90, webapp_url="")
    await cmd_report(message, settings)
    await cmd_emergency(message, settings)
    await cmd_evidence(message, settings)
    await cmd_privacy(message, settings)
    report_reply = message.answer.await_args_list[0].args[0]
    emergency_reply = message.answer.await_args_list[1].args[0]
    evidence_reply = message.answer.await_args_list[2].args[0]
    privacy_reply = message.answer.await_args_list[3].args[0]
    assert "102" in report_reply
    assert message.answer.await_args_list[0].kwargs["reply_markup"] is None
    assert "112" in emergency_reply and "102" in emergency_reply
    assert "несовершеннолет" in emergency_reply
    assert "интимн" in evidence_reply
    assert "90" in privacy_reply
    assert "шифр" in privacy_reply
    assert emergency_text().startswith("Если есть угроза")
