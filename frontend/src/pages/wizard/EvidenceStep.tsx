import type { ChangeEvent } from "react";

import { validateFile } from "../../domain/draft";

export function EvidenceStep({
  files,
  confirmed,
  onChange,
  onConfirm,
  onError,
}: {
  files: File[];
  confirmed: boolean;
  onChange: (files: File[]) => void;
  onConfirm: (value: boolean) => void;
  onError: (message: string | null) => void;
}) {
  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const next = [...files];
    for (const file of selected) {
      const message = validateFile(file);
      if (message) {
        onError(message);
        event.target.value = "";
        return;
      }
      if (next.length >= 5) {
        onError("К одной карточке можно приложить не больше 5 файлов.");
        event.target.value = "";
        return;
      }
      next.push(file);
    }
    onError(null);
    onChange(next);
    event.target.value = "";
  }

  return (
    <div className="stack">
      <p className="hint">
        Не загружайте пароли, коды из СМС, данные карт и интимные материалы. Достаточно написать, что они были.
      </p>
      <label className="file" htmlFor="evidence">
        Приложить файл
        <input
          id="evidence"
          aria-label="Приложить файл"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf,audio/ogg,audio/mpeg,video/mp4,video/webm"
          onChange={addFiles}
        />
      </label>
      {files.length ? (
        <ul className="file-list">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`}>
              <span>{file.name}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, item) => item !== index))}
                aria-label={`Убрать файл ${file.name}`}
              >
                Убрать
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Файлы можно не прикладывать. Карточка сохранится и без них.</p>
      )}
      {files.length ? (
        <label className="check">
          <input type="checkbox" checked={confirmed} onChange={(event) => onConfirm(event.target.checked)} />
          <span>В файлах нет паролей, кодов, данных карт и интимных материалов</span>
        </label>
      ) : null}
    </div>
  );
}
