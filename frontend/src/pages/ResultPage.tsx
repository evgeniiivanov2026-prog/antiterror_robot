import { useState } from "react"
import { CATEGORY_TITLES } from "../content/copy"
import type { IncidentCard } from "../types/incident"
import { api, ApiError } from "../services/api"
import { Screen } from "../components/Screen"
import { StateView } from "../components/StateView"

const STATUS: Record<IncidentCard["status"], string> = {
  new: "Карточка сохранена",
  under_review: "Отмечена для проверки полноты",
  forwarded: "Вы отметили, что обратились в МВД",
  closed: "Карточка закрыта",
}

export function ResultPage({ card, onChange, onDeleted }: { card: IncidentCard; onChange: (card: IncidentCard) => void; onDeleted: () => void }) {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
      setMessage(success)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось выполнить действие")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="Карточка инцидента" lede="Сохраните номер. Это не номер дела полиции.">
      <p className="public-id">{card.public_id}</p>
      <p>{card.urgency_note}</p>
      <dl className="facts">
        <div>
          <dt>Категория</dt>
          <dd>{CATEGORY_TITLES[card.category] ?? card.category}</dd>
        </div>
        <div>
          <dt>Статус</dt>
          <dd>{STATUS[card.status]}</dd>
        </div>
        <div>
          <dt>Платформа</dt>
          <dd>{card.platform || "Не указана"}</dd>
        </div>
        {card.contact_hint ? (
          <div>
            <dt>Контакт для связи</dt>
            <dd>{card.contact_hint}</dd>
          </div>
        ) : null}
      </dl>
      <p>{card.mvd_recommendation}</p>
      {message ? <StateView kind="success">{message}</StateView> : null}
      {error ? <StateView kind="error">{error}</StateView> : null}
      {busy ? <StateView kind="loading">Выполняем действие…</StateView> : null}
      <div className="actions">
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const blob = await api.exportPdf(card.id)
              const url = URL.createObjectURL(blob)
              const link = document.createElement("a")
              link.href = url
              link.download = `${card.public_id}.pdf`
              link.click()
              URL.revokeObjectURL(url)
            }, "PDF сохранён на устройство")
          }
        >
          Скачать PDF
        </button>
        <button className="btn btn-quiet" type="button" disabled={busy} onClick={() => run(() => api.sendToChat(card.id), "Копия отправлена в чат с ботом")}>
          Отправить копию в чат
        </button>
        <button
          className="btn btn-quiet"
          type="button"
          disabled={busy || card.status === "forwarded"}
          onClick={() =>
            run(async () => {
              onChange(await api.markReferred(card.id))
            }, "Отметили, что вы обратились в МВД")
          }
        >
          Я обратился в МВД
        </button>
        {confirmDelete ? (
          <button
            className="btn btn-signal"
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api.removeReport(card.id)
                onDeleted()
              }, "Карточка удалена")
            }
          >
            Подтвердить удаление
          </button>
        ) : (
          <button className="btn btn-quiet" type="button" onClick={() => setConfirmDelete(true)}>
            Удалить карточку
          </button>
        )}
      </div>
      <p className="footer-note">{card.disclaimer}</p>
    </Screen>
  )
}
