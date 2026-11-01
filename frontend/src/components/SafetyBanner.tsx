import { IMMEDIATE_DANGER } from "../content/copy"

export function SafetyBanner() {
  return (
    <aside className="banner">
      <p>{IMMEDIATE_DANGER}</p>
      <p>
        <a href="tel:112">112</a>
        {" · "}
        <a href="tel:102">102</a>
      </p>
    </aside>
  )
}
