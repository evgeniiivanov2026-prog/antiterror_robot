"""Reject secrets and strip unsafe characters before anything is stored."""

import re

from app.core.errors import AppError

_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_LABELED_SECRET_RE = re.compile(
    r"(?i)\b(парол\w*|password|cvv|cvc|pin|otp|код\s+из\s+смс|sms\s*code)\b\s*[:=\-]\s*\S+"
)
_OTP_RE = re.compile(r"(?i)\b(код\s+из\s+смс|одноразов\w+\s+код|sms\s*code|otp)\b\s*[:\-]?\s*\d{3,8}")


def luhn_ok(digits: str) -> bool:
    total = 0
    reverse = digits[::-1]
    for index, char in enumerate(reverse):
        value = int(char)
        if index % 2 == 1:
            value *= 2
            if value > 9:
                value -= 9
        total += value
    return total % 10 == 0


def looks_like_card_number(text: str) -> bool:
    for match in re.finditer(r"(?:\d[ -]?){13,19}", text):
        digits = re.sub(r"\D", "", match.group())
        if 13 <= len(digits) <= 19 and luhn_ok(digits):
            return True
    return False


def contains_forbidden_secret(text: str) -> bool:
    return bool(_LABELED_SECRET_RE.search(text) or _OTP_RE.search(text) or looks_like_card_number(text))


def clean_text(value: str | None, *, max_len: int, multiline: bool = False, required: bool = False) -> str | None:
    if value is None:
        if required:
            raise AppError("validation_error", "Заполните обязательное поле", 422)
        return None
    cleaned = _CONTROL_RE.sub("", value).strip()
    if multiline:
        cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    else:
        cleaned = " ".join(cleaned.split())
    if not cleaned:
        if required:
            raise AppError("validation_error", "Заполните обязательное поле", 422)
        return None
    if len(cleaned) > max_len:
        raise AppError("validation_error", "Текст слишком длинный", 422)
    if contains_forbidden_secret(cleaned):
        raise AppError(
            "sensitive_data",
            "Уберите пароли, коды из SMS, CVV и номера банковских карт. Эти данные нельзя хранить.",
            422,
        )
    return cleaned
