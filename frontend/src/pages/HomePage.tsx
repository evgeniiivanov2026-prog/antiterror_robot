import { DISCLAIMER, IMMEDIATE_DANGER } from "../content/copy"

export function HomePage({
  onReport,
  onEmergency,
  onEvidence,
  onContacts,
}: {
  onReport: () => void
  onEmergency: () => void
  onEvidence: () => void
  onContacts: () => void
}) {
  return (
    <main className="home">
      <svg className="mark" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="4" y="4" width="40" height="40" rx="14" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="24" cy="24" r="5" fill="currentColor" />
      </svg>
      <h1>AntiTerror Robot</h1>
      <p className="slogan">Сообщай. Фиксируй. Защищай.</p>
      <p className="lede">
        Здесь можно спокойно записать мошенничество, вербовку, шантаж или попытку втянуть молодого человека в
        противоправные действия.
      </p>
      <div className="home-actions">
        <button className="btn btn-primary" type="button" onClick={onReport}>
          Сообщить о происшествии
        </button>
        <button className="btn btn-signal" type="button" onClick={onEmergency}>
          Срочная помощь
        </button>
        <button className="btn btn-quiet" type="button" onClick={onEvidence}>
          Как сохранить доказательства
        </button>
        <button className="btn btn-quiet" type="button" onClick={onContacts}>
          Полезные контакты
        </button>
      </div>
      <p className="footer-note">{IMMEDIATE_DANGER}</p>
      <p className="footer-note">{DISCLAIMER}</p>
    </main>
  )
}
