import type { DraftDemands } from "../../domain/draft";

const CHECKS: Array<{ key: keyof Omit<DraftDemands, "summary">; label: string }> = [
  { key: "askedForMoney", label: "Просили деньги" },
  { key: "askedForMeeting", label: "Звали на встречу" },
  { key: "askedForSecrecy", label: "Просили никому не говорить" },
  { key: "askedToClickLink", label: "Просили открыть ссылку" },
];

export function DemandsStep({
  demands,
  onChange,
}: {
  demands: DraftDemands;
  onChange: (demands: DraftDemands) => void;
}) {
  return (
    <div className="stack">
      <p className="hint">Запишите требования, но не выполняйте их. Эти данные не заменяют заявление в полицию.</p>
      {CHECKS.map((item) => (
        <label key={item.key} className="check">
          <input
            type="checkbox"
            checked={demands[item.key]}
            onChange={(event) => onChange({ ...demands, [item.key]: event.target.checked })}
          />
          <span>{item.label}</span>
        </label>
      ))}
      <label className="field" htmlFor="demands">
        <span>Что именно требовали</span>
        <textarea
          id="demands"
          value={demands.summary}
          maxLength={1000}
          onChange={(event) => onChange({ ...demands, summary: event.target.value })}
        />
      </label>
    </div>
  );
}
