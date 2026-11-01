from __future__ import annotations

from datetime import datetime
from pathlib import Path

from app.core.config import Settings
from app.core.labels import CATEGORY_TITLES, DEMAND_TITLES, PLATFORM_TITLES, THREAT_TITLES
from app.models.incident import IncidentReport
from app.services.errors import DomainError

_FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf",
)


def find_font(settings: Settings) -> str | None:
    candidates = [settings.pdf_font_path, *_FONT_CANDIDATES]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    return None


def render_card_text(report: IncidentReport, contact: str | None) -> str:
    created = _fmt(report.created_at)
    occurred = _fmt(report.occurred_at) if report.occurred_at else "не указано"
    demands = report.demands or {}
    lines = [
        "AntiTerror Robot",
        "Карточка инцидента",
        "",
        "Это не заявление, принятое полицией.",
        "Сервис не проводит проверку и не передаёт карточку в МВД.",
        "При непосредственной угрозе звоните 112 или 102.",
        "",
        f"Номер: {report.public_id}",
        f"Создана: {created}",
        f"Категория: {CATEGORY_TITLES.get(report.category, report.category)}",
        f"Срочность: {THREAT_TITLES.get(report.threat_level, report.threat_level)}",
        f"Статус карточки: {report.status}",
        f"Платформа: {PLATFORM_TITLES.get(report.platform, report.platform)}",
        f"Когда произошло: {occurred}",
        f"Ссылка: {report.source_url or 'не указана'}",
        "",
        "Описание:",
        report.description,
        "",
        f"Требовали: {DEMAND_TITLES.get(str(demands.get('asked_for', 'none')), 'не указано')}",
        f"Что просили: {demands.get('summary') or 'не указано'}",
        "Требования выполнять не нужно.",
    ]
    if report.suspect_identifiers:
        lines.extend(["", "Что известно о контакте:"])
        for key, value in report.suspect_identifiers.items():
            if value:
                lines.append(f"- {key}: {value}")
    if report.evidence_files:
        lines.extend(["", "Файлы (контрольные суммы SHA-256):"])
        for item in report.evidence_files:
            lines.append(f"- {item.file_type}, {item.size_bytes} байт, {item.checksum}")
    else:
        lines.extend(["", "Файлы не приложены. Описание тоже является фиксацией."])
    if contact:
        lines.extend(["", f"Контакт для связи, указанный автором: {report.contact_channel}: {contact}"])
    lines.extend(
        [
            "",
            "Не публикуйте эту карточку. Её можно показать при обращении в полицию.",
            "Храните оригиналы файлов у себя.",
        ]
    )
    return "\n".join(lines)


def render_pdf(report: IncidentReport, contact: str | None, settings: Settings) -> bytes:
    font = find_font(settings)
    if font is None:
        raise DomainError(
            "export_unavailable",
            "PDF сейчас недоступен: на сервере нет шрифта с кириллицей.",
            503,
        )
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.add_font("DejaVu", "", font)
    pdf.set_font("DejaVu", size=12)
    pdf.multi_cell(0, 7, render_card_text(report, contact))
    output = pdf.output()
    return bytes(output)


def _fmt(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.strftime("%Y-%m-%d %H:%M UTC")
