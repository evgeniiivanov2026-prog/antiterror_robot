"""Urgency cues for the safety screen. This is not a legal classification."""

from app.models.incident import Category, ThreatLevel
from app.schemas.incident import Demands

_IMMEDIATE = (
    "срочн",
    "насили",
    "ребен",
    "убий",
    "убить",
    "убь",
    "изнасил",
    "суицид",
    "самоубий",
    "похищ",
    "теракт",
    "взорв",
    "избей",
    "залож",
    "оруж",
)
_HIGH = ("угроз", "шантаж")


def normalize(text: str) -> str:
    return text.lower().replace("ё", "е")


def has_emergency_signal(text: str) -> bool:
    value = normalize(text)
    return any(stem in value for stem in (*_IMMEDIATE, *_HIGH))


def assess_threat(category: Category, description: str, demands: Demands | None) -> ThreatLevel:
    if category == Category.emergency:
        return ThreatLevel.immediate
    extra = ""
    if demands is not None:
        extra = f" {demands.summary or ''} {demands.other or ''}"
    text = normalize(f"{description}{extra}")
    if any(stem in text for stem in _IMMEDIATE):
        return ThreatLevel.immediate
    if category == Category.blackmail or any(stem in text for stem in _HIGH):
        return ThreatLevel.high
    if category == Category.recruitment:
        return ThreatLevel.elevated
    return ThreatLevel.low


def urgency_note(level: ThreatLevel) -> str:
    if level == ThreatLevel.immediate:
        return "Возможна непосредственная угроза. Если опасность рядом, звоните 112 или 102."
    if level == ThreatLevel.high:
        return "В сообщении есть признаки угрозы или шантажа. При опасности звоните 112 или 102."
    if level == ThreatLevel.elevated:
        return "Если вас просят о встрече, деньгах или секретности, не соглашайтесь и сохраните переписку."
    return "Срочных признаков в тексте не найдено. При прямой угрозе всё равно звоните 112 или 102."
