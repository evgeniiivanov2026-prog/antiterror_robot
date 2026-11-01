import { EVIDENCE_RULES } from "../content/copy"
import { Screen } from "../components/Screen"
import { SafetyBanner } from "../components/SafetyBanner"

export function EvidenceGuidePage() {
  return (
    <Screen title="Как сохранить доказательства" lede="Сохраните то, что уже есть. Не продолжайте разговор и не выполняйте требования.">
      <SafetyBanner />
      <ol className="steps">
        <li>Сделайте скриншоты так, чтобы были видны имя, дата и текст сообщений.</li>
        <li>Не удаляйте чат и не очищайте историю.</li>
        <li>Сохраните ссылку на аккаунт или канал. Подозрительные файлы повторно не открывайте.</li>
        <li>Не переводите деньги, не сообщайте коды и не отправляйте интимные материалы.</li>
        <li>Не соглашайтесь на встречу, если вас торопят или пугают.</li>
      </ol>
      <p className="footer-note">{EVIDENCE_RULES}</p>
    </Screen>
  )
}
