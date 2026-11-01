import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { categoryTitle, platformTitle } from "../content/ru";
import { Screen } from "../components/Screen";
import { StateMessage } from "../components/StateMessage";
import { useRegisterBack } from "../components/Shell";
import { api } from "../services/api";
import type { ReportCard } from "../types/report";
import { haptic } from "../hooks/useTelegram";

export function ResultPage() {
  const { publicId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { uploadFailed?: boolean } };
  const [card, setCard] = useState<ReportCard | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useRegisterBack(() => navigate("/"));

  useEffect(() => {
    let active = true;
    api
      .getReport(publicId)
      .then((value) => {
        if (active) setCard(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Карточка не найдена.");
      });
    return () => {
      active = false;
    };
  }, [publicId]);

  async function download() {
    if (!card) return;
    setNotice("");
    try {
      const blob = await api.exportPdf(card.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${card.public_id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Не удалось подготовить PDF.");
    }
  }

  async function sendCopy() {
    if (!card) return;
    setNotice("");
    try {
      await api.notify(card.id);
      haptic("success");
      setNotice("Краткое сообщение отправлено в чат с ботом. Контакты третьих лиц туда не входят.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Не удалось отправить сообщение.");
    }
  }

  async function remove() {
    if (!card) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await api.remove(card.public_id);
      navigate("/");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Не удалось удалить карточку.");
    }
  }

  return (
    <Screen title="Карточка сохранена" lede="Это ваша личная фиксация, а не заявление, принятое полицией.">
      {location.state?.uploadFailed ? (
        <StateMessage tone="error" title="Не все файлы сохранились" />
      ) : null}
      {!card && !error ? <StateMessage tone="loading" title="Открываем карточку" /> : null}
      {error ? <StateMessage tone="error" title="Не удалось открыть карточку">{error}</StateMessage> : null}
      {card ? (
        <article className="ticket">
          <p className="stamp">Не является заявлением</p>
          <p className="ticket-id">{card.public_id}</p>
          <h2>{categoryTitle(card.category)}</h2>
          <p className="meta">{platformTitle(card.platform)}</p>
          <p>{card.description}</p>
          {card.evidence.length === 0 ? (
            <p className="hint">Файлы не приложены. Описание тоже является фиксацией. Оригиналы храните у себя.</p>
          ) : (
            <p className="hint">Файлов: {card.evidence.length}. Оригиналы храните у себя.</p>
          )}
          {card.emergency_recommended ? (
            <div className="banner">
              <p>Возможна непосредственная опасность.</p>
              <a href="tel:112">Позвонить 112</a>
              <a href="tel:102">Позвонить 102</a>
            </div>
          ) : null}
          <p>{card.safety_notice}</p>
        </article>
      ) : null}
      {card ? (
        <div className="stack">
          <button type="button" className="button primary" onClick={() => void download()}>
            Скачать PDF
          </button>
          <button type="button" className="button ghost" onClick={() => void sendCopy()}>
            Прислать номер в чат
          </button>
          <p className="hint">С номером карточки можно обратиться в ближайшее подразделение МВД или по телефону 102. Мы не проводим проверку и не гарантируем исход.</p>
          <button type="button" className="button danger" onClick={() => void remove()}>
            {confirmDelete ? "Подтвердить удаление" : "Удалить карточку"}
          </button>
          {notice ? <p role="status">{notice}</p> : null}
        </div>
      ) : null}
      <Link className="text-link" to="/">
        На главную
      </Link>
    </Screen>
  );
}
