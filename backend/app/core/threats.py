from __future__ import annotations

_SIGNALS = (
    "угроз",
    "насили",
    "шантаж",
    "ребенок",
    "ребенк",
    "несовершеннолет",
    "срочно",
    "убить",
    "убьют",
    "убий",
    "изнасил",
    "суицид",
    "самоубий",
    "теракт",
    "взрыв",
    "оружи",
)


def normalize(text: str) -> str:
    return text.lower().replace("ё", "е")


def has_danger_signal(text: str) -> bool:
    folded = normalize(text)
    return any(signal in folded for signal in _SIGNALS)


def assess_threat(category: str, text: str, immediate_flag: bool) -> str:
    if immediate_flag or category == "emergency" or has_danger_signal(text):
        return "immediate"
    if category in {"blackmail", "recruitment"}:
        return "elevated"
    return "low"
