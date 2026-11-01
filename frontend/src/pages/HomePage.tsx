import { DISCLAIMER, IMMEDIATE_DANGER } from "../content/copy"

export function HomePage({
  onReport,
  onEmergency,
  onEvidence,
  onContacts,
  onAdmin,
}: {
  onReport: () => void
  onEmergency: () => void
  onEvidence: () => void
  onContacts: () => void
  onAdmin?: () => void
}) {
  return (
    <main className="home">
      <div className="mark-slot" aria-hidden="true">
        <img className="mark-photo mark-dawn" src="/orbit-dawn.jpg" alt="" />
        <img className="mark-photo mark-void" src="/orbit-void.jpg" alt="" />
      </div>
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
        {onAdmin ? (
          <button className="btn btn-quiet" type="button" onClick={onAdmin}>
            Панель администратора
          </button>
        ) : null}
      </div>
      <p className="footer-note">{IMMEDIATE_DANGER}</p>
      <p className="footer-note">{DISCLAIMER}</p>
    </main>
  )
}
