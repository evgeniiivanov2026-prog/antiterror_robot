"""Reject secrets and normalize free text. Do not store what we refuse."""

import re

SECRET_MESSAGE = (
    "Не отправляйте пароли, коды из СМС, CVV и данные банковских карт. "
    "Удалите их из текста — для фиксации они не нужны."
)
PASSPORT_MESSAGE = "Не указывайте серию и номер паспорта. Для фиксации это не нужно."
ACCOUNT_MESSAGE = "Не указывайте номер банковского счёта. Для фиксации это не нужно."

_PASSWORD_VALUE = re.compile(r"(?:парол[ья]|password|pwd)\s*[:=]\s*\S{4,}", re.IGNORECASE)
_CVV_VALUE = re.compile(r"\b(?:cvv|cvc)\s*[:=]?\s*\d{3,4}\b", re.IGNORECASE)
_SMS_VALUE = re.compile(
    r"(?:код(?:\s+из)?\s+смс|смс-код|sms(?:\s*code)?|одноразов(?:ый|ого)\s+код)\s*[:=]?\s*\d{4,8}",
    re.IGNORECASE,
)
_PASSPORT = re.compile(r"паспорт\D{0,16}\d{4}\D?\d{6}", re.IGNORECASE)
_DIGIT_GROUP = re.compile(r"\d(?:[ \d-]*\d){12,}")
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def sanitize_text(value: str) -> str:
    cleaned = value.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    if _CONTROL_CHARS.search(cleaned):
        raise ValueError("Уберите управляющие символы из текста.")
    cleaned = re.sub(r"\n{4,}", "\n\n\n", cleaned)
    return cleaned.strip()


def luhn_valid(number: str) -> bool:
    if not number.isdigit():
        return False
    total = 0
    for index, char in enumerate(reversed(number)):
        digit = int(char)
        if index % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0 and total > 0


def find_forbidden_secret(text: str) -> str | None:
    if _PASSWORD_VALUE.search(text) or _CVV_VALUE.search(text) or _SMS_VALUE.search(text):
        return SECRET_MESSAGE
    if _PASSPORT.search(text):
        return PASSPORT_MESSAGE
    for match in _DIGIT_GROUP.finditer(text):
        digits = re.sub(r"\D", "", match.group())
        if len(digits) == 20:
            return ACCOUNT_MESSAGE
        if 13 <= len(digits) <= 19 and luhn_valid(digits):
            return SECRET_MESSAGE
    return None


def is_low_entropy(text: str) -> bool:
    compact = re.sub(r"\s+", "", text.casefold())
    return len(compact) >= 30 and len(set(compact)) < 6
