from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from app.core.config import get_settings


def report_keyboard() -> InlineKeyboardMarkup | None:
    url = get_settings().webapp_url
    if not url.startswith("https://"):
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Сообщить о происшествии", web_app=WebAppInfo(url=url))]
        ]
    )
