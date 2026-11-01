import type { Draft } from "../../domain/draft";

export function ContactStep({ draft, onChange }: { draft: Draft; onChange: (patch: Partial<Draft>) => void }) {
  return (
    <div className="stack">
      <p className="hint">
        Контакт можно не оставлять. Если оставите, он будет зашифрован и нужен только чтобы уточнить карточку, а не
        для расследования.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={draft.contactConsent}
          onChange={(event) => onChange({ contactConsent: event.target.checked })}
        />
        <span>Можно связаться со мной по этой карточке</span>
      </label>
      {draft.contactConsent ? (
        <>
          <label className="field" htmlFor="contactChannel">
            <span>Как связаться</span>
            <select
              id="contactChannel"
              value={draft.contactChannel}
              onChange={(event) => onChange({ contactChannel: event.target.value as Draft["contactChannel"] })}
            >
              <option value="">Выберите</option>
              <option value="telegram">Telegram</option>
              <option value="phone">Телефон</option>
              <option value="email">Эл. почта</option>
            </select>
          </label>
          <label className="field" htmlFor="contactValue">
            <span>Контакт</span>
            <input
              id="contactValue"
              autoComplete="off"
              value={draft.contactValue}
              maxLength={120}
              onChange={(event) => onChange({ contactValue: event.target.value })}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}
