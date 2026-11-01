"""Normalize and mask the optional callback contact."""

import re

from app.models.enums import ContactChannel

_EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]+$")
_PHONE = re.compile(r"^\+?\d{10,15}$")
_TELEGRAM = re.compile(r"^@?[A-Za-z0-9_]{5,32}$")
_TELEGRAM_ID = re.compile(r"^\d{5,15}$")


def normalize_contact(channel: str, value: str) -> str:
    text = value.strip()
    if any(char in text for char in "\n\r\t"):
        raise ValueError("Контакт должен быть одной строкой.")
    if channel == ContactChannel.EMAIL.value:
        lowered = text.lower()
        if not _EMAIL.fullmatch(lowered) or len(lowered) > 120:
            raise ValueError("Укажите адрес электронной почты целиком.")
        return lowered
    if channel == ContactChannel.PHONE.value:
        compact = re.sub(r"[\s()-]", "", text)
        if not _PHONE.fullmatch(compact):
            raise ValueError("Укажите телефон цифрами, можно с плюсом в начале.")
        return compact
    if channel == ContactChannel.TELEGRAM.value:
        if _TELEGRAM_ID.fullmatch(text):
            return text
        if _TELEGRAM.fullmatch(text):
            return text if text.startswith("@") else f"@{text}"
        raise ValueError("Укажите Telegram-имя пользователя или числовой id.")
    raise ValueError("Выберите способ связи.")


def mask_contact(channel: str | None, value: str | None) -> str | None:
    if not channel or not value:
        return None
    if channel == ContactChannel.EMAIL.value and "@" in value:
        name, domain = value.split("@", 1)
        return f"{name[:1]}***@{domain}"
    if channel == ContactChannel.PHONE.value:
        digits = re.sub(r"\D", "", value)
        return f"***{digits[-2:]}" if len(digits) >= 2 else "***"
    if channel == ContactChannel.TELEGRAM.value:
        cleaned = value.lstrip("@")
        return f"@{cleaned[:1]}***" if cleaned else "***"
    return "***"
