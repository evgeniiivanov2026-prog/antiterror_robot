import secrets

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_public_id() -> str:
    body = "".join(secrets.choice(_ALPHABET) for _ in range(8))
    return f"ATR-{body}"
