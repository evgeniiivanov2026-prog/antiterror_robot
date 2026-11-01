import { PLATFORMS } from "../../domain/categories";
import type { Draft } from "../../domain/draft";

export function ContextStep({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
}) {
  return (
    <div className="stack">
      <label className="field" htmlFor="occurredAt">
        <span>Когда это было, если помните</span>
        <input
          id="occurredAt"
          type="datetime-local"
          value={draft.occurredAt}
          onChange={(event) => onChange({ occurredAt: event.target.value })}
        />
      </label>
      <label className="field" htmlFor="platform">
        <span>Где это было</span>
        <select
          id="platform"
          value={draft.platformChoice}
          onChange={(event) => onChange({ platformChoice: event.target.value })}
        >
          <option value="">Выберите</option>
          {PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </select>
      </label>
      {draft.platformChoice === "Другое" ? (
        <label className="field" htmlFor="platformCustom">
          <span>Какая площадка</span>
          <input
            id="platformCustom"
            value={draft.platformCustom}
            maxLength={80}
            onChange={(event) => onChange({ platformCustom: event.target.value })}
          />
        </label>
      ) : null}
      <label className="field" htmlFor="sourceUrl">
        <span>Ссылка, если есть</span>
        <input
          id="sourceUrl"
          inputMode="url"
          autoComplete="off"
          value={draft.sourceUrl}
          maxLength={500}
          onChange={(event) => onChange({ sourceUrl: event.target.value })}
        />
      </label>
    </div>
  );
}
