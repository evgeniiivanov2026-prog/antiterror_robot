import { IMMEDIATE_DANGER } from "../content/copy"

export function SafetyBanner() {
  return (
    <aside className="banner">
      <p>{IMMEDIATE_DANGER}</p>
      <div className="chip-row">
        <a className="chip" href="tel:112">
          112
        </a>
        <a className="chip" href="tel:102">
          102
        </a>
      </div>
    </aside>
  )
}
