import type { Draft, DraftSuspect } from "../../domain/draft";

const FIELDS: Array<{ key: keyof DraftSuspect; label: string }> = [
  { key: "display_name", label: "Имя или псевдоним" },
  { key: "username", label: "Имя пользователя" },
  { key: "channel", label: "Канал или чат" },
  { key: "phone", label: "Телефон" },
];

export function SuspectStep({ draft, onChange }: { draft: Draft; onChange: (suspect: DraftSuspect) => void }) {
  return (
    <div className="stack">
      <p className="hint">Эти поля можно пропустить. Не пишите паспорт, адрес и данные карт.</p>
      {FIELDS.map((field) => (
        <label key={field.key} className="field" htmlFor={field.key}>
          <span>{field.label}</span>
          <input
            id={field.key}
            autoComplete="off"
            value={draft.suspect[field.key]}
            maxLength={120}
            onChange={(event) => onChange({ ...draft.suspect, [field.key]: event.target.value })}
          />
        </label>
      ))}
      <label className="field" htmlFor="suspectNote">
        <span>Короткая заметка</span>
        <textarea
          id="suspectNote"
          value={draft.suspect.note}
          maxLength={300}
          onChange={(event) => onChange({ ...draft.suspect, note: event.target.value })}
        />
      </label>
    </div>
  );
}
