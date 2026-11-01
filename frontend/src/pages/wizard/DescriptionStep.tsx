import type { Draft } from "../../domain/draft";

export function DescriptionStep({
  draft,
  onChange,
  errorId,
}: {
  draft: Draft;
  onChange: (description: string) => void;
  errorId?: string;
}) {
  return (
    <div className="stack">
      <label className="field" htmlFor="description">
        <span>Что произошло</span>
        <textarea
          id="description"
          value={draft.description}
          maxLength={4000}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(errorId)}
          aria-describedby={errorId}
        />
      </label>
      <p className="hint">{draft.description.trim().length} / 4000. Достаточно фактов, которые помните.</p>
    </div>
  );
}
