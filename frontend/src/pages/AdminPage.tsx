import { useEffect, useState } from "react"
import { Screen } from "../components/Screen"
import { StateView } from "../components/StateView"
import { FALLBACK_CATEGORIES } from "../content/copy"
import { api, type ModerationItem } from "../services/api"
import type { IncidentCard } from "../types/incident"

const STATUS: Record<IncidentCard["status"], string> = {
  new: "Новая",
  under_review: "Полнота отмечена",
  forwarded: "Автор отметил обращение в МВД",
  closed: "Закрыта",
}

const THREAT: Record<IncidentCard["threat_level"], string> = {
  low: "Обычный сигнал",
  elevated: "Повышенное внимание",
  high: "Высокий сигнал",
  immediate: "Срочная опасность",
}

function categoryTitle(id: string): string {
  return FALLBACK_CATEGORIES.find((item) => item.id === id)?.title ?? id
}

export function AdminQueuePage({ onOpen }: { onOpen: (reportId: string) => void }) {
  const [items, setItems] = useState<ModerationItem[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    api
      .moderationReports()
      .then((list) => {
        if (!cancelled) setItems(list)
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось открыть очередь. Проверьте, что сервер запущен и у вас роль администратора.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Screen
      tone="staff"
      title="Панель администратора"
      lede="Очередь карточек. Это не расследование и не передача в полицию. Зашифрованный контакт сюда не попадает."
    >
      {error ? <StateView kind="error">{error}</StateView> : null}
      {items === null && !error ? <StateView kind="loading">Открываем очередь…</StateView> : null}
      {items && items.length === 0 ? <StateView kind="empty">Карточек пока нет.</StateView> : null}
      {items && items.length > 0 ? (
        <div className="choice-list">
          {items.map((item) => (
            <button key={item.id} className="choice" type="button" onClick={() => onOpen(item.id)}>
              <strong>{item.public_id}</strong>
              <span>{`${categoryTitle(item.category)} · ${STATUS[item.status]} · ${THREAT[item.threat_level]}`}</span>
            </button>
          ))}
        </div>
      ) : null}
    </Screen>
  )
}

export function AdminDeniedPage() {
  return (
    <Screen tone="staff" title="Панель администратора" lede="Этот раздел открывается только администратору сервиса.">
      <p className="note">Если это ваш бот, запишите свой числовой id из команды /admin в ADMIN_TELEGRAM_IDS и перезапустите сервер.</p>
    </Screen>
  )
}

export function AdminDetailPage({ reportId }: { reportId: string }) {
  const [card, setCard] = useState<IncidentCard | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .moderationReport(reportId)
      .then((next) => {
        if (!cancelled) setCard(next)
      })
      .catch(() => {
        if (!cancelled) setError("Карточка не открылась.")
      })
    return () => {
      cancelled = true
    }
  }, [reportId])

  async function apply(status: "under_review" | "closed", reason: string) {
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await api.moderationClose(reportId, status, reason)
      const next = await api.moderationReport(reportId)
      setCard(next)
      setNotice(status === "closed" ? "Карточка закрыта." : "Полнота записи отмечена. Это не проверка полицией.")
    } catch {
      setError("Действие не выполнено.")
    } finally {
      setBusy(false)
    }
  }

  const suspect = card?.suspect_identifiers
  const publicSuspect = [
    ["Площадка", suspect?.platform],
    ["Имя", suspect?.display_name],
    ["Имя пользователя", suspect?.username],
    ["Ссылка", suspect?.url],
    ["Заметка", suspect?.note],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))

  return (
    <Screen tone="staff" title={card?.public_id ?? "Карточка"} lede="Контакт автора не показывается.">
      {error ? <StateView kind="error">{error}</StateView> : null}
      {notice ? <StateView kind="success">{notice}</StateView> : null}
      {card === null && !error ? <StateView kind="loading">Открываем карточку…</StateView> : null}
      {card ? (
        <>
          <dl className="facts">
            <div>
              <dt>Категория</dt>
              <dd>{categoryTitle(card.category)}</dd>
            </div>
            <div>
              <dt>Статус</dt>
              <dd>{STATUS[card.status]}</dd>
            </div>
            <div>
              <dt>Сигнал</dt>
              <dd>{THREAT[card.threat_level]}</dd>
            </div>
            <div>
              <dt>Площадка</dt>
              <dd>{card.platform || "Не указана"}</dd>
            </div>
          </dl>
          <p className="note">{card.description}</p>
          {publicSuspect.length > 0 ? (
            <dl className="facts">
              {publicSuspect.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p className="footer-note">
            {card.evidence.length === 0
              ? "Файлы не приложены."
              : `Файлов: ${card.evidence.length}. Скачивание из панели отключено.`}
          </p>
          <div className="actions">
            <button className="btn btn-primary" type="button" disabled={busy || card.status === "closed"} onClick={() => apply("under_review", "completeness")}>
              Отметить полноту записи
            </button>
            <button className="btn btn-quiet" type="button" disabled={busy || card.status === "closed"} onClick={() => apply("closed", "spam")}>
              Закрыть как спам
            </button>
            <button className="btn btn-quiet" type="button" disabled={busy || card.status === "closed"} onClick={() => apply("closed", "duplicate")}>
              Закрыть как дубликат
            </button>
            <button className="btn btn-quiet" type="button" disabled={busy || card.status === "closed"} onClick={() => apply("closed", "user_request")}>
              Закрыть по просьбе автора
            </button>
          </div>
        </>
      ) : null}
    </Screen>
  )
}
