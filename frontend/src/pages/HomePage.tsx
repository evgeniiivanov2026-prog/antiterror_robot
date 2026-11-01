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
      <svg className="mark" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.85" />
        <circle cx="32" cy="32" r="14" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
        <circle cx="32" cy="32" r="6.5" fill="currentColor" />
        <g className="mark-orbit">
          <circle cx="50" cy="20" r="3.2" fill="#3ad7ff" />
        </g>
      </svg>
      <p className="kicker">Орбита</p>
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
