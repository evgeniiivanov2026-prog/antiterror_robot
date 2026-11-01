from __future__ import annotations

import re

_PASSWORD = re.compile(r"(?i)\b(пароль|password|passphrase)\b\s*[:=]\s*\S+")
_CVV = re.compile(r"(?i)\b(cvv|cvc|cid)\b\s*[:=]?\s*\d{3,4}\b")
_OTP = re.compile(
    r"(?i)(код\s*(из\s*)?(смс|sms)|смс-код|sms-код|одноразовый\s*код|"
    r"one[- ]time\s*code|\botp\b)\s*[:=]?\s*\d{4,8}\b"
)
_CARD_CANDIDATE = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")

SENSITIVE_MESSAGE = (
    "Уберите пароли, коды из SMS, CVV и полные номера карт. "
    "Опишите ситуацию своими словами и не вставляйте секрет."
)


def luhn_ok(number: str) -> bool:
    if not number.isdigit() or not 13 <= len(number) <= 19:
        return False
    digits = [int(char) for char in number]
    parity = len(digits) % 2
    total = 0
    for index, digit in enumerate(digits):
        if index % 2 == parity:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


def find_sensitive(text: str) -> list[str]:
    found: list[str] = []
    if _PASSWORD.search(text):
        found.append("password")
    if _CVV.search(text):
        found.append("cvv")
    if _OTP.search(text):
        found.append("otp")
    for match in _CARD_CANDIDATE.finditer(text):
        digits = re.sub(r"\D", "", match.group())
        if luhn_ok(digits):
            found.append("card_number")
            break
    return found


def ensure_no_secrets(text: str) -> None:
    if find_sensitive(text):
        raise ValueError(SENSITIVE_MESSAGE)
