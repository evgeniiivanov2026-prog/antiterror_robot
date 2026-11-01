"""Build a personal incident card PDF. It is not an official document."""

from datetime import datetime
from pathlib import Path

from fpdf import FPDF

from app.core.copy import DISCLAIMER, EVIDENCE_RULES, MVD_RECOMMENDATION
from app.core.errors import AppError
from app.models.incident import IncidentReport
from app.services.safety import urgency_note

_BUNDLED_FONTS = Path(__file__).resolve().parent.parent / "fonts"
_FONT_CANDIDATES = (
    _BUNDLED_FONTS / "DejaVuSans.ttf",
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
)
_BOLD_CANDIDATES = (
    _BUNDLED_FONTS / "DejaVuSans-Bold.ttf",
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
)

_CATEGORY_TITLES = {
    "recruitment": "Вербовка",
    "fraud": "Мошенничество",
    "blackmail": "Шантаж",
    "suspicious_account": "Подозрительный аккаунт или канал",
    "witness": "Свидетель",
    "emergency": "Срочная опасность",
}
_STATUS_TITLES = {
    "new": "Новая карточка",
    "under_review": "Отмечена для проверки полноты",
    "forwarded": "Пользователь отметил обращение в МВД",
    "closed": "Закрыта",
}


def _font(candidates: tuple[Path, ...]) -> Path:
    for path in candidates:
        if path.exists():
            return path
    raise AppError("internal_error", "Не удалось подготовить PDF", 500)


def _safe(value: object) -> str:
    text = _line(value)
    chunks: list[str] = []
    for word in text.replace("\r", "").split(" "):
        while len(word) > 48:
            chunks.append(word[:48])
            word = word[48:]
        chunks.append(word)
    return " ".join(chunks)


def _line(value: object) -> str:
    if value is None or value == "":
        return "—"
    if isinstance(value, datetime):
        return value.strftime("%d.%m.%Y %H:%M UTC")
    return str(value)


class _CardPDF(FPDF):
    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("DejaVu", size=8)
        self.cell(self.epw, 8, "Не является документом правоохранительных органов", align="L")


def render_incident_pdf(report: IncidentReport, contact_hint: str | None) -> bytes:
    pdf = _CardPDF()
    pdf.set_compression(False)
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_font("DejaVu", "", str(_font(_FONT_CANDIDATES)))
    pdf.add_font("DejaVu", "B", str(_font(_BOLD_CANDIDATES)))
    pdf.add_page()
    pdf.set_font("DejaVu", "B", 16)
    pdf.multi_cell(pdf.epw, 9, "Карточка инцидента")
    pdf.set_font("DejaVu", "", 10)
    pdf.multi_cell(pdf.epw, 6, DISCLAIMER)
    pdf.ln(2)
    pdf.set_font("DejaVu", "B", 12)
    pdf.multi_cell(pdf.epw, 7, f"Номер карточки: {report.public_id}")
    pdf.set_font("DejaVu", "", 11)
    rows = [
        ("Категория", _CATEGORY_TITLES.get(report.category.value, report.category.value)),
        ("Статус", _STATUS_TITLES.get(report.status.value, report.status.value)),
        ("Создана", _line(report.created_at)),
        ("Когда произошло", _line(report.occurred_at)),
        ("Платформа", report.platform or "—"),
        ("Ссылка", report.source_url or "—"),
        ("Признак срочности", urgency_note(report.threat_level)),
    ]
    for label, value in rows:
        pdf.set_font("DejaVu", "B", 11)
        pdf.multi_cell(pdf.epw, 6, label)
        pdf.set_font("DejaVu", "", 11)
        pdf.multi_cell(pdf.epw, 6, _safe(value))
    pdf.ln(1)
    pdf.set_font("DejaVu", "B", 11)
    pdf.multi_cell(pdf.epw, 6, "Описание")
    pdf.set_font("DejaVu", "", 11)
    pdf.multi_cell(pdf.epw, 6, _safe(report.description))
    if report.suspect_identifiers:
        pdf.set_font("DejaVu", "B", 11)
        pdf.multi_cell(pdf.epw, 6, "Публичные данные о контакте")
        pdf.set_font("DejaVu", "", 11)
        for key, value in report.suspect_identifiers.items():
            if value:
                pdf.multi_cell(pdf.epw, 6, _safe(f"{key}: {value}"))
    if report.demands:
        pdf.set_font("DejaVu", "B", 11)
        pdf.multi_cell(pdf.epw, 6, "Что требовали")
        pdf.set_font("DejaVu", "", 11)
        for key, value in report.demands.items():
            if value:
                pdf.multi_cell(pdf.epw, 6, _safe(f"{key}: {value}"))
    pdf.set_font("DejaVu", "B", 11)
    pdf.multi_cell(pdf.epw, 6, "Файлы")
    pdf.set_font("DejaVu", "", 11)
    if not report.evidence_files:
        pdf.multi_cell(pdf.epw, 6, "Файлы не приложены")
    for item in report.evidence_files:
        pdf.multi_cell(
            pdf.epw,
            6,
            f"{item.file_type.value}, {item.size_bytes} байт, sha256 {item.checksum[:12]}",
        )
    if contact_hint:
        pdf.set_font("DejaVu", "B", 11)
        pdf.multi_cell(pdf.epw, 6, "Контакт для связи")
        pdf.set_font("DejaVu", "", 11)
        pdf.multi_cell(pdf.epw, 6, _safe(contact_hint))
    pdf.ln(2)
    pdf.set_font("DejaVu", "", 10)
    pdf.multi_cell(pdf.epw, 6, MVD_RECOMMENDATION)
    pdf.multi_cell(pdf.epw, 6, EVIDENCE_RULES)
    return bytes(pdf.output())
