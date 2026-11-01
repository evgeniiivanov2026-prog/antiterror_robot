"""Encrypt the reporter's own contact. The key lives only in the environment."""

from cryptography.fernet import Fernet, InvalidToken

from app.core.errors import AppError


class ContactCipher:
    def __init__(self, key: str) -> None:
        try:
            self._fernet = Fernet(key.encode() if isinstance(key, str) else key)
        except (ValueError, TypeError) as exc:
            raise AppError("configuration_error", "Ключ шифрования контактов некорректен", 500) from exc

    def encrypt(self, value: str) -> str:
        return self._fernet.encrypt(value.encode()).decode()

    def decrypt(self, token: str) -> str:
        try:
            return self._fernet.decrypt(token.encode()).decode()
        except InvalidToken as exc:
            raise AppError("internal_error", "Не удалось прочитать контакт", 500) from exc


def mask_contact(channel: str | None, value: str | None) -> str | None:
    if not value:
        return None
    if channel == "email" and "@" in value:
        name, domain = value.split("@", 1)
        visible = name[:1]
        return f"{visible}***@{domain}"
    if channel == "phone":
        digits = "".join(char for char in value if char.isdigit())
        tail = digits[-2:] if len(digits) >= 2 else ""
        return f"+{'*' * 6}{tail}"
    if channel == "telegram":
        handle = value.lstrip("@")
        return f"@{handle[:2]}***" if handle else None
    return "***"
