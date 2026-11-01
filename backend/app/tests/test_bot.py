from app.bot.keyboards import report_keyboard
from app.bot.runtime import COMMANDS
from app.bot.texts import EMERGENCY_TEXT, EVIDENCE_TEXT, PRIVACY_TEXT, REPORT_TEXT, START_TEXT
from app.core.config import get_settings


def test_commands_cover_the_public_menu() -> None:
    commands = [item.command for item in COMMANDS]
    assert commands == ["start", "report", "emergency", "evidence", "privacy"]


def test_texts_do_not_promise_an_investigation() -> None:
    combined = "\n".join([START_TEXT, REPORT_TEXT, EMERGENCY_TEXT, EVIDENCE_TEXT, PRIVACY_TEXT])
    assert "112" in EMERGENCY_TEXT
    assert "102" in EMERGENCY_TEXT
    assert "не правоохранительный орган" in START_TEXT
    assert "не передаём" in PRIVACY_TEXT
    assert "гаранти" not in combined.lower()
    assert "расслед" in START_TEXT


def test_webapp_button_requires_https(monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "webapp_url", "http://localhost:5173")
    assert report_keyboard() is None
    monkeypatch.setattr(get_settings(), "webapp_url", "https://example.com/app")
    keyboard = report_keyboard()
    assert keyboard is not None
    button = keyboard.inline_keyboard[0][0]
    assert button.web_app is not None
    assert button.web_app.url == "https://example.com/app"
