import { IMMEDIATE_DANGER, MINOR_GUIDANCE } from "../content/copy"
import { Screen } from "../components/Screen"

export function EmergencyPage({ onContinue }: { onContinue: () => void }) {
  return (
    <Screen title="Срочная опасность" lede={IMMEDIATE_DANGER}>
      <div className="stack">
        <a className="call call-signal" href="tel:112">
          <strong>Позвонить 112</strong>
          <small>Единый номер экстренных служб</small>
        </a>
        <a className="call call-signal" href="tel:102">
          <strong>Позвонить 102</strong>
          <small>Полиция</small>
        </a>
      </div>
      <section className="note" aria-labelledby="minor-title">
        <h2 id="minor-title">Если вам меньше 18 лет</h2>
        <p>{MINOR_GUIDANCE}</p>
      </section>
      <p className="footer-note">Если вы не в России, звоните в местную экстренную службу.</p>
      <div className="actions">
        <button className="btn btn-primary" type="button" onClick={onContinue}>
          Я в безопасности, продолжить фиксацию
        </button>
      </div>
    </Screen>
  )
}
