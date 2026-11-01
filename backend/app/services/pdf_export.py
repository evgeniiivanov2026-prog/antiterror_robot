"""Build a personal incident card PDF. It is not a police document."""

from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from app.models.incident import IncidentReport
from app.services.catalog import CATEGORY_LABELS, DISCLAIMER, SAFETY_NOTICE, STATUS_LABELS, THREAT_LABELS
from app.services.presentation import to_report_response

_FONT_PATH = Path(__file__).resolve().parents[1] / "assets" / "fonts" / "DejaVuSans.ttf"
_FONT_READY = False


def build_pdf_lines(report: IncidentReport) -> list[str]:
    card = to_report_response(report)
    occurred = card.occurred_at.isoformat() if card.occurred_at else "не указано"
    lines = [
        "AntiTerror Robot",
        "Карточка инцидента",
        DISCLAIMER,
        SAFETY_NOTICE,
        f"Номер карточки: {card.public_id}",
        f"Создана: {card.created_at.isoformat()}",
        f"Категория: {CATEGORY_LABELS.get(card.category.value, card.category.value)}",
        f"Оценка срочности: {THREAT_LABELS.get(card.threat_level.value, card.threat_level.value)}",
        f"Статус: {STATUS_LABELS.get(card.status.value, card.status.value)}",
        f"Когда произошло: {occurred}",
        f"Платформа: {card.platform}",
        f"Ссылка: {card.source_url or 'не указана'}",
        "Описание:",
        card.description,
        "Что требовали:",
        card.demands.summary or "не описано",
        f"Просили деньги: {'да' if card.demands.asked_for_money else 'нет'}",
        f"Звали на встречу: {'да' if card.demands.asked_for_meeting else 'нет'}",
        f"Просили молчать: {'да' if card.demands.asked_for_secrecy else 'нет'}",
        f"Просили открыть ссылку: {'да' if card.demands.asked_to_click_link else 'нет'}",
    ]
    if card.suspect is not None:
        lines.append("Кто вышел на связь:")
        for label, value in (
            ("Имя", card.suspect.display_name),
            ("Имя пользователя", card.suspect.username),
            ("Идентификатор", card.suspect.platform_id),
            ("Канал", card.suspect.channel),
            ("Телефон", card.suspect.phone),
            ("Заметка", card.suspect.note),
        ):
            if value:
                lines.append(f"{label}: {value}")
    lines.append(f"Контакт для связи: {card.contact_masked or 'не оставлен'}")
    if card.evidence:
        lines.append("Файлы:")
        for item in card.evidence:
            lines.append(f"{item.file_type}, {item.size_bytes} байт, sha256 {item.checksum}")
    else:
        lines.append("Файлы: не приложены")
    lines.append("Чтобы подать заявление, обратитесь в полицию лично или по номеру 102 и покажите исходные материалы.")
    return lines


def render_report_pdf(report: IncidentReport) -> bytes:
    _ensure_font()
    styles = ParagraphStyle(
        "body",
        fontName="DejaVu",
        fontSize=11,
        leading=15,
        textColor="#142421",
    )
    story = []
    for line in build_pdf_lines(report):
        story.append(Paragraph(_pdf_text(line), styles))
        story.append(Spacer(1, 2 * mm))
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Карточка {report.public_id}",
        author="AntiTerror Robot",
    )
    document.build(story)
    return buffer.getvalue()


def build_chat_caption(report: IncidentReport) -> str:
    category = CATEGORY_LABELS.get(report.category, report.category)
    return f"Карточка {report.public_id}\n{category}\n\n{DISCLAIMER}\n\n{SAFETY_NOTICE}"


def _pdf_text(value: str) -> str:
    wrapped = " ".join(_wrap_token(token) for token in value.split(" "))
    return escape(wrapped).replace("\n", "<br/>")


def _wrap_token(token: str) -> str:
    if len(token) <= 40:
        return token
    return " ".join(token[index : index + 40] for index in range(0, len(token), 40))


def _ensure_font() -> None:
    global _FONT_READY
    if _FONT_READY:
        return
    pdfmetrics.registerFont(TTFont("DejaVu", str(_FONT_PATH)))
    _FONT_READY = True
