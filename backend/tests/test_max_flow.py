import asyncio

from app.bot.max_flow import plan_reply
from app.core.config import Settings


def _settings() -> Settings:
    return Settings(
        app_env="test",
        bot_mode="disabled",
        bot_token="",
        bot_platform="max",
        bot_username="antiterror_robot",
        redis_url="",
    )


def test_bot_started_opens_the_mini_app() -> None:
    reply = asyncio.run(
        plan_reply(
            {
                "update_type": "bot_started",
                "user": {"user_id": 77, "name": "Иван"},
                "chat_id": 77,
            },
            _settings(),
            None,
        )
    )
    assert reply is not None
    assert reply.user_id == 77
    assert reply.buttons == [[{"type": "open_app", "text": "Сообщить", "web_app": "antiterror_robot"}]]
    assert "112" in reply.text


def test_emergency_message_does_not_include_a_button() -> None:
    reply = asyncio.run(
        plan_reply(
            {
                "update_type": "message_created",
                "message": {"sender": {"user_id": 15}, "body": {"text": "/emergency"}},
            },
            _settings(),
            None,
        )
    )
    assert reply is not None
    assert reply.buttons is None
    assert "102" in reply.text


def test_admin_button_carries_the_start_payload() -> None:
    settings = _settings()
    settings.admin_telegram_ids = "15"
    reply = asyncio.run(
        plan_reply(
            {
                "update_type": "message_created",
                "message": {"sender": {"user_id": 15}, "body": {"text": "/admin"}},
            },
            settings,
            None,
        )
    )
    assert reply is not None
    assert reply.buttons == [
        [{"type": "open_app", "text": "Открыть панель", "web_app": "antiterror_robot", "payload": "admin"}]
    ]
