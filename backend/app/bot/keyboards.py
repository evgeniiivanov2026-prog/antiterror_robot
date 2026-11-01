from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from app.core.config import Settings


def main_keyboard(settings: Settings) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    if settings.webapp_url.startswith("https://"):
        rows.append(
            [
                InlineKeyboardButton(
                    text="Сообщить о происшествии",
                    web_app=WebAppInfo(url=settings.webapp_url),
                )
            ]
        )
    rows.append([InlineKeyboardButton(text="Срочная помощь", callback_data="emergency")])
    rows.append([InlineKeyboardButton(text="Как сохранить доказательства", callback_data="evidence")])
    rows.append([InlineKeyboardButton(text="Конфиденциальность", callback_data="privacy")])
    return InlineKeyboardMarkup(inline_keyboard=rows)
