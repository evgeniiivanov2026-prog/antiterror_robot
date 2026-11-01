"""Labels shown to people. Threat words are matched on the server, not trusted from the client."""

import re

from app.models.enums import IncidentCategory, ThreatLevel

DISCLAIMER = (
    "Это личная карточка фиксации. Сервис не является правоохранительным органом, "
    "не ведёт расследование и не передаёт сообщение в МВД автоматически."
)
SAFETY_NOTICE = "Если опасность прямо сейчас, позвоните 112 или 102. Карточка не заменяет звонок."

CATEGORY_LABELS: dict[str, str] = {
    IncidentCategory.RECRUITMENT.value: "Вербовка",
    IncidentCategory.FRAUD.value: "Мошенничество",
    IncidentCategory.BLACKMAIL.value: "Шантаж",
    IncidentCategory.SUSPICIOUS_ACCOUNT.value: "Подозрительный аккаунт или канал",
    IncidentCategory.WITNESS.value: "Я свидетель",
    IncidentCategory.EMERGENCY.value: "Срочная опасность",
}

CATEGORY_DESCRIPTIONS: dict[str, str] = {
    IncidentCategory.RECRUITMENT.value: "Склоняют к противоправным действиям, зовут «в команду» или вербуют.",
    IncidentCategory.FRAUD.value: "Обман с деньгами, доступами или личными данными.",
    IncidentCategory.BLACKMAIL.value: "Угрожают опубликовать сведения или требуют что-то под давлением.",
    IncidentCategory.SUSPICIOUS_ACCOUNT.value: "Аккаунт, чат или канал выглядит опасно, но прямой угрозы может не быть.",
    IncidentCategory.WITNESS.value: "Вы видели ситуацию со стороны и хотите её зафиксировать.",
    IncidentCategory.EMERGENCY.value: "Угроза жизни, здоровью или безопасности может быть прямо сейчас.",
}

STATUS_LABELS = {
    "new": "Принято",
    "under_review": "Проверяется полнота карточки",
    "forwarded": "Сохранено для обращения в МВД",
    "closed": "Закрыто",
}

THREAT_LABELS = {
    ThreatLevel.LOW.value: "Спокойная фиксация",
    ThreatLevel.MEDIUM.value: "Нужна аккуратность",
    ThreatLevel.HIGH.value: "Есть признаки давления",
    ThreatLevel.CRITICAL.value: "Возможна непосредственная опасность",
}

_CRITICAL = re.compile(
    r"(угроз\w*|насили\w*|\bсрочно\b|убий\w*|изнасил\w*|суицид\w*|взорв\w*|теракт\w*|"
    r"заложник\w*|реб[её]н\w*|\bдети\b|детск\w*|несовершеннолет\w*)",
    re.IGNORECASE,
)
_HIGH = re.compile(r"\b(шантаж\w*|шантажи\w*)\b", re.IGNORECASE)


def categories_payload() -> list[dict[str, object]]:
    items = []
    for category in IncidentCategory:
        items.append(
            {
                "id": category.value,
                "title": CATEGORY_LABELS[category.value],
                "description": CATEGORY_DESCRIPTIONS[category.value],
                "suggests_emergency": category in {IncidentCategory.EMERGENCY, IncidentCategory.BLACKMAIL},
            }
        )
    return items


def assess_threat(category: str, text: str) -> str:
    if category == IncidentCategory.EMERGENCY.value or _CRITICAL.search(text):
        return ThreatLevel.CRITICAL.value
    if category == IncidentCategory.BLACKMAIL.value or _HIGH.search(text):
        return ThreatLevel.HIGH.value
    if category == IncidentCategory.WITNESS.value:
        return ThreatLevel.LOW.value
    return ThreatLevel.MEDIUM.value
